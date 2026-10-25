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

test('league cohorts reconcile every fixture and independently apply sample and quality gates', () => {
  const firstId = '20000000-0000-4000-8000-000000000001', secondId = '20000000-0000-4000-8000-000000000002';
  const records = [performanceRecord({ competitionId: firstId, competitionName: 'Alpha League' }),
    performanceRecord({ competitionId: firstId, competitionName: 'Alpha League' }),
    performanceRecord({ competitionId: secondId, competitionName: 'Beta League', score: [0, 1] }),
    performanceRecord({ competitionId: secondId, competitionName: 'Beta League', score: [0, 1] })];
  const protocol = performanceProtocol({ competitionIds: [firstId, secondId], gate: { maximumBrier: .7 } });
  const data = report(records, protocol, 'market=match-result');
  assert.equal(cell(data).metrics.state, 'available'); assert.equal(cell(data).metrics.denominator, 4);
  assert.equal(data.leagues.totalGroups, 2); assert.equal(data.leagues.records.reduce((sum, league) => sum + league.fixtureCount, 0), 4);
  const [first, second] = data.leagues.records;
  assert.equal(first.competition.name, 'Alpha League'); assert.equal(first.competition.country, 'Uganda');
  assert.equal(first.cells[0].metrics.denominator, 2); assert.equal(first.cells[0].metrics.hitRate, 1);
  assert.equal(second.cells[0].metrics.state, 'quality-gate-failed'); assert.equal(second.cells[0].metrics.hitRate, null);
  assert.equal(second.cells[0].metrics.correct, 0); assert.equal(second.cells[0].metrics.incorrect, 2);
  assert.ok(second.cells[0].metrics.reasons.includes('brier-above-gate'));
  assert.deepEqual(first.cells[0].metrics.calibration, []);
  const unapproved = report(records, null, 'market=match-result');
  assert.ok(unapproved.leagues.records.every((league) => league.cells[0].metrics.hitRate === null));
  const small = report([records[0], records[2]], protocol, 'market=match-result');
  assert.ok(small.leagues.records.every((league) => league.cells[0].metrics.state === 'insufficient-sample'));
});

test('league pagination preserves full-period totals, unknown attribution and source-filter denominators', () => {
  const records = Array.from({ length: 12 }, (_, index) => performanceRecord({
    competitionId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, competitionName: `League ${String(index).padStart(2, '0')}`,
  }));
  const unknown = performanceRecord({ competitionId: null, competitionName: 'Unverified label' });
  const missing = performanceRecord({ state: 'open', competitionId: undefined }); delete missing.fixture.season.competitionId;
  records.push(unknown, missing);
  const one = report(records, null, 'market=match-result'), two = report(records, null, 'market=match-result&leaguePage=2');
  assert.equal(one.cohort.fixtureCount, 14); assert.deepEqual(one.cells, two.cells);
  assert.equal(one.leagues.records.length, 10); assert.equal(two.leagues.records.length, 3); assert.equal(two.leagues.totalGroups, 13);
  const group = two.leagues.records.at(-1);
  assert.deepEqual(group.competition, { id: null, name: null, country: null }); assert.equal(group.fixtureCount, 2);
  assert.equal(group.cells[0].coverage.unavailable, 1); assert.equal(group.cells[0].coverage.settled, 1);
  assert.equal(group.cells[0].metrics.hitRate, null);
  assert.deepEqual(report([...records].reverse(), null, 'market=match-result').leagues.records.map((league) => league.competition),
    one.leagues.records.map((league) => league.competition));
  assert.deepEqual(report(records, null, 'leaguePage=3').leagues.records, []);
  const filtered = report([performanceRecord(), performanceRecord({ source: 'api-football' }), performanceRecord({ state: 'open' })],
    null, 'source=api-football&market=match-result').leagues.records[0].cells[0];
  assert.equal(filtered.source, 'api-football'); assert.equal(filtered.coverage.total, 3);
  assert.equal(filtered.coverage.available, 1); assert.equal(filtered.coverage.filteredOut, 1); assert.equal(filtered.coverage.unavailable, 1);
  assert.equal(filtered.metrics.denominator, 1);
});

test('league pagination rejects ambiguous or unbounded input', () => {
  for (const value of ['0', '01', '1.5', '-1', '10000', 'NaN']) {
    assert.throws(() => query(`leaguePage=${value}`), (error) => error.code === 'invalid-query');
  }
  assert.throws(() => query('leaguePage=1&leaguePage=2'), (error) => error.code === 'invalid-query');
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

test('evidence navigation is canonical, revision-specific and bounded even with long or unsafe team text', () => {
  const record = performanceRecord();
  record.fixture.homeTeam.name = '<script>Club & Co</script>';
  record.fixture.awayTeam.name = 'Away Identifier '.repeat(25);
  const data = report([record]), link = cell(data).evidence.links[0];
  assert.equal(link.pageHref, `/en/matches/${record.fixture.id}/script-club-co-script-vs-${('away-identifier-'.repeat(25)).slice(0, 75).replace(/-$/, '')}?revision=${record.revision.id}#revision-history`);
  assert.equal(link.revisionId, record.cycle.lockedSetId);
  assert.ok(link.pageHref.length <= 512);
  assert.equal(cell(data).metrics.denominator, 1);
  assert.equal(data.cohort.fixtureCount, 1);
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
    calls++; assert.match(sql.strings.join(' '), /LIMIT/u); return Array.from({ length: 31001 }, (_, i) => ({ id: String(i) }));
  } }, query(), [39]), (e) => e.code === 'unavailable');
  assert.equal(calls, 1);
});

test('cohorts above one batch retain every fixture and read historical cycles once', async () => {
  const selected = Array.from({ length: 1005 }, (_, index) => ({ id: String(index) }));
  const batches = [];
  let inventoryRead = false, historicalReads = 0;
  const tx = {
    $queryRaw: async (sql) => {
      const text = sql.strings.join(' ');
      if (!inventoryRead) { inventoryRead = true; return selected; }
      if (text.includes('SELECT c.voidReason')) { historicalReads++; return [{ voidReason: 'formal-postponement' }]; }
      return [];
    },
    footballFixture: { findMany: async ({ where }) => {
      const ids = where.id.in; batches.push(ids.length);
      return ids.map(id => ({ id, activeCycleId: null, resultState: null }));
    } },
    predictionCycle: { findMany: async () => [] },
  };
  const snapshot = await readPerformanceSnapshot(tx, query(), [39]);
  assert.deepEqual(batches, [1000, 5]);
  assert.equal(snapshot.records.length, 1005);
  assert.equal(new Set(snapshot.records.map(record => record.fixture.id)).size, 1005);
  assert.equal(historicalReads, 1);
  assert.equal(snapshot.historicalCycles.postponed, 1);
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

const lostRecord = (options = {}) => performanceRecord({ score: [0, 1], ...options });
const at = (record, publishedAt) => { if (record.revision) record.revision.publishedAt = publishedAt; return record; };
test('every source, league and horizon return summary reconciles with its own settled denominator', () => {
  const data = report([performanceRecord(), lostRecord(), performanceRecord({ source: 'api-football' }), lostRecord({ source: 'api-football' }),
    performanceRecord({ state: 'void' }), performanceRecord({ state: 'open' }), performanceRecord({ score: null })], performanceProtocol());
  for (const item of [...data.cells, ...data.leagues.records.flatMap(row => row.cells)]) {
    assert.equal(item.returns.settled, item.metrics.denominator); assert.equal(item.returns.returnsSampleCount, 0);
    assert.equal(item.returns.roi, null); assert.equal(item.returns.excludedQuoteCount, item.metrics.denominator);
  }
  assert.ok(data.cells.some(item => item.horizon !== null));
  assert.equal(cell(data).returns.settled, 4); assert.equal(cell(data, 'match-result', 'ai').returns.settled, 2);
});
test('unattributed and differently filtered voids do not interrupt a source-specific pick streak', () => {
  const records = [at(lostRecord(), 1e12), at(performanceRecord({ state: 'void', source: 'api-football' }), 1e12 + 1), at(lostRecord(), 1e12 + 2)];
  assert.equal(cell(report(records), 'match-result', 'ai').returns.longestLosingStreak, 2);
  assert.equal(cell(report(records)).returns.longestLosingStreak, 1);
  const unbound = [at(lostRecord(), 1e12), performanceRecord({ state: 'void', noLock: true }), at(lostRecord(), 1e12 + 2)];
  assert.equal(cell(report(unbound)).returns.longestLosingStreak, 2);
  const filtered = report(records, null, 'version=no-such-version');
  assert.equal(cell(filtered).returns.settled, 0); assert.equal(cell(filtered).returns.longestLosingStreak, 0);
});
test('captured quote availability never combines pick and slip denominators or pending and void prices', () => {
  const records = [performanceRecord(), lostRecord(), lostRecord(), performanceRecord(), performanceRecord({ score: null }), performanceRecord({ state: 'void' })];
  records.forEach((record,index) => { if(record.revision) record.revision.publishedAt += index; });
  const snapshot = performanceSnapshot(records);
  for (const [index,price] of [[0,'2.60'],[1,'1.50'],[4,'987.65'],[5,'987.65']]) {
    const record = records[index], selection = record.revision.candidate.markets['match-result'].market.selection;
    snapshot.quotes.set(`${record.revision.id}:match-result:${selection}`,price);
  }
  const data = aggregatePerformance(snapshot,query('market=match-result'),asOf,null), returns = cell(data).returns;
  assert.equal(returns.settled,4); assert.equal(returns.returnsSampleCount,2); assert.equal(returns.excludedQuoteCount,2);
  assert.equal(returns.stakeUnits,2); assert.equal(returns.returnUnits,2.6); assert.equal(returns.profitUnits,.6);
  assert.equal(returns.roi,.3); assert.equal(returns.meanQuotedOdds,2.05); assert.equal(returns.longestLosingStreak,2);
  assert.doesNotMatch(JSON.stringify(data), /987\.65|98765/u);
  assert.deepEqual(data.leagues.records[0].cells[0].returns,returns);
});
