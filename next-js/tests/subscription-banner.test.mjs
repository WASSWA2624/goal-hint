import assert from "node:assert/strict";
import test from "node:test";
import { desktopSubscriptionBannerState } from "../src/domain/subscription-banner.ts";

const now = Date.parse("2026-10-29T12:00:00Z");
const summary = (changes = {}) => ({ activeUntil: null, paymentPending: false, canSubscribe: true,
  creditUgx: 0, autoRenew: false, renewsFromCredit: false, ...changes });

test("unresolved account status never advertises authentication or a subscription", () => {
  for (const signedIn of [false, true]) assert.equal(desktopSubscriptionBannerState(signedIn, null, now), null);
});

test("signed-out visitors receive authentication guidance even if an old account summary remains", () => {
  for (const value of [summary(), summary({ paymentPending: true }), summary({ expired: true }),
    summary({ activeUntil: new Date(now + 60_000).toISOString(), paymentPending: true })]) {
    assert.equal(desktopSubscriptionBannerState(false, value, now), "signed-out");
  }
  assert.equal(desktopSubscriptionBannerState(false, summary({ canSubscribe: false }), now), null,
    "closed sales do not advertise a plan");
});

test("an active subscription takes priority over pending payments and closed sales", () => {
  for (const changes of [{}, { paymentPending: true }, { canSubscribe: false }, { expired: true, paymentPending: true, canSubscribe: false }]) {
    const value = summary({ ...changes, activeUntil: new Date(now + 1).toISOString() });
    assert.equal(desktopSubscriptionBannerState(true, value, now), "active");
  }
});

test("pending payments remain discoverable when sales close and after access expires", () => {
  for (const changes of [{}, { canSubscribe: false }, { expired: true }, { activeUntil: new Date(now).toISOString() }]) {
    assert.equal(desktopSubscriptionBannerState(true, summary({ ...changes, paymentPending: true }), now), "pending");
  }
});

test("expired and never-subscribed accounts receive the appropriate acquisition state", () => {
  assert.equal(desktopSubscriptionBannerState(true, summary(), now), "unsubscribed");
  assert.equal(desktopSubscriptionBannerState(true, summary({ expired: true }), now), "expired");
  for (const activeUntil of [new Date(now).toISOString(), new Date(now - 1).toISOString()]) {
    assert.equal(desktopSubscriptionBannerState(true, summary({ activeUntil }), now), "expired",
      "the expiry instant is exclusive even before the next session response");
  }
  assert.equal(desktopSubscriptionBannerState(true, summary({ activeUntil: "invalid" }), now), "unsubscribed");
  assert.equal(desktopSubscriptionBannerState(true, summary({ canSubscribe: false }), now), null);
  assert.equal(desktopSubscriptionBannerState(true, summary({ expired: true, canSubscribe: false }), now), null);
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
    assert.equal(desktopSubscriptionBannerState(signedIn, value, at), expected);
    assert.deepEqual(value, original, "presentation state does not mutate confirmed session data");
  }
});
