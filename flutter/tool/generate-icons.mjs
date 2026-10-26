import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reuse the web application's canonical artwork and pinned Sharp dependency.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireWeb = createRequire(resolve(root, 'next-js/package.json'));
const sharp = requireWeb('sharp');
const source = await readFile(resolve(root, 'next-js/public/brand/goal-hint-mark-primary.svg'), 'utf8');
const mark = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const layers = `<g transform="translate(71.68 71.68) scale(2.304)">${mark}</g>`;
const svg = contents => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${contents}</svg>`;
const artwork = Buffer.from(svg(`<rect width="512" height="512" fill="#FFFFFF"/>${layers}`));
const foreground = Buffer.from(svg(layers));
const monochrome = Buffer.from(foreground.toString()
  .replaceAll('fill="#00A9EE"', 'fill="#FFFFFF"')
  .replaceAll('fill="#061747"', 'fill="#FFFFFF"'));

async function output(path, bytes) {
  const target = resolve(root, 'flutter', path);
  await mkdir(dirname(target), { recursive: true });
  try {
    if ((await readFile(target)).equals(bytes)) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(target, bytes);
}

async function png(size, input = artwork) {
  return sharp(input, { density: Math.max(72, 72 * size / 512) })
    .resize(size, size).flatten({ background: '#FFFFFF' }).removeAlpha().png().toBuffer();
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
    await output(`${directory}/ic_launcher_${name}.png`, icon);
  }
}

for (const platform of ['ios', 'macos']) {
  const directory = `${platform}/Runner/Assets.xcassets/AppIcon.appiconset`;
  const contents = JSON.parse(await readFile(resolve(root, 'flutter', directory, 'Contents.json'), 'utf8'));
  const icons = new Map(contents.images.filter(image => image.filename).map(image => [
    image.filename, Math.round(Number.parseFloat(image.size) * Number.parseFloat(image.scale)),
  ]));
  for (const [filename, size] of icons) {
    const image = platform === 'macos'
      ? await sharp(foreground, { density: Math.max(72, 72 * size / 512) }).resize(size).png().toBuffer()
      : await png(size);
    await output(`${directory}/${filename}`, image);
  }
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size => sharp(foreground).resize(size).ensureAlpha().png().toBuffer()));
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
console.log('Generated native Goal Hint icons from the shared web artwork.');
