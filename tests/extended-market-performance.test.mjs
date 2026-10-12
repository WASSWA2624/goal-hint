import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtendedMarketPerformanceService, extendedMarketPerformanceFromRows } from '../src/server/performance/extended-market-performance.ts';

const goal = (status, count, binaryCount = 0, overrides = {}) => ({ source: 'ai-score-distribution', marketKey: 'goal:full-time:result',
  ruleVersion: 'score-derived-goal-markets-v1', status, count, binaryCount, ...overrides });

test('qualified source/market/rule groups keep payout grades and evidence exclusions outside binary hit rates', () => {
  const rows = [goal('correct', 10n, 8n), goal('incorrect', 4n, 3n), goal('half-win', 2n), goal('half-loss', 1n),
    goal('push', 2n), goal('pending', 4n), goal('void', 3n), goal('unavailable', 5n)];
  const [value] = extendedMarketPerformanceFromRows(rows);
  assert.equal(value.total, 31); assert.equal(value.binaryDenominator, 11); assert.equal(value.binaryHitRate, 8 / 11);
  assert.equal(value.counts['half-win'], 2); assert.equal(value.counts.push, 2); assert.equal(value.counts.unavailable, 5);
  assert.equal(value.calibration, 'not-established'); assert.ok(Object.isFrozen(value.counts));
});

test('market-implied probabilities remain their own source with no implied calibration or fabricated empty groups', () => {
  const values = extendedMarketPerformanceFromRows([goal('correct', 1, 1), goal('correct', 2, 2, {
    source: 'market-implied', marketKey: 'implied:full-time:corners:total:all:9.5', ruleVersion: 'non-goal-market-implied-v1' }),
    goal('pending', 3, 0, { ruleVersion: 'future-reviewed-rule-v2' })]);
  assert.equal(values.length, 3); assert.equal(values[0].calibration, 'not-established');
  assert.equal(values.find((entry) => entry.ruleVersion === 'future-reviewed-rule-v2').binaryHitRate, null);
  assert.deepEqual(extendedMarketPerformanceFromRows([]), []);
});

test('duplicates, unsafe counts, mismatched source keys and partial grades in the binary denominator are rejected', () => {
  for (const rows of [[goal('correct', 1, 1), goal('correct', 1, 1)], [goal('correct', -1)],
    [goal('correct', 1, 2)], [goal('half-win', 1, 1)], [goal('correct', BigInt(Number.MAX_SAFE_INTEGER) + 1n)],
    [goal('correct', 1, 1, { source: 'market-implied' })]]) {
    assert.throws(() => extendedMarketPerformanceFromRows(rows));
  }
});

test('default-off capability never queries new tables; bounded query rejects invalid windows and injected keys', async () => {
  let calls = 0; const database = { transaction: async () => { calls++; throw new Error('No database should be accessed.'); } };
  await assert.rejects(createExtendedMarketPerformanceService({ database }).read({ from: 1_000_000_000_000, to: 1_000_000_001_000 }));
  const enabled = createExtendedMarketPerformanceService({ database, enabled: true });
  for (const input of [{ from: 1_000_000_000_000, to: 1_000_000_000_000 },
    { from: 1_000_000_000_000, to: 1_000_000_000_000 + 367 * 86_400_000 },
    { from: 1_000_000_000_000, to: 1_000_000_001_000, marketKeys: ["goal:full-time:'DROP TABLE'"] }]) {
    await assert.rejects(enabled.read(input));
  }
  assert.equal(calls, 0);
});
