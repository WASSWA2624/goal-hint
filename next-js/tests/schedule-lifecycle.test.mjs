import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLifecycleInput, parseLifecyclePolicy } from '../src/server/predictions/lifecycle-input.ts';
import { lifecycleDecision, lifecycleContentHash } from '../src/server/predictions/lifecycle-policy.ts';
import { lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';

const at = Date.parse('2026-10-09T08:00:00Z');
const state = { fixture: { id: '10000000-0000-4000-8000-000000000001', externalId: 101 }, cycle: { kickoffAt: at + 3_600_000 } };
const policy = parseLifecyclePolicy(lifecyclePolicy());
const observation = (options = {}) => parseLifecycleInput(lifecycleInput(state, at, options));
const previous = (value, extra = {}) => ({ retrievedAt: value.retrievedAt, providerUpdatedAt: value.providerUpdatedAt,
  contentHash: lifecycleContentHash(value), status: value.status, hasPlayed: false, ...extra });

test('ordinary delay and formal postponement remain distinct normalized evidence', () => {
  const scheduled = observation(), delay = observation({ kickoffAt: at + 7_200_000 }), postponed = observation({ status: 'PST' });
  assert.equal(delay.status, 'scheduled'); assert.equal(postponed.status, 'postponed');
  assert.equal(lifecycleDecision({ ...delay, retrievedAt: at + 1 }, policy, previous(scheduled)).outcome, 'accepted');
  assert.equal(lifecycleDecision({ ...postponed, retrievedAt: at + 1 }, policy, previous(scheduled)).outcome, 'accepted');
});
test('duplicate content, old observations and equal-time conflicts have deterministic decisions', () => {
  const value = observation(), baseline = previous(value);
  assert.equal(lifecycleDecision({ ...value, retrievedAt: at + 1 }, policy, baseline).outcome, 'unchanged');
  assert.equal(lifecycleDecision({ ...value, retrievedAt: at - 1 }, policy, baseline).outcome, 'stale');
  assert.equal(lifecycleDecision(observation({ kickoffAt: at + 1 }), policy, baseline).reason, 'same-time-conflicting-evidence');
  assert.equal(lifecycleDecision({ ...value, providerUpdatedAt: at - 10 }, policy,
    { ...baseline, providerUpdatedAt: at - 1 }).outcome, 'stale');
});
test('unresolved provider mappings, absent kickoffs and unknown updates are explicit', () => {
  const baseline = previous(observation(), { retrievedAt: at - 1, contentHash: null });
  assert.equal(lifecycleDecision(observation({ status: 'MYSTERY' }), policy, baseline).reason, 'unresolved-status-mapping');
  assert.equal(lifecycleDecision(observation({ kickoffAt: null }), policy, baseline).reason, 'unknown-scheduled-kickoff');
  assert.equal(lifecycleDecision(observation(), parseLifecyclePolicy(lifecyclePolicy({ unknownUpdate: 'hold' })), baseline).reason, 'unknown-provider-update');
});
test('play evidence prevents later scheduled/postponed statuses from reopening eligibility', () => {
  const baseline = previous(observation(), { retrievedAt: at - 1, hasPlayed: true });
  for (const status of ['NS', 'PST']) assert.equal(lifecycleDecision(observation({ status }), policy, baseline).reason, 'status-regressed-after-play');
  assert.equal(lifecycleDecision(observation({ status: 'PST', actualStartedAt: at - 1 }), policy,
    { ...baseline, hasPlayed: false }).reason, 'postponement-after-play');
  assert.equal(lifecycleDecision(observation({ status: 'LIVE' }), policy,
    { ...baseline, status: 'finished-regulation' }).reason, 'status-regressed-after-final');
});
test('input requires separate attributable start/update clocks and exact normalized identity', () => {
  for (const options of [{ actualStartedAt: at + 1 }, { providerUpdatedAt: at + 1 }])
    assert.throws(() => observation(options), (error) => error.reason === 'invalid-request');
  assert.throws(() => parseLifecycleInput({ ...lifecycleInput(state, at), evidenceRef: '' }), (error) => error.reason === 'invalid-request');
  assert.throws(() => parseLifecyclePolicy(lifecyclePolicy({ mappings: [policy.mappings[0], policy.mappings[0]] })), (error) => error.reason === 'policy-required');
});
