import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { readEvaluationFile } from '../src/server/evaluation/evaluation-archive.ts';
import { evaluateIntelligenceWalkForward } from '../src/server/intelligence/walk-forward-evaluation.ts';
import { provenTrue, synchronous } from '../src/server/shared/authority-proof.ts';
import { evaluateShadowSlips } from '../src/server/slips/shadow-slip-evaluation.ts';

/** Offline diagnostic only: no environment, database, provider or credential loading. */
export function syntheticIntelligenceDataset() {
  const day = 86_400_000, start = Date.parse('2026-09-01T08:00:00Z');
  const history = Array.from({ length: 160 }, (_, index) => {
    const home = index % 8, away = (home + 1 + Math.floor(index / 8) % 7) % 8;
    const row = { fixtureId: `synthetic-history-${index}`, cycleId: `synthetic-cycle-${index}`, competitionId: 'synthetic-league',
      homeTeamId: `team-${home}`, awayTeamId: `team-${away}`, kickoffAt: start - (160 - index) * day,
      availableAt: start - (160 - index) * day + 7_200_000, homeGoals: (index * 7 + 3) % 4, awayGoals: (index * 5 + 1) % 3,
      period: 'regulation-including-stoppage-time', evidenceRef: 'synthetic-only-not-accuracy-evidence' };
    return { ...row, observationHash: evidenceFingerprint(row) };
  });
  const fixtures = Array.from({ length: 6 }, (_, index) => {
    const fixture = { fixtureId: `synthetic-target-${index}`, competitionId: 'synthetic-league', cohort: 'unspecified',
      homeTeamId: `team-${index % 8}`, awayTeamId: `team-${(index + 1) % 8}`,
      forecastAt: start + index * day, kickoffAt: start + index * day + 43_200_000 };
    const row = { ...fixture, cycleId: `synthetic-target-cycle-${index}`, availableAt: fixture.kickoffAt + 7_200_000,
      homeGoals: index % 3, awayGoals: index % 2, period: 'regulation-including-stoppage-time',
      evidenceRef: 'synthetic-only-not-accuracy-evidence' };
    return { fixture, status: index === 5 ? 'pending' : 'settled', result: index === 5 ? null : { ...row, observationHash: evidenceFingerprint(row) } };
  });
  return { mode: 'synthetic', history, fixtures };
}

export async function runIntelligenceReport(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!['--demo', '--dataset', '--authority', '--directory'].includes(key) || flags.has(key)) throw new Error('invalid-arguments');
    const value = key === '--demo' ? true : argv[++index];
    if (value !== true && (typeof value !== 'string' || !value || value.startsWith('--'))) throw new Error('invalid-arguments');
    flags.set(key, value);
  }
  if (!flags.size || flags.size === 1 && flags.has('--directory')) return {
    kind: 'readiness', mode: 'off', actualObservations: 0, providerRequests: 0, aiRequests: 0,
    productionQualified: false, publicClaimAuthorized: false,
    limitations: ['Supply independently verified point-in-time data for evaluation.',
      'Provider comparisons remain unavailable without original forecast receipts.',
      'Prospective qualification and owner approval are required before activation.'],
  };
  if (flags.has('--demo') && (flags.has('--dataset') || flags.has('--authority')) ||
    !flags.has('--demo') && (!flags.has('--dataset') || !flags.has('--authority'))) throw new Error('invalid-arguments');
  let dataset, authority;
  if (flags.has('--demo')) {
    dataset = syntheticIntelligenceDataset();
    authority = { authorizeDataset() {}, verifyHistory: () => true };
  } else {
    dataset = JSON.parse(await readEvaluationFile(flags.get('--dataset')));
    const file = flags.get('--authority');
    if (path.extname(file) !== '.mjs') throw new Error('authority-unavailable');
    await readEvaluationFile(file, 1_048_576);
    // This is deliberately explicit privileged local verifier code, matching the
    // existing evaluation command. Dataset labels/hashes do not grant authority.
    authority = (await import(pathToFileURL(path.resolve(file)).href)).authority;
    if (!authority || typeof authority.authorizeDataset !== 'function' || typeof authority.verifyHistory !== 'function') throw new Error('authority-unavailable');
  }
  if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset) ||
    Object.keys(dataset).some((key) => !['mode', 'history', 'fixtures', 'configuration', 'minimumEnsembleSamples', 'slips'].includes(key)) ||
    !['synthetic', 'historical', 'prospective'].includes(dataset.mode) || !Array.isArray(dataset.history) || !Array.isArray(dataset.fixtures))
    throw new Error('invalid-dataset');
  if (synchronous(authority.authorizeDataset(dataset)) !== undefined) throw new Error('authority-unavailable');
  const report = evaluateIntelligenceWalkForward({ ...dataset,
    verifyHistory: (row) => provenTrue(() => authority.verifyHistory(row)),
    ...(typeof authority.verifyProvider === 'function' ? { verifyProvider: (row) => provenTrue(() => authority.verifyProvider(row)) } : {}),
    ...(typeof authority.verifyContext === 'function' ? { verifyContext: (row) => provenTrue(() => authority.verifyContext(row)) } : {}),
  });
  let wholeSlips = { status: 'unavailable', reason: 'No independently verified original slip captures supplied.' };
  if (dataset.slips) {
    const { captures, results } = dataset.slips;
    if (!Array.isArray(captures) || !Array.isArray(results) || captures.length > 100_000 || results.length > 100_000 ||
      typeof authority.verifySlipCapture !== 'function' || typeof authority.verifySlipResult !== 'function' ||
      captures.some((capture) => capture.mode !== dataset.mode || !provenTrue(() => authority.verifySlipCapture(capture))) ||
      results.some((result) => !provenTrue(() => authority.verifySlipResult(result)))) throw new Error('unverified-slip-evidence');
    wholeSlips = { status: 'evaluated', report: evaluateShadowSlips(dataset.slips) };
  }
  const bundle = { version: 1, datasetHash: evidenceFingerprint(dataset), dataset, report, wholeSlips,
    providerRequests: 0, aiRequests: 0, productionQualified: false, publicClaimAuthorized: false };
  const hash = evidenceFingerprint(bundle), directory = path.resolve(flags.get('--directory') ?? '.tmp/prediction-intelligence');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${hash}.json`), text = JSON.stringify(bundle, null, 2) + '\n';
  try { await writeFile(file, text, { flag: 'wx' }); }
  catch (error) { if (error?.code !== 'EEXIST' || await readFile(file, 'utf8') !== text) throw new Error('archive-conflict'); }
  return { kind: 'evaluation', mode: dataset.mode, archive: file, hash,
    fixtures: dataset.fixtures.length, history: dataset.history.length,
    providerRequests: 0, aiRequests: 0, productionQualified: false, publicClaimAuthorized: false,
    limitations: dataset.mode === 'synthetic' ? ['Synthetic functional demonstration; not prediction accuracy evidence.'] :
      ['Diagnostic evaluation only; independent protocol review and prospective qualification remain required.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(await runIntelligenceReport(process.argv.slice(2)), null, 2) + '\n'); }
  catch { process.stderr.write('Local intelligence report refused; private inputs and verifier diagnostics are withheld.\n'); process.exitCode = 1; }
}
