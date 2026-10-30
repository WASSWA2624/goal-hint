import assert from 'node:assert/strict';
import test from 'node:test';
import { savedSlipOutcome, savedSlipStatus, savedSlipView } from '../src/domain/saved-slips.ts';
import { slipStatus, slipStatusCategory } from '../src/domain/slip-status.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

const original = slipForecastFixture().slip;
const slip = { ...original, selections: [1, 2].map((number) => ({ ...original.selections[0],
  fixtureId: `10000000-0000-4000-8000-00000000000${number}`,
  forecast: { cycleId: `20000000-0000-4000-8000-00000000000${number}`,
    revisionId: `30000000-0000-4000-8000-00000000000${number}`, publishedAt: 1000 },
})) };
const state = (index, status, outcome = 'pending') => ({ ...slip.selections[index], status, outcome, score: null, liveClock: null });
const result = (index, status, overrides = {}) => ({ ...slip.selections[index], status, completed: true,
  regulationVerified: true, regulationHome: 2, regulationAway: 0, ...overrides });
const withoutForecast = (value) => { const record = { ...value }; delete record.forecast; return record; };

test('progress uses recorded original states rather than kickoff time or displayed scores', () => {
  const pastKickoffs = { ...slip, selections: slip.selections.map((selection) => ({ ...selection, kickoffAt: 1 })) };
  assert.equal(slipStatus(pastKickoffs, [state(0, 'scheduled'), state(1, 'scheduled')]), 'not-started');
  assert.equal(slipStatus(slip, [state(0, 'live'), state(1, 'scheduled')]), 'in-progress');
  assert.equal(slipStatus(slip, [state(0, 'finished-regulation', 'correct'), state(1, 'scheduled')]), 'in-progress');
  assert.equal(slipStatus(slip, [{ ...state(0, 'scheduled'), score: { home: 5, away: 0 } }, state(1, 'scheduled')]), 'not-started');
  assert.equal(slipStatus(slip, [state(0, 'scheduled')]), 'pending');
  assert.equal(slipStatus(slip, [state(0, 'unknown'), state(1, 'scheduled')]), 'pending');
  assert.equal(slipStatus(slip), 'pending');
});

test('replacement cycles and wrong selections cannot establish progress for original slips', () => {
  const wrongCycle = { ...state(0, 'live'), forecast: { ...slip.selections[0].forecast, cycleId: '40000000-0000-4000-8000-000000000001' } };
  const wrongPick = { ...state(0, 'live'), selection: 'away-win' };
  for (const other of [wrongCycle, wrongPick]) assert.equal(slipStatus(slip, [other, state(1, 'scheduled')]), 'pending');
  assert.equal(slipStatus(slip, [wrongCycle, state(0, 'scheduled'), state(1, 'scheduled')]), 'not-started');
});

test('all cancelled original selections are distinguished from mixed void outcomes without changing settlement', () => {
  for (const selections of [[slip.selections[0]], slip.selections]) {
    const current = { ...slip, selections };
    const states = selections.map((_, index) => state(index, 'canceled', 'void'));
    assert.equal(slipStatus(current, states, 'void'), 'cancelled');
    const raw = selections.map((_, index) => result(index, 'canceled'));
    assert.equal(savedSlipOutcome(current, raw), 'void');
    assert.equal(savedSlipStatus(current, raw), 'cancelled');
    assert.equal(savedSlipView('public-save', '2026-10-29T09:00:00Z', current, raw).status, 'cancelled');
  }
  assert.equal(slipStatus(slip, [state(0, 'canceled', 'void'), state(1, 'finished-regulation', 'correct')], 'void'), 'void');
  assert.equal(slipStatus(slip, [state(0, 'abandoned', 'void'), state(1, 'canceled', 'void')], 'void'), 'void');
  assert.equal(slipStatus(slip, [state(0, 'canceled', 'void'), state(1, 'scheduled')]), 'not-started');
  assert.equal(slipStatus(slip, [state(0, 'canceled'), state(1, 'canceled')]), 'pending');
});

test('settled wins and early losses retain their adjudicated outcome while cancellation requires exact original evidence', () => {
  assert.equal(slipStatus(slip, [state(0, 'live'), state(1, 'scheduled')], 'lost'), 'lost');
  assert.equal(slipStatus(slip, [], 'won'), 'won');
  assert.equal(slipStatus(slip, [], 'void'), 'void');
  assert.equal(slipStatus(slip, [], 'void', 'cancelled'), 'cancelled');
  assert.equal(savedSlipStatus(slip, [result(0, 'canceled'), result(1, 'canceled', { forecast: { ...slip.selections[1].forecast, publishedAt: 2000 } })]), 'pending');
  assert.equal(savedSlipStatus(slip, [result(0, 'live', { completed: false }), result(1, 'scheduled', { completed: false })]), 'in-progress');
  assert.equal(savedSlipStatus(slip, [result(0, 'scheduled', { completed: false }), result(1, 'scheduled', { completed: false })]), 'not-started');
});

test('legacy saved cancellation status uses recorded terminal fixtures and pending groups every unsettled progress state', () => {
  const legacy = { ...slip, selections: slip.selections.map(withoutForecast) };
  const raw = [result(0, 'canceled'), result(1, 'canceled')].map(withoutForecast);
  assert.equal(savedSlipStatus(legacy, raw), 'cancelled');
  assert.equal(savedSlipOutcome(legacy, raw), 'void');
  for (const status of ['not-started', 'in-progress', 'pending']) assert.equal(slipStatusCategory(status), 'pending');
  for (const status of ['won', 'lost', 'void', 'cancelled']) assert.equal(slipStatusCategory(status), status);
});
