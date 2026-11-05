import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { link, mkdir, mkdtemp, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { loadPilotAuthority, pilotSha256 } from '../scripts/lib/intelligence-pilot-archive.mjs';
import { acquirePilot } from '../scripts/acquire-intelligence-pilot.mjs';

// Invented bytes exercise archive boundaries, never statistical accuracy. Even
// consistent local hashes cannot turn these bytes into the pinned public vintage.
async function fixture() {
  const parent = path.resolve('.tmp/intelligence-pilot-archive-tests');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'archive-'));
  const contents = {
    'zenodo-record.json': '{"id":1,"files":[]}',
    'zenodo-results.csv': 'synthetic,not-the-published-source\n',
    'protocol.json': '{"synthetic":true}',
  };
  for (const [name, content] of Object.entries(contents)) await writeFile(path.join(directory, name), content);
  const manifest = {
    version: 1,
    sources: [
      { file: 'zenodo-record.json', sha256: pilotSha256(contents['zenodo-record.json']), kind: 'archive-metadata' },
      { file: 'zenodo-results.csv', sha256: pilotSha256(contents['zenodo-results.csv']), kind: 'archive-results' },
    ],
    protocol: { file: 'protocol.json', sha256: pilotSha256(contents['protocol.json']) },
    protocolHash: 'a'.repeat(64), datasetHash: 'b'.repeat(64),
  };
  async function pin() {
    const text = JSON.stringify(manifest);
    await writeFile(path.join(directory, 'manifest.json'), text);
    return pilotSha256(text);
  }
  return { directory, contents, manifest, pin, hash: await pin() };
}

test('the external manifest pin rejects edits before granting any dataset authority', async () => {
  const archive = await fixture();
  await assert.rejects(loadPilotAuthority(archive.directory, 'not-a-hash'), /manifest authority/);
  archive.manifest.datasetHash = 'c'.repeat(64);
  await archive.pin();
  await assert.rejects(loadPilotAuthority(archive.directory, archive.hash), /manifest integrity failed/);
});

test('source mutation fails its original pin and locally resealing arbitrary bytes cannot authenticate a vintage', async () => {
  const archive = await fixture();
  await assert.rejects(loadPilotAuthority(archive.directory, archive.hash), /unverified-pilot-source/);
  const changed = '{"id":7831873,"files":[],"synthetic":true}';
  await writeFile(path.join(archive.directory, 'zenodo-record.json'), changed);
  await assert.rejects(loadPilotAuthority(archive.directory, archive.hash), /source integrity failed/);
  archive.manifest.sources[0].sha256 = pilotSha256(changed);
  const newPin = await archive.pin();
  await assert.rejects(loadPilotAuthority(archive.directory, newPin), /unverified-pilot-source/);
});

test('even a pinned manifest cannot traverse paths, reuse source identity, or read linked source files', async () => {
  const traversal = await fixture();
  traversal.manifest.sources[0].file = '../outside.json';
  await assert.rejects(loadPilotAuthority(traversal.directory, await traversal.pin()), /source identity/);

  const duplicate = await fixture();
  duplicate.manifest.sources.push({ ...duplicate.manifest.sources[0] });
  await assert.rejects(loadPilotAuthority(duplicate.directory, await duplicate.pin()), /source identity/);

  const linked = await fixture();
  const source = path.join(linked.directory, 'zenodo-record.json');
  const outside = path.join(linked.directory, 'linked-public-test.json');
  await writeFile(outside, linked.contents['zenodo-record.json']);
  await unlink(source); await link(outside, source);
  await assert.rejects(loadPilotAuthority(linked.directory, linked.hash), /invalid-file/);
});

async function emptyDirectory() {
  const parent = path.resolve('.tmp/intelligence-pilot-archive-tests');
  await mkdir(parent, { recursive: true });
  return mkdtemp(path.join(parent, 'acquisition-'));
}

test('acquisition refuses orphaned cached outcomes and linked or oversized journals before any fetch', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected fetch'); });
  const orphan = await emptyDirectory();
  await writeFile(path.join(orphan, 'espn-20230417.json'), '{}');
  await assert.rejects(acquirePilot(orphan), /original frozen protocol/);

  const linked = await emptyDirectory();
  const other = path.join(linked, 'other-public-test.json');
  await writeFile(other, '[]'); await link(other, path.join(linked, 'acquisition.json'));
  await assert.rejects(acquirePilot(linked), /invalid-file/);
  assert.equal(await readFile(other, 'utf8'), '[]');

  const oversized = await emptyDirectory();
  await writeFile(path.join(oversized, 'acquisition.json'), ' '.repeat(100_001));
  await assert.rejects(acquirePilot(oversized), /invalid-file/);
  assert.equal(calls, 0);
});

test('new acquisitions persist immutable source receipts and resume without renewing capture clocks or fetching', async context => {
  const directory = await emptyDirectory(); let calls = 0;
  const replies = new Map([
    ['https://zenodo.org/api/records/7831873', '{"id":1,"files":[]}'],
    ['https://zenodo.org/api/records/7831873/files/partidos_LaLiga.csv/content', '\uFEFFsynthetic,not-the-vintage\n'],
  ]);
  context.mock.method(globalThis, 'fetch', async url => {
    calls++; assert.ok(replies.has(String(url)));
    return new Response(replies.get(String(url)), { status: 200 });
  });
  // The source checker must still reject invented fixtures, after receipt storage.
  await assert.rejects(acquirePilot(directory), /unverified-pilot-source/);
  assert.equal(calls, 2);
  assert.deepEqual(await readFile(path.join(directory, 'zenodo-results.csv')),
    Buffer.from(replies.get('https://zenodo.org/api/records/7831873/files/partidos_LaLiga.csv/content')));
  const receiptPath = path.join(directory, 'receipt-zenodo-record.json');
  const originalReceipt = await readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(originalReceipt);
  assert.equal(receipt.sha256, pilotSha256(replies.get(receipt.url)));
  assert.ok(Number.isSafeInteger(receipt.capturedAt));
  assert.ok(!(await readdir(directory)).includes('acquisition.json'));
  await assert.rejects(acquirePilot(directory), /unverified-pilot-source/);
  assert.equal(calls, 2);
  assert.equal(await readFile(receiptPath, 'utf8'), originalReceipt);

  await writeFile(path.join(directory, 'zenodo-record.json'), '{"changed":true}');
  await assert.rejects(acquirePilot(directory), /Cached acquisition changed/);
  assert.equal(calls, 2);
});

test('bounded legacy journal resumes read-only and rejects contradictory immutable receipts', async context => {
  const directory = await emptyDirectory(); let calls = 0;
  context.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('Unexpected fetch'); });
  const body = '{"id":1,"files":[]}';
  const url = 'https://zenodo.org/api/records/7831873';
  const receipt = { file: 'zenodo-record.json', url, resolvedUrl: url, capturedAt: Date.now() - 1000,
    sha256: pilotSha256(body), bytes: Buffer.byteLength(body), kind: 'archive-metadata' };
  const journalPath = path.join(directory, 'acquisition.json');
  const journal = JSON.stringify([receipt]); await writeFile(journalPath, journal);
  await writeFile(path.join(directory, receipt.file), '{"changed":true}');
  await assert.rejects(acquirePilot(directory), /Cached acquisition changed/);
  assert.equal(await readFile(journalPath, 'utf8'), journal);
  await writeFile(path.join(directory, 'receipt-zenodo-record.json'), JSON.stringify({ ...receipt, capturedAt: receipt.capturedAt - 1 }));
  await assert.rejects(acquirePilot(directory), /Conflicting acquisition receipt/);
  assert.equal(await readFile(journalPath, 'utf8'), journal);
  assert.equal(calls, 0);
});
