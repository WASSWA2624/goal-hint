import assert from "node:assert/strict";
import test from "node:test";
import {
  getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot,
  refreshPendingPayments, seedPendingPayments, subscribePendingPayments,
} from "../src/components/admin/pending-payments.ts";

function browserFor(t, visibility = "visible") {
  const browser = new EventTarget(), document = new EventTarget();
  document.visibilityState = visibility;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: document });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const requests = [], subscriptions = [];
  t.mock.method(globalThis, "fetch", (url, options) => new Promise((resolve, reject) => {
    requests.push({ url, options, resolve, reject });
  }));
  t.after(() => {
    for (const unsubscribe of subscriptions) unsubscribe();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  });
  return {
    browser, document, requests,
    subscribe(listener = () => {}) {
      const unsubscribe = subscribePendingPayments(listener);
      subscriptions.push(unsubscribe);
      return unsubscribe;
    },
    async reply(body, status = 200, task = refreshPendingPayments()) {
      await Promise.resolve();
      requests.at(-1).resolve(Response.json(body, { status }));
      await task;
    },
    restore(persisted) {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: persisted });
      browser.dispatchEvent(event);
    },
  };
}

test("admin count requests are private, shared across headers and absent without subscribers", async (t) => {
  const view = browserFor(t);
  assert.equal(getPendingPaymentsSnapshot(), null);
  assert.equal(getServerPendingPaymentsSnapshot(), null);
  seedPendingPayments(3);
  await refreshPendingPayments(true);
  assert.equal(getPendingPaymentsSnapshot(), null);
  assert.equal(view.requests.length, 0);

  let desktopUpdates = 0, mobileUpdates = 0;
  const desktop = view.subscribe(() => { desktopUpdates += 1; });
  const mobile = view.subscribe(() => { mobileUpdates += 1; });
  const first = refreshPendingPayments();
  assert.equal(refreshPendingPayments(), first);
  await Promise.resolve();
  assert.equal(view.requests.length, 1);
  const { url, options } = view.requests[0];
  assert.equal(url, "/api/admin/payments?count=1");
  assert.equal(options.cache, "no-store");
  assert.equal(options.credentials, "same-origin");
  assert.equal(options.headers.Accept, "application/json");
  assert.ok(options.signal instanceof AbortSignal);
  await view.reply({ pendingCount: 0 }, 200, first);
  assert.equal(getPendingPaymentsSnapshot(), 0, "zero is a confirmed empty queue, not unknown");
  assert.equal(getServerPendingPaymentsSnapshot(), null, "public HTML never contains the client count");
  assert.deepEqual([desktopUpdates, mobileUpdates], [1, 1]);
  await view.reply({ pendingCount: 0 });
  assert.deepEqual([desktopUpdates, mobileUpdates], [1, 1], "unchanged counts do not publish updates");

  desktop();
  await view.reply({ pendingCount: 2 });
  assert.deepEqual([desktopUpdates, mobileUpdates], [1, 2], "the remaining header keeps its subscription");
  mobile();
  assert.equal(getPendingPaymentsSnapshot(), null, "last unmount clears private state");
  const before = view.requests.length;
  view.browser.dispatchEvent(new Event("focus"));
  view.document.dispatchEvent(new Event("visibilitychange"));
  view.restore(true);
  t.mock.timers.tick(60_000);
  await refreshPendingPayments();
  assert.equal(view.requests.length, before, "last unmount removes all event listeners and polling");
});

test("one 30-second poll runs only while visible and rechecks on focus or restoration", async (t) => {
  const view = browserFor(t, "hidden");
  view.subscribe();
  view.subscribe();
  t.mock.timers.tick(60_000);
  view.browser.dispatchEvent(new Event("focus"));
  view.restore(true);
  await Promise.resolve();
  assert.equal(view.requests.length, 0, "hidden tabs do not poll or refresh on focus events");

  view.document.visibilityState = "visible";
  view.document.dispatchEvent(new Event("visibilitychange"));
  await view.reply({ pendingCount: 1 });
  assert.equal(view.requests.length, 1);
  t.mock.timers.tick(29_999);
  await Promise.resolve();
  assert.equal(view.requests.length, 1);
  t.mock.timers.tick(1);
  view.browser.dispatchEvent(new Event("focus"));
  await view.reply({ pendingCount: 2 });
  assert.equal(view.requests.length, 2, "the poll and simultaneous focus share their request");
  view.restore(false);
  await Promise.resolve();
  assert.equal(view.requests.length, 2, "ordinary pageshow does not duplicate the initial refresh");
  view.restore(true);
  await view.reply({ pendingCount: 3 });
  assert.equal(view.requests.length, 3);
  view.browser.dispatchEvent(new Event("focus"));
  await view.reply({ pendingCount: 4 });
  assert.equal(view.requests.length, 4);

  view.document.visibilityState = "hidden";
  view.document.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(30_000);
  await Promise.resolve();
  assert.equal(view.requests.length, 4);
});

test("invalid payloads and temporary failures preserve the last confirmed count", async (t) => {
  const view = browserFor(t);
  let updates = 0;
  view.subscribe(() => { updates += 1; });
  await view.reply({ pendingCount: 7 });
  for (const body of [null, [], {}, { pendingCount: "8" }, { pendingCount: null }, { pendingCount: -1 },
    { pendingCount: 1.5 }, { pendingCount: Number.MAX_SAFE_INTEGER + 1 }]) {
    await view.reply(body);
    assert.equal(getPendingPaymentsSnapshot(), 7);
  }
  await view.reply({ pendingCount: 0 }, 503);
  assert.equal(getPendingPaymentsSnapshot(), 7);
  const failure = refreshPendingPayments();
  await Promise.resolve();
  view.requests.at(-1).reject(new TypeError("Network unavailable"));
  await failure;
  assert.equal(getPendingPaymentsSnapshot(), 7);
  const invalidJson = refreshPendingPayments();
  await Promise.resolve();
  view.requests.at(-1).resolve(new Response("not json"));
  await invalidJson;
  assert.equal(getPendingPaymentsSnapshot(), 7);
  assert.equal(updates, 1);
});

test("unauthorized or forbidden responses clear the private count", async (t) => {
  const view = browserFor(t);
  let updates = 0;
  view.subscribe(() => { updates += 1; });
  for (const status of [401, 403]) {
    await view.reply({ pendingCount: 5 });
    await view.reply({ pendingCount: 99 }, status);
    assert.equal(getPendingPaymentsSnapshot(), null);
    assert.equal(getServerPendingPaymentsSnapshot(), null);
  }
  assert.equal(updates, 4);
});

test("last unsubscribe aborts requests and a previous admin session cannot overwrite a new one", async (t) => {
  const view = browserFor(t);
  const unsubscribe = view.subscribe();
  seedPendingPayments(5);
  const old = refreshPendingPayments();
  await Promise.resolve();
  const oldRequest = view.requests[0];
  unsubscribe();
  assert.equal(oldRequest.options.signal.aborted, true);
  assert.equal(getPendingPaymentsSnapshot(), null);
  view.subscribe();
  const current = refreshPendingPayments();
  await Promise.resolve();
  assert.equal(view.requests.length, 2);
  oldRequest.resolve(Response.json({ pendingCount: 99 }));
  await old;
  assert.equal(getPendingPaymentsSnapshot(), null);
  assert.equal(refreshPendingPayments(), current, "an obsolete request cannot clear the current in-flight request");
  await view.reply({ pendingCount: 2 }, 200, current);
  assert.equal(getPendingPaymentsSnapshot(), 2);
});

test("a completed payment decision replaces an older request without publishing its stale count", async (t) => {
  const view = browserFor(t);
  const values = [];
  view.subscribe(() => { values.push(getPendingPaymentsSnapshot()); });
  seedPendingPayments(3);
  const beforeDecision = refreshPendingPayments();
  await Promise.resolve();
  const oldRequest = view.requests[0];
  const afterDecision = refreshPendingPayments(true);
  assert.notEqual(afterDecision, beforeDecision);
  await Promise.resolve();
  assert.equal(oldRequest.options.signal.aborted, true);
  assert.equal(view.requests.length, 2);
  oldRequest.resolve(Response.json({ pendingCount: 99 }));
  await beforeDecision;
  assert.equal(getPendingPaymentsSnapshot(), 3);
  assert.equal(refreshPendingPayments(), afterDecision);
  await view.reply({ pendingCount: 2 }, 200, afterDecision);
  assert.deepEqual(values, [3, 2]);
});

test("a count whose body arrives after refresh or logout cannot restore obsolete data", async (t) => {
  const view = browserFor(t);
  for (const invalidate of ["refresh", "logout"]) {
    const unsubscribe = view.subscribe();
    const old = refreshPendingPayments();
    await Promise.resolve();
    let finishBody;
    view.requests.at(-1).resolve({ status: 200, ok: true, json: () => new Promise(resolve => { finishBody = resolve; }) });
    await Promise.resolve();
    assert.equal(typeof finishBody, "function");
    if (invalidate === "refresh") {
      const current = refreshPendingPayments(true);
      await view.reply({ pendingCount: 2 }, 200, current);
    } else unsubscribe();
    finishBody({ pendingCount: 99 });
    await old;
    assert.equal(getPendingPaymentsSnapshot(), invalidate === "refresh" ? 2 : null);
    unsubscribe();
  }
});

test("server seeds initialize only unknown counts and never overwrite a completed poll", async (t) => {
  const view = browserFor(t);
  view.subscribe();
  for (const invalid of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) seedPendingPayments(invalid);
  assert.equal(getPendingPaymentsSnapshot(), null);
  seedPendingPayments(3);
  assert.equal(getPendingPaymentsSnapshot(), 3);
  seedPendingPayments(4);
  assert.equal(getPendingPaymentsSnapshot(), 3);
  await view.reply({ pendingCount: 8 });
  seedPendingPayments(3);
  assert.equal(getPendingPaymentsSnapshot(), 8);
  await view.reply({ pendingCount: 0 });
  seedPendingPayments(8);
  assert.equal(getPendingPaymentsSnapshot(), 0, "confirmed zero cannot be replaced by a stale server seed");
});
