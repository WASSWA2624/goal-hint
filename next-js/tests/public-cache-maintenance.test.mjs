import assert from 'node:assert/strict';
import test from 'node:test';
import { CacheMaintenanceLimitError, reconcilePublicCache } from '../src/server/cache/public-cache-maintenance.ts';

test('default maintenance keeps one bounded transaction', async () => {
  let calls = 0;
  const result = await reconcilePublicCache({ async reconcile(limit) {
    calls++; assert.equal(limit, 100); return { acknowledged: 100, removed: 3 };
  } }, { limit: 100 });
  assert.deepEqual(result, { acknowledged: 100, removed: 3 });
  assert.equal(calls, 1);
});

test('draining continues when only one kind of work remains and aggregates committed batches', async () => {
  const batches = [{ acknowledged: 1000, removed: 0 }, { acknowledged: 0, removed: 2 }, { acknowledged: 0, removed: 0 }];
  let calls = 0;
  const result = await reconcilePublicCache({ async reconcile(limit) {
    assert.equal(limit, 1000); return batches[calls++];
  } }, { limit: 1000, all: true });
  assert.deepEqual(result, { acknowledged: 1000, removed: 2 });
  assert.equal(calls, 3);
});

test('failed transactions stop draining without retries or a success result', async () => {
  let calls = 0;
  const failure = new Error('synthetic database failure');
  await assert.rejects(reconcilePublicCache({ async reconcile() {
    calls++; throw failure;
  } }, { all: true }), (error) => error === failure);
  assert.equal(calls, 1);
});

test('continuous writes have a finite pass limit and report committed counts', async () => {
  let calls = 0;
  await assert.rejects(reconcilePublicCache({ async reconcile() {
    calls++; return { acknowledged: 2, removed: 1 };
  } }, { all: true }), (error) => error instanceof CacheMaintenanceLimitError
    && error.message.includes('1000 passes (2000 acknowledged, 1000 removed)'));
  assert.equal(calls, 1000);
});
