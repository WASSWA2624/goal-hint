import assert from 'node:assert/strict';
import test from 'node:test';
import { reconstructCutoff, revisionEligibleForLock } from '../src/server/predictions/cutoff-eligibility.ts';
import { CutoffLockingError } from '../src/server/predictions/cutoff-contract.ts';
import { cutoffEnvelope, parseCutoffPolicy } from '../src/server/predictions/cutoff-input.ts';
import { createCutoffJob } from '../src/server/predictions/cutoff-service.ts';
import { cutoffPolicy } from './helpers/cutoff-fixtures.mjs';

const start = Date.parse('2026-10-09T08:00:00Z'), deadline = start + 3_600_000;
const cycle = { id: '10000000-0000-4000-8000-000000000001', fixtureId: '10000000-0000-4000-8000-000000000002',
  scheduleVersion: 1, kickoffAt: deadline + 300_000, cutoffAt: deadline };
const schedule = (version = 1, cutoffAt = deadline, observedAt = start, actualStartedAt = null) =>
  ({ version, kickoffAt: cutoffAt + 300_000, cutoffAt, observedAt, actualStartedAt });
const revision = (publishedAt, scheduleVersion = 1, kickoffAt = cycle.kickoffAt) => ({ fixtureId: cycle.fixtureId,
  cycleId: cycle.id, scheduleVersion, publishedAt, candidate: { context: { context: { kickoffAt } } } });

test('cutoff bounds and durable job limits require an explicit policy', () => {
  assert.throws(() => parseCutoffPolicy(null), (error) => error.reason === 'policy-required');
  assert.throws(() => parseCutoffPolicy({ version: 1 }), CutoffLockingError);
  assert.deepEqual(parseCutoffPolicy(cutoffPolicy()), cutoffPolicy());
});
test('closure is due exactly at cutoff and publication must be strictly earlier', () => {
  assert.equal(reconstructCutoff(cycle, [schedule()], deadline - 1, null).due, false);
  for (const now of [deadline, deadline + 1, deadline + 86_400_000]) {
    assert.equal(reconstructCutoff(cycle, [schedule()], now, null).effectiveCloseAt, deadline);
    assert.equal(revisionEligibleForLock(revision(deadline - 1), cycle, [schedule()], deadline), true);
    assert.equal(revisionEligibleForLock(revision(deadline), cycle, [schedule()], deadline), false);
  }
});
test('actual-start and earlier-play evidence constrain every stored revision without outcomes', () => {
  const early = deadline - 60_000;
  assert.equal(reconstructCutoff({ ...cycle, scheduleVersion: 2 }, [schedule(), schedule(2, deadline, deadline, early)], deadline, null).effectiveCloseAt, early);
  assert.equal(reconstructCutoff(cycle, [schedule()], early, early).reason, 'early-play');
  assert.equal(revisionEligibleForLock(revision(early), cycle, [schedule()], early), false);
  assert.equal(revisionEligibleForLock(revision(early - 1), cycle, [schedule()], early), true);
});
test('a later correction cannot undo a deadline already reached while its schedule was in force', () => {
  const changed = { ...cycle, scheduleVersion: 2, kickoffAt: cycle.kickoffAt + 3_600_000, cutoffAt: deadline + 3_600_000 };
  const late = [schedule(), schedule(2, changed.cutoffAt, deadline + 1)];
  assert.equal(reconstructCutoff(changed, late, changed.cutoffAt, null).effectiveCloseAt, deadline);
  assert.equal(reconstructCutoff(changed, late, changed.cutoffAt, null).reason, 'schedule-history-cutoff');
  const timely = [schedule(), schedule(2, changed.cutoffAt, deadline - 1)];
  assert.equal(reconstructCutoff(changed, timely, changed.cutoffAt, null).effectiveCloseAt, changed.cutoffAt);
  assert.equal(revisionEligibleForLock(revision(deadline - 2), changed, timely, changed.cutoffAt), true);
  assert.equal(revisionEligibleForLock(revision(deadline - 1), changed, timely, changed.cutoffAt), true);
  assert.equal(revisionEligibleForLock(revision(deadline), changed, timely, changed.cutoffAt), false);
  const replaced = [schedule(), schedule(2, changed.cutoffAt, start + 100)];
  assert.equal(revisionEligibleForLock(revision(start + 101), changed, replaced, changed.cutoffAt), false);
});
test('earlier schedule corrections skip an ineligible newest revision and preserve an eligible earlier revision', () => {
  const changed = { ...cycle, scheduleVersion: 2, kickoffAt: cycle.kickoffAt - 60_000, cutoffAt: deadline - 60_000 };
  const rows = [schedule(), schedule(2, changed.cutoffAt, deadline + 10_000)];
  const at = reconstructCutoff(changed, rows, deadline + 20_000, null).effectiveCloseAt;
  assert.equal(revisionEligibleForLock(revision(deadline - 30_000), changed, rows, at), false);
  assert.equal(revisionEligibleForLock(revision(deadline - 120_000), changed, rows, at), true);
  assert.equal(revisionEligibleForLock(revision(start - 1), changed, rows, at), false);
});
test('missing, future or contradictory schedule evidence fails closed', () => {
  for (const rows of [[], [schedule(2)], [schedule(1, deadline + 1)], [schedule(1, deadline, deadline + 1)]])
    assert.throws(() => reconstructCutoff(cycle, rows, deadline, null), CutoffLockingError);
});
test('close envelopes are stable per accepted schedule and remain claimable after downtime', () => {
  const first = cutoffEnvelope(cycle, cutoffPolicy()), second = cutoffEnvelope(cycle, cutoffPolicy());
  assert.deepEqual(first, second); assert.equal(first.notBefore, cycle.cutoffAt); assert.equal(first.refresh, null);
  assert.ok(first.expiresAt > deadline + 365 * 86_400_000);
  assert.notEqual(cutoffEnvelope({ ...cycle, scheduleVersion: 2 }, cutoffPolicy()).idempotencyKey, first.idempotencyKey);
});
test('superseded close jobs schedule the accepted cutoff instead of closing early', async () => {
  let scheduled = 0;
  const job = createCutoffJob({ close: async () => { throw new CutoffLockingError('not-due'); },
    scheduleCycle: async () => { scheduled++; return { id: 'replacement-job' }; } });
  const payload = { fixtureId: cycle.fixtureId, cycleId: cycle.id, scheduleVersion: 1, recoveryKey: null, recoveryProof: null };
  assert.deepEqual(await job.handle(payload, { signal: new AbortController().signal, lease: { jobId: 'original-job' } }), { status: 'succeeded' });
  assert.equal(scheduled, 1);
  assert.deepEqual(await job.handle(payload, { signal: new AbortController().signal, lease: { jobId: 'replacement-job' } }),
    { status: 'failed', reason: 'handler-failed', retryable: true });
});
