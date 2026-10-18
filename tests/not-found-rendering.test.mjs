import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = path.join(workspace, ".tmp");
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const next = require.resolve("next/dist/bin/next");
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" };
// Bots post a fake action id as a form; Next answers with the root not-found page but omits the root layout.
const fakeAction = { "Next-Action": "x", "Content-Type": "application/x-www-form-urlencoded" };
// A declaration only the root GlobalStyle emits: once means exactly one StyleProvider rendered.
const globalStyleMarker = /-webkit-text-size-adjust:100%/gu;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer(fixture) {
  const port = await freePort();
  const child = spawn(process.execPath, [next, "start", fixture, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: fixture, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const server = { origin: `http://127.0.0.1:${port}`, output: "", child };
  for (const stream of [child.stdout, child.stderr]) stream.setEncoding("utf8").on("data", (chunk) => { server.output += chunk; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, `Fixture server stopped before readiness.\n${server.output}`);
    const ready = await fetch(server.origin, { redirect: "manual" }).then((response) => response.status === 200, () => false);
    if (ready) return server;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  assert.fail(`Fixture server did not become ready.\n${server.output}`);
}

async function stopServer(server) {
  if (!server || server.child.exitCode !== null) return;
  const exited = new Promise((resolve) => server.child.once("exit", resolve));
  server.child.kill();
  await exited;
}

test("the root not-found page renders its styled shell even when Next omits the root layout", { timeout: 240_000 }, async () => {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await realpath(workspace);
  assert.equal(path.relative(root, await realpath(temporaryRoot)), ".tmp");
  const fixture = await mkdtemp(path.join(temporaryRoot, "not-found-rendering-"));
  const ownership = randomUUID();
  const marker = path.join(fixture, ".goal-hint-test-owner");
  await writeFile(marker, ownership, { flag: "wx" });
  let server;
  try {
    const app = path.join(fixture, "app");
    await mkdir(app);
    const source = path.relative(fixture, path.join(workspace, "src")).split(path.sep).join("/");
    await Promise.all([
      writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true, type: "module" })),
      // The application's own build type-checks these modules; the fixture only needs their runtime behaviour.
      writeFile(path.join(fixture, "next.config.mjs"), "export default { agentRules: false, compiler: { styledComponents: true }, "
        + `typescript: { ignoreBuildErrors: true }, turbopack: { root: ${JSON.stringify(workspace)} } };\n`),
      writeFile(path.join(fixture, "tsconfig.json"), JSON.stringify({
        extends: path.relative(fixture, path.join(workspace, "tsconfig.json")).split(path.sep).join("/"),
        compilerOptions: { paths: { "@/*": [`${source}/*`] } }, include: ["app/**/*.tsx"],
      })),
      writeFile(path.join(app, "layout.tsx"), 'export { default, metadata } from "@/app/layout";\n'),
      writeFile(path.join(app, "not-found.tsx"), 'export { default, metadata } from "@/app/not-found";\n'),
      writeFile(path.join(app, "page.tsx"), 'export const dynamic = "force-dynamic";\nexport default function Page() { return <main>fixture</main>; }\n'),
    ]);
    await execFileAsync(process.execPath, [next, "build", fixture], {
      cwd: fixture, env, windowsHide: true, timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    });
    server = await startServer(fixture);

    const missing = await fetch(`${server.origin}/missing-page`, { redirect: "manual" });
    const missingHtml = await missing.text();
    assert.equal(missing.status, 404);
    assert.match(missingHtml, /<html[^>]*lang="en"/u, "An unmatched address keeps the root layout.");
    assert.match(missingHtml, /Page not found/u);
    assert.match(missingHtml, /<title>Page not found \| Goal Hint<\/title>/u, "A missing page must not inherit the home page title.");
    assert.equal(missingHtml.match(globalStyleMarker)?.length, 1, "The fallback must not nest a second provider under the root layout.");

    const rejected = await fetch(server.origin, { method: "POST", headers: fakeAction, body: "probe=1", redirect: "manual" });
    const rejectedHtml = await rejected.text();
    assert.equal(rejected.status, 404, `A fake Server Action must get the not-found page, not a 500.\n${server.output}`);
    assert.match(rejectedHtml, /Page not found/u);
    assert.match(rejectedHtml, /href="#main-content"/u, "The shell's skip link must render.");
    assert.equal(rejectedHtml.match(globalStyleMarker)?.length, 1, "The layout-less not-found page must supply its own styles.");
    assert.doesNotMatch(server.output, /TypeError|Cannot read properties/u);
  } finally {
    await stopServer(server);
    const actual = await realpath(fixture);
    const parent = await realpath(temporaryRoot);
    assert.equal(path.relative(root, parent), ".tmp");
    const relative = path.relative(parent, actual);
    assert.ok(relative.startsWith("not-found-rendering-") && !relative.includes(path.sep));
    assert.equal(await readFile(marker, "utf8"), ownership);
    await rm(actual, { recursive: true, force: false, maxRetries: 3 });
  }
});
