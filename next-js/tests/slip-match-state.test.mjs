import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipViews } from '../src/domain/best-slips.ts';
import { scheduledSlipMatchStates, slipMatchStateForSelection, slipMatchStatesFromResults } from '../src/domain/slip-match-state.ts';
import { gateBestSlips } from '../src/server/slips/best-slips.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

function selection() {
  const source = slipForecastFixture();
  return { ...source.slip.selections[0], forecast: { cycleId: source.cycle.id, revisionId: source.row.id, publishedAt: source.row.publishedAt.getTime() } };
}
function result(leg, changes = {}) {
  return { fixtureId: leg.fixtureId, family: leg.family, selection: leg.selection, forecast: leg.forecast,
    status: 'live', completed: false, regulationVerified: false, regulationHome: null, regulationAway: null,
    progress: { score: { home: 1, away: 0 }, liveClock: { phase: 'first-half', minute: 30 } }, ...changes };
}

test('live sidecars retain original forecast identities and never settle a pick early', () => {
  const leg = selection(), original = structuredClone(leg);
  const states = slipMatchStatesFromResults([leg], [result(leg)]);
  assert.equal(states.length, 1); assert.equal(slipMatchStateForSelection(leg, states), states[0]);
  assert.deepEqual(states[0].score, { home: 1, away: 0 }); assert.equal(states[0].liveClock.minute, 30);
  assert.equal(states[0].outcome, 'pending'); assert.deepEqual(leg, original);
  for (const change of [{ family: 'total-goals' }, { selection: 'away-win' }, { fixtureId: 'foreign' },
    { forecast: undefined }, { forecast: { ...leg.forecast, cycleId: 'replacement' } },
    { forecast: { ...leg.forecast, revisionId: 'replacement' } }, { forecast: { ...leg.forecast, publishedAt: leg.forecast.publishedAt + 1 } }]) {
    assert.equal(slipMatchStateForSelection(leg, [{ ...states[0], ...change }]), undefined);
  }
  assert.equal(slipMatchStateForSelection({ ...leg, forecast: undefined }, states), undefined);
});

test('final sidecars require verified regulation evidence and grade the original choice', () => {
  const leg = selection(), final = result(leg, { status: 'finished-extra-time', completed: true,
    regulationVerified: true, regulationHome: 2, regulationAway: 1,
    progress: { score: { home: 4, away: 1 }, liveClock: { phase: 'extra-time', minute: 120 } } });
  const state = slipMatchStatesFromResults([leg], [final])[0];
  assert.deepEqual(state.score, { home: 2, away: 1 }, 'extra-time/live totals cannot replace the approved regulation score');
  assert.equal(state.liveClock, null); assert.equal(state.outcome, 'correct');
  const unverified = slipMatchStatesFromResults([leg], [{ ...final, regulationVerified: false }])[0];
  assert.equal(unverified.score, null); assert.equal(unverified.outcome, 'pending');
  const invalid = slipMatchStatesFromResults([leg], [{ ...final, regulationHome: -1 }])[0];
  assert.equal(invalid.score, null); assert.equal(invalid.outcome, 'pending');
  const voided = slipMatchStatesFromResults([leg], [result(leg, { status: 'unknown', completed: true,
    cycleEligibility: { eligible: false, reason: 'postponed-cycle' }, progress: undefined })])[0];
  assert.equal(voided.outcome, 'void'); assert.equal(voided.score, null);
});

test('scheduled builder sidecars require the same stored scheduled fixture and original forecast', () => {
  const leg = selection(), slip = { id: 'test', selections: [leg], totalOdds: '2.00', averageProbability: .7, oddsBasis: 'bookmaker' };
  const record = { fixtureId: leg.fixtureId, status: 'scheduled', kickoffAt: leg.kickoffAt,
    homeTeam: leg.homeTeam, awayTeam: leg.awayTeam, cycleId: leg.forecast.cycleId,
    forecast: { revisionId: leg.forecast.revisionId, publishedAt: leg.forecast.publishedAt } };
  const states = scheduledSlipMatchStates([slip, slip], [record]);
  assert.equal(states.length, 1); assert.equal(states[0].status, 'scheduled'); assert.equal(states[0].outcome, 'pending');
  for (const change of [{ status: 'live' }, { kickoffAt: leg.kickoffAt + 1 }, { homeTeam: { id: 'other' } },
    { cycleId: 'replacement' }, { forecast: { ...record.forecast, revisionId: 'replacement' } }]) {
    assert.deepEqual(scheduledSlipMatchStates([slip], [{ ...record, ...change }]), []);
  }
});

test('Best slips gates every sidecar with its released slip and strips foreign fixture data', () => {
  const leg = selection(), slip = { id: 'private', selections: [leg], totalOdds: '2.00', averageProbability: .7,
    oddsBasis: 'bookmaker', estimatedProbability: .7 };
  const state = slipMatchStatesFromResults([leg], [result(leg)])[0], foreign = { ...state, fixtureId: 'unrelated-private-fixture' };
  const views = bestSlipViews([slip], true, [state, foreign]);
  assert.deepEqual(views[0].matchStates, [state]);
  assert.equal('matchStates' in bestSlipViews([slip], false, [state])[0], false);
  const input = { day: '2026-10-09', state: 'generated', slips: [{ ...views[0], matchStates: [state, foreign] }], searchLimited: false, partialCoverage: false };
  const full = gateBestSlips(input, { tier: 'full', signedIn: true, mode: 'off' });
  assert.deepEqual(full.slips[0].matchStates, [state]);
  const free = gateBestSlips(input, { tier: 'free', signedIn: false, mode: 'off' });
  assert.equal('matchStates' in free.slips[0], false); assert.equal('slip' in free.slips[0], false);
  assert.doesNotMatch(JSON.stringify(free), /fixtureId|forecast|home-win|liveClock|unrelated-private/);
  const aggregate = gateBestSlips({ ...input, slips: [{ ...views[0], slip: undefined }] }, { tier: 'full', signedIn: true, mode: 'off' });
  assert.equal('matchStates' in aggregate.slips[0], false);
});
