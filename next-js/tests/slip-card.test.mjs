import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { snapshotCardPrediction } from '../src/domain/match-card.ts';
import { slipSelectionCard } from '../src/domain/slip-card.ts';

const selection = Object.freeze({
  fixtureId: '00000000-0000-4000-8000-000000000001', kickoffAt: Date.parse('2026-10-28T15:00:00Z'),
  homeTeam: Object.freeze({ id: 'home', name: 'Original Home', logoUrl: null }),
  awayTeam: Object.freeze({ id: 'away', name: 'Original Away', logoUrl: null }),
  competition: Object.freeze({ id: 'league', name: 'Original League', country: 'Uganda' }),
  family: 'match-result', selection: 'home-win', probability: 0.2, odds: '2.00', oddsBasis: 'bookmaker',
  forecast: Object.freeze({ cycleId: '00000000-0000-4000-8000-000000000002',
    revisionId: '00000000-0000-4000-8000-000000000003', publishedAt: Date.parse('2026-10-28T08:00:00Z') }),
});

test('slip cards preserve original fixture facts and the selected alternative without constructing a forecast', () => {
  const { fixture, snapshotPick } = slipSelectionCard(selection);
  assert.deepEqual(parseFixtureSnapshot(fixture), fixture);
  assert.equal(fixture.homeTeam, selection.homeTeam);
  assert.equal(fixture.awayTeam, selection.awayTeam);
  assert.equal(fixture.competition, selection.competition);
  assert.equal(fixture.kickoffAt, selection.kickoffAt);
  assert.equal(fixture.cycleId, selection.forecast.cycleId);
  assert.equal(fixture.forecast, null);
  assert.equal(fixture.status, 'unknown');
  assert.equal(fixture.score, null);
  assert.equal(fixture.liveClock, undefined);
  assert.deepEqual(snapshotPick, { family: 'match-result', selection: 'home-win', probability: 0.2, odds: '2.00', outcome: 'pending',
    publishedAt: selection.forecast.publishedAt });
  const prediction = snapshotCardPrediction(snapshotPick);
  assert.equal(prediction.item.market.selection, 'home-win');
  assert.equal(prediction.probability.roundedPercent, 20);
  assert.equal(prediction.item.market.source, null);
  assert.equal(prediction.publishedAt, selection.forecast.publishedAt);
});

test('saved leg scores and supplied outcomes stay separate from an unknown current fixture status', () => {
  for (const outcome of ['correct', 'incorrect', 'pending', 'void']) {
    const result = { fixtureId: selection.fixtureId, home: 1, away: 0, outcome };
    const { fixture, snapshotPick } = slipSelectionCard(selection, result);
    assert.deepEqual(fixture.score, { home: 1, away: 0 });
    assert.equal(fixture.scorePeriod, 'regulation');
    assert.equal(fixture.status, 'unknown');
    assert.equal(snapshotCardPrediction(snapshotPick).status, outcome);
    assert.deepEqual(result, { fixtureId: selection.fixtureId, home: 1, away: 0, outcome });
  }
});

test('missing or mismatched saved results never invent a score or settle another leg', () => {
  for (const result of [undefined, { fixtureId: selection.fixtureId, home: null, away: null, outcome: 'void' },
    { fixtureId: 'other-fixture', home: 4, away: 0, outcome: 'correct' }]) {
    const { fixture, snapshotPick } = slipSelectionCard(selection, result);
    assert.equal(fixture.score, null);
    assert.equal(snapshotPick.outcome, result?.fixtureId === selection.fixtureId ? 'void' : 'pending');
  }
});

test('legacy selections require no invented publication identity and retain their own market', () => {
  const legacy = { ...selection };
  delete legacy.forecast;
  const card = slipSelectionCard({ ...legacy, family: 'total-goals', selection: 'under-2.5', probability: 0.6173, odds: '1.73' });
  assert.equal(card.fixture.cycleId, null);
  assert.equal(card.snapshotPick.odds, '1.73');
  const prediction = snapshotCardPrediction(card.snapshotPick);
  assert.equal(prediction.item.market.family, 'total-goals');
  assert.equal(prediction.item.market.selection, 'under-2.5');
  assert.equal(prediction.probability.roundedPercent, 61.7);
  assert.equal(prediction.publishedAt, null);
});

test('saved probability labels preserve precision without rounding near certainty to a guarantee', () => {
  const base = slipSelectionCard(selection).snapshotPick;
  assert.equal(snapshotCardPrediction({ ...base, probability: 0.99999 }).probability.labelKey, 'probability.more-than-ninety-nine');
  assert.equal(snapshotCardPrediction({ ...base, probability: 0.00001 }).probability.labelKey, 'probability.less-than-one');
  for (const probability of [-1, 1.1, NaN, Infinity]) assert.throws(() => snapshotCardPrediction({ ...base, probability }), RangeError);
  assert.throws(() => snapshotCardPrediction({ ...base, selection: 'under-2.5' }), RangeError);
});
