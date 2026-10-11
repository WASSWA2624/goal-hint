/** Generate Goal Hint assets from original geometry, outlined type and shared tokens.
 * Requires Node.js 20.9+ and Sharp 0.35.4. See assets/brand/README.md.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.BRAND_NODE_MODULES ? join(process.env.BRAND_NODE_MODULES, 'sharp') : 'sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(root, 'assets/brand');
const outputDir = join(root, 'public/brand');
const tokens = JSON.parse(await readFile(join(brandDir, 'brand-tokens.json'), 'utf8'));
const type = JSON.parse(await readFile(join(brandDir, 'source/type-outlines.json'), 'utf8'));
const c = tokens.colors;
const colorLabels = { navy: 'Navy', teal: 'Teal', tealOnDark: 'Teal on dark', paper: 'Paper', white: 'White', muted: 'Muted text', border: 'Border' };
await mkdir(outputDir, { recursive: true });

const escapeXml = value => value.replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[ch]));
const svg = (width, height, title, body, description = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title>${description ? `<desc>${escapeXml(description)}</desc>` : ''}${body}</svg>\n`;
const rawSvg = source => source.replace(/^<\?xml[^>]*>\s*/, '');
const point = (cx, cy, r, angle) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
const fmt = n => +n.toFixed(3);

// The open G is one filled path: a heavy ring with a radial top terminal and a
// square crossbar whose top edge sits on the horizontal centre line (slightly
// thinner than the ring, so it reads optically equal).
const G = { cx: 80, cy: 80, outer: 74, ring: 22, terminal: -42, bar: 21, tip: 106, gap: 6 };
// The football is concentric with the G, one gap inside the ring, and is knocked
// out around the crossbar with the same gap. Rotating it -36deg (centre pentagon
// pointing down) hides exactly one outer panel behind the bar, so no slivers.
const BALL = { radius: G.outer - G.ring - G.gap, outline: 4.6, seam: 3, rim: 4.6, rotate: -36 };
// Favicon: a shorter crossbar and tighter knockout; no seams and no rim.
const MICRO = { tip: 110, gap: 5.5 };
let maskCount = 0;

function gPath(tip) {
  const { cx, cy, outer, ring, bar } = G;
  const inner = outer - ring, angle = G.terminal * Math.PI / 180;
  const [ox, oy] = point(cx, cy, outer, angle).map(fmt);
  const [ix, iy] = point(cx, cy, inner, angle).map(fmt);
  const barInner = fmt(cx + Math.sqrt(inner ** 2 - bar ** 2));
  return `M${ox} ${oy}A${outer} ${outer} 0 1 0 ${cx + outer} ${cy}H${tip}V${cy + bar}H${barInner}A${inner} ${inner} 0 1 1 ${ix} ${iy}Z`;
}

// A real truncated icosahedron seen face-on: pentagons sit on icosahedron
// vertices and the seams between two hexagons are the middle thirds of its
// edges. Only the five seams leaving the facing pentagon are drawn; the seams
// running round the rim read as a second, busy outline at small sizes.
const ball = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const raw = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]];
  const norm = v => { const l = Math.hypot(...v); return v.map(n => n / l); };
  const sub = (a, b) => a.map((n, i) => n - b[i]);
  const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const lerp = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
  const ico = raw.map(norm);
  const edge = Math.min(...ico.slice(1).map(v => Math.hypot(...sub(v, ico[0]))));
  const neighbours = ico.map(v => ico.filter(w => w !== v && Math.abs(Math.hypot(...sub(v, w)) - edge) < 1e-6));
  // View frame: vertex 0 faces the viewer and one neighbour points up.
  const z = ico[0];
  const y = norm(sub(z.map(n => n * dot(neighbours[0][0], z)), neighbours[0][0])), x = cross(y, z);
  const view = v => [dot(v, x), dot(v, y), dot(v, z)];
  const angleAround = (p, axis) => {
    const k = norm(axis), u = norm(cross(Math.abs(k[2]) < .9 ? [0, 0, 1] : [0, 1, 0], k)), w = cross(k, u), d = sub(p, axis);
    return Math.atan2(dot(d, w), dot(d, u));
  };
  const pentagons = ico.map((v, i) => {
    const centre = view(v);
    return neighbours[i].map(w => view(lerp(v, w, 1 / 3))).sort((a, b) => angleAround(a, centre) - angleAround(b, centre));
  });
  const seams = neighbours[0].map(w => [view(lerp(z, w, 1 / 3)), view(lerp(z, w, 2 / 3))]);
  return { pentagons, seams };
})();

// Straight polyhedron edges are mapped onto the sphere, so the ball fills its
// disc exactly; anything behind the horizon (z < 0) is clipped away.
function sphereLine(a, b, steps = 8) {
  return Array.from({length: steps + 1}, (_, i) => {
    const p = a.map((n, k) => n + (b[k] - n) * i / steps);
    const l = Math.hypot(...p);
    return p.map(n => n / l);
  });
}
function frontPolygon(points) {
  const out = [];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    if (p[2] >= 0) out.push(p);
    if ((p[2] >= 0) !== (q[2] >= 0)) out.push(p.map((n, k) => n + (q[k] - n) * p[2] / (p[2] - q[2])));
  });
  return out;
}
function ballGeometry(cx, cy, r, inset, hidden) {
  const scale = r - inset, angle = BALL.rotate * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const place = p => [cx + (p[0] * cos - p[1] * sin) * scale, cy + (p[0] * sin + p[1] * cos) * scale];
  const project = p => place(p).map(n => +n.toFixed(2)).join(' ');
  const panels = ball.pentagons.map(ring => {
    const pts = frontPolygon(ring.flatMap((p, i) => sphereLine(p, ring[(i + 1) % ring.length]).slice(0, -1)));
    return pts.length > 2 ? `M${pts.map(project).join('L')}Z` : '';
  }).join('');
  // A seam running into the panel hidden behind the crossbar is dropped too.
  const seams = ball.seams.filter(([, b]) => !hidden(...place(sphereLine(b, b, 1)[0]))).map(([a, b]) => `M${sphereLine(a, b).map(project).join('L')}`).join('');
  return { panels, seams };
}

// Light surfaces: a clear ball with a navy outline, panels and seams.
// Dark surfaces: a solid light ball with a rim, the panels and seams cut through.
// The ball is masked so the surface shows through every gap in any context.
function mark(accent = c.teal, ink = c.navy, micro = false, onDark = ink === c.white) {
  const id = `goal-hint-ball-${++maskCount}`;
  const { cx, cy, bar } = G, r = BALL.radius;
  const { tip, gap } = micro ? MICRO : G;
  const hidden = (x, y) => x >= tip - gap && y >= cy - gap && y <= cy + bar + gap;
  const knockout = `<rect x="${fmt(tip - gap)}" y="${fmt(cy - gap)}" width="${fmt(160 - tip + gap)}" height="${fmt(bar + gap * 2)}" fill="black"/>`;
  let body;
  if (onDark) {
    const rim = micro ? 0 : BALL.rim;
    const { panels, seams } = ballGeometry(cx, cy, r, rim, hidden);
    body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white"/><path d="${panels}" fill="black"/>${micro ? '' : `<path d="${seams}" fill="none" stroke="black" stroke-width="${BALL.seam}"/><circle cx="${cx}" cy="${cy}" r="${fmt(r - rim / 2)}" fill="none" stroke="white" stroke-width="${rim}"/>`}`;
  } else {
    const { panels, seams } = ballGeometry(cx, cy, r, BALL.outline / 2, hidden);
    body = `<circle cx="${cx}" cy="${cy}" r="${fmt(r - BALL.outline / 2)}" fill="none" stroke="white" stroke-width="${BALL.outline}"/><path d="${panels}" fill="white"/>${micro ? '' : `<path d="${seams}" fill="none" stroke="white" stroke-width="${BALL.seam}"/>`}`;
  }
  return `<path d="${gPath(tip)}" fill="${accent}"/><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160">${body}${knockout}</mask><rect x="${fmt(cx - r)}" y="${fmt(cy - r)}" width="${fmt(r * 2)}" height="${fmt(r * 2)}" fill="${ink}" mask="url(#${id})"/>`;
}

function textPath(key, x, baseline, size, color) {
  const item = type[key];
  const scale = size / item.unitsPerEm;
  return `<g fill="${color}" transform="translate(${x} ${baseline}) scale(${scale} ${-scale})"><path d="${item.path}"/></g>`;
}

const logoHeight = 128;
const wordmarkSize = 93;
const wordmarkX = 133.4;
const logoWidth = Math.ceil(wordmarkX + type.wordmark.advance * wordmarkSize / type.wordmark.unitsPerEm + 8);
const wordmarkBaseline = 64 + (type.wordmark.bounds[3] + type.wordmark.bounds[1]) * wordmarkSize / type.wordmark.unitsPerEm / 2;
function logoBody(accent, ink) {
  return `<g transform="translate(8 8) scale(.7)">${mark(accent, ink)}</g>${textPath('wordmark', wordmarkX, wordmarkBaseline, wordmarkSize, ink)}`;
}
function logoAt(x, y, width, accent, ink) {
  const scale = width / logoWidth;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${logoBody(accent, ink)}</g>`;
}
function iconBody(size, background = c.navy) {
  const scale = size * .72 / 160;
  return `<rect width="${size}" height="${size}" fill="${background}"/><g transform="translate(${size * .14} ${size * .14}) scale(${scale})">${mark(c.tealOnDark, c.white)}</g>`;
}

const exports = [];
async function saveSvg(name, source, pngScale = 0) {
  await writeFile(join(outputDir, `${name}.svg`), source);
  exports.push(`${name}.svg`);
  if (pngScale) {
    const metadata = await sharp(Buffer.from(source)).metadata();
    await sharp(Buffer.from(source)).resize(Math.round(metadata.width * pngScale), Math.round(metadata.height * pngScale)).png().toFile(join(outputDir, `${name}.png`));
    exports.push(`${name}.png`);
  }
}
const variants = [
  ['primary', c.teal, c.navy],
  ['inverse', c.tealOnDark, c.white],
  ['monochrome', c.navy, c.navy],
  ['monochrome-inverse', c.white, c.white],
];
for (const [name, accent, ink] of variants) {
  await saveSvg(`goal-hint-logo-${name}`, svg(logoWidth, logoHeight, 'Goal Hint', logoBody(accent, ink), 'A geometric G around a football beside the Goal Hint wordmark.'), 2);
  await saveSvg(`goal-hint-mark-${name}`, svg(160, 160, 'Goal Hint mark', mark(accent, ink)), 4);
}

const favicon = svg(160, 160, 'Goal Hint', `<rect width="160" height="160" fill="${c.navy}"/>${mark(c.tealOnDark, c.white, true)}`);
await saveSvg('goal-hint-favicon', favicon);
const iconSizes = [16, 32, 48];
const iconBuffers = await Promise.all(iconSizes.map(size => sharp(Buffer.from(favicon)).resize(size, size).png().toBuffer()));
const icoHeader = Buffer.alloc(6 + iconBuffers.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(iconBuffers.length, 4);
let iconOffset = icoHeader.length;
for (let i = 0; i < iconBuffers.length; i++) {
  const entry = 6 + i * 16;
  icoHeader[entry] = icoHeader[entry + 1] = iconSizes[i];
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(iconBuffers[i].length, entry + 8);
  icoHeader.writeUInt32LE(iconOffset, entry + 12);
  iconOffset += iconBuffers[i].length;
  await writeFile(join(outputDir, `goal-hint-favicon-${iconSizes[i]}.png`), iconBuffers[i]);
  exports.push(`goal-hint-favicon-${iconSizes[i]}.png`);
}
await writeFile(join(outputDir, 'goal-hint-favicon.ico'), Buffer.concat([icoHeader, ...iconBuffers]));
exports.push('goal-hint-favicon.ico');
for (const [name, size] of [['apple-touch-icon', 180], ['app-icon-192', 192], ['app-icon-512', 512], ['social-avatar', 512]]) {
  await saveSvg(`goal-hint-${name}`, svg(size, size, 'Goal Hint', iconBody(size)), 1);
}

const ogBody = `<rect width="1200" height="630" fill="${c.navy}"/>${logoAt(64, 45, 326, c.tealOnDark, c.white)}<path d="M64 158 H1136" stroke="${c.white}" stroke-opacity=".2"/>${textPath('headline1', 64, 287, 62, c.white)}${textPath('headline2', 64, 369, 62, c.tealOnDark)}<g transform="translate(882 220) scale(1.46)">${mark(c.tealOnDark, c.white)}</g>${textPath('descriptor', 64, 457, 22, c.white)}${textPath('domain', 64, 566, 25, c.tealOnDark)}`;
await saveSvg('goal-hint-open-graph', svg(1200, 630, 'Goal Hint — Football predictions. Clearly explained.', ogBody, 'AI analysis, estimated probabilities and verified outcomes. goalhint.com.'), 1);

const css = `/* Generated from assets/brand/brand-tokens.json. */\n:root {\n  --gh-navy: ${c.navy};\n  --gh-teal: ${c.teal};\n  --gh-teal-on-dark: ${c.tealOnDark};\n  --gh-paper: ${c.paper};\n  --gh-white: ${c.white};\n  --gh-text-muted: ${c.muted};\n  --gh-border: ${c.border};\n  --gh-font-family: ${tokens.typography.family};\n  --gh-radius: ${tokens.shape.componentRadius};\n}\n`;
await writeFile(join(outputDir, 'goal-hint-brand-tokens.css'), css);
await writeFile(join(outputDir, 'goal-hint-brand-tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
exports.push('goal-hint-brand-tokens.css', 'goal-hint-brand-tokens.json');

// Contact sheet uses system text only for explanatory labels. Public artwork is
// entirely outlined, and its appearance does not depend on installed fonts.
const label = (text, x, y, size = 22, color = c.muted, weight = 400) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(text)}</text>`;
const panel = (x, y, width, height, fill, body) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>${body}`;
const sheet = svg(1600, 1480, 'Goal Hint brand asset overview', `<rect width="1600" height="1480" fill="${c.paper}"/>${label('GOAL HINT / BRAND SYSTEM', 64, 68, 20, c.teal, 700)}${label('A clear view of the match.', 64, 121, 40, c.navy, 700)}${label('PRIMARY / NAVY + TEAL', 64, 180, 18)}${label('INVERSE / DARK SURFACES', 836, 180, 18)}${panel(64, 204, 708, 230, c.white, logoAt(112, 256, 612, c.teal, c.navy))}${panel(836, 204, 700, 230, c.navy, logoAt(880, 256, 612, c.tealOnDark, c.white))}${label('MONOCHROME', 64, 484, 18)}${label('SYMBOL / FULL + SMALL SIZE', 836, 484, 18)}${panel(64, 506, 708, 180, c.white, logoAt(128, 538, 580, c.navy, c.navy))}${panel(836, 506, 700, 180, c.white, `<g transform="translate(878 516)">${mark()}</g><g transform="translate(1088 516)">${mark(c.navy, c.navy)}</g><g transform="translate(1324 540) scale(.68)"><rect width="160" height="160" fill="${c.navy}"/>${mark(c.tealOnDark, c.white, true)}</g>`)}${label('CORE PALETTE', 64, 736, 18)}${['navy', 'teal', 'tealOnDark', 'paper', 'white'].map((key, i) => `<rect x="${64 + i * 296}" y="758" width="288" height="72" fill="${c[key]}" stroke="${c.border}"/>${label(colorLabels[key].toUpperCase(), 64 + i * 296, 858, 16)}${label(c[key], 64 + i * 296, 884, 20, c.navy)}`).join('')}${label('SOCIAL / OPEN GRAPH 1200 × 630', 64, 952, 18)}<g transform="translate(64 974) scale(.65)">${ogBody}</g>${label('APP ICON + SOCIAL AVATAR', 900, 952, 18)}<g transform="translate(900 974)">${iconBody(288)}</g>${label('Manrope / outlined wordmark', 1220, 1026, 19, c.navy)}${label('Square component corners', 1220, 1066, 19, c.navy)}${label('Original SVG geometry', 1220, 1106, 19, c.navy)}${label('Remote team logos stay remote', 1220, 1146, 19, c.navy)}${label('Use estimated probabilities, never guaranteed wins.', 900, 1320, 18)}${label('Source of truth: assets/brand/brand-tokens.json + scripts/generate-brand.mjs', 64, 1432, 19)}`);
await writeFile(join(brandDir, 'goal-hint-brand-sheet.svg'), sheet);
await sharp(Buffer.from(sheet)).png().toFile(join(brandDir, 'goal-hint-brand-sheet.png'));

const previewItems = variants.map(([name]) => `<figure class="${name.includes('inverse') ? 'dark' : ''}"><div class="art">${rawSvg(logoSvg(name))}</div><figcaption>Horizontal logo / ${name.replaceAll('-', ' ')}</figcaption></figure>`).join('');
function logoSvg(name) {
  const [, accent, ink] = variants.find(item => item[0] === name);
  return svg(logoWidth, logoHeight, `Goal Hint ${name} logo`, logoBody(accent, ink));
}
const palette = Object.entries(c).map(([name, color]) => `<li><span style="background:${color}"></span><strong>${colorLabels[name]}</strong><code>${color}</code></li>`).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Goal Hint — Brand assets</title><style>*{box-sizing:border-box}body{margin:0;background:${c.paper};color:${c.navy};font:16px/1.6 Arial,sans-serif}main{max-width:1240px;margin:auto;padding:40px 24px}h1{font-size:40px;line-height:1.15;margin:8px 0 16px}h2{margin-top:40px;font-size:22px}p{max-width:780px}a{color:${c.teal}}.eyebrow{color:${c.teal};font-weight:700;letter-spacing:.12em}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;border:1px solid ${c.border}}.art{padding:32px;min-height:180px;display:flex;align-items:center}.art svg{width:100%;height:auto}.dark .art{background:${c.navy}}figcaption{padding:12px 20px;border-top:1px solid ${c.border};font-size:14px}.symbols{display:flex;gap:40px;align-items:center;flex-wrap:wrap;padding:24px;background:white;border:1px solid ${c.border}}.symbols svg{width:120px;height:120px}.symbols .favicon{width:32px;height:32px}ul.palette{list-style:none;padding:0;display:grid;grid-template-columns:repeat(7,1fr);gap:12px}.palette span{display:block;height:64px;border:1px solid ${c.border}}.palette strong,.palette code{display:block;font-size:13px;overflow-wrap:anywhere}.social svg{width:100%;height:auto}.notes{padding:24px;background:white;border-left:4px solid ${c.teal}}code{font-family:Consolas,monospace}@media(max-width:650px){.grid{grid-template-columns:1fr}.art{padding:20px;min-height:120px}.palette{grid-template-columns:repeat(3,1fr)!important}h1{font-size:32px}}</style></head><body><main><p class="eyebrow">GOAL HINT / BRAND SYSTEM</p><h1>Football predictions.<br>Clearly explained.</h1><p>A solid football inside a heavy open geometric G, beside a bold Manrope wordmark. Deep navy establishes the reading surface; teal is the navigation and identity accent.</p><h2>Horizontal logos</h2><div class="grid">${previewItems}</div><h2>Full symbol and small-size favicon</h2><div class="symbols">${rawSvg(svg(160,160,'Primary mark',mark()))}${rawSvg(svg(160,160,'Monochrome mark',mark(c.navy,c.navy)))}${rawSvg(favicon).replace('<svg ', '<svg class="favicon" ')}</div><h2>Shared palette</h2><ul class="palette">${palette}</ul><h2>Social preview</h2><div class="social">${rawSvg(svg(1200,630,'Goal Hint social preview',ogBody))}</div><h2>Use consistently</h2><div class="notes"><p>Use primary artwork on white or paper; inverse artwork on navy. Keep clear space equal to one quarter of the mark width. Use the micro favicon at 16–32 pixels. Do not stretch, recolor, add shadows or apply rounded containers.</p><p>The wordmark is Manrope, converted to paths. The source font and its SIL Open Font License are preserved. Use the brand mark beside the name where possible; label icon-only links accessibly.</p><p>See <a href="README.md">the asset guide</a> for exact files, metadata integration and regeneration. The existing raster logo is preserved unchanged under <code>reference/</code>.</p></div></main></body></html>\n`;
await writeFile(join(brandDir, 'goal-hint-brand-preview.html'), html);

await writeFile(join(brandDir, 'asset-manifest.json'), JSON.stringify({name: tokens.name, publicPath: '/brand/', files: exports.sort()}, null, 2) + '\n');
console.log(`Generated ${exports.length} public assets, a standalone HTML preview and the brand contact sheet.`);
