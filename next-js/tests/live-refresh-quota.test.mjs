import assert from 'node:assert/strict';
import test from 'node:test';
import { canRunLiveRefresh, remainingLiveRefreshRequests } from '../src/server/live/live-refresh-quota.ts';

const jobId = 'a'.repeat(64);
function fixture({ publication = null, outcome = null, intent = null, started = [] } = {}) {
  const calls = [], phases = new Set(started);
  return { calls, store: {
    async publication(id) { assert.equal(id, jobId); calls.push('publication'); return publication; },
    async outcome(id) { assert.equal(id, jobId); calls.push('outcome'); return outcome; },
    async intent(id) { assert.equal(id, jobId); calls.push('intent'); return intent; },
    async stage(id, phase, kind) {
      assert.equal(id, jobId); assert.equal(kind, 'started'); calls.push(phase);
      return phases.has(phase) ? { jobId, phase, kind, value: null } : null;
    },
  } };
}
const saved = { plan: { fallback: { bounds: { maxRequests: 1 } }, observation: { bounds: { maxRequests: 1 } } } };

test('new jobs reserve structured evidence, fallback and status with AI enabled or disabled', async () => {
  for (const primaryEnabled of [true, false]) {
    const h = fixture(), expected = 8;
    assert.equal(await remainingLiveRefreshRequests(h.store, jobId), expected);
    for (const remaining of [100 + expected - 1, 100 + expected]) {
      assert.equal(await canRunLiveRefresh({ store: h.store, jobId, primaryEnabled, floor: 100,
        remaining: async () => remaining }), remaining === 100 + expected);
    }
  }
});

test('committed publication and terminal outcomes recover without reading quota or pending stages', async () => {
  for (const recovered of [{ publication: { refresh: { outcome: 'published' } } }, { outcome: { outcome: 'skipped' } }]) {
    const h = fixture(recovered);
    assert.equal(await canRunLiveRefresh({ store: h.store, jobId, primaryEnabled: true, floor: 100,
      async remaining() { throw new Error('Recovery must not need quota.'); } }), true);
    assert.deepEqual(h.calls.sort(), ['outcome', 'publication']);
  }
});

test('saved intents and interrupted preparation never reserve history requests again', async () => {
  for (const options of [{ intent: saved }, { started: ['preparation'] }]) {
    const h = fixture(options);
    assert.equal(await remainingLiveRefreshRequests(h.store, jobId, true), 2);
    assert.equal(await canRunLiveRefresh({ store: h.store, jobId, primaryEnabled: true, floor: 100,
      remaining: async () => 102 }), true);
    if (options.intent) assert.ok(!h.calls.includes('preparation'));
  }
});

test('started fallback and observation phases cannot reserve or dispatch a second provider request', async () => {
  for (const started of [['fallback'], ['observation'], ['fallback', 'observation']]) {
    const h = fixture({ intent: saved, started });
    const requests = 2 - started.length;
    assert.equal(await remainingLiveRefreshRequests(h.store, jobId, true), requests);
    assert.equal(await canRunLiveRefresh({ store: h.store, jobId, primaryEnabled: true, floor: 100,
      async remaining() { assert.ok(requests > 0); return 100 + requests; } }), true);
  }
});

test('a frozen fallback-disabled plan reserves only the remaining observation request', async () => {
  const h = fixture({ intent: { plan: { ...saved.plan, fallback: { bounds: null } } } });
  assert.equal(await remainingLiveRefreshRequests(h.store, jobId, true), 1);
});
