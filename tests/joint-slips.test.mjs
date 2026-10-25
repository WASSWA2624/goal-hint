import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFeedRecordSchema } from '../src/domain/match-feed.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { customSlipBuilder, jointSlipProbability, jointSlipRanking } from '../src/domain/joint-slips.ts';
import { buildSlips, defaultSlipCriteria, slipBuilderRules } from '../src/domain/slip-builder.ts';

const today = '2026-10-13', asOf = Date.parse('2026-10-13T07:00:00Z'), kickoffAt = Date.parse('2026-10-13T15:00:00Z');
// Synthetic test evidence only: these models are never bound to a production service.
const synthetic = { calibrationReference: 'synthetic-test-calibration', correlationReference: 'synthetic-test-joint-outcomes',
  validFrom: asOf - 1000, validUntil: asOf + 60_000 };
const model = { ...synthetic, estimate: (selections) => Math.min(...selections.map((item) => item.probability)) - 0.05 * (selections.length - 1) };
function record(id, odds = '2.00', probability = 0.8, offset = 0) {
  const snapshot = validateMarketSnapshot({
    'match-result': { source: 'ai', period: marketRules.period,
      probabilities: { 'home-win': probability, draw: (1 - probability) / 2, 'away-win': (1 - probability) / 2 } },
  });
  const markets = Object.values(snapshot.markets).filter((entry) => entry.available).map(({ market }) => ({ market, reasons: [], uncertainty: null }));
  return matchFeedRecordSchema.parse({ fixtureId: id, dataVersion: '1', homeTeam: { id: `${id}-h`, name: `${id} Home` },
    awayTeam: { id: `${id}-a`, name: `${id} Away` }, competition: { id: 'league-a', name: 'League A', country: 'Uganda' },
    kickoffAt: kickoffAt + offset, syncedAt: asOf, status: 'scheduled', score: null, cycleId: `cycle-${id}`,
    cycle: { state: 'open', mode: 'current', ordinal: 1, lockedAt: null, voidReason: null },
    forecast: { runId: 'run-a', revisionId: `revision-${id}`, publishedAt: asOf - 60_000, markets },
    update: { prediction: 'current', result: 'untracked' }, unavailableMarkets: [
      { family: 'total-goals', reason: 'not-published' }, { family: 'both-teams-to-score', reason: 'not-published' }],
    availabilityMessage: null, scorePeriod: null,
    prices: [{ family: 'match-result', selection: 'home-win', price: odds, basis: 'bookmaker', retrievedAt: asOf - 1000, providerUpdatedAt: null }] });
}
function criteria(overrides = {}) {
  return { ...defaultSlipCriteria(today), markets: ['match-result'], oddsMin: 101, oddsMax: 100_000,
    probMin: 0, probMax: 100, totalMin: 101, totalMax: 10_000_000, teamsMin: 1, teamsMax: 8, slips: 10, reuse: true, ...overrides };
}
const fixtureIds = (slip) => slip.selections.map((selection) => selection.fixtureId).sort();
const scaled = (price) => BigInt(price.replace('.', ''));
function subsets(items, maximum, start = 0, prefix = []) {
  const result = prefix.length ? [prefix] : [];
  if (prefix.length === maximum) return result;
  for (let index = start; index < items.length; index++) result.push(...subsets(items, maximum, index + 1, [...prefix, items[index]]));
  return result;
}
/** Brute-force oracle: the builder only supplies each subset's slip identity; filtering and ranking are recomputed here. */
function qualifyingSlips(records, bounds, joint) {
  const minimum = bounds.jointMin / 100, maximum = bounds.jointMax / 100;
  return subsets(records, bounds.teamsMax).filter((subset) => subset.length >= bounds.teamsMin).flatMap((subset) => {
    const product = subset.reduce((total, item) => total * scaled(item.prices[0].price), 1n), denominator = 100n ** BigInt(subset.length);
    if (product * 100n < BigInt(bounds.totalMin) * denominator || product * 100n > BigInt(bounds.totalMax) * denominator) return [];
    const slip = buildSlips(criteria({ teamsMin: subset.length, teamsMax: subset.length, slips: 1 }), subset, asOf).slips[0];
    const estimate = jointSlipProbability(joint, slip);
    return estimate === null || estimate < minimum || estimate > maximum ? [] : [{ slip, estimate }];
  }).sort((left, right) => right.estimate - left.estimate || left.slip.selections.length - right.slip.selections.length
    || Number(right.slip.totalOdds) - Number(left.slip.totalOdds) || left.slip.id.localeCompare(right.slip.id));
}

test('without a current model custom builds are byte-identical to the average-ranked builder', () => {
  const records = [record('a', '2.10', 0.71), record('b', '2.10', 0.71), record('c', '1.70', 0.99), record('d', '1.70', 0.99), record('e', '1.70', 0.99)];
  const bounds = criteria({ teamsMin: 2, teamsMax: 3, totalMin: 400, totalMax: 600, slips: 2 });
  const expected = buildSlips(bounds, records, asOf);
  for (const absent of [null, { ...model, validUntil: asOf }, { ...model, validFrom: asOf + 1 }, { ...model, calibrationReference: ' ' }]) {
    const result = customSlipBuilder(absent)(bounds, records, asOf);
    assert.deepEqual(result, expected); assert.equal('joint' in result, false);
    assert.ok(result.slips.every((slip) => !('estimatedProbability' in slip)));
    assert.throws(() => customSlipBuilder(absent)({ ...bounds, jointMin: 50 }, records, asOf), /current calibrated joint ranking/);
  }
});

test('a higher whole-slip estimate outranks fewer selections; the mean and product are never the estimate', () => {
  // 1.40^3 = 2.744 and 1.66^2 = 2.7556 are the only combinations within 2.70-2.80.
  const records = [record('a', '1.40', 0.95), record('b', '1.40', 0.95), record('c', '1.40', 0.95), record('d', '1.66', 0.7), record('e', '1.66', 0.7)];
  const bounds = criteria({ teamsMin: 2, teamsMax: 3, totalMin: 270, totalMax: 280, slips: 1 });
  assert.deepEqual(buildSlips(bounds, records, asOf).slips.map(fixtureIds), [['d', 'e']]);
  const ranked = customSlipBuilder(model)(bounds, records, asOf);
  assert.deepEqual(ranked.slips.map(fixtureIds), [['a', 'b', 'c']]); assert.equal(ranked.slips[0].totalOdds, '2.74');
  assert.ok(Math.abs(ranked.slips[0].estimatedProbability - 0.85) <= Number.EPSILON * 6);
  assert.notEqual(ranked.slips[0].estimatedProbability, ranked.slips[0].averageProbability);
  assert.ok(Math.abs(ranked.slips[0].estimatedProbability - 0.95 ** 3) > 0.005, 'the estimate is not an independence product');
  assert.deepEqual(ranked.joint, { unestimated: 0 }); assert.equal(ranked.searchLimited, false);
  assert.deepEqual(ranked.slips[0].selections.map((item) => item.fixtureId), ['a', 'b', 'c'], 'rows keep kickoff order');
});

test('whole-slip bounds are inclusive at the exact estimate', () => {
  const records = [record('a', '2.00', 0.7), record('b', '2.00', 0.7)], half = { ...synthetic, estimate: () => 0.5 };
  const pair = (bounds) => customSlipBuilder(half)(criteria({ teamsMin: 2, teamsMax: 2, ...bounds }), records, asOf).slips.length;
  assert.equal(pair({ jointMin: 50 }), 1); assert.equal(pair({ jointMin: 50.001 }), 0);
  assert.equal(pair({ jointMax: 50 }), 1); assert.equal(pair({ jointMax: 49.999 }), 0);
  assert.equal(pair({ jointMin: 50, jointMax: 50 }), 1);
});

test('absent, invalid or impossible estimates are excluded and counted, never replaced', () => {
  const records = [record('a', '2.00', 0.7), record('b', '2.00', 0.8), record('c', '2.00', 0.9)];
  for (const value of [null, NaN, Infinity, -0.1, 1.1, 0.99, 0.05]) {
    const result = customSlipBuilder({ ...synthetic, estimate: () => value })(criteria({ teamsMin: 2, teamsMax: 3 }), records, asOf);
    assert.equal(result.slips.length, 0, String(value)); assert.ok(result.joint.unestimated > 0, String(value));
  }
  // Partial coverage keeps only estimable slips and discloses the rest.
  const partial = { ...synthetic, estimate: (selections) => selections.length === 2 ? model.estimate(selections) : null };
  const result = customSlipBuilder(partial)(criteria({ teamsMin: 1, teamsMax: 3 }), records, asOf);
  assert.equal(result.slips.length, 3); assert.ok(result.slips.every((slip) => slip.selections.length === 2));
  assert.equal(result.joint.unestimated, 4);
});

test('exhaustive oracle: reused slips are the top estimates over every qualifying combination', () => {
  const records = [record('a', '1.41', 0.7, 1), record('b', '2.07', 0.8, 2), record('c', '1.93', 0.9, 3), record('d', '2.14', 0.82, 4),
    record('e', '1.52', 0.74, 5), record('f', '1.75', 0.88, 6), record('g', '2.30', 0.66, 7)];
  const curved = { ...synthetic, estimate: (selections) => Math.min(...selections.map((item) => item.probability)) * (1 - 0.04 * (selections.length - 1)) };
  for (const bounds of [criteria({ teamsMin: 1, teamsMax: 3, totalMin: 180, totalMax: 900 }),
    criteria({ teamsMin: 1, teamsMax: 3, totalMin: 180, totalMax: 900, jointMin: 66.5, jointMax: 80 })]) {
    const expected = qualifyingSlips(records, bounds, curved).slice(0, bounds.slips);
    const result = customSlipBuilder(curved)(bounds, records, asOf);
    assert.ok(expected.length === bounds.slips || bounds.jointMin > 0);
    assert.deepEqual(result.slips.map((slip) => slip.id), expected.map((item) => item.slip.id));
    assert.deepEqual(result.slips.map((slip) => slip.estimatedProbability), expected.map((item) => item.estimate));
    assert.equal(result.searchLimited, false);
    assert.deepEqual(customSlipBuilder(curved)(bounds, [...records].reverse(), asOf), result);
  }
});

test('exhaustive oracle: separate slips are the lexicographically best maximum-size disjoint batch', () => {
  const records = [record('a', '1.41', 0.7, 1), record('b', '2.07', 0.8, 2), record('c', '1.93', 0.9, 3), record('d', '2.14', 0.82, 4),
    record('e', '1.52', 0.74, 5), record('f', '1.75', 0.88, 6), record('g', '2.30', 0.66, 7)];
  for (const slips of [2, 3, 4]) {
    const bounds = criteria({ teamsMin: 2, teamsMax: 3, totalMin: 300, totalMax: 700, slips, reuse: false });
    const ranked = qualifyingSlips(records, bounds, model);
    // Rank-index tuples are generated in lexicographic order, so the first disjoint tuple of each size is that size's best.
    let best = [];
    for (const indexes of subsets(ranked.map((_, index) => index), slips)) {
      const fixtures = indexes.flatMap((index) => fixtureIds(ranked[index].slip));
      if (new Set(fixtures).size === fixtures.length && indexes.length > best.length) best = indexes;
    }
    const result = customSlipBuilder(model)(bounds, records, asOf);
    assert.ok(best.length > 0);
    assert.deepEqual(result.slips.map((slip) => slip.id), best.map((index) => ranked[index].slip.id), `slips=${slips}`);
    assert.equal(result.searchLimited, false);
  }
});

test('bounded joint searches disclose limits and stay deterministic', () => {
  const records = Array.from({ length: slipBuilderRules.maximumCandidates + 1 }, (_, index) => record(`fixture-${String(index).padStart(3, '0')}`));
  const result = customSlipBuilder(model)(criteria({ teamsMin: 1, teamsMax: 8 }), records, asOf);
  assert.equal(result.searchLimited, true); assert.equal(result.slips.length, 10);
  assert.ok(result.slips.every((slip, index) => !index || result.slips[index - 1].estimatedProbability >= slip.estimatedProbability));
  assert.deepEqual(customSlipBuilder(model)(criteria({ teamsMin: 1, teamsMax: 8 }), [...records].reverse(), asOf), result);
});

test('each enumerated combination is estimated once', () => {
  const records = [record('a', '1.41', 0.7), record('b', '2.07', 0.8), record('c', '1.93', 0.9), record('d', '2.14', 0.82), record('e', '1.52', 0.74)];
  let calls = 0;
  const seen = new Set(), counted = { ...model, estimate: (selections) => {
    calls++; seen.add(selections.map((item) => item.fixtureId).sort().join('|')); return model.estimate(selections);
  } };
  const result = customSlipBuilder(counted)(criteria({ teamsMin: 1, teamsMax: 4, slips: 3, reuse: false }), records, asOf);
  assert.equal(result.slips.length, 3); assert.ok(calls > 3); assert.equal(calls, seen.size);
  const ranking = jointSlipRanking(counted, criteria()), slip = result.slips[0];
  calls = 0; ranking.probability(slip); ranking.probability(slip); ranking.ranking.compare(slip, slip);
  assert.equal(calls, 1);
});

test('ranked builds batch only the final retained set, so discarded stages cannot flag a limit', () => {
  // Pairs exist only among twelve 1.80 fixtures (3.24); triples only among twenty-one 1.50 fixtures (3.375).
  const pairs = Array.from({ length: 12 }, (_, index) => record(`pair-${String(index).padStart(2, '0')}`, '1.80', 0.8, index));
  const triples = Array.from({ length: 21 }, (_, index) => record(`triple-${String(index).padStart(2, '0')}`, '1.50', 0.95, 100 + index));
  const records = [...pairs, ...triples], bounds = criteria({ totalMin: 320, totalMax: 340, slips: 7, reuse: false });
  // Seven separate pairs are impossible, and that discarded stage's exact batch search exceeds its budget.
  const pairStage = customSlipBuilder(model)({ ...bounds, teamsMin: 2, teamsMax: 2 }, records, asOf);
  assert.equal(pairStage.slips.length, 6); assert.equal(pairStage.searchLimited, true);
  const result = customSlipBuilder(model)({ ...bounds, teamsMin: 2, teamsMax: 3 }, records, asOf);
  const finalStage = customSlipBuilder(model)({ ...bounds, teamsMin: 3, teamsMax: 3 }, records, asOf);
  assert.equal(result.slips.length, 7); assert.ok(result.slips.every((slip) => slip.selections.length === 3));
  assert.deepEqual(result.slips, finalStage.slips); assert.equal(result.searchLimited, false);
  const used = result.slips.flatMap(fixtureIds); assert.equal(new Set(used).size, 21);
});
