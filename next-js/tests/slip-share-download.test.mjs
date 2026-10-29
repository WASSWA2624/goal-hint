import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';
import { slipShareCaption, whatsAppShareUrl } from '../src/domain/slip-share-caption.ts';
import { createSlipShareDownload } from '../src/components/slips/sharing/slip-share-download.ts';

const shared = {
  id: 'a'.repeat(32), url: `https://goalhint.com/s/${'a'.repeat(32)}`, createdAt: '2026-10-29T10:00:00.000Z',
  slip: { id: 'source-slip', selections: [{ fixtureId: 'first' }, { fixtureId: 'second' }, { fixtureId: 'third' }],
    totalOdds: '4.10', oddsBasis: 'bookmaker', averageProbability: 0.758 },
};

test('the shared caption retains the slip summary, exact permanent URL, app URL, and branding', () => {
  const caption = slipShareCaption(shared, 'en');
  assert.match(caption, /^My Goal Hint slip\n3 selections · Total odds 4\.10\n/u);
  assert.ok(caption.includes(`View this slip: ${shared.url}`));
  assert.ok(caption.includes('Explore Goal Hint: https://goalhint.com'));
  assert.ok(caption.endsWith('Created with Goal Hint'));
  assert.equal(caption.split(shared.url).length - 1, 1);
  // Public captions expose only the share token; the internal source identity stays private.
  assert.ok(!caption.includes(shared.slip.id));
});

test('the WhatsApp URL round-trips the complete caption without changing links or line breaks', () => {
  const caption = `${slipShareCaption(shared, 'en')}\nClub A & B + C? #final = yes\nMünchen ⚽ 日本語`;
  const url = new URL(whatsAppShareUrl(caption));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/');
  assert.deepEqual([...url.searchParams.keys()], ['text']);
  assert.equal(url.searchParams.get('text'), caption);
  assert.equal(url.hash, '');
  assert.ok(!url.search.includes('\n'));
});

test('a single PNG is returned intact, with the same filename, type, and bytes', async () => {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 65]);
  const image = new File([bytes], `goal-hint-${shared.id}.png`, { type: 'image/png', lastModified: 1234 });
  const download = await createSlipShareDownload([image], shared.id, slipShareCaption(shared, 'en'));
  assert.equal(download, image);
  assert.equal(download.name, image.name);
  assert.equal(download.type, 'image/png');
  assert.equal(download.lastModified, 1234);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
});

test('multiple pages create a real ZIP containing every exact PNG and a UTF-8 caption', async () => {
  const contents = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 65]),
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 10, 0, 240, 159, 154, 128]),
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 222, 173, 190, 239]),
  ];
  const files = contents.map((bytes, index) => new File([bytes], `goal-hint-${shared.id}-${String(index + 1).padStart(2, '0')}.png`, { type: 'image/png' }));
  const caption = `${slipShareCaption(shared, 'en')}\nMünchen · 日本語 · ⚽`;
  const archive = await createSlipShareDownload(files, shared.id, caption);
  assert.equal(archive.name, `goal-hint-${shared.id}.zip`);
  assert.equal(archive.type, 'application/zip');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [80, 75, 3, 4]);
  const entries = unzipSync(bytes);
  assert.deepEqual(Object.keys(entries).sort(), ['caption.txt', ...files.map(file => file.name)].sort());
  assert.equal(strFromU8(entries['caption.txt']), caption);
  files.forEach((file, index) => assert.deepEqual(entries[file.name], contents[index]));
});

test('an empty image set fails instead of producing an empty or misleading download', async () => {
  await assert.rejects(createSlipShareDownload([], shared.id, 'caption'), /No slip images to download/u);
});
