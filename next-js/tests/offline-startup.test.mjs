import assert from "node:assert/strict";
import test from "node:test";
import { scheduleOfflineStartup } from "../src/components/offline/schedule-offline-startup.ts";

function browser({ ready = false, idle = true } = {}) {
  const listeners = new Set(), idleCallbacks = new Map(), timers = new Map();
  let next = 0;
  const host = {
    document: { readyState: ready ? "complete" : "loading" },
    addEventListener: (event, listener) => { assert.equal(event, "load"); listeners.add(listener); },
    removeEventListener: (event, listener) => { assert.equal(event, "load"); listeners.delete(listener); },
    ...(idle ? {
      requestIdleCallback: (callback, options) => { const id = ++next; idleCallbacks.set(id, { callback, options }); return id; },
      cancelIdleCallback: id => idleCallbacks.delete(id),
    } : {}),
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  return { host, listeners, idleCallbacks, timers,
    load: () => { host.document.readyState = "complete"; for (const listener of [...listeners]) listener(); },
    flushIdle: () => { const callbacks = [...idleCallbacks.values()]; idleCallbacks.clear(); for (const { callback } of callbacks) callback(); },
    flushTimers: () => { const callbacks = [...timers.values()]; timers.clear(); for (const { callback } of callbacks) callback(); },
  };
}

test("offline preparation waits for page resources and then browser idle time", () => {
  const fixture = browser();
  let starts = 0, stops = 0;
  const stop = scheduleOfflineStartup(() => { starts++; return () => stops++; }, fixture.host);
  assert.equal(starts, 0);
  assert.equal(fixture.idleCallbacks.size, 0);
  fixture.load();
  assert.equal(starts, 0);
  assert.equal(fixture.listeners.size, 0);
  assert.equal([...fixture.idleCallbacks.values()][0].options.timeout, 3_000, "busy pages still receive bounded startup");
  fixture.flushIdle();
  assert.equal(starts, 1);
  stop();
  assert.equal(stops, 1, "unmount stops the refresh controller");
});

test("an already loaded page schedules offline work without waiting for another load", () => {
  const fixture = browser({ ready: true });
  let starts = 0;
  const stop = scheduleOfflineStartup(() => { starts++; return () => {}; }, fixture.host);
  assert.equal(fixture.listeners.size, 0);
  assert.equal(starts, 0);
  fixture.flushIdle();
  assert.equal(starts, 1);
  stop();
});

test("unmount before load removes the pending listener and never starts work", () => {
  const fixture = browser();
  let starts = 0;
  const stop = scheduleOfflineStartup(() => { starts++; return () => {}; }, fixture.host);
  stop();
  assert.equal(fixture.listeners.size, 0);
  fixture.load();
  fixture.flushIdle();
  assert.equal(starts, 0);
});

test("canceling idle startup prevents even an already queued callback from starting work", () => {
  const fixture = browser({ ready: true });
  let starts = 0;
  const stop = scheduleOfflineStartup(() => { starts++; return () => {}; }, fixture.host);
  const queued = [...fixture.idleCallbacks.values()][0].callback;
  stop();
  assert.equal(fixture.idleCallbacks.size, 0);
  queued();
  assert.equal(starts, 0);
});

test("browsers without idle callbacks yield after load and allow timer cancellation", () => {
  const fixture = browser({ idle: false });
  let starts = 0;
  const stop = scheduleOfflineStartup(() => { starts++; return () => {}; }, fixture.host);
  assert.equal(fixture.timers.size, 0);
  fixture.load();
  assert.equal(starts, 0);
  assert.equal([...fixture.timers.values()][0].delay, 1_000);
  fixture.flushTimers();
  assert.equal(starts, 1);
  stop();

  const canceled = browser({ ready: true, idle: false });
  const cancel = scheduleOfflineStartup(() => { starts++; return () => {}; }, canceled.host);
  cancel();
  assert.equal(canceled.timers.size, 0);
  canceled.flushTimers();
  assert.equal(starts, 1);
});
