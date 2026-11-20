import assert from 'node:assert/strict';
import test from 'node:test';
import { nonGoalEventMarket, nonGoalEventTeamMarket, nonGoalTotalsMarket } from '../src/domain/non-goal-market-definitions.ts';
import { assessScorerCapability, assessStatisticCapability } from '../src/server/intelligence/market-evidence-capabilities.ts';

const day = 86_400_000, cutoff = Date.parse('2025-11-20T12:00:00Z');
const fixture = { fixtureId: 'target', competitionId: 'league', homeTeamId: 'home', awayTeamId: 'away', forecastAt: cutoff, kickoffAt: cutoff + 600_000 };
const hash = (id) => id.toString(16).padStart(64, '0');
const receipt = (id) => ({ availableAt: cutoff - 2000, observationHash: hash(id), evidenceRef: `observation:${id}` });
const lineup = (id = 1, overrides = {}) => ({ kind: 'lineup', ...receipt(id), fixtureId: fixture.fixtureId, playerId: 12, teamId: 'home', role: 'starting', ...overrides });
const availability = (id = 2, overrides = {}) => ({ kind: 'availability', ...receipt(id), fixtureId: fixture.fixtureId,
  playerId: 12, teamId: 'home', status: 'unavailable', ...overrides });
const contribution = (id, overrides = {}) => ({ kind: 'match-contribution', ...receipt(id), fixtureId: `history-${id}`,
  playerId: 12, teamId: 'home', competitionId: fixture.competitionId, opponentId: 'past-opponent', kickoffAt: cutoff - 4 * day,
  period: 'regulation-including-stoppage-time', minutes: 75, goals: 1, penaltyGoals: null, ...overrides });
const environment = (id, overrides = {}) => ({ kind: 'scoring-environment', ...receipt(id), fixtureId: fixture.fixtureId,
  teamId: 'home', opponentId: 'away', modelHash: hash(53), expectedTeamGoals: 1.35, ...overrides });
const scorer = (observations, overrides = {}) => assessScorerCapability({ fixture, teamId: 'home', playerId: 12, order: 'any',
  observations, verifyEvidence: () => true, ...overrides });

test('verified lineup roles report participation uncertainty without inventing minutes or scorer chances', () => {
  const starter = scorer([lineup(), contribution(2), contribution(3, { teamId: 'previous-club', penaltyGoals: 1 }),
    contribution(4, { penaltyGoals: 0 }), environment(5)]);
  assert.equal(starter.status, 'unavailable');
  assert.deepEqual(starter.participation, { state: 'confirmed-starter', expectedMinutes: null });
  assert.deepEqual(starter.reasons, ['missing-qualified-participation-model', 'no-qualified-player-scorer-model']);
  assert.deepEqual(starter.support, { currentTeamMatches: 2, previousTeamMatches: 1, recordedPenaltyMatches: 1, conflictingMatches: 0,
    scoringEnvironment: true, observationHashes: [1, 2, 3, 4, 5].map(hash) });
  const bench = scorer([lineup(1, { role: 'substitute' })], { order: 'first' });
  assert.deepEqual(bench.participation, { state: 'confirmed-bench', expectedMinutes: null });
  assert.ok(bench.reasons.includes('no-qualified-scorer-order-model'));
  assert.ok(bench.reasons.includes('missing-qualified-scoring-environment'));
  assert.ok(Object.isFrozen(bench.support));
});

test('invalid fixture membership, unverified lineup and competing role and availability observations withhold', () => {
  assert.equal(scorer([lineup(1, { availableAt: cutoff + 1 })]).participation.state, 'unconfirmed');
  assert.equal(scorer([lineup()], { verifyEvidence: async () => true }).participation.state, 'unconfirmed');
  assert.equal(scorer([lineup(1, { fixtureId: 'different-fixture' })]).participation.state, 'unconfirmed');
  assert.equal(scorer([lineup(1, { teamId: 'away' })]).participation.state, 'conflicting');
  assert.equal(scorer([lineup(), lineup(2, { role: 'substitute' })]).participation.state, 'conflicting');
  assert.equal(scorer([lineup(), availability()]).participation.state, 'conflicting');
  assert.equal(scorer([availability()]).participation.state, 'unavailable');
  assert.equal(scorer([availability(1, { status: 'available' })]).participation.state, 'unconfirmed');
  assert.deepEqual(scorer([lineup()], { teamId: 'unrelated' }).reasons, ['invalid-scorer-request']);
});

test('scorer inputs exclude future corrections, other players, unmatched environment and non-appearance samples', () => {
  const earlier = contribution(8, { penaltyGoals: null });
  const future = { ...earlier, ...receipt(9), availableAt: cutoff + 1, penaltyGoals: 1 };
  const rival = contribution(10, { playerId: 13 });
  const absent = contribution(11, { minutes: 0, goals: 0 });
  const conflicting = contribution(12);
  const sameMatch = { ...conflicting, ...receipt(13), minutes: 30 };
  const extraTime = contribution(15, { period: 'including-extra-time' });
  const result = scorer([lineup(), earlier, earlier, future, rival, absent, conflicting, sameMatch, extraTime,
    environment(14, { opponentId: 'wrong' }), environment(16, { expectedTeamGoals: -1 })]);
  assert.equal(result.support.currentTeamMatches, 1);
  assert.equal(result.support.conflictingMatches, 1);
  assert.equal(result.support.recordedPenaltyMatches, 0);
  assert.equal(result.support.scoringEnvironment, false);
  assert.deepEqual(result.support.observationHashes, [1, 8].map(hash));
});

const rule = 'provider-reported-count-v1';
const count = (metric, period = 'full-time', overrides = {}) => ({ metric, period, scope: 'regulation-including-stoppage-time', countingRule: rule,
  verified: true, home: 3, away: 4, ...overrides });
const event = (metric, overrides = {}) => ({ metric, period: 'full-time', scope: 'regulation-including-stoppage-time', countingRule: 'provider-event-v1',
  verified: true, complete: true, entries: [], ...overrides });
function statistics(id, counts = [], events = [], overrides = {}) {
  return { kind: 'non-goal-result', ...receipt(id), fixtureId: `statistic-${id}`, competitionId: fixture.competitionId, kickoffAt: cutoff - 3 * day,
    settlement: { status: 'finished-regulation', cycleEligibility: { eligible: true }, resultUsable: true, evidence: { counts, events } }, ...overrides };
}
const statistic = (definition, history, overrides = {}) => assessStatisticCapability({ fixture, definition, history,
  verifyHistory: () => true, ...overrides });

test('count scope uses compatible verified metric, counting rule and period without accepting score or event proxies', () => {
  const usable = statistics(1, [count('corners', 'half-time', { home: 0, away: 0 })]);
  const history = [usable, usable, statistics(2, [count('corners')]), statistics(3, [count('yellow-cards', 'half-time')]),
    statistics(4, [count('corners', 'half-time', { verified: false })]), statistics(5, [count('corners', 'half-time', { home: null })]),
    statistics(6, [count('corners', 'half-time', { countingRule: 'other-rule' })]), statistics(7, [], [event('corners')]),
    statistics(8, [count('corners', 'half-time')], [], { availableAt: cutoff + 1 }),
    statistics(9, [count('corners', 'half-time')], [], { competitionId: 'other' })];
  const total = statistic(nonGoalTotalsMarket('corners', 4.5, { period: 'half-time' }), history);
  assert.equal(total.basis, 'count');
  assert.deepEqual(total.support.observationHashes, [hash(1)]);
  assert.deepEqual(total.reasons, ['no-qualified-statistic-model']);
  const away = statistic(nonGoalTotalsMarket('corners', 4.5, { period: 'half-time', scope: 'away' }), history);
  assert.deepEqual(away.support.observationHashes, [1, 5].map(hash));
  const unsupported = statistic(nonGoalTotalsMarket('red-cards', 0.5), history);
  assert.deepEqual(unsupported.reasons, ['missing-verified-period-count-history', 'no-qualified-statistic-model']);
});

test('first/last events require complete timelines, and a verified empty timeline can settle', () => {
  const market = nonGoalEventTeamMarket('corners', 'first');
  const data = [statistics(1, [count('corners')]), statistics(2, [], [event('corners', { complete: false })]),
    statistics(3, [], [event('yellow-cards')]), statistics(4, [], [event('corners')])];
  const missing = statistic(market, data.slice(0, 3));
  assert.equal(missing.basis, 'event');
  assert.deepEqual(missing.reasons, ['missing-complete-period-event-history', 'no-qualified-event-order-model']);
  const supportedInput = statistic(market, data);
  assert.equal(supportedInput.status, 'unavailable');
  assert.deepEqual(supportedInput.support.observationHashes, [hash(4)]);
  assert.deepEqual(supportedInput.reasons, ['no-qualified-event-order-model']);
  const rejectedScope = statistic(nonGoalEventMarket('goals', 'last', {}, 12), data);
  assert.deepEqual(rejectedScope.reasons, ['invalid-statistic-request']);
});
