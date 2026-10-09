import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const nextCli = require.resolve("next/dist/bin/next");
const sentinel = "brand_styling_secret_sentinel_do_not_ship_015";
const privateCanary = "BRAND_STYLING_PRIVATE_ONLY_CANARY";
const streamedCopy = "The delayed styled content has arrived.";
const streamedDeclaration = "--brand-stream-proof:delivered";
const args = process.argv.slice(2);
assert.ok(args.every((argument) => argument === "--serve"), "Usage: node scripts/verify-brand-rendering.mjs [--serve]");
assert.equal(process.versions.node, "24.18.1", "Run with the repository's pinned Node.js 24.18.1.");
const serve = args.includes("--serve");
const environment = {
  ...process.env,
  AI_API_KEY: sentinel,
  NEXT_TELEMETRY_DISABLED: "1",
  FORCE_COLOR: "0",
};
let child;
let serverLog = "";

function importPath(value) {
  return value.split(path.sep).join("/");
}

async function createFixture() {
  const temporaryRoot = path.join(root, ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const fixture = await mkdtemp(path.join(temporaryRoot, "brand-styling-"));
  await mkdir(path.join(fixture, "app", "delayed"), { recursive: true });
  const actualLayout = importPath(path.relative(path.join(fixture, "app"), path.join(root, "src", "app", "layout")));
  const relativeRoot = importPath(path.relative(fixture, root));
  const files = {
    "package.json": JSON.stringify({ name: "goal-hint-brand-rendering-fixture", private: true, type: "module" }, null, 2),
    "next.config.mjs": `export default { agentRules: false, compiler: { styledComponents: true }, turbopack: { root: ${JSON.stringify(root)} } };\n`,
    "tsconfig.json": JSON.stringify({
      extends: `${relativeRoot}/tsconfig.json`,
      compilerOptions: { paths: { "@/*": [`${relativeRoot}/src/*`] } },
      include: ["next-env.d.ts", "app/**/*.ts", "app/**/*.tsx", ".next/types/**/*.ts", `${relativeRoot}/src/styles/styled.d.ts`],
      exclude: ["node_modules"],
    }, null, 2),
    "app/layout.tsx": `export { default, metadata } from ${JSON.stringify(actualLayout)};\n`,
    "app/private-boundary.ts": `import "server-only";\nexport function verifyPrivateBoundary() { if (process.env.AI_API_KEY !== ${JSON.stringify(sentinel)}) throw new Error(${JSON.stringify(privateCanary)}); }\n`,
    "app/page.tsx": `import { Container, PageHeading, PageMain, Stack, BodyText } from "@/components/ui/layout";
import { BrandLogo, BrandMark } from "@/components/ui/brand";
import { PrimitiveDemo } from "./primitive-demo";
import { verifyPrivateBoundary } from "./private-boundary";
export default function Page() {
  verifyPrivateBoundary();
  return <PageMain id="acceptance-main" tabIndex={-1}><Container><Stack $gap="lg">
    <BrandLogo /><BrandMark />
    <PageHeading>Brand styling acceptance fixture</PageHeading>
    <BodyText>These are synthetic interface checks. No football fixtures or predictions are represented.</BodyText>
    <PrimitiveDemo />
  </Stack></Container></PageMain>;
}
`,
    "app/primitive-demo.tsx": `"use client";
import { useState } from "react";
import { Button, ButtonLink, TextLink, TextInput, SelectInput } from "@/components/ui/controls";
import { EmptyState, StatusText } from "@/components/ui/feedback";
import { BodyText, Inline, SectionHeading, Stack, Surface } from "@/components/ui/layout";
const longCopy = "${"LongUnbrokenInterfaceIdentifier".repeat(9)}";
export function PrimitiveDemo() {
  const [updated, setUpdated] = useState(false);
  return <Stack $gap="lg">
    <Surface><Stack><SectionHeading>Navigation and controls</SectionHeading>
      <Inline>
        <Button id="demo-primary" onClick={() => setUpdated(true)}>Update demonstration status</Button>
        <Button id="demo-secondary" variant="secondary">Secondary action</Button>
        <Button id="demo-quiet" variant="quiet">Quiet action</Button>
        <Button id="demo-disabled" disabled>Disabled action</Button>
        <ButtonLink id="navigate-delayed" href="/delayed" prefetch={false}>Open delayed style check</ButtonLink>
        <TextLink href="#fields">Go to labeled fields</TextLink>
      </Inline>
      <Button variant="secondary">{longCopy}</Button>
      <StatusText id="changing-status" tone={updated ? "correct" : "pending"} announce>
        {updated ? "Demonstration status updated" : "Waiting for the demonstration action"}
      </StatusText>
    </Stack></Surface>
    <Surface id="fields"><Stack><SectionHeading>Labeled fields</SectionHeading>
      <BodyText id="external-help">Existing description retained alongside the hint and validation error.</BodyText>
      <TextInput id="demo-input" label="Example text field" hint="Use synthetic text for this check." defaultValue="Example interface text" />
      <TextInput id="demo-invalid" label="Required field with an error" hint="This hint remains associated." error={"Please enter a value. " + longCopy} aria-describedby="external-help" required />
      <TextInput id="demo-disabled-input" label="Disabled example field" defaultValue="Disabled value" disabled />
      <SelectInput id="demo-select" label="Example selection" hint="A native select with its label." defaultValue="first">
        <option value="first">First demonstration option</option><option value="second">Second demonstration option</option>
      </SelectInput>
      <BodyText>{longCopy}</BodyText>
    </Stack></Surface>
    <Surface><Stack><SectionHeading>Status text and icons</SectionHeading><Inline>
      <StatusText tone="correct">Correct</StatusText><StatusText tone="incorrect">Incorrect</StatusText>
      <StatusText tone="pending">Pending</StatusText><StatusText tone="void">Void</StatusText>
      <StatusText tone="unavailable">Unavailable</StatusText>
    </Inline></Stack></Surface>
    <EmptyState title="No demonstration items" description={"This empty state is an interface example. " + longCopy}
      action={<Button variant="secondary">Example empty-state action</Button>} />
  </Stack>;
}
`,
    "app/stream-panel.tsx": `"use client";
import styled from "styled-components";
import { Surface } from "@/components/ui/layout";
export const StreamPanel = styled(Surface)\`
  --brand-stream-proof: delivered;
  border-inline-start: 7px solid \${({ theme }) => theme.color.text};
\`;
`,
    "app/delayed/page.tsx": `import { Suspense } from "react";
import { connection } from "next/server";
import { ButtonLink } from "@/components/ui/controls";
import { BodyText, Container, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import { StatusText } from "@/components/ui/feedback";
import { StreamPanel } from "../stream-panel";
async function DelayedContent() {
  await new Promise<void>((resolve) => setTimeout(resolve, 900));
  return <StreamPanel data-testid="stream-panel"><BodyText>${streamedCopy}</BodyText></StreamPanel>;
}
export default async function DelayedPage() {
  await connection();
  return <PageMain><Container><Stack $gap="lg"><PageHeading>Delayed style check</PageHeading>
    <ButtonLink href="/" prefetch={false} variant="secondary">Return to the primitive checks</ButtonLink>
    <Suspense fallback={<StatusText tone="pending">Waiting for the delayed interface example.</StatusText>}>
      <DelayedContent />
    </Suspense>
  </Stack></Container></PageMain>;
}
`,
  };
  await Promise.all(Object.entries(files).map(([name, source]) => writeFile(path.join(fixture, name), `${source.trimEnd()}\n`)));
  await cp(path.join(root, "public", "brand"), path.join(fixture, "public", "brand"), { recursive: true, errorOnExist: true, force: false });
  return fixture;
}

async function availablePort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const address = reservation.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Fixture server stopped before readiness. ${serverLog}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* Retry while the process opens its listener. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Fixture server did not become ready. ${serverLog}`);
}

function styleElements(html) {
  return [...html.matchAll(/<style\b[^>]*data-styled(?:[=\s>])[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({ css: match[1], offset: match.index }));
}

function assertStylesUnique(html) {
  const styles = styleElements(html);
  assert.ok(styles.length > 0, "Server HTML must include styled-components CSS.");
  const markers = new Set();
  for (const { css } of styles) {
    for (const match of css.matchAll(/data-styled\.g\d+\[id="([^"]+)"\]\{content:"([^"]*)";?\}/g)) {
      for (const name of match[2].split(",").filter(Boolean)) {
        const key = `${match[1]}:${name}`;
        assert.ok(!markers.has(key), `Styled rule was emitted more than once: ${key}`);
        markers.add(key);
      }
    }
  }
  assert.ok(markers.size >= 5, "Expected real shared primitive rules, not an empty registry.");
  assert.equal([...markers].filter((marker) => marker.startsWith("sc-global-")).length, 1, "The root global style must be inserted only once per response.");
  assert.equal(styles.map(({ css }) => css).join("").split("body{margin:0;").length - 1, 1, "The global body reset must not be duplicated across streamed chunks.");
  return { elements: styles.length, registeredRules: markers.size };
}

function assertPrivateOutputAbsent(value) {
  for (const privateText of [sentinel, privateCanary, "verifyPrivateBoundary", "createFallbackService", "createEvaluationHarness", "createMySqlCostStore"]) {
    assert.ok(!value.includes(privateText), `Private implementation appeared in public output: ${privateText}`);
  }
}

function assertNoStylingAttributes(html) {
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const renderedTags = markup.match(/<(?:button|a|input|select|span|div|section|main)(?=[\s>])[^>]*>/g) ?? [];
  for (const tag of renderedTags) {
    assert.doesNotMatch(tag, /\s(?:\$[\w-]+|tone|variant|invalid|gap)=/, `Styling-only prop leaked: ${tag}`);
  }
}

async function scanBrowserChunks(fixture) {
  const directory = path.join(fixture, ".next", "static");
  const paths = [];
  async function collect(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await collect(target);
      else if (entry.isFile() && entry.name.endsWith(".js")) paths.push(target);
    }
  }
  await collect(directory);
  assert.ok(paths.length > 0, "Production browser chunks must exist for the boundary check.");
  for (const target of paths) assertPrivateOutputAbsent(await readFile(target, "utf8"));
  return paths.length;
}

async function verify(baseUrl, fixture) {
  const initialResponse = await fetch(baseUrl);
  assert.equal(initialResponse.status, 200);
  const initialHtml = await initialResponse.text();
  await writeFile(path.join(fixture, "initial.html"), initialHtml);
  assert.match(initialHtml, /Brand styling acceptance fixture/);
  assert.match(initialHtml, /Example text field/);
  assert.match(initialHtml, /aria-invalid="true"/);
  assert.match(initialHtml, /id="demo-invalid"[^>]*aria-describedby="external-help demo-invalid-hint demo-invalid-error"/);
  assert.match(initialHtml, /<button[^>]*id="demo-disabled"[^>]*disabled=""/);
  assert.match(initialHtml, /goal-hint-logo-primary\.svg/);
  assert.match(initialHtml, /box-sizing:border-box/);
  assert.match(initialHtml, /font-size:1rem/);
  assert.ok(styleElements(initialHtml)[0].offset < initialHtml.indexOf("<main"), "Initial CSS must precede the readable content.");
  assert.ok(!initialHtml.includes(streamedDeclaration), "A new delayed style must not already exist on the first route.");
  const initialStyles = assertStylesUnique(initialHtml);
  assertPrivateOutputAbsent(initialHtml);
  assertNoStylingAttributes(initialHtml);

  const response = await fetch(`${baseUrl}/delayed`, { headers: { "User-Agent": "GoalHintBrandAcceptance/1.0" } });
  assert.equal(response.status, 200);
  const decoder = new TextDecoder();
  const chunks = [];
  const start = performance.now();
  for await (const chunk of response.body) chunks.push({ atMilliseconds: Math.round(performance.now() - start), text: decoder.decode(chunk, { stream: true }) });
  const remainder = decoder.decode();
  if (remainder) chunks.push({ atMilliseconds: Math.round(performance.now() - start), text: remainder });
  const streamedHtml = chunks.map(({ text }) => text).join("");
  await writeFile(path.join(fixture, "streamed.html"), streamedHtml);
  await writeFile(path.join(fixture, "stream-chunks.json"), JSON.stringify(chunks.map(({ atMilliseconds, text }) => ({ atMilliseconds, bytes: Buffer.byteLength(text), hasNewStyle: text.includes(streamedDeclaration), hasDelayedElement: text.includes('data-testid="stream-panel"') })), null, 2));
  assert.ok(chunks.length >= 2, "A real streamed request must deliver multiple chunks.");
  const pendingOffset = streamedHtml.indexOf("Waiting for the delayed interface example.");
  const styleOffset = streamedHtml.indexOf(streamedDeclaration);
  // Flight scripts may carry text before its HTML is inserted; compare the actual element.
  const contentOffset = streamedHtml.indexOf('data-testid="stream-panel"');
  assert.match(streamedHtml, new RegExp(`<p[^>]*>${streamedCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/p>`));
  assert.ok(pendingOffset >= 0 && pendingOffset < styleOffset, "The fallback must arrive before the new delayed style.");
  assert.ok(styleOffset >= 0 && styleOffset < contentOffset, "The streamed style must precede the content that uses it.");
  assert.equal(streamedHtml.split(streamedDeclaration).length - 1, 1, "The delayed style must be emitted exactly once.");
  const streamedStyles = assertStylesUnique(streamedHtml);
  assertPrivateOutputAbsent(streamedHtml);
  assertNoStylingAttributes(streamedHtml);
  const browserChunks = await scanBrowserChunks(fixture);
  const result = { initialStyles, streamedStyles, responseChunks: chunks.length, browserChunks, privateCanaryAbsent: true, transientPropsAbsent: true };
  await writeFile(path.join(fixture, "verification.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Brand rendering verification passed: ${JSON.stringify(result)}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
}

try {
  const fixture = await createFixture();
  console.log(`Building the production brand fixture: ${fixture}`);
  let build;
  try {
    build = await execFileAsync(process.execPath, [nextCli, "build", fixture], {
      cwd: fixture, env: environment, windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    await writeFile(path.join(fixture, "build.log"), `${error.stdout ?? ""}\n${error.stderr ?? ""}`);
    throw new Error(`Fixture production build failed; see ${path.join(fixture, "build.log")}.`);
  }
  await writeFile(path.join(fixture, "build.log"), `${build.stdout}\n${build.stderr}`);
  const port = await availablePort();
  child = spawn(process.execPath, [nextCli, "start", fixture, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: fixture, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (value) => { serverLog = `${serverLog}${value}`.slice(-64 * 1024); });
  child.on("error", (error) => { serverLog += `\n${error.message}`; });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl);
  await verify(baseUrl, fixture);
  console.log(`Fixture artifacts: ${fixture}`);
  if (serve) {
    console.log(`Fixture browser URL: ${baseUrl}`);
    console.log("Server remains available for browser acceptance checks; Ctrl+C stops it.");
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
      child.once("exit", resolve);
    });
  }
} catch (error) {
  console.error("Brand rendering verification failed:", error instanceof Error ? error.message : "Unknown failure.");
  process.exitCode = 1;
} finally {
  await stopServer();
}
