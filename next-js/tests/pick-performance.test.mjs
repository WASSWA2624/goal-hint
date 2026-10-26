import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePickPerformance } from '../src/domain/pick-performance.ts';
import { aggregatePerformance } from '../src/server/performance/performance-service.ts';
import { parsePerformanceQuery } from '../src/server/performance/performance-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { performanceRecord, performanceSnapshot } from './helpers/performance-fixtures.mjs';

const sample = (revisionId, outcome, quotedOdds, publishedAt = 1) => ({ revisionId, publishedAt, outcome, quotedOdds });
test('pick returns use exact one-unit arithmetic, their own quoted denominator and original ordering', () => {
  const result = summarizePickPerformance([sample('d', 'lost', '9.20', 4), sample('a', 'won', '2.35'),
    sample('b', 'pending', '999999.99', 2), sample('c', 'void', '999999.99', 3), sample('e', 'lost', null, 5)]);
  assert.equal(result.settled, 3); assert.equal(result.returnsSampleCount, 2); assert.equal(result.excludedQuoteCount, 1);
  assert.equal(result.stakeUnits, 2); assert.equal(result.returnUnits, 2.35); assert.equal(result.profitUnits, .35);
  assert.equal(result.roi, .175); assert.equal(result.meanQuotedOdds, 5.775);
  assert.equal(result.longestLosingStreak, 2); assert.equal(result.currentLosingStreak, 2);
  assert.equal(result.basis, 'one-unit-per-binary-locked-pick-stored-pre-publication-quote');
});
test('empty and missing-quote pick cohorts keep rates unavailable instead of inferring zero profit', () => {
  for (const samples of [[], [sample('a', 'won', null), sample('b', 'lost', '1.00')]]) {
    const result = summarizePickPerformance(samples);
    assert.equal(result.returnsSampleCount, 0); assert.equal(result.roi, null); assert.equal(result.meanQuotedOdds, null);
    assert.equal(result.profitUnits, 0); assert.equal(result.excludedQuoteCount, samples.length);
  }
  assert.throws(() => summarizePickPerformance([sample('a', 'lost', '2.00'), sample('a', 'won', '2.00')]));
});
test('pick summaries preserve input and interrupt losing streaks at void and pending forecasts', () => {
  const samples = [sample('z', 'lost', '2.00', 4), sample('b', 'void', null, 2), sample('a', 'lost', '2.00'),
    sample('c', 'pending', null, 3)];
  const before = structuredClone(samples), result = summarizePickPerformance(samples);
  assert.equal(result.longestLosingStreak, 1); assert.equal(result.currentLosingStreak, 1);
  assert.deepEqual(samples, before);
});
test('performance cells and league cohorts use locked selection quotes and exact source denominators without a calibration approval', () => {
  const win = performanceRecord(), loss = performanceRecord({ source: 'api-football', score: [0, 1] }), pending = performanceRecord({ score: null });
  const snapshot = performanceSnapshot([win, loss, pending]);
  snapshot.quotes.set(`${win.revision.id}:match-result:${win.revision.candidate.markets['match-result'].market.selection}`, '2.35');
  snapshot.quotes.set(`${win.revision.id}:match-result:away-win`, '99.00');
  snapshot.quotes.set(`${loss.revision.id}:match-result:${loss.revision.candidate.markets['match-result'].market.selection}`, '9.20');
  snapshot.quotes.set(`${pending.revision.id}:match-result:${pending.revision.candidate.markets['match-result'].market.selection}`, '999999.99');
  const query = parsePerformanceQuery(new URLSearchParams('market=match-result'), parseReportingDate('2026-10-09'));
  const report = aggregatePerformance(snapshot, query, Date.parse('2026-10-09T12:00:00Z'), null);
  const combined = report.cells.find((cell) => cell.source === 'combined');
  assert.equal(combined.metrics.hitRate, null); assert.equal(combined.returns.roi, .175);
  assert.equal(combined.returns.settled, 2); assert.equal(combined.returns.returnsSampleCount, 2);
  assert.equal(combined.returns.meanQuotedOdds, 5.775);
  assert.equal(report.cells.find((cell) => cell.source === 'ai').returns.returnsSampleCount, 1);
  assert.equal(report.cells.find((cell) => cell.source === 'api-football').returns.roi, -1);
  assert.deepEqual(report.leagues.records[0].cells[0].returns, combined.returns);
  assert.doesNotMatch(JSON.stringify(report), /999999\.99|99\.00/);
});
