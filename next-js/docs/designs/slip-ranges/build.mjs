// Assembles docs/designs/slip-ranges/dNN-*.html fragments + manifest.json into docs/designs/slip-ranges.html
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frameCss = readFileSync(join(here, "_frame.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const fragments = readdirSync(here).filter((name) => /^d\d{2}-.*\.html$/.test(name)).sort();
const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cards = fragments.map((file) => {
  const number = file.slice(1, 3);
  const entry = manifest.find((item) => item.file.endsWith(file)) ?? { name: file, tagline: "", notes: "" };
  const html = readFileSync(join(here, file), "utf8");
  return `<article class="sample" id="d${number}" data-sample>
  <header class="sample-head">
    <div><span class="num">${number}</span><h2>${escape(entry.name)}</h2><p class="tagline">${escape(entry.tagline)}</p></div>
    <div class="sample-tools"><a class="solo" href="?only=d${number}#d${number}">Open alone</a><a class="top" href="#top">Top</a></div>
  </header>
  ${entry.notes ? `<p class="notes">${escape(entry.notes)}</p>` : ""}
  <div class="stage">
${html}
  </div>
</article>`;
}).join("\n");

const index = fragments.map((file) => {
  const number = file.slice(1, 3);
  const entry = manifest.find((item) => item.file.endsWith(file)) ?? { name: file };
  return `<a href="#d${number}"><b>${number}</b> ${escape(entry.name)}</a>`;
}).join("");

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Slip builder range controls · 20 samples</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
${frameCss}
/* Gallery chrome */
html { background: #EFF8FF; }
body { margin: 0; font-family: "Manrope", Arial, sans-serif; color: #071747; background: #EFF8FF; }
.gallery { max-inline-size: 1180px; margin: 0 auto; padding: 24px 16px 80px; }
.gallery-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; margin-block-end: 12px; }
.gallery-head h1 { margin: 0; font-size: 1.5rem; }
.gallery-head p { margin: 4px 0 0; color: #486B9F; font-size: 0.875rem; max-inline-size: 60ch; }
.viewport { display: inline-flex; border: 1px solid #7D8997; border-radius: 2px; overflow: hidden; }
.viewport button { border: 0; background: #fff; color: #071747; font: inherit; font-size: 0.8125rem; font-weight: 700; padding: 8px 14px; cursor: pointer; }
.viewport button[aria-pressed="true"] { background: #0066F5; color: #fff; }
.index { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 24px; }
.index a { display: inline-flex; gap: 6px; align-items: center; padding: 5px 9px; border: 1px solid #DFE6EE; border-radius: 2px; background: #fff; color: #071747; font-size: 0.75rem; text-decoration: none; }
.index a b { color: #005BD6; }
.index a:hover { background: #E6F3FF; }
.sample { margin-block-end: 36px; scroll-margin-top: 16px; }
.sample-head { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-block-end: 8px; }
.sample-head h2 { display: inline; margin: 0 0 0 8px; font-size: 1.0625rem; }
.sample-head .num { display: inline-flex; align-items: center; justify-content: center; min-inline-size: 2rem; block-size: 1.5rem; padding-inline: 6px; background: #071747; color: #fff; font-size: 0.75rem; font-weight: 800; border-radius: 2px; vertical-align: middle; }
.sample-head .tagline { margin: 4px 0 0; color: #486B9F; font-size: 0.8125rem; }
.sample-tools { display: flex; gap: 10px; flex: none; }
.sample-tools a { color: #005BD6; font-size: 0.75rem; font-weight: 700; text-decoration: none; }
.sample-tools a:hover { text-decoration: underline; }
.notes { margin: 0 0 8px; color: #486B9F; font-size: 0.75rem; max-inline-size: 90ch; }
.stage { inline-size: 100%; max-inline-size: 1100px; padding: 16px; background: #EFF8FF; border: 1px dashed #BFD3EA; border-radius: 2px; }
body[data-viewport="phone"] .stage { inline-size: 390px; max-inline-size: 100%; padding: 10px; }
body[data-only] .sample { display: none; }
body[data-only] .sample[data-shown] { display: block; }
</style>
</head>
<body>
<div class="gallery" id="top">
  <header class="gallery-head">
    <div>
      <h1>Slip builder · range control samples</h1>
      <p>Twenty ways to set <b>Total odds per slip</b> and <b>Matches per slip</b> in less space. Every sample is interactive. Switch the stage width to check the phone layout.</p>
    </div>
    <div class="viewport" role="group" aria-label="Stage width">
      <button type="button" data-viewport="desktop" aria-pressed="true">Desktop</button>
      <button type="button" data-viewport="phone" aria-pressed="false">Phone · 390px</button>
    </div>
  </header>
  <nav class="index" aria-label="Samples">${index}</nav>
${cards}
</div>
<script>
(function () {
  var buttons = document.querySelectorAll('.viewport button');
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      buttons.forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
      document.body.setAttribute('data-viewport', button.getAttribute('data-viewport'));
    });
  });
  var only = new URLSearchParams(location.search).get('only');
  if (only) {
    var sample = document.getElementById(only);
    if (sample) { document.body.setAttribute('data-only', only); sample.setAttribute('data-shown', ''); }
  }
})();
</script>
</body>
</html>
`;
writeFileSync(join(here, "..", "slip-ranges.html"), page);
console.log(`Built ${fragments.length} samples into docs/designs/slip-ranges.html`);
