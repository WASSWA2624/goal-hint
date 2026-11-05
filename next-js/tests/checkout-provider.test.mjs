import assert from "node:assert/strict";
import test from "node:test";
import { capCheckoutFunding, chooseCheckoutMethod, withCheckoutProvider } from "../src/components/members/checkout-draft.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";

const settings = { ...defaultSubscriptionSettings, mtnEnabled: true, mtnNumber: "256700000901", mtnName: "TEST MTN",
  airtelEnabled: true, airtelNumber: "256700000902", airtelName: "TEST AIRTEL" };
const draft = { step: 1, purpose: "plan", planId: "weekly", method: "", usePackage: true,
  useWallet: false, useReferral: false, walletUgx: "0", referralDays: "0", accepted: false, attachingId: null };
const plans = [{ id: "weekly", priceUgx: 5000 }];

test("new Pay selects MTN, or the available previously used subscription provider, without spending balances", () => {
  assert.equal(withCheckoutProvider(draft, settings, null).method, "mtn");
  assert.equal(withCheckoutProvider(draft, settings, "airtel").method, "airtel");
  for (const previous of ["wallet", "referral", "unknown"]) {
    const next = withCheckoutProvider(draft, settings, previous);
    assert.equal(next.method, "mtn");
    assert.equal(next.useWallet, false);
    assert.equal(next.walletUgx, "0");
    assert.equal(next.referralDays, "0");
  }
});

test("current draft wins and unavailable receiving details never become defaults", () => {
  assert.equal(withCheckoutProvider({ ...draft, method: "airtel" }, settings, "mtn").method, "airtel");
  assert.equal(withCheckoutProvider(draft, { ...settings, mtnEnabled: false }, "mtn").method, "airtel");
  assert.equal(withCheckoutProvider(draft, { ...settings, airtelName: "" }, "airtel").method, "mtn");
  assert.equal(withCheckoutProvider(draft, { ...settings, mtnNumber: "invalid", airtelEnabled: false }, null).method, "");
});

test("full wallet, changed balances and switching providers preserve the member's transfer preference", () => {
  const balances = { availableWalletUgx: 6000, availableReferralDays: 0 };
  const airtel = withCheckoutProvider({ ...draft, method: "airtel" }, settings, "mtn");
  const wallet = chooseCheckoutMethod(airtel, "wallet", true, balances, plans);
  assert.equal(wallet.method, "wallet");
  assert.equal(wallet.mobileMethod, "airtel");
  assert.equal(withCheckoutProvider(wallet, settings, "mtn").method, "wallet");
  const removed = withCheckoutProvider(chooseCheckoutMethod(wallet, "wallet", false, balances, plans), settings, "mtn");
  assert.equal(removed.method, "airtel");
  assert.equal(removed.walletUgx, "0");
  const reduced = withCheckoutProvider(capCheckoutFunding(wallet, { ...balances, availableWalletUgx: 2000 }, plans), settings, null);
  assert.equal(reduced.method, "airtel");
  assert.equal(reduced.walletUgx, "2000");
  const depleted = withCheckoutProvider(capCheckoutFunding(wallet, { ...balances, availableWalletUgx: 0 }, plans), settings, null);
  assert.equal(depleted.useWallet, false, "An emptied wallet cannot return as a selected zero contribution.");
  assert.equal(depleted.walletUgx, "0");
  assert.equal(depleted.method, "airtel");
  const switched = chooseCheckoutMethod(wallet, "mtn", true, balances, plans);
  assert.equal(switched.method, "mtn");
  assert.equal(switched.useWallet, false);
  assert.equal(switched.walletUgx, "0");
});

test("defaults never change a redemption, receipt attachment, or payment awaiting review", () => {
  const redemption = withCheckoutProvider({ ...draft, purpose: "referral", method: "referral", usePackage: false }, settings, "airtel");
  assert.equal(redemption.method, "referral");
  for (const value of [{ ...draft, step: 2, method: "airtel" }, { ...draft, step: 3, method: "wallet" }, { ...draft, attachingId: "existing" }]) {
    assert.equal(withCheckoutProvider(value, { ...settings, airtelEnabled: false }, "mtn"), value);
  }
});
