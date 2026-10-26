import assert from "node:assert/strict";
import test from "node:test";
import { initialOfflineRefreshState, offlineRefreshRules, readOfflineReply, startOfflineRefresh } from "../src/domain/offline-refresh.ts";

const at = Date.parse("2026-10-26T09:00:00Z"), version = "a".repeat(64);
const ready = (capturedAt = at) => ({ ok: true, version, refreshed: true, capturedAt, expiresAt: capturedAt + 86_400_000, records: 2 });
const flush = async () => { for (let count = 0; count < 12; count++) await Promise.resolve(); };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function harness(prepare, { hint = true, inspected = { ok: false, error: "cache-unavailable" } } = {}) {
  let now = at, visible = true, online = hint, listener, id = 0;
  const timers = new Map(), states = [], starts = [], signals = [];
  const environment = { now: () => now, visible: () => visible, onlineHint: () => online,
    schedule: (callback, delay) => { const key = ++id; timers.set(key, { callback, at: now + delay }); return key; },
    cancel: (key) => timers.delete(key), listen: (callback) => { listener = callback; return () => { listener = undefined; }; } };
  const stop = startOfflineRefresh({ inspect: async () => typeof inspected === "function" ? inspected() : inspected, prepare: (signal) => {
    starts.push(now); signals.push(signal); return prepare(signal, starts.length);
  }, publish: (state) => states.push(state) }, environment);
  return {
    stop, timers, states, starts, signals, state: () => states.at(-1),
    hint: (value) => { online = value; listener?.(); },
    visibility: (value) => { visible = value; listener?.(); },
    ping: () => listener?.(),
    manual: () => listener?.("manual"),
    async advance(milliseconds) {
      const until = now + milliseconds;
      let limit = 0;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        assert.ok(++limit < 100, "No tight timer loop.");
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
      }
      now = until; await flush();
    },
  };
}

test("false network hint cannot block a verified reachable update", async () => {
  const h = harness(async () => ready(), { hint: false });
  await h.advance(0);
  assert.equal(h.starts.length, 1);
  assert.equal(h.state().connection, "reachable");
  assert.equal(h.state().cache.version, version);
  h.stop(); assert.equal(h.timers.size, 0);
});

test("retained good cache is a failed refresh with bounded exponential retries and cooldown", async () => {
  const h = harness(async () => ({ ...ready(), refreshed: false, retained: true, updateError: "network-timeout" }), { inspected: ready() });
  await h.advance(0);
  assert.equal(h.state().cache.version, version);
  assert.equal(h.state().connection, "unreachable");
  assert.equal(h.state().phase, "waiting");
  for (const wait of offlineRefreshRules.retryMs) {
    const count = h.starts.length;
    for (let index = 0; index < 100; index++) h.hint(index % 2 === 0);
    assert.equal(h.timers.size, 1);
    await h.advance(wait - 1); assert.equal(h.starts.length, count);
    await h.advance(1); assert.equal(h.starts.length, count + 1);
  }
  assert.equal(h.starts.length, 5);
  await h.advance(299_999); assert.equal(h.starts.length, 5);
  await h.advance(1); assert.equal(h.starts.length, 6);
  h.stop();
});

test("server Retry-After is honored without an unbounded delay", async () => {
  const h = harness(async () => ({ ok: false, refreshed: false, error: "rate-limited", retryAfterSeconds: 120 }));
  await h.advance(1_000); h.manual();
  await h.advance(118_999); assert.equal(h.starts.length, 1);
  await h.advance(1); assert.equal(h.starts.length, 2);
  assert.equal(readOfflineReply({ ok: false, retryAfterSeconds: 86_400 }).retryAfterSeconds, undefined);
  h.stop();
});

test("manual retry is user-controlled, coalesced and still observes the minimum request gap", async () => {
  const h = harness(async () => ready());
  await h.advance(0);
  for (let count = 0; count < 100; count++) h.manual();
  await h.advance(1_999); assert.equal(h.starts.length, 1);
  await h.advance(1); assert.equal(h.starts.length, 2);
  assert.equal(h.timers.size, 1);
  h.stop();
});

test("repeated hints cannot overlap an in-flight update", async () => {
  const pending = deferred(), h = harness(() => pending.promise);
  await h.advance(0);
  for (let index = 0; index < 100; index++) h.hint(index % 2 === 0);
  await h.advance(20_000); assert.equal(h.starts.length, 1);
  pending.resolve(ready()); await flush();
  assert.equal(h.state().connection, "reachable");
  assert.equal(h.timers.size, 1);
  h.stop();
});

test("hide cancels its owner, stops timers, and resume retries once without losing cache", async () => {
  const pending = deferred();
  const h = harness((signal, count) => count > 1 ? Promise.resolve(ready(at + 600_000)) : new Promise((resolve, reject) => {
    pending.promise.then(resolve); signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), { once: true });
  }), { inspected: ready() });
  await h.advance(0); h.visibility(false); await flush();
  assert.equal(h.signals[0].aborted, true); assert.equal(h.timers.size, 0);
  assert.equal(h.state().phase, "paused"); assert.equal(h.state().cache.version, version);
  await h.advance(600_000); assert.equal(h.starts.length, 1);
  h.visibility(true); await h.advance(0);
  assert.equal(h.starts.length, 2); assert.equal(h.state().connection, "reachable");
  h.stop();
});

test("dispose prevents late replies, timers and lifecycle work", async () => {
  const pending = deferred(), h = harness(() => pending.promise);
  await h.advance(0); const count = h.states.length;
  h.stop(); pending.resolve(ready()); await flush();
  assert.equal(h.signals[0].aborted, true);
  assert.equal(h.states.length, count); assert.equal(h.timers.size, 0);
  h.ping(); await h.advance(3_600_000); assert.equal(h.starts.length, 1);
});

test("healthy cadence coalesces recent hints, then checks a later foreground once", async () => {
  const h = harness(async () => ready());
  await h.advance(50_000);
  for (let index = 0; index < 100; index++) h.hint(index % 2 === 0);
  await h.advance(10_001); assert.equal(h.starts.length, 1);
  h.visibility(false); h.visibility(true); await h.advance(0);
  assert.equal(h.starts.length, 2); assert.equal(h.timers.size, 1);
  h.stop();
});

test("authentication wall and unusable responses never masquerade as a successful update", async () => {
  for (const [problem, connection] of [["authentication-required", "authentication-required"], ["response-policy", "unusable"], ["older-version", "unusable"]]) {
    const h = harness(async () => ({ ...ready(), refreshed: false, retained: true, updateError: problem }), { inspected: ready() });
    await h.advance(0);
    assert.equal(h.state().connection, connection); assert.equal(h.state().failures, 1); assert.equal(h.state().cache.version, version);
    h.stop();
  }
});

test("expiry removes readiness without a tight loop and legacy worker replies remain compatible", async () => {
  const h = harness(async () => ({ ...ready(), expiresAt: at + 1_000 }));
  await h.advance(0); assert.ok(h.state().cache);
  await h.advance(1_000); assert.equal(h.state().cache, null); assert.equal(h.starts.length, 1);
  h.stop();
  let reads = 0;
  const legacy = harness(async () => ({ ok: true, version }), { inspected: () => ++reads === 1 ? { ok: false } : ready() });
  await legacy.advance(0); assert.equal(legacy.state().connection, "reachable"); assert.equal(legacy.state().cache.capturedAt, at);
  assert.equal(reads, 2);
  legacy.stop();
});

test("legacy preparation preserves known expiry and cannot report freshness if status verification fails", async () => {
  let reads = 0;
  const h = harness(async () => ({ ok: true, version }), { inspected: () => {
    if (++reads > 1) throw new Error("Transient status failure");
    return { ...ready(), expiresAt: at + 1_000 };
  } });
  await h.advance(0);
  assert.equal(h.state().cache.expiresAt, at + 1_000);
  assert.equal(h.state().phase, "waiting"); assert.equal(h.state().problem, "cache-unavailable");
  await h.advance(1_000); assert.equal(h.state().cache, null);
  h.stop();
});

test("worker reply decoder rejects invalid metadata and copies no private fields", () => {
  assert.deepEqual(initialOfflineRefreshState.cache, null);
  assert.throws(() => readOfflineReply({ ok: true, version: "not-a-version" }));
  assert.throws(() => readOfflineReply({ ...ready(), records: 31 }));
  assert.throws(() => readOfflineReply({ ...ready(), expiresAt: at + 86_400_001 }));
  for (const patch of [{ refreshed: "false" }, { retained: null }, { activated: 1 }, { error: 401 }, { updateError: false }]) {
    assert.throws(() => readOfflineReply({ ...ready(), ...patch }));
  }
  const checked = readOfflineReply({ ...ready(), phone: "private", token: "private", forecast: "private" });
  assert.equal("phone" in checked || "token" in checked || "forecast" in checked, false);
});
