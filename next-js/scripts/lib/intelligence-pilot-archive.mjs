import path from 'node:path';
import { createHash } from 'node:crypto';
import { readEvaluationFile } from '../../src/server/evaluation/evaluation-archive.ts';
import { evidenceFingerprint } from '../../src/server/evidence/evidence-input.ts';
import { preparePilotArchive, buildPilotDataset, createPilotAuthority } from './intelligence-pilot-data.mjs';

export const pilotSha256 = value => createHash('sha256').update(value).digest('hex');

/** A generated verifier pins this manifest, which in turn pins every source byte.
 * Reconstructing the dataset is mandatory: its own hash grants no authority. */
export async function loadPilotAuthority(directory, expectedManifestHash) {
  if (!/^[a-f0-9]{64}$/.test(expectedManifestHash)) throw new Error('Invalid pilot manifest authority.');
  const manifestText = await readEvaluationFile(path.join(directory, 'manifest.json'));
  if (pilotSha256(manifestText) !== expectedManifestHash) throw new Error('Pilot manifest integrity failed.');
  const manifest = JSON.parse(manifestText);
  if (manifest.version !== 1 || !Array.isArray(manifest.sources) || manifest.sources.length > 50) throw new Error('Invalid pilot archive.');
  const files = new Map();
  for (const entry of [...manifest.sources, manifest.protocol]) {
    if (!entry || typeof entry.file !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(entry.file) || files.has(entry.file))
      throw new Error('Invalid pilot source identity.');
    const content = await readEvaluationFile(path.join(directory, entry.file), 5_000_000);
    if (pilotSha256(content) !== entry.sha256) throw new Error('Pilot source integrity failed.');
    files.set(entry.file, content);
  }
  const archive = preparePilotArchive({ metadata: JSON.parse(files.get('zenodo-record.json')), csv: files.get('zenodo-results.csv') });
  const protocol = JSON.parse(files.get('protocol.json'));
  if (evidenceFingerprint(protocol) !== manifest.protocolHash) throw new Error('Pilot protocol identity failed.');
  const scoreboards = manifest.sources.filter(entry => entry.kind === 'scoreboard').map(entry => ({
    date: entry.date, body: files.get(entry.file), capturedAt: entry.capturedAt, sha256: entry.sha256,
  }));
  const prepared = buildPilotDataset({ archive, scoreboards, protocol });
  if (evidenceFingerprint(prepared.dataset) !== manifest.datasetHash) throw new Error('Pilot reconstruction failed.');
  return createPilotAuthority({ dataset: prepared.dataset });
}
