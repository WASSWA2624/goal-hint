import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ESLint } from "eslint";

const root = fileURLToPath(new URL("../", import.meta.url));
const eslint = new ESLint({ cwd: root });
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

async function lint(source, filePath) {
  const [result] = await eslint.lintText(source, { filePath: path.join(root, filePath) });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages;
}

test("browser components and domain contracts reject private imports and re-exports", async () => {
  for (const filePath of ["src/components/example.ts", "src/domain/example.ts"]) {
    for (const source of [
      'export { value } from "@/server/provider";',
      'export * from "../../server/provider";',
      'import "../workers/predict";',
      'import "@/workers/predict";',
      'export type { Contract } from "@/server/provider";',
    ]) {
      const messages = await lint(source, filePath);
      assert.ok(
        messages.some(({ ruleId }) => ruleId === "no-restricted-imports"),
        `${filePath} should reject ${source}`,
      );
    }
  }
});

test("web routes and server services cannot import worker entry points", async () => {
  for (const filePath of ["src/app/example.ts", "src/server/example.ts"]) {
    for (const specifier of ["@/workers/predict", "../workers/predict"]) {
      const messages = await lint(`import "server-only"; export * from "${specifier}";`, filePath);
      assert.ok(messages.some(({ ruleId }) => ruleId === "no-restricted-imports"));
    }
  }
});

test("shared contracts, server services and workers allow intended dependency directions", async () => {
  for (const [filePath, source] of [
    ["src/components/example.ts", 'export type { Contract } from "@/domain/contracts";'],
    ["src/domain/example.ts", 'export type { Contract } from "./contracts";'],
    ["src/app/example.ts", 'export { value } from "@/server/provider";'],
    ["src/server/example.ts", 'import "server-only"; export type { Contract } from "@/domain/contracts";'],
    ["src/workers/example.ts", 'import "server-only"; export { value } from "@/server/provider";'],
    ["src/server/example.d.ts", "export type Contract = string;"],
  ]) {
    assert.deepEqual(await lint(source, filePath), [], filePath);
  }
});

test("every server and worker module requires the server-only side-effect import", async () => {
  for (const filePath of ["src/server/example.ts", "src/workers/example.tsx"]) {
    for (const source of [
      "export const value = 1;",
      '/* import "server-only"; */ export const value = 1;',
      'import type {} from "server-only"; export const value = 1;',
    ]) {
      const messages = await lint(source, filePath);
      assert.ok(messages.some(({ ruleId }) => ruleId === "no-restricted-syntax"));
    }
    assert.deepEqual(await lint('import "server-only"; export const value = 1;', filePath), []);
  }
});

test("Next.js rejects a transitive server-only import into a client bundle", { timeout: 120_000 }, async () => {
  const temporaryRoot = path.join(root, ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const fixture = await mkdtemp(path.join(temporaryRoot, "server-boundary-"));

  try {
    await mkdir(path.join(fixture, "app"));
    await mkdir(path.join(fixture, "shared"));
    await mkdir(path.join(fixture, "server"));
    await Promise.all([
      writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true })),
      writeFile(
        path.join(fixture, "next.config.mjs"),
        `export default { turbopack: { root: ${JSON.stringify(root)} } };\n`,
      ),
      writeFile(
        path.join(fixture, "app", "layout.jsx"),
        "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
      ),
      writeFile(
        path.join(fixture, "app", "page.jsx"),
        '"use client";\nimport { value } from "../shared/bridge";\nexport default function Page() { return <main>{value}</main>; }\n',
      ),
      writeFile(path.join(fixture, "shared", "bridge.js"), 'export { value } from "../server/private";\n'),
      writeFile(path.join(fixture, "server", "private.js"), 'import "server-only";\nexport const value = "synthetic boundary fixture";\n'),
    ]);

    await assert.rejects(
      execFileAsync(process.execPath, [require.resolve("next/dist/bin/next"), "build", fixture], {
        cwd: fixture,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
        windowsHide: true,
        timeout: 90_000,
        maxBuffer: 2 * 1024 * 1024,
      }),
      (error) => {
        const output = `${error.stdout}\n${error.stderr}`;
        assert.equal(error.code, 1, output);
        assert.match(output, /server-only/);
        assert.match(output, /Client Component|client component|use client/);
        assert.match(output, /server[\\/]private/);
        assert.match(output, /app[\\/]page/);
        return true;
      },
      "A client bundle containing a transitive server-only dependency must fail compilation.",
    );
  } finally {
    const relative = path.relative(temporaryRoot, fixture);
    assert.ok(relative.startsWith("server-boundary-") && !relative.includes(path.sep));
    await rm(fixture, { recursive: true, force: true, maxRetries: 3 });
  }
});
