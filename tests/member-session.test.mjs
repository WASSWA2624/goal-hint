import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminSessionSnapshot, getServerAdminSessionSnapshot,
  getMemberSessionSnapshot, getServerMemberSessionSnapshot, refreshMemberSession, subscribeMemberSession,
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
