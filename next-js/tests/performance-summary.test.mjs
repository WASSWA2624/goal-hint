import assert from 'node:assert/strict';
import test from 'node:test';
import { predictedPerformanceSummary } from '../src/domain/performance-summary.ts';

test('predicted match totals include actual forecasts and exclude unavailable or filtered-out fixtures', () => {
  const counts = { total: 200, won: 30, lost: 15, pending: 50, void: 5, unavailable: 80, filteredOut: 20 };
  assert.deepEqual(predictedPerformanceSummary(counts), { total: 100, won: .3, lost: .15, pending: .5 });
});

test('outcome percentages use the complete predicted sample, including predictions later voided', () => {
  const summary = predictedPerformanceSummary({ total: 9, won: 2, lost: 1, pending: 1, void: 1, unavailable: 4 });
  assert.equal(summary.total, 5);
  assert.equal(summary.won, .4);
  assert.equal(summary.lost, .2);
  assert.equal(summary.pending, .2);
  assert.equal(summary.won + summary.lost + summary.pending, .8, 'Void predictions remain a distinct outcome');
});

test('zero predictions have no inferred outcome percentage, even when fixtures are present', () => {
  for (const total of [0, 7]) assert.deepEqual(predictedPerformanceSummary({ total, won: 0, lost: 0, pending: 0,
    unavailable: total }), { total: 0, won: null, lost: null, pending: null });
});

test('optional coverage and void counts do not change ordinary won, lost and pending proportions', () => {
  assert.deepEqual(predictedPerformanceSummary({ total: 10, won: 6, lost: 3, pending: 1 }),
    { total: 10, won: .6, lost: .3, pending: .1 });
});

test('distinct cancelled slips remain in the denominator without being counted as void twice', () => {
  assert.deepEqual(predictedPerformanceSummary({ total: 8, won: 2, lost: 1, pending: 1, void: 1, cancelled: 3 }),
    { total: 8, won: .25, lost: .125, pending: .125 });
});
