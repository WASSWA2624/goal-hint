import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeBestSlipStudySlate } from '../src/server/slips/best-slip-study-results.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

function leg() {
  const sample = slipForecastFixture();
  const selection = { ...sample.slip.selections[0], forecast: {
    cycleId: sample.cycle.id, revisionId: sample.row.id, publishedAt: sample.row.publishedAt.getTime(),
  } };
  const result = { fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
    forecast: selection.forecast, status: 'finished-regulation', completed: true,
    regulationVerified: true, regulationHome: 1, regulationAway: 0 };
  return { selection, result };
}

test('the study waits for terminal results from every original market and forecast revision', () => {
  const first = leg(), second = leg();
  const slip = { id: 'study-test', selections: [first.selection, second.selection], totalOdds: '4.00',
    oddsBasis: 'bookmaker', averageProbability: 0.7 };
  const loss = { ...first.result, regulationHome: 0, regulationAway: 1 };
  assert.equal(gradeBestSlipStudySlate(slip, [loss]), 'pending');
  assert.equal(gradeBestSlipStudySlate(slip, [loss, { ...second.result, forecast: first.result.forecast }]), 'pending');
  assert.equal(gradeBestSlipStudySlate(slip, [loss, { ...second.result, regulationVerified: false }]), 'pending');
  assert.equal(gradeBestSlipStudySlate(slip, [loss, second.result]), 'lost');
  assert.equal(gradeBestSlipStudySlate(slip, [first.result, second.result]), 'won');
  assert.equal(gradeBestSlipStudySlate(slip, [loss, { ...second.result, status: 'cancelled', fixtureCompleted: true, cycleEligibility: { eligible: false, reason: 'cutoff-invalidated' } }]), 'void');
});
