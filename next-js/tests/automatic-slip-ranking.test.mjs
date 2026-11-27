import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipKickoffSpanMs } from '../src/domain/best-slip-publication-hour.ts';
import { automaticBestSlipPriority, buildHourlyBestSlips } from '../src/domain/best-slips.ts';
import { getReportingDayBounds } from '../src/domain/calendar.ts';
import { pricedEditorialSelection } from './helpers/best-slip-publication-fixtures.mjs';

const day = '2026-11-26';
const { startInclusive: midnight, endExclusive: nextMidnight } = getReportingDayBounds(day);
const minute = 60_000;
const selection = (index, minutes, odds, probability, extra = {}) => pricedEditorialSelection(index, {
  at: midnight, kickoffAt: midnight + minutes * minute, odds, probability, ...extra,
});
const build = (selections, capacity = 1, asOf = midnight, priorFixtures) => buildHourlyBestSlips(day, '1.5-5', capacity,
  asOf, { selections, priorFixtures }, new Set()).slips;
const fixtureIds = (slips) => slips.map(({ selections }) => selections.map(({ fixtureId }) => fixtureId));
const ids = (...selections) => selections.map(({ fixtureId }) => fixtureId);

test('probability ranks eligible kickoff groups and the release horizon defers later fixtures', () => {
  const early = [selection(1, 185, '2.00', 0.88), selection(2, 190, '2.00', 0.89)];
  const later = [selection(3, 295, '2.00', 0.94, { bookmakerId: 9 }), selection(4, 300, '2.00', 0.95, { bookmakerId: 9 })];
  const evening = [selection(5, 1100, '2.00', 0.90, { bookmakerId: 10 }), selection(6, 1110, '2.00', 0.91, { bookmakerId: 10 })];
  const offers = [evening[0], later[1], ...early, later[0], evening[1]];
  assert.deepEqual(fixtureIds(build(offers, 3)), [ids(...later), ids(...early)]);
  const asOf = midnight + 900 * minute;
  const refreshed = [selection(5, 1100, '2.00', 0.90, { at: asOf, bookmakerId: 10 }),
    selection(6, 1110, '2.00', 0.91, { at: asOf, bookmakerId: 10 })];
  assert.deepEqual(fixtureIds(build([...early, ...later, ...refreshed], 3, asOf, new Set(ids(...early, ...later)))), [ids(...evening)]);
});

test('an eligible narrow step wins ahead of stronger probability ten hours apart', () => {
  const wide = [selection(1, 240, '2.00', 0.97), selection(2, 840, '2.05', 0.98)];
  const nearby = [selection(3, 295, '2.00', 0.94, { bookmakerId: 9 }), selection(4, 300, '2.00', 0.95, { bookmakerId: 9 })];
  assert.deepEqual(fixtureIds(build([...nearby, ...wide], 2)), [ids(...nearby), ids(...wide)]);
  assert.equal(bestSlipKickoffSpanMs(wide), 600 * minute);
});

test('stronger probability ranks ahead of an earlier adaptive kickoff group', () => {
  const early = [selection(1, 185, '2.00', 0.61), selection(2, 186, '2.00', 0.87),
    selection(3, 187, '2.00', 0.88), selection(4, 188, '2.00', 0.62)];
  const later = Array.from({ length: 4 }, (_, index) => selection(5 + index, 206 + index, '2.00', 0.93));
  assert.deepEqual(fixtureIds(build([...early, ...later])), [ids(later[0], later[1])]);
});

test('within 15 minutes probability outranks price, exact span and selection count', () => {
  const single = selection(1, 200, '4.60', 0.82);
  const pair = [selection(2, 196, '2.04', 0.93), selection(3, 205, '2.01', 0.92)];
  const [slip] = build([single, ...pair]);
  assert.deepEqual(fixtureIds([slip]), [ids(...pair)]);
  assert.equal(slip.totalOdds, '4.10');
  assert.equal(Object.hasOwn(slip, 'estimatedProbability'), false);
});

test('comparable probability favors lower individual odds while preserving better prices for identical picks', () => {
  const riskier = selection(1, 200, '4.60', 0.82);
  const conservative = selection(2, 200, '2.80', 0.82);
  const betterSamePick = selection(2, 200, '3.00', 0.82, { bookmakerId: 9 });
  const [slip] = build([riskier, conservative, betterSamePick]);
  assert.deepEqual(fixtureIds([slip]), [ids(conservative)]);
  assert.equal(slip.totalOdds, betterSamePick.odds);
  assert.deepEqual(fixtureIds(build([riskier, { ...conservative, probability: 0.81 }])), [ids(riskier)]);
});

test('exact current offers from distinct bookmakers break probability ties ahead of price', () => {
  const rare = selection(1, 200, '2.60', 0.84), common = selection(2, 200, '3.20', 0.84);
  const otherBook = selection(2, 200, '3.20', 0.84, { bookmakerId: 9 });
  const stale = selection(1, 200, '2.60', 0.84, { bookmakerId: 10, at: midnight - 13 * 60 * minute });
  const opposite = selection(1, 200, '2.60', 0.80, { bookmakerId: 11 });
  const offers = [rare, { ...rare }, common, otherBook, stale,
    { ...opposite, selection: 'away-win', offer: { ...opposite.offer, providerSelection: 'Away' } }];
  assert.deepEqual(fixtureIds(build(offers)), [ids(common)]);
  assert.deepEqual(fixtureIds(build([{ ...rare, probability: 0.85 }, ...offers.slice(2)])), [ids(rare)]);
});

test('equally qualified pairs prefer simultaneous, 15 minute and 30 minute starts before price', () => {
  const spread = [selection(1, 185, '1.80', 0.90), selection(2, 215, '1.80', 0.90)];
  const nearby = [selection(3, 255, '1.90', 0.90), selection(4, 270, '1.90', 0.90)];
  const simultaneous = [selection(5, 310, '2.10', 0.90), selection(6, 310, '2.10', 0.90)];
  assert.deepEqual(fixtureIds(build([...spread, ...nearby, ...simultaneous], 3)), [ids(...simultaneous), ids(...nearby), ids(...spread)]);
});

test('elapsed windows include 15, 30 and 45 exactly and expand just beyond each boundary', () => {
  const minuteSpans = [0, 15, 15 + 1 / minute, 30, 30 + 1 / minute, 45, 45 + 1 / minute];
  const probabilities = [0.85, 0.96, 0.86, 0.97, 0.87, 0.98, 0.99];
  const pairs = minuteSpans.map((span, index) => {
    const bookmakerId = index + 1;
    const first = selection(2 * index + 1, 240, '2.00', probabilities[index], { bookmakerId });
    const last = selection(2 * index + 2, 240 + span, '2.00', probabilities[index],
      { bookmakerId, kickoffAt: first.kickoffAt + Math.round(span * minute) });
    return [first, last];
  });
  const slips = build(pairs.flat().reverse(), pairs.length);
  assert.deepEqual(fixtureIds(slips), [pairs[1], pairs[0], pairs[3], pairs[2], pairs[5], pairs[4], pairs[6]].map(pair => ids(...pair)));
  assert.deepEqual(slips.map(slip => automaticBestSlipPriority(slip).spanBucket), [1, 1, 2, 2, 3, 3, 4]);
});

test('used fixtures are excluded and remaining fixtures carry into wider steps', () => {
  const picks = [240, 248, 275, 320].map((kickoff, index) => selection(index + 1, kickoff, '2.00', 0.96 - index * 0.01));
  const slips = build(picks, 2);
  assert.deepEqual(fixtureIds(slips), [ids(...picks.slice(0, 2)), ids(...picks.slice(2))]);
  assert.deepEqual(slips.map(slip => automaticBestSlipPriority(slip).spanBucket), [1, 3]);
});

test('shorter span decides equal bounds ahead of stronger constituents, more bookmakers and price', () => {
  const nearby = [selection(1, 240, '2.10', 0.9375), selection(2, 255, '2.10', 0.8125)];
  const wide = [selection(3, 240, '1.80', 0.875, { bookmakerId: 9 }), selection(4, 840, '1.80', 0.875, { bookmakerId: 9 })];
  const extraOffers = [selection(3, 240, '1.80', 0.875, { bookmakerId: 10 }),
    selection(4, 840, '1.80', 0.875, { bookmakerId: 10 })];
  assert.deepEqual(fixtureIds(build([...wide, ...extraOffers, ...nearby], 2)), [ids(...nearby), ids(...wide)]);
});

test('every band can publish a wide pair when it is the only eligible combination', () => {
  for (const [band, price] of [['1.5-5', '2.00'], ['5-10', '2.50'], ['10-20', '3.50'], ['20-50', '5.00'],
    ['50-100', '8.00'], ['100-200', '11.00']]) {
    const first = selection(1, 240, price, 0.90), last = selection(2, 840, price, 0.90);
    const result = buildHourlyBestSlips(day, band, 1, midnight, { selections: [last, first] }, new Set(), undefined,
      { includeAlternatives: true });
    assert.deepEqual(fixtureIds(result.slips), [ids(first, last)]);
    assert.deepEqual(fixtureIds(result.alternatives), [ids(first, last)]);
    assert.equal(result.searchLimited, false);
  }
});

test('overlapping fixtures retain all eligible alternatives in deterministic span order', () => {
  const picks = [180, 195, 210, 225].map((at, index) => selection(index + 1, at, '2.00', 0.90));
  const run = (selections) => buildHourlyBestSlips(day, '5-10', 1, midnight, { selections }, new Set(), undefined,
    { includeAlternatives: true });
  const result = run([...picks].reverse());
  assert.deepEqual(fixtureIds(result.alternatives), [ids(...picks.slice(0, 3)), ids(...picks.slice(1)),
    ids(picks[0], picks[1], picks[3]), ids(picks[0], picks[2], picks[3])]);
  assert.deepEqual(fixtureIds(result.slips), [ids(...picks.slice(0, 3))]);
  assert.deepEqual(run(picks), result);
});

test('kickoff ranking uses elapsed time across midnight and only the first leg must be released', () => {
  const at = nextMidnight - 6 * 60 * minute;
  const before = selection(1, 1430, '2.00', 0.87, { at });
  const after = selection(2, 1460, '2.00', 0.89, { at });
  const wide = [selection(3, 1290, '2.00', 0.87, { at, bookmakerId: 9 }), selection(4, 1500, '2.00', 0.89, { at, bookmakerId: 9 })];
  assert.deepEqual(fixtureIds(build([after, ...wide, before], 2, at)), [ids(before, after), ids(...wide)]);
  assert.equal(bestSlipKickoffSpanMs([after, before]), 30 * minute);
  assert.deepEqual(build([after, { ...before, kickoffAt: nextMidnight + 1 }], 1, at), []);
});

test('fixture ownership includes 03:00 exactly and stops before the next 03:00', () => {
  const prior = selection(1, 180, '4.00', 0.95, { kickoffAt: midnight + 180 * minute - 1 });
  const first = selection(2, 180, '4.00', 0.82);
  const last = selection(3, 1620, '4.00', 0.85, { at: nextMidnight, kickoffAt: nextMidnight + 180 * minute - 1 });
  const next = selection(4, 1620, '4.00', 0.94, { at: nextMidnight });
  const offers = [prior, first, last, next];
  assert.deepEqual(fixtureIds(build(offers, 10)), [ids(first)]);
  assert.deepEqual(fixtureIds(build(offers, 10, nextMidnight)), [ids(last)]);
});

test('the bounded selector accepts every distinct qualifying slip up to its requested batch size', () => {
  for (const count of [2, 10, 24]) {
    const offers = Array.from({ length: count }, (_, index) => selection(index + 1, 200, '4.00', 0.83));
    assert.equal(new Set(fixtureIds(build(offers, 32)).flat()).size, count);
  }
});

test('bounded full-day search reaches the narrow step before spending the budget on wide alternatives', () => {
  const short = Array.from({ length: 8 }, (_, index) => selection(index + 1, 240 + 2 * index, '1.90', 0.90));
  const wide = Array.from({ length: 47 }, (_, index) => selection(index + 9, 500 + index * 7, '1.90', 0.99));
  const result = buildHourlyBestSlips(day, '100-200', 1, midnight, { selections: [...wide, ...short] }, new Set(), undefined,
    { includeAlternatives: true });
  assert.equal(result.searchLimited, true);
  assert.deepEqual(fixtureIds(result.slips), [ids(...short)]);
  assert.deepEqual(fixtureIds(result.alternatives.slice(0, 1)), [ids(...short)]);
});

test('the disjoint reserve carries a wider slip past a full retained heap of narrow alternatives', () => {
  const narrow = Array.from({ length: 16 }, (_, index) => selection(index + 1, 240, '1.60', 0.90));
  const wide = [selection(17, 240, '3.30', 0.90, { bookmakerId: 9 }), selection(18, 285, '3.30', 0.90, { bookmakerId: 9 })];
  const result = buildHourlyBestSlips(day, '10-20', 4, midnight, { selections: [...wide, ...narrow] }, new Set(), undefined,
    { includeAlternatives: true });
  assert.equal(result.searchLimited, true);
  assert.equal(result.slips.length, 4);
  assert.deepEqual(fixtureIds(result.slips.slice(-1)), [ids(...wide)]);
});

test('the bounded widening search can prove an odds band is infeasible across many books', () => {
  const selections = Array.from({ length: 210 }, (_, index) => selection(index + 1, 240 + index % 7,
    '1.90', 0.90, { bookmakerId: 1 + Math.floor(index / 7) }));
  const result = buildHourlyBestSlips(day, '100-200', 4, midnight, { selections }, new Set(), undefined,
    { includeAlternatives: true });
  assert.deepEqual(result.slips, []);
  assert.equal(result.searchDiagnostics.candidateOffers, 210);
  assert.equal(result.searchDiagnostics.bookmakerPrunedBranches, 0);
  assert.equal(result.searchLimited, false);
});
