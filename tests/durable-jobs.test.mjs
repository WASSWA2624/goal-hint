import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { JobQueueError } from '../src/server/jobs/job-contract.ts';
import { durableJobId, parseJobEnvelope, retryDelay } from '../src/server/jobs/job-input.ts';
import { createJobRegistry, defineJob } from '../src/server/jobs/job-registry.ts';
import { createBearerJobIdentity, createJobTrigger } from '../src/server/jobs/job-trigger.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { jobEnvelope, jobTestHash, jobTestRegistry } from './helpers/job-fixtures.mjs';

test('typed registry rejects unknown versions, invalid payloads, transforms, secrets and unbounded execution contracts', () => {
  const registry = jobTestRegistry(), envelope = jobEnvelope();
  assert.deepEqual(registry.validate(envelope), envelope);
  assert.ok(Object.isFrozen(registry.validate(envelope).payload));
  for (const overrides of [{ payload: { value: 0 } }, { payload: { value: 1, token: 'private' } }, { handlerVersion: 2 },
    { type: 'unknown' }, { maxAttempts: 17 }, { timeoutMs: Infinity }, { timeoutMs: 100, fallbackReserveMs: 100 },
    { leaseMs: 0 }, { expiresAt: envelope.notBefore }, { refresh: { runId: 'bad' } }, { extra: true },
    { payload: { value: BigInt(1) } }, { payload: 'x'.repeat(70_000) }]) assert.throws(() => registry.validate({ ...envelope, ...overrides }), JobQueueError);
  const transformed = defineJob({ type: 'test.noop', handlerVersion: 1, payload: z.number().transform((v) => v + 1), handle: async () => ({ status: 'succeeded' }) });
  assert.throws(() => createJobRegistry([transformed]).validate({ ...envelope, payload: 1 }), JobQueueError);
  assert.throws(() => createJobRegistry([transformed, transformed]), JobQueueError);
});
test('job identity ignores delivery attempts while distinguishing the durable request key and handler version', () => {
  const envelope = jobEnvelope();
  assert.equal(durableJobId(envelope), durableJobId({ ...envelope, payload: { value: 9 }, notBefore: envelope.notBefore + 1 }));
  assert.notEqual(durableJobId(envelope), durableJobId({ ...envelope, handlerVersion: 2 }));
  assert.notEqual(durableJobId(envelope), durableJobId({ ...envelope, idempotencyKey: jobTestHash('other') }));
  assert.throws(() => parseJobEnvelope({ ...envelope, payload: undefined }), JobQueueError);
});
test('exponential equal jitter is deterministic under a sample, capped and never zero', () => {
  const envelope = jobEnvelope();
  assert.equal(retryDelay(envelope, 1, 0), 50); assert.equal(retryDelay(envelope, 2, 0.5), 150);
  assert.equal(retryDelay(envelope, 16, 0), 500); assert.ok(retryDelay(envelope, 16, 0.999) < 1000);
  for (const sample of [-1, 1, NaN]) assert.throws(() => retryDelay(envelope, 1, sample), JobQueueError);
});
test('private trigger authenticates before reading, never executes handlers and returns only durable acknowledgement', async () => {
  let enqueues = 0, handlers = 0, secret = 's'.repeat(48);
  const registry = jobTestRegistry(async () => { handlers++; return { status: 'succeeded' }; });
  const queue = { async enqueue(envelope) { enqueues++; return { id: durableJobId(envelope), state: 'pending' }; } };
  const trigger = createJobTrigger({ queue, registry, identity: createBearerJobIdentity(() => secret) });
  const request = (authorization, data = jobEnvelope()) => new Request('https://internal.example/jobs', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(data) });
  assert.equal((await trigger(request(null))).status, 401);
  assert.equal((await trigger(request(`Bearer ${'x'.repeat(48)}`))).status, 401); assert.equal(enqueues, 0);
  const accepted = await trigger(request(`Bearer ${secret}`)); assert.equal(accepted.status, 202);
  assert.deepEqual(Object.keys(await accepted.json()).sort(), ['jobId','state']); assert.equal(enqueues, 1); assert.equal(handlers, 0);
  assert.equal((await trigger(request(`Bearer ${secret}`, { ...jobEnvelope(), payload: { value: 0 } }))).status, 400);
  assert.equal((await trigger(request(`Bearer ${secret}`, { ...jobEnvelope(), payload: 'x'.repeat(70_000) }))).status, 400);
  const old = secret; secret = 'r'.repeat(48); assert.equal((await trigger(request(`Bearer ${old}`))).status, 401);
  assert.equal((await createJobTrigger({ queue, registry, identity: { authorize() { throw new Error('credential'); } } })(request(null))).status, 401);
});
test('worker does not claim after shutdown or when its registry is unconfigured', async () => {
  let claims = 0; const queue = { async claim() { claims++; return null; } };
  const signal = AbortSignal.abort();
  await createJobWorker({ queue, registry: jobTestRegistry(), ownerId: jobTestHash('worker') }).run(signal);
  assert.equal(await createJobWorker({ queue, registry: createJobRegistry([]), ownerId: jobTestHash('empty') }).runOnce(), false);
  assert.equal(claims, 0);
});
