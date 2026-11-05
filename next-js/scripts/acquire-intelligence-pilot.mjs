import path from 'node:path';
import { lstat, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { localGoalDefaults, localGoalModelVersion } from '../src/server/intelligence/local-goals-model.ts';
import { preparePilotArchive, preparePilotProtocol, buildPilotDataset } from './lib/intelligence-pilot-data.mjs';
import { pilotSha256, loadPilotAuthority } from './lib/intelligence-pilot-archive.mjs';
import { prepareEvaluationDirectory, readEvaluationFile, writeImmutableEvaluationFile } from '../src/server/evaluation/evaluation-archive.ts';

const metadataUrl = 'https://zenodo.org/api/records/7831873';
const csvUrl = 'https://zenodo.org/api/records/7831873/files/partidos_LaLiga.csv/content';
const permittedHosts = new Set(['zenodo.org', 'site.api.espn.com']);
const json = value => JSON.stringify(value, null, 2) + '\n';
const SOURCE_LIMIT = 5_000_000, RECEIPT_LIMIT = 100_000, MAX_SOURCES = 50, MAX_REDIRECT_HOPS = 4;
const receiptName = file => `receipt-${file.replace(/\.[^.]+$/u, '')}.json`;

async function immutableFile(file, value) {
  const text = typeof value === 'string' ? value : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value);
  return writeImmutableEvaluationFile(path.dirname(file), path.basename(file), text);
}

async function optionalFile(file, maximum) {
  try { await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return readEvaluationFile(file, maximum);
}

function remoteUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !permittedHosts.has(url.hostname) || url.username || url.password ||
    (url.port && url.port !== '443') || [...url.searchParams.keys()].some(key => /key|token|auth|secret|password/iu.test(key)))
    throw new Error('Unapproved archive endpoint.');
  return url;
}

function sourceIdentity(file) {
  if (file === 'zenodo-record.json') return { url: metadataUrl, kind: 'archive-metadata' };
  if (file === 'zenodo-results.csv') return { url: csvUrl, kind: 'archive-results' };
  const match = /^espn-(\d{8})\.json$/u.exec(file);
  if (match) return { url: `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${match[1]}&limit=1000`,
    kind: 'scoreboard', date: match[1] };
  throw new Error('Invalid acquisition source identity.');
}

function receipt(value) {
  if (!value || typeof value !== 'object' || typeof value.file !== 'string') throw new Error('Invalid acquisition receipt.');
  if (Object.keys(value).some(key => !['file', 'url', 'resolvedUrl', 'capturedAt', 'sha256', 'bytes', 'kind', 'date'].includes(key)))
    throw new Error('Invalid acquisition receipt fields.');
  const expected = sourceIdentity(value.file);
  if (value.url !== expected.url || value.kind !== expected.kind || value.date !== expected.date ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > SOURCE_LIMIT ||
    !Number.isSafeInteger(value.capturedAt) || value.capturedAt <= 0 || value.capturedAt > Date.now() ||
    typeof value.resolvedUrl !== 'string') throw new Error('Invalid acquisition receipt.');
  remoteUrl(value.resolvedUrl);
  return value;
}

/** Only free, public, fixed archive endpoints. No application environment,
 * account credentials, database client, paid provider or model transport loads. */
export async function acquirePilot(directory) {
  const root = await prepareEvaluationDirectory(directory);
  const receiptFile = path.join(root, 'acquisition.json');
  // Legacy journals remain read-only. New receipts are individual immutable
  // files, so resume never truncates or follows a writable journal target.
  const journal = await optionalFile(receiptFile, RECEIPT_LIMIT);
  const receipts = journal === null ? [] : JSON.parse(journal);
  if (!Array.isArray(receipts) || receipts.length > MAX_SOURCES ||
    new Set(receipts.map(entry => receipt(entry).file)).size !== receipts.length) throw new Error('Invalid acquisition journal.');
  const protocolFile = path.join(root, 'protocol.json');
  let protocolText = await optionalFile(protocolFile, RECEIPT_LIMIT);
  const directoryEntries = await readdir(root);
  if (directoryEntries.length > 200) throw new Error('Too many acquisition files.');
  for (const name of directoryEntries.filter(entry => /^receipt-(?:zenodo-record|zenodo-results|espn-\d{8})\.json$/u.test(entry))) {
    const saved = receipt(JSON.parse(await readEvaluationFile(path.join(root, name), RECEIPT_LIMIT)));
    if (receiptName(saved.file) !== name) throw new Error('Invalid acquisition receipt filename.');
    const prior = receipts.find(entry => entry.file === saved.file);
    if (prior && evidenceFingerprint(prior) !== evidenceFingerprint(saved)) throw new Error('Conflicting acquisition receipt.');
    if (!prior) receipts.push(saved);
  }
  if (receipts.length > MAX_SOURCES) throw new Error('Acquisition source limit exceeded.');
  if (protocolText === null && (receipts.some(entry => entry.kind === 'scoreboard') ||
    directoryEntries.some(name => /^(?:receipt-)?espn-\d{8}\.json$/u.test(name))))
    throw new Error('Cached outcomes require the original frozen protocol.');
  let requests = 0;
  async function source(file, url, extra = {}) {
    const sourceReceiptFile = path.join(root, receiptName(file));
    const saved = await optionalFile(sourceReceiptFile, RECEIPT_LIMIT);
    const savedReceipt = saved === null ? null : receipt(JSON.parse(saved));
    let prior = receipts.find(entry => entry.file === file);
    if (savedReceipt) {
      if (savedReceipt.file !== file || (prior && evidenceFingerprint(prior) !== evidenceFingerprint(savedReceipt)))
        throw new Error('Conflicting acquisition receipt.');
      if (!prior) {
        if (receipts.length >= MAX_SOURCES) throw new Error('Acquisition source limit exceeded.');
        receipts.push(savedReceipt); prior = savedReceipt;
      }
    }
    if (prior) {
      const bytes = Buffer.from(await readEvaluationFile(path.join(root, file), SOURCE_LIMIT), 'utf8');
      if (prior.url !== url || pilotSha256(bytes) !== prior.sha256 || bytes.length !== prior.bytes)
        throw new Error('Cached acquisition changed.');
      await immutableFile(sourceReceiptFile, json(prior));
      return bytes;
    }
    if (receipts.length >= MAX_SOURCES) throw new Error('Acquisition source limit exceeded.');
    let current = remoteUrl(url), response;
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
      remoteUrl(current.href);
      if (requests >= MAX_SOURCES * MAX_REDIRECT_HOPS) throw new Error('Acquisition request limit exceeded.');
      requests++;
      response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30_000),
        headers: { accept: '*/*', 'user-agent': 'GoalHint-local-research/1.0' } });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const redirect = response.headers.get('location'); await response.body?.cancel();
      if (!redirect) throw new Error('Missing archive redirect.');
      current = new URL(redirect, current);
    }
    if (!response?.ok || !response.body) throw new Error(`Public archive request failed (${response?.status ?? 'network'}).`);
    if (Number(response.headers.get('content-length') ?? 0) > SOURCE_LIMIT) { await response.body.cancel(); throw new Error('Archive size exceeded.'); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > SOURCE_LIMIT) throw new Error('Archive size exceeded.');
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks), capturedAt = Date.now();
    await immutableFile(path.join(root, file), bytes);
    const captured = receipt({ file, url, resolvedUrl: current.href, capturedAt, sha256: pilotSha256(bytes), bytes: bytes.length, ...extra });
    await immutableFile(sourceReceiptFile, json(captured));
    receipts.push(captured);
    process.stdout.write(json({ acquired: file, bytes: bytes.length }));
    return bytes;
  }
  const metadata = JSON.parse((await source('zenodo-record.json', metadataUrl, { kind: 'archive-metadata' })).toString('utf8'));
  const csv = await source('zenodo-results.csv', csvUrl, { kind: 'archive-results' });
  const archive = preparePilotArchive({ metadata, csv });
  const allowedFiles = new Set(['zenodo-record.json', 'zenodo-results.csv', ...archive.requiredScoreboardDates.map(date => `espn-${date}.json`)]);
  if (receipts.some(entry => !allowedFiles.has(entry.file))) throw new Error('Acquisition contains outcomes outside the fixed protocol.');
  let protocol;
  if (protocolText !== null) {
    protocol = JSON.parse(protocolText);
    if (evidenceFingerprint(protocol) !== evidenceFingerprint(preparePilotProtocol({ archive, frozenAt: protocol.frozenAt })))
      throw new Error('Frozen protocol differs.');
    if (receipts.some(entry => entry.kind === 'scoreboard' && entry.capturedAt <= protocol.frozenAt))
      throw new Error('Cached outcome predates the frozen protocol.');
  } else {
    protocol = preparePilotProtocol({ archive, frozenAt: Date.now() });
    protocolText = json(protocol);
    await immutableFile(protocolFile, protocolText);
  }
  // This line is emitted before the first target-result request, and the sealed
  // file fixes all membership, timing, model and exclusion rules in advance.
  process.stdout.write(json({ protocolFrozen: evidenceFingerprint(protocol), targets: archive.targets.length,
    modelVersion: localGoalModelVersion(), configuration: localGoalDefaults }));
  const scoreboards = [];
  for (const date of archive.requiredScoreboardDates) {
    if (!/^\d{8}$/.test(date)) throw new Error('Invalid scoreboard date.');
    const file = `espn-${date}.json`;
    const body = (await source(file,
      `https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=${date}&limit=1000`,
      { kind: 'scoreboard', date })).toString('utf8');
    const receipt = receipts.find(entry => entry.file === file);
    scoreboards.push({ date, body, capturedAt: receipt.capturedAt, sha256: receipt.sha256 });
  }
  const { dataset, audit } = buildPilotDataset({ archive, scoreboards, protocol });
  await immutableFile(path.join(root, 'dataset.json'), json(dataset));
  await immutableFile(path.join(root, 'audit.json'), json(audit));
  const sourceOrder = [...allowedFiles];
  receipts.sort((left, right) => sourceOrder.indexOf(left.file) - sourceOrder.indexOf(right.file));
  const manifest = { version: 1, sources: receipts, protocol: { file: 'protocol.json', sha256: pilotSha256(protocolText) },
    protocolHash: evidenceFingerprint(protocol), datasetHash: evidenceFingerprint(dataset),
    publicationAuthorized: false, paidRequests: 0 };
  const manifestText = json(manifest), manifestHash = pilotSha256(manifestText);
  await immutableFile(path.join(root, 'manifest.json'), manifestText);
  const loaderUrl = new URL('./lib/intelligence-pilot-archive.mjs', import.meta.url).href;
  await immutableFile(path.join(root, 'verifier.mjs'),
    `import { loadPilotAuthority } from ${JSON.stringify(loaderUrl)};\nexport const authority = await loadPilotAuthority(${JSON.stringify(root)}, ${JSON.stringify(manifestHash)});\n`);
  // Reopen through the exact verifier path before reporting a usable dataset.
  const authority = await loadPilotAuthority(root, manifestHash); authority.authorizeDataset(dataset);
  return { directory: root, fixtures: dataset.fixtures.length, history: dataset.history.length, manifestHash,
    datasetHash: manifest.datasetHash, publicArchiveRequestsThisRun: requests, paidRequests: 0, shadowOnly: true, audit };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--directory') {
    process.stderr.write('Usage: acquire-intelligence-pilot.mjs --directory <private-local-directory>\n'); process.exitCode = 1;
  } else try { process.stdout.write(json(await acquirePilot(args[1]))); }
  catch (error) { process.stderr.write(`Pilot acquisition refused: ${error.message}\n`); process.exitCode = 1; }
}
