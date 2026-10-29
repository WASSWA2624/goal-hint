import assert from "node:assert/strict";
import test from "node:test";
import { subscriptionBannerLinks, subscriptionBannerState } from "../src/domain/subscription-banner.ts";

const now = Date.parse("2026-10-29T12:00:00Z");
const summary = (changes = {}) => ({ activeUntil: null, paymentPending: false, canSubscribe: true,
  creditUgx: 0, autoRenew: false, renewsFromCredit: false, ...changes });

test("unresolved account status never advertises authentication or a subscription", () => {
  for (const signedIn of [false, true]) assert.equal(subscriptionBannerState(signedIn, null, now), null);
});

test("signed-out visitors receive authentication guidance even if an old account summary remains", () => {
  for (const value of [summary(), summary({ paymentPending: true }), summary({ expired: true }),
    summary({ activeUntil: new Date(now + 60_000).toISOString(), paymentPending: true })]) {
    assert.equal(subscriptionBannerState(false, value, now), "signed-out");
  }
  assert.equal(subscriptionBannerState(false, summary({ canSubscribe: false }), now), null,
    "closed sales do not advertise a plan");
});

test("an active subscription takes priority over pending payments and closed sales", () => {
  for (const changes of [{}, { paymentPending: true }, { canSubscribe: false }, { expired: true, paymentPending: true, canSubscribe: false }]) {
    const value = summary({ ...changes, activeUntil: new Date(now + 1).toISOString() });
    assert.equal(subscriptionBannerState(true, value, now), "active");
  }
});

test("pending payments remain discoverable when sales close and after access expires", () => {
  for (const changes of [{}, { canSubscribe: false }, { expired: true }, { activeUntil: new Date(now).toISOString() }]) {
    assert.equal(subscriptionBannerState(true, summary({ ...changes, paymentPending: true }), now), "pending");
  }
});

test("expired and never-subscribed accounts receive the appropriate acquisition state", () => {
  assert.equal(subscriptionBannerState(true, summary(), now), "unsubscribed");
  assert.equal(subscriptionBannerState(true, summary({ expired: true }), now), "expired");
  for (const activeUntil of [new Date(now).toISOString(), new Date(now - 1).toISOString()]) {
    assert.equal(subscriptionBannerState(true, summary({ activeUntil }), now), "expired",
      "the expiry instant is exclusive even before the next session response");
  }
  assert.equal(subscriptionBannerState(true, summary({ activeUntil: "invalid" }), now), "unsubscribed");
  assert.equal(subscriptionBannerState(true, summary({ canSubscribe: false }), now), null);
  assert.equal(subscriptionBannerState(true, summary({ expired: true, canSubscribe: false }), now), null);
});

test("the banner follows approval, exact expiry and sign-out without retaining account actions", () => {
  const until = new Date(now + 60_000).toISOString();
  const steps = [
    [false, null, now, null],
    [false, summary(), now, "signed-out"],
    [true, summary(), now, "unsubscribed"],
    [true, summary({ paymentPending: true }), now, "pending"],
    [true, summary({ activeUntil: until }), now, "active"],
    [true, summary({ activeUntil: until }), now + 60_000, "expired"],
    [false, summary({ activeUntil: until }), now, "signed-out"],
  ];
  for (const [signedIn, value, at, expected] of steps) {
    const original = value && structuredClone(value);
    assert.equal(subscriptionBannerState(signedIn, value, at), expected);
    assert.deepEqual(value, original, "presentation state does not mutate confirmed session data");
  }
});

test("responsive banner actions preserve approved return destinations and their account/payment views", () => {
  for (const pathname of ["/en", "/en/matches", "/en/slips", "/en/matches/123/arsenal-chelsea"]) {
    const links = subscriptionBannerLinks("en", pathname);
    assert.equal(links.account, "/en/account");
    assert.equal(links.subscribe, "/en/subscribe");
    for (const [action, view] of [["signIn", "login"], ["signUp", "register"]]) {
      const target = new URL(links[action], "https://goalhint.example");
      assert.equal(target.pathname, "/en/account");
      assert.deepEqual(Object.fromEntries(target.searchParams), { view, return: pathname });
      assert.equal(target.hash, "");
    }
    for (const [action, fragment] of [["plans", "#plans"], ["payment", "#report"]]) {
      const target = new URL(links[action], "https://goalhint.example");
      assert.equal(target.pathname, "/en/subscribe");
      assert.deepEqual(Object.fromEntries(target.searchParams), { return: pathname });
      assert.equal(target.hash, fragment);
    }
  }
});

test("banner actions reject unsafe or non-returnable locations and fall back to supported account routes", () => {
  for (const pathname of ["https://outside.example/en/matches", "//outside.example/en/slips", "/en/matches?return=https://outside.example",
    "/en/slips#private", "/en/matches/%2Fadmin/team", "/en/account", "/en/subscribe", "/admin"]) {
    const links = subscriptionBannerLinks("untranslated", pathname);
    assert.equal(links.account, "/en/account");
    assert.equal(links.subscribe, "/en/subscribe");
    for (const action of ["signIn", "signUp", "plans", "payment"]) {
      const target = new URL(links[action], "https://goalhint.example");
      assert.equal(target.origin, "https://goalhint.example");
      assert.equal(target.searchParams.has("return"), false, `${action}: ${pathname} must not survive as a return target`);
    }
    assert.equal(links.signIn, "/en/account?view=login");
    assert.equal(links.signUp, "/en/account?view=register");
    assert.equal(links.plans, "/en/subscribe#plans");
    assert.equal(links.payment, "/en/subscribe#report");
  }
});
