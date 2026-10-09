import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fixture as syntheticFixture } from "../tests/helpers/client-state-fixtures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");
const execute = promisify(execFile);
const args = process.argv.slice(2);
assert.ok(args.every((argument) => argument === "--serve"), "Usage: node scripts/verify-client-state-rendering.mjs [--serve]");
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" };
let child;
let serverLog = "";

async function createFixture() {
  const temporaryRoot = path.join(root, ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, "client-state-"));
  await mkdir(path.join(directory, "app"));
  const relative = (target) => path.relative(directory, target).split(path.sep).join("/");
  const files = {
    "package.json": JSON.stringify({ private: true, type: "module" }),
    "next.config.mjs": `export default { agentRules: false, compiler: { styledComponents: true }, turbopack: { root: ${JSON.stringify(root)} } };`,
    "tsconfig.json": JSON.stringify({ extends: `${relative(root)}/tsconfig.json`,
      compilerOptions: { paths: { "@/*": [`${relative(root)}/src/*`] } },
      include: ["app/**/*.tsx", ".next/types/**/*.ts", `${relative(root)}/src/styles/styled.d.ts`], exclude: ["node_modules"] }),
    "app/layout.tsx": `export { default, metadata } from ${JSON.stringify(`../${relative(path.join(root, "src/app/layout"))}`)};`,
    "app/page.tsx": `import { connection } from "next/server";
import { parseReportingDate } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { parseFixtureSnapshot } from "@/domain/fixture-snapshot";
import { Harness } from "./harness";
export default async function Page({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  await connection();
  const input = await searchParams;
  const seed = /^[a-z]{1,20}$/.test(input.seed ?? "") ? input.seed! : "request";
  const today = parseReportingDate("2026-10-09");
  const query = parseFeedQuery(new URLSearchParams({ q: seed }), { today });
  const snapshot = parseFixtureSnapshot(${JSON.stringify(syntheticFixture())});
  const initial = { today, query, data: { records: [snapshot], page: 1, nextPage: 2 } };
  return <Harness initial={initial} />;
}`,
    "app/harness.tsx": `"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/controls";
import { BodyText, Container, PageHeading, PageMain, Stack, Surface } from "@/components/ui/layout";
import { FeedStateProvider } from "@/state/provider";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { draftChanged } from "@/state/feed";
import { preferencesChanged } from "@/state/preferences";
import type { FeedBootstrap } from "@/state/contracts";
function Probe({ id }: { id: string }) {
  const feed = useAppSelector((state) => state.feed);
  const density = useAppSelector((state) => state.preferences.density);
  const dispatch = useAppDispatch();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return <Surface id={id} data-hydrated={String(hydrated)}><Stack>
    <BodyText id={id + "-query"}>{feed.query.search}</BodyText>
    <BodyText id={id + "-draft"}>{feed.draft.search}</BodyText>
    <BodyText id={id + "-version"}>{feed.records["fixture-a"]?.dataVersion}</BodyText>
    <BodyText id={id + "-density"}>{density}</BodyText>
    <Button id={id + "-change"} onClick={() => dispatch(draftChanged({ ...feed.draft, search: "changed" }))}>Change {id} draft</Button>
    <Button id={id + "-compact"} onClick={() => dispatch(preferencesChanged({ density: "compact" }))}>Compact {id}</Button>
  </Stack></Surface>;
}
export function Harness({ initial }: { initial: FeedBootstrap }) {
  const [renders, setRenders] = useState(0);
  const changedSeed = { ...initial, query: { ...initial.query, search: "reseeded" } };
  return <PageMain><Container><Stack>
    <PageHeading>Client state acceptance fixture</PageHeading>
    <BodyText>Synthetic fixture data for isolated state verification.</BodyText>
    <Button id="rerender" onClick={() => setRenders(renders + 1)}>Render parent again</Button>
    <FeedStateProvider initial={renders ? changedSeed : initial}><Probe id="a" /></FeedStateProvider>
    <FeedStateProvider initial={{ ...initial, query: { ...initial.query, search: initial.query.search + "-b" } }}><Probe id="b" /></FeedStateProvider>
  </Stack></Container></PageMain>;
}`,
  };
  await Promise.all(Object.entries(files).map(([name, contents]) => writeFile(path.join(directory, name), `${contents}\n`)));
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
  const seeds = ["alpha", "beta", "gamma", "delta"];
  const responses = await Promise.all(seeds.map(async (seed) => {
    const response = await fetch(`${origin}/?seed=${seed}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    for (const [id, value] of [["a-query", seed], ["b-query", `${seed}-b`], ["a-draft", seed], ["b-draft", `${seed}-b`],
      ["a-version", "9"], ["b-version", "9"], ["a-density", "comfortable"], ["b-density", "comfortable"]]) {
      assert.match(html, new RegExp(`id="${id}"[^>]*>${value}</p>`));
    }
    assert.equal((html.match(/data-hydrated="false"/g) ?? []).length, 2);
    for (const other of seeds.filter((value) => value !== seed)) assert.ok(!html.includes(`>${other}</p>`));
    await writeFile(path.join(directory, `${seed}.html`), html);
    return seed;
  }));
  console.log(`Client state SSR verification passed: ${responses.length} concurrent requests, two isolated providers each, deterministic initial preferences.`);
}

try {
  const directory = await createFixture();
  console.log(`Building client state fixture: ${directory}`);
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
  console.error(error instanceof Error ? error.message : "Client state verification failed.");
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
    if (child.exitCode === null) { child.kill("SIGKILL"); await exited; }
  }
}
