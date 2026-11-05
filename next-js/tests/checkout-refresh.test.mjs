import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutRefresh, revalidateCheckout } from "../src/components/members/checkout-refresh.ts";

const view = wallet => ({ availableWalletUgx: wallet, availableReferralDays: 0, lastMethod: null, requests: [] });
function fixture(t) {
  const requests = [], accepted = [];
  let unauthorized = 0;
  t.mock.method(globalThis, "fetch", (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })));
  const polling = createCheckoutRefresh({ accept: value => accepted.push(value), unauthorized: () => { unauthorized++; } });
  t.after(() => polling.stop());
  return { polling, requests, accepted, unauthorized: () => unauthorized };
}

test("focus, visibility, reconnect and timer bursts share one private read and one update", async t => {
  const { polling, requests, accepted } = fixture(t);
  const first = polling.refresh();
  for (let event = 0; event < 100; event++) assert.equal(polling.refresh(), first);
  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/account/checkout");
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests[0].options.credentials, "same-origin");
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  requests[0].resolve(Response.json(view(1000)));
  await first;
  assert.deepEqual(accepted, [view(1000)]);
  const later = polling.refresh();
  await Promise.resolve();
  assert.equal(requests.length, 2, "completed results do not become a stale private cache");
  requests[1].resolve(Response.json(view(2000)));
  await later;
  assert.deepEqual(accepted, [view(1000), view(2000)]);
});

test("transport, HTTP and body failures retain the current view and allow the next scheduled read", async t => {
  const { polling, requests, accepted } = fixture(t);
  for (const fail of [request => request.reject(new TypeError("offline")),
    request => request.resolve(new Response(null, { status: 503 })),
    request => request.resolve(new Response("invalid JSON"))]) {
    const result = polling.refresh();
    await Promise.resolve();
    fail(requests.at(-1));
    await result;
    assert.deepEqual(accepted, []);
  }
  const recovered = polling.refresh();
  await Promise.resolve();
  assert.equal(requests.length, 4);
  requests.at(-1).resolve(Response.json(view(10)));
  await recovered;
  assert.deepEqual(accepted, [view(10)]);
});

test("unauthorized responses retain the existing authentication recovery and coalesce it", async t => {
  const { polling, requests, accepted, unauthorized } = fixture(t);
  for (const status of [401, 403]) {
    const result = polling.refresh();
    assert.equal(polling.refresh(), result);
    await Promise.resolve();
    requests.at(-1).resolve(new Response(null, { status }));
    await result;
  }
  assert.equal(unauthorized(), 2);
  assert.deepEqual(accepted, []);
});

test("explicit mutation revalidation cancels a stale body and pauses background reads", async t => {
  const { polling, requests, accepted } = fixture(t);
  const old = polling.refresh();
  await Promise.resolve();
  let completeOldBody;
  requests[0].resolve({ ok: true, status: 200, json: () => new Promise(resolve => { completeOldBody = resolve; }) });
  await Promise.resolve();
  const fresh = revalidateCheckout({ pause: polling.pause, accept: next => accepted.push(next) });
  assert.equal(requests[0].options.signal.aborted, true);
  for (let event = 0; event < 10; event++) await polling.refresh();
  assert.equal(requests.length, 2, "focus events must not race the explicit fresh read");
  requests[1].resolve(Response.json(view(5000)));
  assert.deepEqual(await fresh, view(5000));
  completeOldBody(view(1000));
  await old;
  assert.deepEqual(accepted, [view(5000)], "an uncancellable late body cannot overwrite confirmed funding");
  const current = polling.refresh();
  await Promise.resolve();
  assert.equal(requests.length, 3);
  requests[2].resolve(Response.json(view(5500)));
  await current;
  assert.deepEqual(accepted, [view(5000), view(5500)]);
});

test("a superseded request cannot release the lock held by a newer background read", async t => {
  const { polling, requests, accepted } = fixture(t);
  const old = polling.refresh();
  await Promise.resolve();
  const resume = polling.pause(); resume();
  const current = polling.refresh();
  await Promise.resolve();
  requests[0].resolve(Response.json(view(1)));
  await old;
  assert.equal(polling.refresh(), current);
  assert.equal(requests.length, 2);
  requests[1].resolve(Response.json(view(2)));
  await current;
  assert.deepEqual(accepted, [view(2)]);
});

test("cleanup aborts outstanding reads and prevents late identity recovery or new requests", async t => {
  const { polling, requests, accepted, unauthorized } = fixture(t);
  const result = polling.refresh();
  await Promise.resolve();
  polling.stop(); polling.stop();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[0].resolve(new Response(null, { status: 401 }));
  await result;
  await polling.refresh();
  assert.equal(requests.length, 1);
  assert.equal(unauthorized(), 0);
  assert.deepEqual(accepted, []);
});

test("cleanup before a scheduled microtask avoids starting the network request", async t => {
  const { polling, requests } = fixture(t);
  const result = polling.refresh();
  polling.stop();
  await result;
  assert.equal(requests.length, 0);
});

test("the shared account deadline releases a stalled read so later refreshes can recover", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { polling, requests, accepted } = fixture(t);
  const stalled = polling.refresh();
  await Promise.resolve();
  const request = requests[0];
  request.options.signal.addEventListener("abort", () => request.reject(request.options.signal.reason), { once: true });
  t.mock.timers.tick(14_999);
  assert.equal(request.options.signal.aborted, false);
  t.mock.timers.tick(1);
  await stalled;
  assert.equal(request.options.signal.reason.name, "TimeoutError");
  assert.deepEqual(accepted, []);
  const recovered = polling.refresh();
  await Promise.resolve();
  requests[1].resolve(Response.json(view(3000)));
  await recovered;
  assert.deepEqual(accepted, [view(3000)]);
});

test("a stalled explicit revalidation releases background suppression at the account deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { polling, requests, accepted } = fixture(t);
  let foreground = 0;
  const pending = revalidateCheckout({
    pause() { foreground++; const resume = polling.pause(); return () => { foreground--; resume(); }; },
    accept: next => accepted.push(next),
  });
  const failed = assert.rejects(pending, { name: "TimeoutError" });
  const request = requests[0];
  request.options.signal.addEventListener("abort", () => request.reject(request.options.signal.reason), { once: true });
  await polling.refresh();
  assert.equal(requests.length, 1);
  assert.equal(foreground, 1);
  t.mock.timers.tick(15_000);
  await failed;
  assert.equal(foreground, 0);
  assert.deepEqual(accepted, []);
  const recovered = polling.refresh();
  await Promise.resolve();
  assert.equal(requests.length, 2, "the next existing poll can recover without retrying a write");
  requests[1].resolve(Response.json(view(5000)));
  await recovered;
  assert.deepEqual(accepted, [view(5000)]);
});

test("the explicit deadline covers body reading and rejects an uncancellable late response", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { polling, requests, accepted } = fixture(t);
  const pending = revalidateCheckout({ pause: polling.pause, accept: next => accepted.push(next) });
  const failed = assert.rejects(pending, { name: "TimeoutError" });
  let finish;
  requests[0].resolve({ ok: true, status: 200, json: () => new Promise(resolve => { finish = resolve; }) });
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  assert.equal(requests[0].options.signal.aborted, true);
  finish(view(1));
  await failed;
  assert.deepEqual(accepted, []);
  const next = polling.refresh();
  await Promise.resolve();
  requests[1].resolve(Response.json(view(2)));
  await next;
  assert.deepEqual(accepted, [view(2)]);
});
