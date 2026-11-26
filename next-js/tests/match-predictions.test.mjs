import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPredictionSummary, matchSummaryStanding } from '../src/domain/match-predictions.ts';

const over15 = 'goal:full-time:totals:total:1.5:binary';
const under45 = 'goal:full-time:totals:total:4.5:binary';

function core(family, selection, selectedProbability, source = 'api-football') {
  return { market: { family, selection, selectedProbability, source } };
}

function extended(key, selection, selectedProbability, source = 'local-poisson') {
  return { key, selection, selectedProbability, source, result: { status: 'pending' } };
}

function createDetail() {
  const featuredPrediction = { key: 'match-result', family: 'match-result', selection: 'away-win', probability: 0.41,
    odds: '2.09', source: 'local-engine' };
  return {
    selection: 'applicable', fixture: { status: 'live', score: { home: 2, away: 0 }, cycleId: 'cycle',
      featuredDecisionFrozen: true, featuredPrediction, forecast: { revisionId: 'revision', markets: [] } },
    snapshot: { applicability: 'locked', revisionId: 'revision', cycleId: 'cycle', outcomes: [], markets: [
      core('match-result', 'home-win', 0.51), core('both-teams-to-score', 'yes', 0.90),
      core('double-chance', 'home-or-away', 0.68), core('total-goals', 'over-2.5', 0.70),
    ] },
    extendedMarkets: { markets: [extended(over15, 'over', 0.90), extended(under45, 'under', 0.96),
      extended('goal:full-time:btts', 'yes', 0.98), extended('implied:full-time:unlisted', 'winner', 0.99, 'market-implied')] },
    access: { tier: 'full' }, history: {},
  };
}

test('summary honors the frozen featured outcome and ranks four distinct published modeled markets', () => {
  const data = createDetail();
  const { featured, other } = matchPredictionSummary(data);
  assert.equal(featured.selection, 'away-win');
  assert.equal(featured.odds, '2.09');
  assert.deepEqual(other.map(({ key }) => key), [under45, over15, 'both-teams-to-score', 'total-goals']);
  assert.deepEqual([featured, ...other].map((pick) => matchSummaryStanding(data, pick)),
    ['off-track', 'on-track', 'on-track', 'off-track', 'off-track']);
  assert.equal(matchSummaryStanding({ ...data, fixture: { ...data.fixture, liveClock: { phase: 'extra-time' } } }, featured), null);
});

test('summary enforces prediction access and uses publication settlement without borrowing a live score or price', () => {
  const data = createDetail();
  assert.equal(matchPredictionSummary({ ...data, access: { tier: 'free' } }), null);
  const completed = { ...data, fixture: { ...data.fixture, status: 'finished-regulation',
    featuredPrediction: { ...data.fixture.featuredPrediction, settlementStatus: 'incorrect' } }, access: { tier: 'free' } };
  const featured = matchPredictionSummary(completed).featured;
  assert.equal(featured.status, 'incorrect');
  assert.equal(matchSummaryStanding(completed, featured), null);
  const historical = { ...data, selection: 'revision', snapshot: { ...data.snapshot, applicability: 'historical' }, extendedMarkets: null };
  const original = matchPredictionSummary(historical);
  assert.equal(original.featured.key, 'both-teams-to-score');
  assert.ok([original.featured, ...original.other].every(({ status, odds }) => status === 'unavailable' && odds === null));
});

test('summary keeps replay selections and recovered odds with their own forecast', () => {
  const data = createDetail();
  const featured = { ...data.fixture.featuredPrediction, odds: '2.20', historicalOdds: { bookmakerId: 1 }, settlementStatus: 'correct' };
  const other = { key: over15, selection: 'over', probability: 0.86, odds: null, source: 'local-engine' };
  const replay = { ...data, fixture: { ...data.fixture, status: 'finished-regulation', retrospective: { pick: featured } },
    retrospectiveMarkets: [featured, other] };
  const summary = matchPredictionSummary(replay);
  assert.equal(summary.featured.priceKind, 'historical-pre-match');
  assert.equal(summary.featured.status, 'correct');
  assert.deepEqual(summary.other.map(({ key }) => key), [over15]);
  assert.deepEqual(matchPredictionSummary({ ...replay, retrospectiveMarkets: null }).other, []);
});
