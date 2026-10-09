import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cardExamples } from "../tests/helpers/match-card-fixtures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");
const execute = promisify(execFile);
const args = process.argv.slice(2);
assert.ok(args.every((argument) => argument === "--serve"), "Usage: node scripts/verify-match-card-rendering.mjs [--serve]");
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" };
let child;
let serverLog = "";

async function createFixture() {
  const temporaryRoot = path.join(root, ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, "match-card-"));
  await mkdir(path.join(directory, "app/en/matches/[fixtureId]/[slug]"), { recursive: true });
  const relative = (target) => path.relative(directory, target).split(path.sep).join("/");
  const files = {
    "package.json": JSON.stringify({ private: true, type: "module" }),
    "next.config.mjs": `export default { agentRules: false, compiler: { styledComponents: true }, turbopack: { root: ${JSON.stringify(root)} } };`,
    "tsconfig.json": JSON.stringify({ extends: `${relative(root)}/tsconfig.json`,
      compilerOptions: { paths: { "@/*": [`${relative(root)}/src/*`] } },
      include: ["app/**/*.tsx", ".next/types/**/*.ts", `${relative(root)}/src/styles/styled.d.ts`], exclude: ["node_modules"] }),
    "app/layout.tsx": `export { default, metadata } from ${JSON.stringify(`../${relative(path.join(root, "src/app/layout"))}`)};`,
    "app/examples.json": JSON.stringify(cardExamples(), null, 2),
    "app/page.tsx": `import { Container, BodyText, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import { parseFixtureSnapshot } from "@/domain/fixture-snapshot";
import { isMarketFamily, marketRules, validateMarketGroup } from "@/domain/markets";
import { CardPreview } from "./preview";
import examples from "./examples.json";
export default function Page() {
  const checked = examples.map((entry) => ({ ...entry, fixture: parseFixtureSnapshot(entry.fixture),
    selectedFamily: isMarketFamily(entry.selectedFamily) ? entry.selectedFamily : "match-result" as const }));
  const equal = validateMarketGroup("match-result", { source: "ai", period: marketRules.period,
    probabilities: { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 } });
  const boundary = validateMarketGroup("total-goals", { source: "api-football", period: marketRules.period, line: 2.5,
    probabilities: { "over-2.5": 0.001, "under-2.5": 0.999 } });
  if (!equal.valid || !boundary.valid) throw new Error("Invalid synthetic probabilities");
  return <PageMain><Container><Stack $gap="lg">
    <PageHeading>Match card acceptance examples</PageHeading>
    <BodyText>All teams, predictions, scores, outcomes and logo URLs below are synthetic component examples.</BodyText>
    <CardPreview examples={checked} equal={equal.markets[0]!} boundary={boundary.markets[0]!} />
  </Stack></Container></PageMain>;
}`,
    "app/en/matches/[fixtureId]/[slug]/page.tsx": `import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/controls";
import { Container, BodyText, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import examples from "../../../../examples.json";
export default async function Page({ params }: { params: Promise<{ fixtureId: string; slug: string }> }) {
  const { fixtureId, slug } = await params;
  if (slug !== "example-home-v-example-away" || !examples.some((entry) => entry.fixture.fixtureId === fixtureId)) notFound();
  return <PageMain><Container><Stack><PageHeading>Example analysis destination</PageHeading>
    <BodyText id="example-fixture-id">{fixtureId}</BodyText>
    <BodyText>This is an isolated keyboard-navigation fixture, not real match analysis.</BodyText>
    <ButtonLink href="/" prefetch={false}>Return to examples</ButtonLink>
  </Stack></Container></PageMain>;
}`,
  };
  await Promise.all(Object.entries(files).map(([name, contents]) => writeFile(path.join(directory, name), `${contents}\n`)));
  await cp(path.join(root, "tests/fixtures/match-card/preview.tsx"), path.join(directory, "app/preview.tsx"));
  await cp(path.join(root, "public/brand"), path.join(directory, "public/brand"), { recursive: true, errorOnExist: true, force: false });
  return directory;
}

async function availablePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const address = reservation.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function verify(origin, directory) {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const html = await response.text();
  await writeFile(path.join(directory, "initial.html"), html);
  const visible = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const articles = [...visible.matchAll(/<article\b[^>]*data-fixture-id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
  assert.equal(articles.length, 12);
  const byId = new Map(articles.map((match) => [match[1], match[2]]));
  assert.ok(html.indexOf("data-styled=") < html.indexOf("<main"));
  for (const [, article] of byId) {
    const order = ["<header", 'data-team-side="home"', 'data-team-side="away"', "Prediction:", "Prediction outcome", "View analysis"];
    const positions = order.map((item) => article.indexOf(item));
    assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])), "Card reading order");
    assert.match(article, /<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.equal((article.match(/<a\b/g) ?? []).length, 1, "One keyboard destination per card");
    assert.match(article, /Published|Unavailable for this market/);
    assert.doesNotMatch(article, /\s(?:\$[\w-]+|tone|variant|loaded)=/);
  }
  for (const [id, status] of [["card-correct", "correct"], ["card-incorrect", "incorrect"], ["card-pending", "pending"],
    ["card-void", "void"], ["card-unavailable", "unavailable"], ["card-missing-family", "unavailable"]]) {
    assert.match(byId.get(id), new RegExp(`data-outcome="${status}"`));
  }
  assert.match(byId.get("card-correct"), /Final score/);
  assert.match(byId.get("card-correct"), /Estimated probability:[\s\S]*54%/);
  assert.match(byId.get("card-correct"), /AI prediction/);
  assert.match(byId.get("card-incorrect"), /API-Football fallback/);
  assert.match(byId.get("card-delayed"), /Update delayed/);
  assert.match(byId.get("card-delayed"), /Oct 9, 2026, 00:18 EAT/);
  assert.match(byId.get("card-limited"), /Limited news coverage/);
  assert.match(byId.get("card-partial"), /Partial coverage/);
  assert.match(byId.get("card-void"), /Postponed before play/);
  assert.match(visible, /Less than 1%/);
  assert.match(visible, /More than 99%/);
  assert.doesNotMatch(visible, />0%<|>100%<|\/_next\/image/);
  const images = [...visible.matchAll(/<img\b[^>]*>/g)];
  assert.ok(images.length > 0);
  for (const [tag] of images) {
    assert.match(tag, /src="https:\/\/static\.match-card\.test\//);
    assert.match(tag, /alt=""/);
    assert.match(tag, /width="32"/);
    assert.match(tag, /height="32"/);
  }
  console.log(`Match card SSR verification passed: ${articles.length} labeled examples, every outcome/source, coherent probability and direct remote image markup.`);
}

try {
  const directory = await createFixture();
  console.log(`Building match card fixture: ${directory}`);
  try {
    const build = await execute(process.execPath, [nextCli, "build", directory], {
      cwd: directory, env: environment, windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    });
    await writeFile(path.join(directory, "build.log"), `${build.stdout}\n${build.stderr}`);
  } catch (error) {
    await writeFile(path.join(directory, "build.log"), `${error.stdout ?? ""}\n${error.stderr ?? ""}`);
    throw new Error(`Fixture build failed; see ${path.join(directory, "build.log")}.`);
  }
  const port = await availablePort();
  child = spawn(process.execPath, [nextCli, "start", directory, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: directory, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (value) => { serverLog = `${serverLog}${value}`.slice(-32 * 1024); });
  child.on("error", (error) => { serverLog += error.message; });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (true) {
    assert.equal(child.exitCode, null, serverLog);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1_000) })).ok) break; } catch { /* Wait for startup. */ }
    assert.ok(Date.now() < deadline, serverLog);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await verify(origin, directory);
  console.log(`Fixture artifacts: ${directory}`);
  if (args.includes("--serve")) {
    console.log(`Fixture browser URL: ${origin}`);
    await new Promise((resolve) => {
      process.once("SIGINT", resolve); process.once("SIGTERM", resolve); child.once("exit", resolve);
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Match card verification failed.");
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
  }
}
