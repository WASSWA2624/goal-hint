import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reuse the web application's canonical artwork and pinned Sharp dependency.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireWeb = createRequire(resolve(root, 'next-js/package.json'));
const sharp = requireWeb('sharp');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) {
  throw new Error('Usage: node flutter/tool/generate-icons.mjs [--check]');
}
const source = await readFile(resolve(root, 'next-js/public/brand/goal-hint-mark-primary.svg'), 'utf8');
const microSource = await readFile(resolve(root, 'next-js/public/brand/goal-hint-favicon.svg'), 'utf8');
const mark = input => input.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const padded = input => `<g transform="translate(71.68 71.68) scale(2.304)">${mark(input)}</g>`;
const layers = padded(source);
const svg = contents => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${contents}</svg>`;
const artwork = Buffer.from(svg(`<rect width="512" height="512" fill="#FFFFFF"/>${layers}`));
const foreground = Buffer.from(svg(layers));
// The shared micro mark keeps its football opaque on either title-bar appearance.
const microForeground = Buffer.from(svg(padded(microSource)));
const monochrome = Buffer.from(foreground.toString()
  .replaceAll('fill="#00A9EE"', 'fill="#FFFFFF"')
  .replaceAll('fill="#061747"', 'fill="#FFFFFF"'));

const stale = [];
let outputs = 0;
async function output(path, bytes) {
  outputs++;
  const target = resolve(root, 'flutter', path);
  try {
    if ((await readFile(target)).equals(bytes)) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (check) { stale.push(path); return; }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

// Native feedback uses the same identity and palette as the shared website.
const tokens = JSON.parse(await readFile(resolve(root, 'next-js/assets/brand/brand-tokens.json'), 'utf8'));
const colors = Object.entries(tokens.colors).map(([name, value]) => {
  if (!/^[a-zA-Z]+$/.test(name) || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error('Invalid canonical brand color.');
  }
  return `  static const ${name} = Color(0xFF${value.slice(1).toUpperCase()});`;
});
await output('lib/config/brand_tokens.dart', Buffer.from(
  `// Generated from next-js/assets/brand/brand-tokens.json.\n` +
  `// Run node flutter/tool/generate-icons.mjs after updating the shared brand.\n` +
  `import 'package:flutter/painting.dart';\n\n` +
  `abstract final class BrandTokens {\n  static const name = ${JSON.stringify(tokens.name)};\n${colors.join('\n')}\n}\n`
));

async function png(size, input = artwork) {
  return sharp(input, { density: Math.max(72, 72 * size / 512) })
    .resize(size, size).flatten({ background: '#FFFFFF' }).removeAlpha().png().toBuffer();
}

async function verifyAdaptive(bytes, scale) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const center = info.width / 2;
  // One raster pixel allows antialiasing at the 66dp circular safe-zone edge.
  const radius = 33 * scale + 1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 16 && Math.hypot(x + 0.5 - center, y + 0.5 - center) > radius) {
      throw new Error('Adaptive artwork exceeds Android\'s 66dp safe zone.');
    }
  }
}

for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  await output(`${directory}/ic_launcher.png`, await png(48 * scale));
  // The existing mark occupies 2/3 of its square. Scale it into Android's
  // 66dp adaptive safe zone inside the 108dp foreground canvas.
  const canvas = 108 * scale;
  const inset = Math.round(canvas / 24);
  for (const [name, input] of [['foreground', foreground], ['monochrome', monochrome]]) {
    const content = await sharp(input).resize(canvas - 2 * inset).png().toBuffer();
    const icon = await sharp({ create: { width: canvas, height: canvas, channels: 4, background: '#00000000' } })
      .composite([{ input: content, gravity: 'centre' }]).png().toBuffer();
    await verifyAdaptive(icon, scale);
    await output(`${directory}/ic_launcher_${name}.png`, icon);
  }
}

for (const platform of ['ios', 'macos']) {
  const directory = `${platform}/Runner/Assets.xcassets/AppIcon.appiconset`;
  const contents = JSON.parse(await readFile(resolve(root, 'flutter', directory, 'Contents.json'), 'utf8'));
  const icons = new Map();
  for (const image of contents.images.filter(image => image.filename)) {
    const dimensions = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(image.size);
    const scale = /^(\d+)x$/.exec(image.scale);
    const size = dimensions && scale ? Number(dimensions[1]) * Number(scale[1]) : NaN;
    if (!dimensions || dimensions[1] !== dimensions[2] || !Number.isInteger(size) || size < 1
      || basename(image.filename) !== image.filename || !image.filename.endsWith('.png')
      || icons.has(image.filename) && icons.get(image.filename) !== size) {
      throw new Error(`Invalid square icon declaration in ${platform}: ${image.filename}`);
    }
    icons.set(image.filename, size);
  }
  for (const [filename, size] of icons) {
    const image = platform === 'macos'
      ? await sharp(size <= 32 ? microForeground : foreground,
        { density: Math.max(72, 72 * size / 512) }).resize(size).png().toBuffer()
      : await png(size);
    await output(`${directory}/${filename}`, image);
  }
}

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
// Explorer and taskbar surfaces can be light or dark at every icon size. Reuse
// the canonical opaque-football mark throughout, with a transparent outer tile.
// Its painted bounds are 6..154 in the 160px source. A Windows-only 164px
// viewport fits that unchanged geometry to about 90%, rather than the shared
// mobile clear-space layout's 67%; the extra 2px on each side prevents clipping.
const windowsForeground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-2 -2 164 164">${mark(microSource)}</svg>`);
const images = await Promise.all(sizes.map(size => sharp(windowsForeground)
  .resize(size).ensureAlpha().png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + 16 * index;
  header[entry] = size === 256 ? 0 : size;
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await output('windows/runner/resources/app_icon.ico', Buffer.concat([header, ...images]));
await output('linux/runner/resources/goal-hint.png', await sharp(foreground).resize(256).png().toBuffer());
const splashMark = await readFile(resolve(root, 'next-js/public/brand/goal-hint-mark-primary.svg'));
await output('assets/branding/goal-hint-mark.png', await sharp(splashMark, { density: 288 }).resize(384).png().toBuffer());
const inverseMark = await readFile(resolve(root, 'next-js/public/brand/goal-hint-mark-inverse.svg'));
await output('assets/branding/goal-hint-mark-inverse.png', await sharp(inverseMark, { density: 288 }).resize(384).png().toBuffer());
for (const scale of [1, 2, 3]) {
  const suffix = scale === 1 ? '' : `@${scale}x`;
  await output(`ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage${suffix}.png`,
    await sharp(splashMark, { density: 72 * scale }).resize(96 * scale).png().toBuffer());
}
const nativeMark = await sharp(splashMark, { density: 432 }).resize(768).png().toBuffer();
await output('android/app/src/main/res/drawable-nodpi/goal_hint_splash.png',
  await sharp({ create: { width: 1152, height: 1152, channels: 4, background: '#00000000' } })
    .composite([{ input: nativeMark, gravity: 'centre' }]).png().toBuffer());
const wordmark = await readFile(resolve(root, 'next-js/public/brand/goal-hint-logo-primary.svg'));
const nativeBranding = await sharp(wordmark, { density: 288 })
  .resize(720, 288, { fit: 'inside' }).png().toBuffer();
await output('android/app/src/main/res/drawable-nodpi/goal_hint_splash_branding.png',
  await sharp({ create: { width: 800, height: 320, channels: 4, background: '#00000000' } })
    .composite([{ input: nativeBranding, gravity: 'centre' }]).png().toBuffer());
if (check && stale.length) {
  console.error(`Native branding is missing or stale:\n${stale.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`${check ? 'Verified' : 'Generated'} ${outputs} native ${tokens.name} assets from the shared web artwork.`);
}
