import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildOfflineManifest } from "../scripts/build-offline-manifest.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "goal-hint-offline-manifest-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("goal-hint-offline-manifest-"));
    await rm(root, { recursive: true, force: true });
  });
  const save = async (name, text) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), text); };
  await save(".next/server/app/offline.html", '<div data-offline-view></div><script src="/_next/static/chunks/root.js"></script>');
  await save(".next/server/app/offline/page_client-reference-manifest.js",
    'globalThis.__RSC_MANIFEST={"/offline/page":{clientModules:{a:{chunks:["/_next/static/chunks/client.js"]}}}};');
  await save(".next/static/chunks/root.js", 'const dependency="static/chunks/split.js";');
  await save(".next/static/chunks/client.js", 'const style="static/chunks/offline.css";');
  await save(".next/static/chunks/split.js", "export const answer=42;");
  await save(".next/static/chunks/offline.css", '@font-face{src:url(../media/local.woff2)}');
  await save(".next/static/media/local.woff2", "synthetic-font");
  for (const kind of ["logo", "mark"]) for (const variant of ["primary", "inverse"]) {
    await save(`public/brand/goal-hint-${kind}-${variant}.svg`, "<svg/>");
  }
  return { root, save };
}

test("offline build pins HTML, client/split chunks, CSS and local fonts coherently", async (t) => {
  const { root } = await fixture(t);
  const manifest = await buildOfflineManifest(root);
  assert.equal(manifest.entry.url, "/offline");
  assert.equal(manifest.assets.length, 9);
  assert.ok(manifest.assets.some(({ url }) => url.endsWith("/split.js")));
  assert.ok(manifest.assets.some(({ url }) => url.endsWith("/local.woff2")));
  assert.deepEqual(manifest.assets.filter(({ url }) => url.startsWith("/brand/")).map(({ url }) => url), [
    "/brand/goal-hint-logo-inverse.svg", "/brand/goal-hint-logo-primary.svg",
    "/brand/goal-hint-mark-inverse.svg", "/brand/goal-hint-mark-primary.svg",
  ]);
  assert.deepEqual(manifest.assets.map(({ url }) => url), manifest.assets.map(({ url }) => url).sort());
  assert.equal((await buildOfflineManifest(root)).version, manifest.version);
});

test("missing dependency cannot replace the previous complete build manifest", async (t) => {
  const { root, save } = await fixture(t);
  const original = await buildOfflineManifest(root);
  await save(".next/static/chunks/root.js", 'const dependency="static/chunks/missing.js";');
  await assert.rejects(buildOfflineManifest(root), /ENOENT/);
  assert.equal(JSON.parse(await readFile(path.join(root, "public/offline-manifest.json"))).version, original.version);
});

test("remote CSS assets are rejected instead of being added to the offline store", async (t) => {
  const { root, save } = await fixture(t);
  await save(".next/static/chunks/offline.css", '@font-face{src:url(https://example.com/private.woff2)}');
  await assert.rejects(buildOfflineManifest(root), /remote media/);
});
