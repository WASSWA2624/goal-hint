import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const temporaryRoot = path.join(workspace, ".tmp");
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

test("Next rejects direct generated Prisma imports from an actual Client Component", { timeout: 120000 }, async () => {
  await mkdir(temporaryRoot, { recursive: true });
  const root = await realpath(workspace);
  assert.equal(path.relative(root, await realpath(temporaryRoot)), ".tmp");
  const fixture = await mkdtemp(path.join(temporaryRoot, "generated-client-boundary-"));
  const ownership = randomUUID();
  const marker = path.join(fixture, ".goal-hint-test-owner");
  await writeFile(marker, ownership, { flag: "wx" });
  try {
    const app = path.join(fixture, "app");
    await mkdir(app);
    const generatedClient = path.join(workspace, "src", "server", "generated", "prisma", "client.ts");
    const specifier = path.relative(app, generatedClient).split(path.sep).join("/");
    await Promise.all([
      writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true })),
      writeFile(path.join(fixture, "next.config.mjs"), `export default { turbopack: { root: ${JSON.stringify(workspace)} } };\n`),
      writeFile(path.join(app, "layout.jsx"), "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n"),
      writeFile(path.join(app, "page.jsx"), `"use client";\nimport { PrismaClient } from ${JSON.stringify(specifier)};\nexport default function Page() { return <main>{typeof PrismaClient}</main>; }\n`),
    ]);
    await assert.rejects(execFileAsync(process.execPath, [require.resolve("next/dist/bin/next"), "build", fixture], {
      cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
      windowsHide: true, timeout: 90000, maxBuffer: 2 * 1024 * 1024,
    }), (error) => {
      const output = `${error.stdout}\n${error.stderr}`;
      assert.equal(error.code, 1, output);
      assert.match(output, /server-only/u);
      assert.match(output, /Client Component|client component|use client/u);
      assert.match(output, /server[\\/]generated[\\/]prisma[\\/]client/u);
      assert.match(output, /app[\\/]page/u);
      return true;
    });
  } finally {
    const actual = await realpath(fixture);
    const parent = await realpath(temporaryRoot);
    assert.equal(path.relative(root, parent), ".tmp");
    const relative = path.relative(parent, actual);
    assert.ok(relative.startsWith("generated-client-boundary-") && !relative.includes(path.sep));
    assert.equal(await readFile(marker, "utf8"), ownership);
    await rm(actual, { recursive: true, force: false, maxRetries: 3 });
  }
});
