import assert from 'node:assert/strict';
import test from 'node:test';
import { slipOutcome } from '../src/domain/slip-outcome.ts';
import { slipHeaderOutcome } from '../src/components/slips/slip-header-outcome.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

const { slip: original } = slipForecastFixture({ fixtureId: '10000000-0000-4000-8000-000000000001' });
const slip = { ...original, selections: [1, 2, 3].map((number) => ({
  ...original.selections[0], fixtureId: `10000000-0000-4000-8000-00000000000${number}`,
})) };
const result = (position, outcome, score = null) => ({
  fixtureId: slip.selections[position].fixtureId, home: score?.home ?? null, away: score?.away ?? null, outcome,
});
const headerOutcome = (results) => slipOutcome(slip.selections.map((selection) =>
  results?.find((candidate) => candidate.fixtureId === selection.fixtureId) ?? null));

test('a nonempty slip without matching results remains pending', () => {
  for (const results of [undefined, [], [{ fixtureId: 'another-fixture', home: 2, away: 0, outcome: 'correct' }]]) {
    assert.equal(headerOutcome(results), 'pending');
  }
});

test('missing or explicitly pending selections prevent an unverified win', () => {
  assert.equal(headerOutcome([result(0, 'correct'), result(2, 'correct')]), 'pending');
  assert.equal(headerOutcome([result(0, 'correct'), result(1, 'pending'), result(2, 'correct')]), 'pending');
  assert.equal(headerOutcome([result(0, 'void'), result(1, 'correct')]), 'pending');
});

test('one verified loss establishes the aggregate loss before other selections complete', () => {
  assert.equal(headerOutcome([result(1, 'incorrect')]), 'lost');
  assert.equal(headerOutcome([result(2, 'void'), result(1, 'incorrect'), result(0, 'pending')]), 'lost');
});

test('correct results combined with a void selection remain void rather than won', () => {
  assert.equal(headerOutcome([result(2, 'correct'), result(0, 'correct'), result(1, 'void')]), 'void');
});

test('all original selections must be correct before the header reports won', () => {
  assert.equal(headerOutcome([result(2, 'correct'), result(0, 'correct'), result(1, 'correct')]), 'won');
});

test('a pending adjudication cannot be settled from a displayed score alone', () => {
  assert.equal(headerOutcome([result(0, 'correct'), result(1, 'correct'),
    result(2, 'pending', { home: 3, away: 0 })]), 'pending');
});

test('shared headers use matching original-cycle observations before saved result presentation', () => {
  const states = slip.selections.map((selection) => ({ fixtureId: selection.fixtureId, family: selection.family,
    selection: selection.selection, status: 'finished-regulation', score: { home: 1, away: 0 }, liveClock: null, outcome: 'correct' }));
  const saved = [result(0, 'correct'), result(1, 'correct'), result(2, 'correct')];
  assert.equal(slipHeaderOutcome(slip, saved, states), 'won');
  assert.equal(slipHeaderOutcome(slip, saved, [{ ...states[0], outcome: 'incorrect' }]), 'lost');
  assert.equal(slipHeaderOutcome(slip, saved, [{ ...states[0], outcome: 'pending' }]), 'pending');
  assert.equal(slipHeaderOutcome(slip, saved, [{ ...states[0], selection: 'away-win', outcome: 'incorrect' }]), 'won');
});

test('shared headers preserve approved aggregate fallbacks without guessing a result from missing states', () => {
  for (const outcome of ['won', 'lost', 'pending', 'void']) {
    assert.equal(slipHeaderOutcome(slip, undefined, undefined, outcome), outcome);
    assert.equal(slipHeaderOutcome(slip, undefined, [], outcome), outcome);
  }
  assert.equal(slipHeaderOutcome(slip), 'pending');
  assert.equal(slipHeaderOutcome(slip, [], undefined, 'won'), 'pending');
  assert.equal(slipHeaderOutcome(slip, [result(0, 'correct'), result(1, 'void'), result(2, 'correct')]), 'void');
});
