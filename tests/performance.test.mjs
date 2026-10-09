import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { performanceResponseSchema } from '../src/domain/performance.ts';
import { aggregatePerformance, createPerformanceService } from '../src/server/performance/performance-service.ts';
import { parsePerformanceQuery } from '../src/server/performance/performance-query.ts';
import { createPerformanceHandler } from '../src/server/performance/performance-http.ts';
import { readPerformanceSnapshot } from '../src/server/performance/performance-read.ts';
import { fixtureResultFromRow } from '../src/server/results/result-read.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { performanceRecord, performanceSnapshot, performanceProtocol } from './helpers/performance-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';

const today = parseReportingDate('2026-10-09'), asOf = Date.parse('2026-10-09T12:00:00Z');
const query = (value = '') => parsePerformanceQuery(new URLSearchParams(value), today);
const cell = (report, family = 'match-result', source = 'combined', horizon = null) => report.cells.find((c) => c.family === family && c.source === source && (c.horizon?.id ?? null) === horizon);
const report = (records = [], policy = null, parameters = '') => aggregatePerformance(performanceSnapshot(records), query(parameters), asOf, policy);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('bounded dates use exact EAT boundaries and a 30 day default', () => {
  const q = query(); assert.equal(q.range.startDate, '2026-09-10'); assert.equal(q.range.endDate, today);
  const range = query('from=2026-10-01&to=2026-10-31').range;
  assert.equal(new Date(range.window.startInclusive).toISOString(), '2026-09-30T21:00:00.000Z');
  assert.equal(new Date(range.window.endExclusive).toISOString(), '2026-10-31T21:00:00.000Z');
  assert.equal(query(`market=double-chance&source=ai&model=${modelVersion().id}&version=synthetic-v1`).market, 'double-chance');
});
for (const value of ['unknown=1', 'market=score', 'source=provider', 'market=all&market=all', 'from=2026-10-01',
  'from=2026-10-01&to=2026-11-01', 'from=2026-10-02&to=2026-10-01', 'from=2026-02-30&to=2026-03-01',
  'from=0999-12-31&to=1000-01-01', 'model=bad', `source=api-football&model=${modelVersion().id}`, 'version=', 'version=bad%0Aversion',
  `version=${'x'.repeat(129)}`, `unknown=${'x'.repeat(2049)}`]) {
  test(`rejects invalid public filter ${value.slice(0, 70)}`, () => assert.throws(() => query(value), (e) => e.code === 'invalid-query'));
}
test('counts reconcile distinct sources, void, unavailable and pending without alternative inflation', () => {
  const data = report([performanceRecord(), performanceRecord({ score: [0, 1] }), performanceRecord({ source: 'api-football', score: null }),
    performanceRecord({ state: 'void' }), performanceRecord({ state: 'open' })]);
  assert.deepEqual(cell(data).coverage, { total: 5, available: 3, unavailable: 1, void: 1, filteredOut: 0, pending: 1, settled: 2, sources: { ai: 2, 'api-football': 1 } });
  assert.equal(cell(data).metrics.correct, 1); assert.equal(cell(data).metrics.incorrect, 1); assert.equal(cell(data).metrics.denominator, 2);
  assert.equal(cell(data, 'double-chance').metrics.denominator, 2);
  assert.equal(cell(data, 'total-goals').coverage.unavailable, 2);
  assert.equal(cell(data, 'match-result', 'ai').coverage.filteredOut, 1);
  assert.equal(cell(data, 'match-result', 'api-football').coverage.filteredOut, 2);
  assert.equal(cell(data).metrics.hitRate, null); assert.equal(cell(data).metrics.state, 'unavailable');
  assert.equal(data.policy.publicClaimAuthorized, false); assert.equal(data.policy.provisional, true);
});
test('full precision harness scores, binary double chance and uncertainty match hand calculations', () => {
  const data = report([performanceRecord(), performanceRecord({ score: [0, 1] })], performanceProtocol());
  const mr = cell(data).metrics, dc = cell(data, 'double-chance').metrics;
  assert.equal(mr.state, 'available'); assert.equal(mr.hitRate, 0.5); assert.equal(mr.denominator, 2);
  near(mr.brier, (.54 + .74) / 2); near(mr.logLoss, (-Math.log(.4) - Math.log(.3)) / 2);
  near(dc.brier, (.18 + (.49 + .16 + .09) / 3) / 2);
  near(dc.logLoss, (-Math.log(.7) - Math.log1p(-.6) - Math.log(.7) - Math.log1p(-.7) - Math.log(.6) - Math.log(.7)) / 6);
  assert.equal(dc.denominator, 2); assert.equal(dc.calibration.reduce((s, b) => s + b.count, 0), 6);
  assert.ok(dc.calibration.filter((b) => b.count > 0).every((b) => b.interval.lower < b.observedFrequency || b.observedFrequency === 0));
  const singleHorizon = cell(data, 'double-chance', 'combined', 'day-ahead'); assert.deepEqual(singleHorizon.metrics, dc);
  assert.equal(data.comparisons[0].count, 0); assert.equal(data.comparisons[0].brierDifference, null);
});
test('no samples, insufficient samples, missing source policy, quality failure and absent baselines withhold values', () => {
  assert.equal(cell(report([], performanceProtocol())).metrics.hitRate, null);
  assert.deepEqual(cell(report([], performanceProtocol())).metrics.reasons, ['no-settled-samples']);
  const small = cell(report([performanceRecord()], performanceProtocol())).metrics;
  assert.equal(small.state, 'insufficient-sample'); assert.equal(small.minimumSamples, 2); assert.equal(small.hitRate, null);
  const failed = cell(report([performanceRecord(), performanceRecord()], performanceProtocol({ gate: { maximumBrier: .1 } }))).metrics;
  assert.equal(failed.state, 'quality-gate-failed'); assert.ok(failed.reasons.includes('brier-above-gate')); assert.equal(failed.brier, null);
  const missing = performanceProtocol({ gates: performanceProtocol().gates.filter((g) => g.system !== 'ai') });
  assert.ok(cell(report([performanceRecord(), performanceRecord()], missing), 'match-result', 'ai').metrics.reasons.includes('missing-public-sample-and-quality-gate'));
  const baseline = cell(report([performanceRecord(), performanceRecord()], performanceProtocol({ gate: { baseline: 'team-strength', maximumBrierDifference: 1 } }))).metrics;
  assert.ok(baseline.reasons.includes('insufficient-matched-baseline-samples')); assert.equal(baseline.brier, null);
});
test('filters account for nonmatching versions separately and retain unattributed coverage', () => {
  const records = [performanceRecord(), performanceRecord({ source: 'api-football' }), performanceRecord({ state: 'open' })];
  const filtered = report(records, null, `market=match-result&model=${modelVersion().id}`);
  assert.equal(filtered.cells.length, 3); assert.equal(cell(filtered).coverage.available, 1); assert.equal(cell(filtered).coverage.filteredOut, 1);
  assert.equal(cell(filtered).coverage.unavailable, 1);
  assert.equal(cell(report(records, null, 'version=no-such-version')).coverage.available, 0);
  assert.equal(cell(report(records, null, 'source=api-football')).coverage.sources.ai, 0);
});
test('quality coverage uses the full nonvoid cohort and cannot improve by filtering out other sources', () => {
  const records = [performanceRecord(), performanceRecord(), performanceRecord({ source: 'api-football' }),
    performanceRecord({ state: 'open' }), performanceRecord({ state: 'open' })];
  const data = cell(report(records, performanceProtocol()), 'match-result', 'ai');
  assert.equal(data.coverage.total, 5); assert.equal(data.coverage.available, 2); assert.equal(data.coverage.filteredOut, 1);
  assert.equal(data.metrics.state, 'quality-gate-failed'); assert.ok(data.metrics.reasons.includes('coverage-below-gate'));
});
test('stale audit input cannot score, evidence links are locked, bounded and deterministic', () => {
  const first = performanceRecord(); first.projection.markets[0].previous.inputHash = 'stale';
  assert.equal(cell(report([first])).coverage.pending, 1); assert.equal(cell(report([first])).metrics.denominator, 0);
  const data = Array.from({ length: 21 }, () => performanceRecord());
  const one = report(data, performanceProtocol()), two = report(data, performanceProtocol());
  assert.equal(one.freshness.snapshotKey, two.freshness.snapshotKey); assert.equal(cell(one).evidence.links.length, 20); assert.equal(cell(one).evidence.truncated, true);
  assert.ok(cell(one).evidence.links.every((link) => link.href.endsWith(`?revision=${link.revisionId}`)));
  assert.doesNotMatch(JSON.stringify(one), /approvalRef|evidenceRef|transport|configurationJson|requestHash|private/u);
  assert.equal(performanceResponseSchema.safeParse({ ...one, private: true }).success, false);
});
test('mixed horizons and versions never borrow an approved gate from a different cohort', () => {
  const records = [performanceRecord(), performanceRecord()];
  records[0].revision.publishedAt = records[0].cycle.kickoffAt - 3_600_000;
  records[1].revision.publishedAt = records[1].cycle.kickoffAt - 86_400_000;
  const horizons = [{ id: 'near', minimumMs: 0, maximumMs: 6 * 3_600_000 }, { id: 'day', minimumMs: 6 * 3_600_000, maximumMs: 7 * 86_400_000 }];
  const gates = performanceProtocol().gates.flatMap((g) => horizons.map((h) => ({ ...g, id: `${g.id}-${h.id}`, horizonId: h.id })));
  const data = report(records, performanceProtocol({ horizons, gates }));
  assert.equal(cell(data).metrics.hitRate, null); assert.ok(cell(data).metrics.reasons.includes('mixed-or-unknown-horizons-use-horizon-cells'));
  assert.equal(cell(data, 'match-result', 'combined', 'near').metrics.state, 'insufficient-sample');
  const scoped = performanceProtocol({ providerContractVersion: 'different-provider-contract' });
  assert.ok(cell(report([performanceRecord({ source: 'api-football' }), performanceRecord({ source: 'api-football' })], scoped)).metrics.reasons.includes('outside-approved-policy-scope'));
});
test('a fixture cohort above the bound stops before loading snapshots or silently truncating counts', async () => {
  let calls = 0;
  await assert.rejects(readPerformanceSnapshot({ $queryRaw: async (sql) => {
    calls++; assert.match(sql.strings.join(' '), /LIMIT/u); return Array.from({ length: 1001 }, (_, i) => ({ id: String(i) }));
  } }, query(), [39]), (e) => e.code === 'unavailable');
  assert.equal(calls, 1);
});
test('sealed result reads reconcile MySQL raw unsigned goals and booleans without losing result integrity', () => {
  const body = { id: 'a'.repeat(64), fixtureId: '20000000-0000-4000-8000-000000000001', fixtureVersion: 8n,
    previousId: null, observationId: 'b'.repeat(64), observedAt: asOf, providerUpdatedAt: null, regulationVerifiedAt: asOf,
    status: 'finished-regulation', providerStatus: 'FT', elapsedMinutes: 90, reportedGoals: { home: 2, away: 1 },
    extraTimeScore: { home: null, away: null }, penaltyScore: { home: null, away: null },
    regulation: { verified: true, home: 2, away: 1, evidenceRef: 'synthetic-result-proof' } };
  const content = Object.fromEntries(['status', 'providerStatus', 'elapsedMinutes', 'reportedGoals', 'extraTimeScore', 'penaltyScore', 'regulation'].map((k) => [k, body[k]]));
  const row = { id: body.id, fixtureId: body.fixtureId, fixtureVersion: body.fixtureVersion, observedAt: new Date(asOf), status: body.status,
    regulationVerified: 1, regulationHome: 2n, regulationAway: 1n, contentHash: evidenceFingerprint(content), body: evidenceSerialize(body), validIntegrity: 1n };
  assert.deepEqual(fixtureResultFromRow(row), body);
  assert.throws(() => fixtureResultFromRow({ ...row, regulationHome: 3n }));
  assert.throws(() => fixtureResultFromRow({ ...row, validIntegrity: 0n }));
});
test('invalid input is rejected before reading or evaluating server capabilities', async () => {
  let reads = 0;
  const handler = createPerformanceHandler(async () => { reads++; throw new Error('private database credentials'); });
  const invalid = await handler(new Request('http://localhost/api/performance?source=unknown'));
  assert.equal(invalid.status, 400); assert.equal(reads, 0);
  const failure = await handler(new Request('http://localhost/api/performance'));
  assert.equal(failure.status, 503); assert.equal(reads, 1); assert.doesNotMatch(await failure.text(), /credentials/u);
  const service = createPerformanceService({ competitionIds: [], database: { transaction: async () => { throw new Error(); } } });
  await assert.rejects(service.query(), (e) => e.code === 'unavailable');
});
test('anonymous success uses shared uncached safe serialization and no cookies', async () => {
  const handler = createPerformanceHandler(async () => report());
  const response = await handler(new Request('http://localhost/api/performance'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0'); assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(performanceResponseSchema.safeParse(await response.json()).success, true);
});
