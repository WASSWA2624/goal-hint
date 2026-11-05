import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { summarizeIntelligenceAccuracy, runIntelligenceAccuracySummary } from '../scripts/intelligence-accuracy-summary.mjs';
import { syntheticIntelligenceDataset, runIntelligenceReport } from '../scripts/intelligence-report.mjs';
import { evaluateIntelligenceWalkForward } from '../src/server/intelligence/walk-forward-evaluation.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';

function seal(value) {
  const body = { ...value }; delete body.hash;
  return { ...body, hash: evidenceFingerprint(body) };
}
function bundleFor(dataset) {
  return { version: 1, datasetHash: evidenceFingerprint(dataset), dataset,
    report: evaluateIntelligenceWalkForward({ ...dataset, verifyHistory: () => true }),
    wholeSlips: { status: 'unavailable' }, providerRequests: 0, aiRequests: 0,
    productionQualified: false, publicClaimAuthorized: false };
}
function fixtureBundle() {
  const dataset = syntheticIntelligenceDataset();
  dataset.fixtures = dataset.fixtures.slice(0, 4);
  const [first, unseen, pending, cancelled] = dataset.fixtures;
  first.result.homeGoals = 2; first.result.awayGoals = 1;
  first.context = { source: 'ai-context', modelVersion: 'synthetic-context', fixtureId: first.fixture.fixtureId,
    assessedAt: first.fixture.forecastAt, evidenceHash: 'a'.repeat(64), facts: [] };
  unseen.fixture.homeTeamId = 'unseen-team'; unseen.result.homeTeamId = 'unseen-team';
  pending.status = 'pending'; pending.result = null;
  cancelled.status = 'cancelled'; cancelled.result = null;
  return bundleFor(dataset);
}
const summarize = bundle => summarizeIntelligenceAccuracy(bundle, evidenceFingerprint(bundle));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('matched metrics use the same settled fixtures and retain raw coverage separately from operational withholding', () => {
  const bundle = fixtureBundle(), summary = summarize(bundle), probabilities = bundle.report.forecasts[0].components.local.probabilities;
  assert.equal(summary.fixtures, 4); assert.equal(summary.operational.withheld, 2);
  assert.equal(summary.operational.eligibleShadow, 2); assert.equal(summary.operational.published, 0);
  assert.ok(summary.operational.reasons.some(row => row.reason === 'context-unverified-or-stale' && row.count === 1));
  for (const cell of summary.cells) {
    assert.deepEqual(cell.statuses, { settled: 2, pending: 1, void: 0, cancelled: 1, unavailable: 0 });
    assert.equal(cell.local.available, 3); assert.equal(cell.local.abstentions, 1); assert.equal(cell.local.coverage, 0.75);
    assert.equal(cell.local.metrics.count, 1); assert.equal(cell.leagueFrequency.available, 4);
    assert.equal(cell.leagueFrequency.metrics.count, 2); assert.equal(cell.matched.count, 1);
    assert.equal(cell.matched.local.count, cell.matched.leagueFrequency.count);
    assert.equal(cell.matched.fixtureKeysHash, evidenceFingerprint([bundle.dataset.fixtures[0].fixture.fixtureId]));
    assert.ok(cell.matched.local.hitRateInterval);
    close(cell.matched.brierDifference, cell.matched.local.brier - cell.matched.leagueFrequency.brier);
  }
  const result = summary.cells.find(cell => cell.family === 'match-result').matched.local;
  close(result.brier, (probabilities['match-result']['home-win'] - 1) ** 2 +
    probabilities['match-result'].draw ** 2 + probabilities['match-result']['away-win'] ** 2);
  close(result.logLoss, -Math.log(probabilities['match-result']['home-win']));
  const goals = summary.cells.find(cell => cell.family === 'total-goals').matched.local;
  close(goals.brier, (1 - probabilities['total-goals']['over-2.5']) ** 2);
  close(goals.logLoss, -Math.log(probabilities['total-goals']['over-2.5']));
  const both = summary.cells.find(cell => cell.family === 'both-teams-to-score').matched.local;
  close(both.brier, (1 - probabilities['both-teams-to-score'].yes) ** 2);
  const chance = summary.cells.find(cell => cell.family === 'double-chance').matched.local;
  close(chance.brier, ((1 - probabilities['double-chance']['home-or-draw']) ** 2 +
    probabilities['double-chance']['away-or-draw'] ** 2 + (1 - probabilities['double-chance']['home-or-away']) ** 2) / 3);
  assert.equal(summary.otherComparisons.status, 'unavailable'); assert.equal(summary.roi.status, 'unavailable');
  assert.equal(summary.wholeSlips.status, 'unavailable'); assert.equal(summary.productionQualified, false);
  assert.ok(summary.otherComparisons.providerArchivedAvailability.every(cell => cell.available === 0));
  assert.ok(summary.limitations.some(line => line.includes('Synthetic')));
});

test('distinct leagues and horizons retain their own denominators, including no matched samples', () => {
  const dataset = syntheticIntelligenceDataset();
  dataset.fixtures = dataset.fixtures.slice(0, 3);
  dataset.fixtures[1].fixture.forecastAt = dataset.fixtures[1].fixture.kickoffAt - 86_400_000;
  dataset.fixtures[2].fixture.competitionId = 'synthetic-sparse-league';
  dataset.fixtures[2].result.competitionId = 'synthetic-sparse-league';
  const summary = summarize(bundleFor(dataset));
  assert.equal(summary.cells.length, 12);
  const sparse = summary.cells.filter(cell => cell.competitionId === 'synthetic-sparse-league');
  assert.equal(sparse.length, 4);
  for (const cell of sparse) {
    assert.equal(cell.fixtures, 1); assert.equal(cell.local.available, 0); assert.equal(cell.leagueFrequency.available, 0);
    assert.equal(cell.matched.count, 0); assert.equal(cell.matched.brierDifference, null);
    assert.equal(cell.matched.local.hitRateInterval, null); assert.equal(cell.matched.local.logLoss, null);
  }
  assert.equal(summary.cells.filter(cell => cell.horizon === '24h-or-more').length, 4);
});

test('external archive hash, nested seals, fixture bindings and deterministic raw-model replay reject tampering', () => {
  const original = fixtureBundle(), originalHash = evidenceFingerprint(original);
  const altered = structuredClone(original); altered.dataset.fixtures[0].result.homeGoals++;
  assert.throws(() => summarizeIntelligenceAccuracy(altered, originalHash), /bundle-hash/);
  assert.throws(() => summarize(altered), /dataset-hash/);
  const unsealed = structuredClone(original); unsealed.report.forecasts[0].components.local.expectedGoals.home++;
  unsealed.report = seal(unsealed.report);
  assert.throws(() => summarize(unsealed), /forecast-hash/);
  const forged = structuredClone(original);
  forged.report.forecasts[0].components.local = seal({ ...forged.report.forecasts[0].components.local,
    expectedGoals: { home: 4, away: 1 } });
  forged.report.forecasts[0] = seal(forged.report.forecasts[0]); forged.report = seal(forged.report);
  assert.throws(() => summarize(forged), /local-replay/);
  const mismatched = structuredClone(original); mismatched.report.forecasts[0].fixtureId = 'absent-fixture';
  mismatched.report.forecasts[0] = seal(mismatched.report.forecasts[0]); mismatched.report = seal(mismatched.report);
  assert.throws(() => summarize(mismatched), /forecast-binding/);
  const duplicate = structuredClone(original); duplicate.report.forecasts[1] = duplicate.report.forecasts[0];
  duplicate.report = seal(duplicate.report);
  assert.throws(() => summarize(duplicate), /forecast-binding/);
  const tuned = structuredClone(original); tuned.dataset.configuration = { ridge: 4 };
  tuned.datasetHash = evidenceFingerprint(tuned.dataset);
  assert.throws(() => summarize(tuned), /nondefault-configuration/);
  const wrongMetrics = structuredClone(original); wrongMetrics.report.cells[0].metrics.brier += 0.1;
  wrongMetrics.report = seal(wrongMetrics.report);
  assert.throws(() => summarize(wrongMetrics), /archived-metrics-mismatch/);
});

test('CLI reads an actual immutable report archive, requires its separate hash and rejects unsafe file input', async () => {
  const parent = path.resolve('.tmp/intelligence-accuracy-summary-tests'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'archive-'));
  const archived = await runIntelligenceReport(['--demo', '--directory', directory]);
  const summary = await runIntelligenceAccuracySummary(['--bundle', archived.archive, '--hash', archived.hash]);
  assert.equal(summary.bundleHash, archived.hash); assert.equal(summary.fixtures, 6);
  await assert.rejects(runIntelligenceAccuracySummary(['--bundle', archived.archive]), /arguments/);
  await assert.rejects(runIntelligenceAccuracySummary(['--bundle', archived.archive, '--hash', '0'.repeat(64)]), /bundle-hash/);
  await assert.rejects(runIntelligenceAccuracySummary(['--bundle', directory, '--hash', archived.hash]), /invalid-file/);
  const broken = path.join(directory, 'invalid.json'); await writeFile(broken, '{');
  await assert.rejects(runIntelligenceAccuracySummary(['--bundle', broken, '--hash', archived.hash]), SyntaxError);
});
