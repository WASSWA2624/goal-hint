import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "design/light-theme-samples");
const capturePath = path.resolve(process.argv[2] ?? path.join(root, "output/playwright/light-themes/capture.json"));
const target = process.argv[3];
if (!target) throw new Error("Usage: node scripts/build-light-theme-gallery.mjs [capture.json] <absolute-output.html>");
if (!path.isAbsolute(target)) throw new Error("The output path must be absolute.");

const [template, paletteText, captureText] = await Promise.all([
  readFile(path.join(source, "gallery.html"), "utf8"),
  readFile(path.join(source, "palettes.json"), "utf8"),
  readFile(capturePath, "utf8"),
]);
const palettes = JSON.parse(paletteText);
const captures = JSON.parse(captureText);
if (palettes.length !== 10 || new Set(palettes.map(palette => palette.id)).size !== 10) {
  throw new Error("The review requires exactly ten uniquely named themes.");
}
if (!Array.isArray(captures.themes) || captures.themes.length !== palettes.length) {
  throw new Error("Capture desktop and mobile views for every theme before building the gallery.");
}
for (const palette of palettes) {
  const capture = captures.themes.find(theme => theme.id === palette.id);
  for (const screen of ["desktop", "mobile"]) {
    if (!capture?.[screen]?.html || !capture[screen].css) throw new Error(`Missing ${screen} capture for ${palette.name}.`);
    if (/<script\b/i.test(capture[screen].html)) throw new Error(`Remove scripts from ${palette.name} ${screen} capture.`);
  }
}
const escape = value => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const variants = palettes.map((palette, index) => `    <section data-variant="${escape(palette.name)}" data-theme-id="${escape(palette.id)}" aria-label="${escape(palette.name)}"${index ? " hidden" : ""}>
      <div class="gh-review-stage">
        <figure data-device-view="desktop"><figcaption>${escape(palette.name)} · Desktop · 1440 px</figcaption><div class="gh-review-viewport" data-screen="desktop"><div class="gh-review-product" aria-label="${escape(palette.name)} desktop preview"></div></div></figure>
        <figure data-device-view="mobile"><figcaption>${escape(palette.name)} · Mobile · 390 px</figcaption><div class="gh-review-viewport" data-screen="mobile"><div class="gh-review-product" aria-label="${escape(palette.name)} mobile preview"></div></div></figure>
      </div>
    </section>`).join("\n");
// Asset dictionaries avoid repeating already-compressed fonts outside gzip's 32 KiB window.
const assets = [], assetIds = new Map();
for (const capture of captures.themes) for (const screen of ["desktop", "mobile"]) {
  capture[screen].css = capture[screen].css.replace(/@font-face\s*\{[^}]*\}/gi, rule => /url\(/i.test(rule) && !/data:/i.test(rule) ? "" : rule);
  for (const field of ["html", "css"]) {
    capture[screen][field] = capture[screen][field].replace(/data:[^\s"'<>)]*/g, value => {
      let id = assetIds.get(value);
      if (id === undefined) { id = assets.length; assets.push(value); assetIds.set(value, id); }
      return `__GH_EMBEDDED_ASSET_${id}__`;
    });
  }
}
const packed = { assets, themes: captures.themes };
const payload = JSON.stringify({ palettes, gzip: gzipSync(JSON.stringify(packed), { level: 9 }).toString("base64") }).replaceAll("<", "\\u003c");
const html = template.replace("    <!-- THEME_VARIANTS -->", variants).replace("<!-- THEME_PAYLOAD -->", `<script id="goal-hint-theme-payload" type="application/json">${payload}</script>`);
if (Buffer.byteLength(html) > 1_000_000) throw new Error("The gallery exceeds the inline visualization size limit.");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, html, "utf8");
console.log(`Built ten desktop/mobile theme previews: ${target} (${Buffer.byteLength(html).toLocaleString()} bytes)`);
