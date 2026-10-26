import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRecovery, recoveryPlan, recoveryPolicySchema, recoveryAction, RecoveryError } from '../src/server/recovery/recovery-input.ts';
import { createRecoveryWatchdog } from '../src/server/recovery/recovery-service.ts';
import { runRecoveryCommand } from '../src/server/recovery/recovery-command.ts';
import { recoveryPolicy, recoveryAuthority, approvedPlan } from './helpers/recovery-fixtures.mjs';
import { createResultSyncService } from '../src/server/results/result-sync-service.ts';
import { resultPolicy, resultAuthority } from './helpers/result-sync-fixtures.mjs';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';

test('recovery requires explicit bounded thresholds, approved policy and strict reviewed identifiers', () => {
  for (const changes of [{ runGraceMs: undefined }, { maxItems: 51 }, { lookbackDays: 8 }, { stalledJobMs: 0 },
    { planTtlMs: Infinity }, { job: { ...recoveryPolicy().job, maxAttempts: 17 } }, { surprise: true }])
    assert.throws(() => parseRecovery(recoveryPolicySchema, recoveryPolicy(changes)), RecoveryError);
  for (const action of [{ kind: 'mapping', name: 'Same team' }, { kind: 'job', jobId: 'x', expectedVersion: 0 },
    { kind: 'cutoff', fixtureId: 'x', cycleId: 'y', force: true }]) assert.throws(() => parseRecovery(recoveryAction, action), RecoveryError);
  const plan = approvedPlan({ now: () => Date.now() }, recoveryPolicy(), [{ kind: 'results', accountId: 'a'.repeat(64) }]);
  for (const changes of [{ actor: 'Bearer private token' }, { reason: 'https://user:password@example.test' }, { reason: 'https://example.test/path' },
    { approvalRef: 'multi\nline' }, { secret: 'private' }]) assert.throws(() => parseRecovery(recoveryPlan, { ...plan, ...changes }), RecoveryError);
});
test('unauthorized inspection and mutation fail before database access; actor text is not credentials', async () => {
  const database = { transaction() { throw new Error('must not touch database'); } };
  for (const authority of [recoveryAuthority({ authorize: () => false }), recoveryAuthority({ verifyPolicy: () => false }),
    recoveryAuthority({ authorize: () => { throw new Error('private-secret'); } })]) {
    const watchdog = createRecoveryWatchdog({ database, queue: {}, policy: recoveryPolicy(), authority, services: {} });
    await assert.rejects(watchdog.inspect('runs'), (error) => error instanceof RecoveryError && error.reason === 'unauthorized' && !error.message.includes('private-secret'));
    await assert.rejects(watchdog.enqueue(approvedPlan({ now: () => Date.now() }, recoveryPolicy(), [{ kind: 'results', accountId: 'a'.repeat(64) }])), RecoveryError);
  }
});
test('private commands reject unsupported operations and arbitrary extra flags before importing operator code', async () => {
  for (const args of [[], ['apply'], ['force','--binding','example.ts','--input','plan.json'],
    ['apply','--binding','example.json','--input','plan.json'], ['worker','--binding','example.ts','--force']])
    await assert.rejects(runRecoveryCommand(args, new AbortController().signal), RecoveryError);
});
test('stored result backlog is bounded per invocation and resumes before new provider dispatch', async () => {
  const policy = resultPolicy({ maxBatchesPerTick: 2 }), accountId = 'a'.repeat(64), now = Date.now();
  const batches = Array.from({ length: 5 }, (_, index) => ({ id: String(index), policyHash: evidenceFingerprint(policy) }));
  const applied = []; let freshReads = 0;
  const lease = { accountId, ownerId: 'b'.repeat(64), fence: 1n, until: now + 30_000, nextLiveAt: now + 60_000,
    nextDateAt: now + 60_000, liveFailures: 0, dateFailures: 0 };
  const poller = createResultSyncService({ accountId, policy, authority: resultAuthority(), clock: { now: () => now },
    adapter: {}, store: { acquire: async () => lease, renew: async () => lease, release: async () => {},
      pending: async () => batches, apply: async (_lease, batch) => { assert.equal(batch, batches[0]); applied.push(batches.shift()); },
      tracked: async () => { freshReads++; return []; } } });
  try {
    await poller.runOnce(); assert.equal(applied.length, 2); assert.equal(freshReads, 0);
    await poller.runOnce(); assert.equal(applied.length, 4); assert.equal(freshReads, 0);
    await poller.runOnce(); assert.equal(applied.length, 5); assert.equal(freshReads, 1);
  } finally { await poller.stop(); }
});
