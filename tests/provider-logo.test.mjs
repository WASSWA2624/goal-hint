import assert from 'node:assert/strict';
import test from 'node:test';
import { isOptimizableProviderLogo } from '../src/domain/provider-logo.ts';
import { providerImageSource } from '../src/components/ui/provider-image.ts';
import { badgeParameters, badgeInputFormat, resizeBadge, loadProviderBadge } from '../src/server/images/provider-badge.ts';

test('only credential-free provider team and league PNGs qualify for optimization', () => {
  for (const kind of ['teams', 'leagues']) assert.equal(isOptimizableProviderLogo(`https://media.api-sports.io/football/${kind}/33.png`), true);
  for (const url of ['http://media.api-sports.io/football/teams/33.png', 'https://media.api-sports.io.evil.test/football/teams/33.png',
    'https://user:secret@media.api-sports.io/football/teams/33.png', 'https://media.api-sports.io/football/teams/33.png?token=private',
    'https://media.api-sports.io/football/teams/33.png#fragment', 'https://media.api-sports.io/football/teams/33.svg',
    'https://media.api-sports.io/football/players/33.png', 'https://127.0.0.1/football/teams/33.png']) {
    assert.equal(isOptimizableProviderLogo(url), false, url);
  }
});

test('badges use bounded retina sizes and other approved hosts stay direct', () => {
  assert.equal(providerImageSource('https://media.api-sports.io/football/teams/33.png', 32), '/badges/teams/33/64.webp');
  assert.equal(providerImageSource('https://media.api-sports.io/football/leagues/39.png', 14), '/badges/leagues/39/32.webp');
  assert.equal(providerImageSource('https://static.match-card.test/team.svg', 32), 'https://static.match-card.test/team.svg');
  assert.deepEqual(badgeParameters('teams', '33', '64.webp'), { source: 'https://media.api-sports.io/football/teams/33.png', width: 64 });
  for (const args of [['players', '33', '64.webp'], ['teams', '../secret', '64.webp'], ['teams', '33', '4096.webp'], ['teams', '033', '64.webp']]) {
    assert.equal(badgeParameters(...args), null);
  }
});

test('badge loader rejects oversized or non-raster input before decoding', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('not png', { headers: { 'content-type': 'image/png' } });
    await assert.rejects(() => loadProviderBadge('https://media.api-sports.io/football/teams/33.png', 32), /bounded PNG/u);
    globalThis.fetch = async () => new Response('oversized', { headers: { 'content-type': 'image/png', 'content-length': '1048577' } });
    await assert.rejects(() => loadProviderBadge('https://media.api-sports.io/football/teams/33.png', 32), /unavailable/u);
  } finally { globalThis.fetch = original; }
});

test('the local image codec produces a bounded WebP', async () => {
  if (process.platform === 'linux') return; // The hosted codec is verified before activation.
  const { default: sharp } = await import('sharp');
  const png = await sharp({ create: { width: 128, height: 96, channels: 4, background: '#049893' } }).png().toBuffer();
  const output = await resizeBadge(png, 32), metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 24);
});

test('a provider JPEG mislabeled as PNG is safely optimized', async () => {
  const { default: sharp } = await import('sharp');
  const jpeg = await sharp({ create: { width: 96, height: 128, channels: 3, background: '#049893' } }).jpeg().toBuffer();
  assert.equal(badgeInputFormat(jpeg), 'jpeg');
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(jpeg, { headers: { 'content-type': 'image/png' } });
    const output = await loadProviderBadge('https://media.api-sports.io/football/leagues/396.png', 32);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 24);
    assert.equal(metadata.height, 32);
  } finally { globalThis.fetch = original; }
});

test('JPEG dimensions and segment bounds are checked before decoding', () => {
  const frame = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 0, 32, 0, 32, 1]);
  assert.equal(badgeInputFormat(frame), 'jpeg');
  const oversized = Buffer.from(frame); oversized.writeUInt16BE(2049, 9);
  assert.equal(badgeInputFormat(oversized), null);
  const empty = Buffer.from(frame); empty.writeUInt16BE(0, 7);
  assert.equal(badgeInputFormat(empty), null);
  assert.equal(badgeInputFormat(frame.subarray(0, 10)), null);
  assert.equal(badgeInputFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1])), null);
  assert.equal(badgeInputFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
});
