import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipCombinationIdentity, buildDailyBestSlips } from '../src/domain/best-slips.ts';
import { parseDecimalOdds } from '../src/domain/odds.ts';

const at = Date.parse('2026-11-21T10:00:00Z');
const model = { calibrationReference: 'synthetic-test', correlationReference: 'synthetic-test',
  validFrom: at - 1, validUntil: at + 1, estimate: () => 0.72 };

function offer(fixtureId, bookmakerId, odds) {
  const bookmakerName = 'Book ' + bookmakerId;
  return {
    fixtureId, kickoffAt: at + 3_600_000, homeTeam: { id: fixtureId + '-h' }, awayTeam: { id: fixtureId + '-a' },
    family: 'match-result', selection: 'home-win', probability: 0.8, odds, oddsBasis: 'bookmaker',
    forecast: { cycleId: fixtureId + '-cycle', revisionId: fixtureId + '-revision', publishedAt: at - 1000 },
    bookmaker: { id: bookmakerId, name: bookmakerName },
    offer: { bookmakerId, bookmakerName, decimal: parseDecimalOdds(odds).text },
  };
}

test('daily Best Slips considers alternate books and keeps one highest exact same-book combination per pick set', () => {
  const selections = [
    offer('a', 1, '2.30'), offer('b', 2, '2.40'),
    offer('a', 3, '1.55'), offer('b', 3, '1.80'),
    offer('a', 4, '1.61'), offer('b', 4, '1.80'),
    offer('c', 5, '1.50'), offer('d', 5, '1.80'),
  ];
  const { slips } = buildDailyBestSlips('2026-11-21', '1.5-5', model, at, { selections }, new Set());
  assert.deepEqual(slips.map((slip) => [slip.totalOdds, slip.selections.map(({ fixtureId, bookmaker }) => [fixtureId, bookmaker.id])]),
    [['2.90', [['a', 4], ['b', 4]]], ['2.70', [['c', 5], ['d', 5]]]]);
  const repeated = new Set([bestSlipCombinationIdentity(slips[0].selections)]);
  const retry = buildDailyBestSlips('2026-11-21', '1.5-5', model, at, { selections }, repeated);
  assert.deepEqual(retry.slips, [slips[1]]);
});
