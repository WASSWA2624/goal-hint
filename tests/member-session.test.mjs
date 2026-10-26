import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminSessionSnapshot, getServerAdminSessionSnapshot,
  getMemberSessionSnapshot, getServerMemberSessionSnapshot, refreshMemberSession, subscribeMemberSession,
  getSubscriptionSnapshot, getServerSubscriptionSnapshot,
} from "../src/components/members/member-session.ts";

test("header identity requests are private, deduplicated and refreshed after another tab signs out", async (t) => {
  const browser = new EventTarget();
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = browser;
  const requests = [];
  const responses = [];
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    return new Promise((resolve) => responses.push(resolve));
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  });
  assert.equal(getServerMemberSessionSnapshot(), null);
  assert.equal(getMemberSessionSnapshot(), null);
  assert.equal(getAdminSessionSnapshot(), false);
  assert.equal(getServerAdminSessionSnapshot(), false);
  let updates = 0;
  const desktop = subscribeMemberSession(() => { updates += 1; });
  const mobile = subscribeMemberSession(() => { updates += 1; });
  t.after(desktop);
  t.after(mobile);
  const first = refreshMemberSession();
  assert.equal(refreshMemberSession(), first);
  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/account/session");
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests[0].options.credentials, "same-origin");
  responses.shift()(Response.json({ phone: "+256700000001" }));
  await first;
  assert.equal(getMemberSessionSnapshot(), "+256700000001");
  assert.equal(getServerMemberSessionSnapshot(), null, "public server rendering never receives the client phone");
  assert.equal(updates, 2, "both header instances receive the identity update");

  browser.dispatchEvent(new Event("focus"));
  const focused = refreshMemberSession();
  await Promise.resolve();
  responses.shift()(Response.json({ phone: null }));
  await focused;
  assert.equal(requests.length, 2);
  assert.equal(getMemberSessionSnapshot(), null);
  assert.equal(updates, 4);

  const restored = new Event("pageshow");
  Object.defineProperty(restored, "persisted", { value: true });
  browser.dispatchEvent(restored);
  const restoreRequest = refreshMemberSession();
  await Promise.resolve();
  responses.shift()(Response.json({ phone: "+256700000002" }));
  await restoreRequest;
  assert.equal(getMemberSessionSnapshot(), "+256700000002");

  const failure = refreshMemberSession();
  await Promise.resolve();
  responses.shift()(new Response(null, { status: 503 }));
  await failure;
  assert.equal(getMemberSessionSnapshot(), "+256700000002", "temporary transport failures preserve the last confirmed account");

  for (const administrator of [true, false]) {
    const before = updates;
    const refreshed = refreshMemberSession();
    await Promise.resolve();
    responses.shift()(Response.json({ phone: "+256700000002", administrator }));
    await refreshed;
    assert.equal(getAdminSessionSnapshot(), administrator);
    assert.equal(getServerAdminSessionSnapshot(), false, "public HTML never includes private admin state");
    assert.equal(updates, before + 2, "role changes notify both headers even when the phone stays the same");
  }

  const owner = refreshMemberSession();
  await Promise.resolve();
  responses.shift()(Response.json({ phone: null, administrator: true }));
  await owner;
  assert.equal(getAdminSessionSnapshot(), true, "owner sessions do not require a member phone");
  const signedOut = refreshMemberSession();
  await Promise.resolve();
  responses.shift()(Response.json({ phone: null, administrator: false }));
  await signedOut;
  assert.equal(getAdminSessionSnapshot(), false, "signing out removes dashboard access from navigation");

  desktop();
  mobile();
  const beforeUnmount = requests.length;
  browser.dispatchEvent(new Event("focus"));
  await Promise.resolve();
  assert.equal(requests.length, beforeUnmount, "unmounted headers remove their browser listeners");
});

test("subscription changes update all headers, poll approval and expire without navigation", async (t) => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = new EventTarget();
  const now = Date.parse("2026-12-31T20:59:00Z");
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now });
  let calls = 0, updates = 0;
  const credit = { creditUgx: 0, autoRenew: false, renewsFromCredit: false };
  let summary = { activeUntil: null, paymentPending: true, canSubscribe: true, ...credit };
  let failure = false;
  globalThis.fetch = async () => {
    calls += 1;
    return failure ? new Response(null, { status: 503 }) : Response.json({ phone: "+256700000003", administrator: false, subscription: summary });
  };
  const unsubscribe = subscribeMemberSession(() => { updates += 1; });
  t.after(() => {
    unsubscribe();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  });
  await refreshMemberSession();
  assert.deepEqual(getSubscriptionSnapshot(), summary);
  assert.equal(getServerSubscriptionSnapshot(), null, "subscription details never enter public server HTML");
  const stable = getSubscriptionSnapshot();
  await refreshMemberSession();
  assert.equal(getSubscriptionSnapshot(), stable, "unchanged responses retain a stable external-store snapshot");
  assert.equal(updates, 1);

  summary = { ...summary, activeUntil: new Date(now + 60_000).toISOString(), paymentPending: false };
  t.mock.timers.tick(20_000);
  await refreshMemberSession();
  assert.equal(calls, 3, "the shared pending timer discovers approval");
  assert.deepEqual(getSubscriptionSnapshot(), summary);
  assert.equal(updates, 2, "approval notifies even when the phone is unchanged");

  failure = true;
  await refreshMemberSession();
  assert.deepEqual(getSubscriptionSnapshot(), summary, "temporary errors preserve confirmed subscription details");
  t.mock.timers.tick(40_000);
  assert.equal(getSubscriptionSnapshot().activeUntil, null, "expiry clears at the exact instant even when the network is unavailable");
  assert.equal(getSubscriptionSnapshot().expired, true, "a confirmed active period becomes expired without a working network");
  await refreshMemberSession();
  assert.equal(updates, 3);

  failure = false;
  summary = { activeUntil: null, paymentPending: true, canSubscribe: true, ...credit };
  await refreshMemberSession();
  const changed = updates;
  summary = { ...summary, expired: true };
  await refreshMemberSession();
  assert.equal(updates, changed + 1, "an authoritative expiry change updates every header");
  assert.equal(getSubscriptionSnapshot().expired, true);
  summary = { ...summary, activeUntil: new Date(now + 120_000).toISOString(), paymentPending: false };
  await refreshMemberSession();
  assert.equal(getSubscriptionSnapshot().expired, undefined, "renewed access clears a stale expiry flag");
  unsubscribe();
  const beforeUnmount = calls;
  t.mock.timers.tick(60_000);
  await Promise.resolve();
  assert.equal(calls, beforeUnmount, "last unmount removes the shared polling timer");
});

test("the subscribe offer is kept only when well formed, and a price change updates the headers", async (t) => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  globalThis.window = new EventTarget();
  const base = { activeUntil: null, paymentPending: false, canSubscribe: true, creditUgx: 0, autoRenew: false, renewsFromCredit: false };
  let subscription = { ...base, offer: { priceUgx: 1_000, durationDays: 1 } }, updates = 0;
  globalThis.fetch = async () => Response.json({ phone: null, administrator: false, subscription });
  const unsubscribe = subscribeMemberSession(() => { updates += 1; });
  t.after(() => {
    unsubscribe();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  });
  await refreshMemberSession();
  assert.deepEqual(getSubscriptionSnapshot(), subscription);
  const seen = updates;
  subscription = { ...base, offer: { priceUgx: 2_000, durationDays: 1 } };
  await refreshMemberSession();
  assert.equal(updates, seen + 1, "a new price reaches every header");
  assert.deepEqual(getSubscriptionSnapshot().offer, subscription.offer);
  for (const offer of [null, { priceUgx: "1000", durationDays: 1 }, { priceUgx: 1_000 }, { priceUgx: 0, durationDays: 1 }, { priceUgx: 1.5, durationDays: 1 }]) {
    subscription = { ...base, offer };
    await refreshMemberSession();
    assert.deepEqual(getSubscriptionSnapshot(), base, `a malformed offer is dropped: ${JSON.stringify(offer)}`);
  }
});
