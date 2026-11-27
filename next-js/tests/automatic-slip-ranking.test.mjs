import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHourlyBestSlips } from '../src/domain/best-slips.ts';
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
  const later = [selection(3, 295, '2.00', 0.94), selection(4, 300, '2.00', 0.95)];
  const evening = [selection(5, 1100, '2.00', 0.90), selection(6, 1110, '2.00', 0.91)];
  const offers = [evening[0], later[1], ...early, later[0], evening[1]];
  assert.deepEqual(fixtureIds(build(offers, 3)), [ids(...later), ids(...early)]);
  const asOf = midnight + 900 * minute;
  const refreshed = [selection(5, 1100, '2.00', 0.90, { at: asOf }), selection(6, 1110, '2.00', 0.91, { at: asOf })];
  assert.deepEqual(fixtureIds(build([...early, ...later, ...refreshed], 3, asOf, new Set(ids(...early, ...later)))), [ids(...evening)]);
});

test('nearby selections can cross clock boundaries and wide pairs never qualify', () => {
  const early = selection(1, 185, '2.00', 0.99);
  const nearby = [selection(2, 295, '2.00', 0.81), selection(3, 300, '2.00', 0.82)];
  assert.deepEqual(fixtureIds(build([early, ...nearby])), [ids(...nearby)]);
  const distant = selection(4, 610, '2.05', 0.94);
  assert.deepEqual(build([early, distant]), []);
  assert.deepEqual(build([early, nearby[0]]), []);
});

test('stronger probability ranks ahead of an earlier adaptive kickoff group', () => {
  const early = [selection(1, 185, '2.00', 0.61), selection(2, 186, '2.00', 0.87),
    selection(3, 187, '2.00', 0.88), selection(4, 188, '2.00', 0.62)];
  const later = Array.from({ length: 4 }, (_, index) => selection(5 + index, 206 + index, '2.00', 0.93));
  assert.deepEqual(fixtureIds(build([...early, ...later])), [ids(later[0], later[1])]);
});

test('in the same kickoff group probability outranks price, span and selection count', () => {
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

test('every band permits exactly 30 minutes and rejects a single millisecond beyond it', () => {
  for (const [band, price] of [['1.5-5', '2.00'], ['5-10', '2.50'], ['10-20', '3.50'], ['20-50', '5.00'],
    ['50-100', '8.00'], ['100-200', '11.00']]) {
    const first = selection(1, 200, price, 0.90), last = selection(2, 230, price, 0.90);
    const run = (end) => buildHourlyBestSlips(day, band, 1, midnight, { selections: [end, first] }, new Set(), undefined,
      { includeAlternatives: true });
    assert.deepEqual(fixtureIds(run(last).slips), [ids(first, last)]);
    const tooWide = run({ ...last, kickoffAt: last.kickoffAt + 1 });
    assert.deepEqual(tooWide.slips, []);
    assert.ok(tooWide.searchDiagnostics.kickoffPrunedBranches > 0);
  }
});

test('overlapping kickoff windows retain ranked alternatives from each window', () => {
  const picks = [180, 195, 210, 225].map((at, index) => selection(index + 1, at, '2.00', 0.90));
  const run = (selections) => buildHourlyBestSlips(day, '5-10', 1, midnight, { selections }, new Set(), undefined,
    { includeAlternatives: true });
  const result = run([...picks].reverse());
  assert.deepEqual(fixtureIds(result.alternatives), [ids(...picks.slice(0, 3)), ids(...picks.slice(1))]);
  assert.deepEqual(fixtureIds(result.slips), [ids(...picks.slice(0, 3))]);
  assert.deepEqual(run(picks), result);
});

test('kickoff cohesion uses elapsed time across midnight and preserves an earliest-leg release horizon', () => {
  const at = nextMidnight - 6 * 60 * minute;
  const before = selection(1, 1430, '2.00', 0.87, { at });
  const after = selection(2, 1460, '2.00', 0.89, { at });
  assert.deepEqual(fixtureIds(build([after, before], 1, at)), [ids(before, after)]);
  assert.deepEqual(build([after, { ...before, kickoffAt: before.kickoffAt - 1 }], 1, at), []);
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
