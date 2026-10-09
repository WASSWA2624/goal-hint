import assert from 'node:assert/strict';
import test from 'node:test';
import { failureDelay, parseResultSyncPolicy, pollingInterval, shouldPollLive } from '../src/server/results/result-sync-policy.ts';
import { ResultSyncError } from '../src/server/results/result-sync-contract.ts';
import { runResultSyncCommand } from '../src/server/results/result-sync-command.ts';
import { resultPolicy } from './helpers/result-sync-fixtures.mjs';

const policy = parseResultSyncPolicy(resultPolicy());
const fixture = { fixtureId: 'synthetic', externalId: 1, kickoffAt: 1_000_000, firstTrackedAt: 0, firstFinalAt: null, status: 'scheduled' };
test('undefined approach, horizons and invalid resource/lease bounds remain explicit configuration blockers', () => {
  for (const changes of [{ approachMs: undefined }, { unresolved: [] }, { corrections: undefined }, { leaseMs: 10_000 },
    { requestWindowMs: 100 }, { failureMaxMs: 100 }, { coverage: [] },
    { unresolved: [{ untilAgeMs: 10, intervalMs: 60000 }, { untilAgeMs: 20, intervalMs: 60000 }] }]) {
    assert.throws(() => parseResultSyncPolicy(resultPolicy(changes)), (error) => error instanceof ResultSyncError && error.reason === 'policy-required');
  }
});
test('live pause/approach boundary and active window use the controlled clock', () => {
  assert.equal(shouldPollLive([fixture], policy, 939_999), false);
  assert.equal(shouldPollLive([fixture], policy, 940_000), true);
  assert.equal(shouldPollLive([{ ...fixture, status: 'finished-regulation', firstFinalAt: 1_000_000 }], policy, 1_000_001), false);
  assert.equal(shouldPollLive([{ ...fixture, status: 'live' }], policy, 1_000_000 + policy.activeWindowMs), false);
});
test('unresolved and corrections slow at exact tier boundaries and stop without deleting records', () => {
  const start = fixture.kickoffAt + policy.activeWindowMs;
  assert.equal(pollingInterval(fixture, policy, start - 1), 60_000);
  assert.equal(pollingInterval(fixture, policy, start), 300_000);
  assert.equal(pollingInterval(fixture, policy, start + 86_400_000), 3_600_000);
  assert.equal(pollingInterval(fixture, policy, start + 30 * 86_400_000), null);
  const final = { ...fixture, firstFinalAt: start };
  assert.equal(pollingInterval(final, policy, start + 86_400_000), 3_600_000);
  assert.equal(pollingInterval(final, policy, start + 7 * 86_400_000), null);
  assert.equal(final.firstFinalAt, start);
});
test('outage backoff grows to its configured ceiling', () => {
  assert.deepEqual([1,2,3,4,5,99].map((n) => failureDelay(policy, n)), [60000,120000,240000,480000,900000,900000]);
});
test('private poller command refuses invalid invocation before importing any binding', async () => {
  for (const args of [[], ['--binding'], ['--binding', 'example.json'], ['--binding', 'example.ts', 'extra']])
    await assert.rejects(runResultSyncCommand(args, new AbortController().signal), (error) => error instanceof ResultSyncError && error.reason === 'invalid-request');
});
