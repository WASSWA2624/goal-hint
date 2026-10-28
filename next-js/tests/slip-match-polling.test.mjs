import assert from 'node:assert/strict';
import test from 'node:test';
import { readSlipMatchObservations, SlipMatchPollingError, slipMatchPollingRules, startSlipMatchPolling } from '../src/domain/slip-match-polling.ts';
import { slipMatchRefreshRules, slipMatchSelectionKey } from '../src/domain/slip-match-refresh.ts';

const at = Date.parse('2026-10-28T17:00:00Z');
const state = (changes = {}) => ({ fixtureId: '00000000-0000-4000-8000-000000000001', family: 'match-result', selection: 'home-win',
  forecast: { cycleId: '00000000-0000-4000-8000-000000000002', revisionId: '00000000-0000-4000-8000-000000000003', publishedAt: at - 3_600_000 },
  status: 'live', score: { home: 1, away: 0 }, liveClock: { phase: 'first-half', minute: 30 }, outcome: 'pending', ...changes });
const data = (asOf = at, states = [state()]) => ({ asOf, states });
const flush = () => new Promise(setImmediate);

function clock() {
  let time = 0, sequence = 0, listener = null, visible = true, online = true, navigating = false;
  const timers = new Map();
  const lifecycle = async (change) => { change(); listener?.(); await flush(); };
  return {
    timers,
    env: {
      available: () => visible && online && !navigating,
      schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: time + delay }); return id; },
      cancel: (id) => timers.delete(id),
      listen: (callback) => { listener = callback; return () => { listener = null; }; },
    },
    async advance(duration) {
      const target = time + duration;
      for (;;) {
        const next = [...timers.entries()].sort((left, right) => left[1].at - right[1].at)[0];
        if (!next || next[1].at > target) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
      }
      time = target; await flush();
    },
    visible: (value) => lifecycle(() => { visible = value; }),
    online: (value) => lifecycle(() => { online = value; }),
    navigating: (value) => lifecycle(() => { navigating = value; }),
    event: () => lifecycle(() => {}),
  };
}

test('desktop observations refresh immediately and serially every twenty seconds without rebuilding slips', async () => {
  const c = clock(), calls = [], accepted = [];
  const phases = [state({ status: 'scheduled', score: null, liveClock: null }), state(),
    state({ score: { home: 1, away: 1 }, liveClock: { phase: 'half-time', minute: null } }),
    state({ status: 'finished-regulation', score: { home: 1, away: 2 }, liveClock: null, outcome: 'incorrect' })];
  const stop = startSlipMatchPolling({ enabled: true, read: async (signal) => {
    calls.push(signal); return data(at + calls.length, [phases[calls.length - 1]]);
  },
    accept: (value) => accepted.push(value), revoke: () => assert.fail('unexpected revocation') }, c.env);
  await flush(); assert.equal(calls.length, 1); assert.equal(accepted[0].states[0].status, 'scheduled');
  await c.advance(19_999); assert.equal(calls.length, 1);
  await c.advance(1); assert.equal(calls.length, 2); assert.equal(accepted[1].states[0].liveClock.minute, 30);
  await c.advance(20_000); assert.equal(calls.length, 3); assert.equal(accepted[2].states[0].liveClock.phase, 'half-time');
  await c.advance(20_000); assert.equal(calls.length, 4); assert.equal(accepted[3].states[0].status, 'finished-regulation');
  assert.deepEqual(accepted[3].states[0].score, { home: 1, away: 2 }); assert.equal(accepted[3].states[0].outcome, 'incorrect');
  assert.ok(accepted.every((value) => value.states[0].selection === 'home-win'), 'observation updates retain the original pick identity');
  stop(); assert.equal(c.timers.size, 0); await c.advance(60_000); assert.equal(calls.length, 4);
});

test('disabled mobile polling installs no timers, listeners or requests', async () => {
  const c = clock(); let reads = 0;
  const stop = startSlipMatchPolling({ enabled: false, read: async () => { reads++; return data(); }, accept: () => {}, revoke: () => {} }, c.env);
  await c.advance(120_000); await c.visible(false); await c.visible(true);
  assert.equal(reads, 0); assert.equal(c.timers.size, 0); stop();
});

test('hidden, offline and pending navigation cancel active requests and resume immediately', async () => {
  const c = clock(), requests = [], accepted = [];
  const stop = startSlipMatchPolling({ enabled: true, read: (signal) => new Promise((resolve) => requests.push({ signal, resolve })),
    accept: (value) => accepted.push(value), revoke: () => {} }, c.env);
  assert.equal(requests.length, 1);
  await c.visible(false); assert.equal(requests[0].signal.aborted, true); assert.equal(c.timers.size, 0);
  requests[0].resolve(data(at + 100)); await flush(); assert.equal(accepted.length, 0);
  await c.visible(true); assert.equal(requests.length, 2);
  await c.online(false); assert.equal(requests[1].signal.aborted, true);
  await c.online(true); assert.equal(requests.length, 3);
  await c.navigating(true); assert.equal(requests[2].signal.aborted, true); await c.advance(60_000); assert.equal(requests.length, 3);
  await c.navigating(false); assert.equal(requests.length, 4);
  requests[3].resolve(data(at + 1)); await flush(); assert.equal(accepted.length, 1);
  stop(); assert.equal(c.timers.size, 0);
});

test('overlapping lifecycle events never duplicate a current request and stale aborted responses cannot win', async () => {
  const c = clock(), requests = [], accepted = [];
  const stop = startSlipMatchPolling({ enabled: true, read: (signal) => new Promise((resolve) => requests.push({ signal, resolve })),
    accept: (value) => accepted.push(value), revoke: () => {} }, c.env);
  await c.event(); await c.event(); assert.equal(requests.length, 1);
  await c.visible(false); await c.visible(true); assert.equal(requests.length, 2);
  requests[1].resolve(data(at + 10)); await flush(); requests[0].resolve(data(at + 100)); await flush();
  assert.equal(accepted.length, 1); assert.equal(accepted[0].asOf, at + 10);
  stop();
});

test('request deadlines abort even an uncooperative transport and retry without accepting its late result', async () => {
  const c = clock(), requests = [], accepted = [];
  const stop = startSlipMatchPolling({ enabled: true, read: (signal) => new Promise((resolve) => requests.push({ signal, resolve })),
    accept: (value) => accepted.push(value), revoke: () => {} }, c.env);
  await c.advance(slipMatchRefreshRules.requestDeadlineMs); assert.equal(requests[0].signal.aborted, true);
  await c.advance(20_000); assert.equal(requests.length, 2);
  requests[1].resolve(data(at + 2)); await flush(); requests[0].resolve(data(at + 9)); await flush();
  assert.deepEqual(accepted.map((value) => value.asOf), [at + 2]); stop();
});

test('transient errors retain accepted observations and respect bounded retry-after backoff', async () => {
  const c = clock(), accepted = []; let calls = 0;
  const stop = startSlipMatchPolling({ enabled: true, read: async () => {
    calls++;
    if (calls === 2) throw new SlipMatchPollingError(429, 90_000);
    if (calls === 3) throw new SlipMatchPollingError(503, 900_000);
    return data(at + calls);
  }, accept: (value) => accepted.push(value), revoke: () => {} }, c.env);
  await flush(); await c.advance(20_000); assert.equal(calls, 2); assert.equal(accepted.length, 1);
  await c.advance(89_999); assert.equal(calls, 2); await c.advance(1); assert.equal(calls, 3);
  await c.advance(slipMatchPollingRules.maximumRetryMs - 1); assert.equal(calls, 3);
  await c.advance(1); assert.equal(calls, 4); assert.equal(accepted.length, 2);
  await c.advance(20_000); assert.equal(calls, 5); stop();
});

test('authoritative empty states replace old observations while an older response is rejected', async () => {
  const c = clock(), accepted = []; let calls = 0;
  const stop = startSlipMatchPolling({ enabled: true, read: async () => {
    calls++; return calls === 1 ? data(at + 5) : calls === 2 ? data(at + 4) : data(at + 6, []);
  }, accept: (value) => accepted.push(value), revoke: () => {} }, c.env);
  await flush(); await c.advance(20_000); assert.equal(accepted.length, 1);
  await c.advance(20_000); assert.equal(accepted.length, 2); assert.deepEqual(accepted[1].states, []); stop();
});

test('access withdrawal revokes once and stops all further reads, even after lifecycle events', async () => {
  for (const status of [401, 403]) {
    const c = clock(); let calls = 0, revoked = 0, accepted = 0;
    const stop = startSlipMatchPolling({ enabled: true, read: async () => { calls++; throw new SlipMatchPollingError(status); },
      accept: () => { accepted++; }, revoke: () => { revoked++; } }, c.env);
    await flush(); assert.equal(revoked, 1); assert.equal(accepted, 0); assert.equal(c.timers.size, 0);
    await c.visible(false); await c.visible(true); await c.advance(120_000);
    assert.equal(calls, 1); assert.equal(revoked, 1); stop();
  }
});

test('unmount and cohort replacement abort in-flight work before it can publish', async () => {
  const c = clock(), requests = [], accepted = [];
  const options = { enabled: true, read: (signal) => new Promise((resolve) => requests.push({ signal, resolve })),
    accept: (value) => accepted.push(value), revoke: () => {} };
  const first = startSlipMatchPolling(options, c.env); first();
  assert.equal(requests[0].signal.aborted, true);
  const second = startSlipMatchPolling(options, c.env);
  requests[0].resolve(data(at + 100)); await flush(); assert.equal(accepted.length, 0);
  requests[1].resolve(data(at + 1)); await flush(); assert.equal(accepted.length, 1);
  second(); assert.equal(c.timers.size, 0);
});

test('observation transport is one private same-origin POST and excludes foreign original identities', async () => {
  const original = state(), foreign = state({ forecast: { ...original.forecast, cycleId: '00000000-0000-4000-8000-000000000099' } });
  const allowed = new Set([slipMatchSelectionKey(original)]), controller = new AbortController(), calls = [];
  const body = JSON.stringify({ selections: [] });
  const result = await readSlipMatchObservations(body, allowed, controller.signal, async (href, options) => {
    calls.push({ href, options }); return Response.json(data(at, [original, foreign]));
  });
  assert.equal(calls.length, 1); assert.equal(calls[0].href, '/api/slips/match-states');
  assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.body, body);
  assert.equal(calls[0].options.credentials, 'same-origin'); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.signal, controller.signal); assert.deepEqual(result.states, [original]);
});

test('transport fails closed on malformed, oversized, or incoherent responses and preserves HTTP retry information', async () => {
  const allowed = new Set([slipMatchSelectionKey(state())]), signal = new AbortController().signal;
  for (const response of [new Response('not-json'), Response.json({ states: [] }), Response.json(data(at, [state({ status: 'scheduled' })])),
    new Response('x'.repeat(slipMatchPollingRules.maximumResponseBytes + 1))]) {
    await assert.rejects(readSlipMatchObservations('{}', allowed, signal, async () => response));
  }
  await assert.rejects(readSlipMatchObservations('{}', allowed, signal, async () => new Response('', { status: 429, headers: { 'retry-after': '90' } })),
    (error) => error instanceof SlipMatchPollingError && error.status === 429 && error.retryAfterMs === 90_000);
  assert.deepEqual((await readSlipMatchObservations('{}', allowed, signal, async () => Response.json(data(at, [])))).states, []);
});
