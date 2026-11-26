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

test('nearby slips progress through actual kickoffs and keep previous groups exhausted on refresh', () => {
  const early = [selection(1, 185, '2.00', 0.88), selection(2, 190, '2.00', 0.89)];
  const later = [selection(3, 295, '2.00', 0.94), selection(4, 300, '2.00', 0.95)];
  const evening = [selection(5, 1100, '2.00', 0.90), selection(6, 1110, '2.00', 0.91)];
  const offers = [evening[0], later[1], ...early, later[0], evening[1]];
  assert.deepEqual(fixtureIds(build(offers, 3)), [ids(...early), ids(...later)]);
  assert.deepEqual(fixtureIds(build(offers, 3, midnight + 900 * minute, new Set(ids(...early, ...later)))), [ids(...evening)]);
});

test('nearby selections can cross clock boundaries and beat an unnecessary wider grouping', () => {
  const early = selection(1, 185, '2.00', 0.99);
  const nearby = [selection(2, 295, '2.00', 0.81), selection(3, 300, '2.00', 0.82)];
  assert.deepEqual(fixtureIds(build([early, ...nearby])), [ids(...nearby)]);

  const distant = selection(4, 610, '2.05', 0.94);
  assert.deepEqual(fixtureIds(build([early, distant])), [ids(early, distant)], 'a qualifying wider group is still considered');
});

test('the slate itself determines which gaps separate nearby groups', () => {
  const early = [selection(1, 185, '2.00', 0.61), selection(2, 186, '2.00', 0.87),
    selection(3, 187, '2.00', 0.88), selection(4, 188, '2.00', 0.62)];
  const later = Array.from({ length: 4 }, (_, index) => selection(5 + index, 206 + index, '2.00', 0.93));
  assert.deepEqual(fixtureIds(build([...early, ...later])), [ids(early[1], early[2])]);
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

test('fixture ownership includes 03:00 exactly and stops before the next 03:00', () => {
  const prior = selection(1, 180, '4.00', 0.95, { kickoffAt: midnight + 180 * minute - 1 });
  const first = selection(2, 180, '4.00', 0.82);
  const last = selection(3, 1620, '4.00', 0.85, { kickoffAt: nextMidnight + 180 * minute - 1 });
  const next = selection(4, 1620, '4.00', 0.94);
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
