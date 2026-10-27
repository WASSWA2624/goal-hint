import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const assetsIn = (text) => Array.from(text.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|ttf|otf|svg)/gu),
  ([value]) => value.startsWith("/_next/") ? value : `/_next/${value}`);

/** Build output, never request-time HTML: the manifest pins one complete anonymous UI version. */
export async function buildOfflineManifest(directory = process.cwd()) {
  const root = path.resolve(directory);
  const entryBody = await readFile(path.join(root, ".next/server/app/offline.html"));
  if (!entryBody.toString("utf8").includes("data-offline-view")) throw new Error("Missing static offline entry.");
  const context = { globalThis: {} };
  vm.runInNewContext(await readFile(path.join(root, ".next/server/app/offline/page_client-reference-manifest.js"), "utf8"), context, { timeout: 1_000 });
  const routes = Object.values(context.globalThis.__RSC_MANIFEST ?? {});
  if (routes.length !== 1) throw new Error("Ambiguous offline client manifest.");
  const pending = new Set([
    ...assetsIn(entryBody.toString("utf8")),
    ...assetsIn(JSON.stringify(routes[0])),
    "/brand/goal-hint-logo-primary.svg", "/brand/goal-hint-logo-inverse.svg",
    "/brand/goal-hint-mark-primary.svg", "/brand/goal-hint-mark-inverse.svg",
  ]);
  const assets = new Map();
  while (pending.size) {
    const url = pending.values().next().value;
    pending.delete(url);
    if (assets.has(url)) continue;
    if (!/^\/(?:_next\/static\/(?:chunks|css|media)\/[a-zA-Z0-9_./-]+\.(?:js|css|woff2?|ttf|otf|svg)|brand\/goal-hint-(?:logo|mark)-(?:primary|inverse)\.svg)$/u.test(url)
      || url.includes("..")) throw new Error("Unapproved offline asset.");
    const file = path.resolve(root, url.startsWith("/_next/") ? `.next/${url.slice(7)}` : `public${url}`);
    if (!file.startsWith(root + path.sep)) throw new Error("Offline asset escapes build directory.");
    const body = await readFile(file);
    if (!body.length || body.length > 4 * 1024 * 1024) throw new Error("Offline asset exceeds size limits.");
    assets.set(url, { url, sha256: digest(body), bytes: body.length });
    if (/\.(?:js|css)$/u.test(url)) {
      const text = body.toString("utf8");
      for (const dependency of assetsIn(text)) if (!assets.has(dependency)) pending.add(dependency);
      if (url.endsWith(".css")) {
        for (const [, dependency] of text.matchAll(/url\(["']?([^\s)'"?#]+)(?:\?[^)'"\s]*)?["']?\)/gu)) {
          if (dependency.startsWith("data:")) continue;
          const resolved = new URL(dependency, `https://offline.invalid${url}`);
          if (resolved.origin !== "https://offline.invalid") throw new Error("Offline stylesheet includes remote media.");
          if (!assets.has(resolved.pathname)) pending.add(resolved.pathname);
        }
      }
    }
    if (assets.size > 256) throw new Error("Offline asset count exceeds limit.");
  }
  const entry = { url: "/offline", sha256: digest(entryBody), bytes: entryBody.length };
  const manifest = { schemaVersion: 1, entry, assets: [...assets.values()].sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0) };
  if (entry.bytes + manifest.assets.reduce((total, item) => total + item.bytes, 0) > 10 * 1024 * 1024 - (128 + 96) * 1024) {
    throw new Error("Offline bundle exceeds storage budget.");
  }
  const output = { ...manifest, version: digest(JSON.stringify(manifest)), createdAt: Date.now() };
  await writeFile(path.join(root, "public/offline-manifest.json"), JSON.stringify(output) + "\n");
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildOfflineManifest(process.argv[2]);
  console.log(`Offline bundle ${result.version.slice(0, 12)}: ${result.assets.length} pinned assets.`);
}
