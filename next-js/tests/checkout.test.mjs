import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { checkoutMethodAvailable, checkoutSelectionSchema, receiptInputSchema, fundingAmounts } from "../src/domain/checkout.ts";
import { createCheckoutHandlers } from "../src/server/members/checkout-http.ts";
import { jpeg } from "./helpers/payment-fixtures.mjs";
import { paymentEvidenceDate } from "../src/domain/payment-evidence-date.ts";
import { capCheckoutFunding, chooseCheckoutMethod } from "../src/components/members/checkout-draft.ts";

test("checkout uses integer funding and referral days never reduce the cash price", () => {
  assert.deepEqual(fundingAmounts(5000, 2000, 1000), { amountToSend: 3000, remainingUgx: 2000, excessUgx: 0 });
  assert.deepEqual(fundingAmounts(5000, 2000, 5000), { amountToSend: 3000, remainingUgx: 0, excessUgx: 2000 });
  const selection = { purpose: "plan", planId: randomUUID(), method: "mtn", walletUgx: 2000, referralDays: 3 };
  assert.equal(checkoutSelectionSchema.safeParse(selection).success, true);
  for (const patch of [{ walletUgx: 0.5 }, { walletUgx: -1 }, { referralDays: 1.5 }, { referralDays: 366 }, { priceUgx: 1 }, { email: "unwanted@example.test" }])
    assert.equal(checkoutSelectionSchema.safeParse({ ...selection, ...patch }).success, false);
});

test("manual evidence remains valid after failed extraction and original text is bounded", () => {
  const input = { transactionId: "MANUAL100", amountUgx: 1000, payerPhone: "256700000123", paidAt: "2026-11-01T12:00:00+03:00",
    original: { text: "Unreadable screenshot text", extracted: {} } };
  assert.equal(receiptInputSchema.safeParse(input).success, true);
  for (const patch of [{ amountUgx: 1000.5 }, { amountUgx: 0 }, { paidAt: "yesterday" }, { verified: true }, { original: { text: "x".repeat(12001), extracted: {} } }])
    assert.equal(receiptInputSchema.safeParse({ ...input, ...patch }).success, false);
});

test("funding inputs cap edits and restored choices at spendable balances and package cost", () => {
  const planId = randomUUID(), plans = [{ id: planId, priceUgx: 5000 }];
  const draft = { purpose: "plan", planId, method: "mtn", useWallet: true, useReferral: true, walletUgx: "99999999999999999999", referralDays: "99", accepted: true };
  const available = { availableWalletUgx: 3000, availableReferralDays: 3 };
  assert.deepEqual(capCheckoutFunding(draft, available, plans), { ...draft, walletUgx: "3000", referralDays: "3", accepted: false });
  assert.equal(capCheckoutFunding(draft, { ...available, availableWalletUgx: 10000 }, plans).walletUgx, "5000");
  assert.equal(capCheckoutFunding(draft, { ...available, availableWalletUgx: 10000 }, plans).method, "wallet", "Fully funded purchases omit external payment proof.");
  assert.equal(capCheckoutFunding({ ...draft, referralDays: "999" }, { ...available, availableReferralDays: 500 }, plans).referralDays, "365");
  const lowered = capCheckoutFunding({ ...draft, walletUgx: "3000", referralDays: "3" }, { availableWalletUgx: 0, availableReferralDays: 0 }, plans);
  assert.equal(lowered.walletUgx, "0"); assert.equal(lowered.referralDays, "0"); assert.equal(lowered.accepted, false);
  const blank = { ...draft, walletUgx: "", referralDays: "" };
  assert.equal(capCheckoutFunding(blank, available, plans), blank, "Clearing an input remains possible.");
  const valid = { ...draft, walletUgx: "500", referralDays: "1" };
  assert.equal(capCheckoutFunding(valid, available, plans), valid, "Available choices stay unchanged.");
});

test("wallet contributions stay selectable even when the balance cannot cover the package", () => {
  const balances = { availableWalletUgx: 1000, availableReferralDays: 1 }, providers = { mtnNumber: "256700000123", airtelNumber: null };
  assert.equal(checkoutMethodAvailable("mtn", balances, providers), true);
  assert.equal(checkoutMethodAvailable("airtel", balances, providers), false);
  assert.equal(checkoutMethodAvailable("wallet", balances, providers), true);
  assert.equal(checkoutMethodAvailable("wallet", { ...balances, availableWalletUgx: 0 }, providers), false);
  assert.equal(checkoutMethodAvailable("referral", balances, providers), true);
  assert.equal(checkoutMethodAvailable("referral", { ...balances, availableReferralDays: 0 }, providers), false);
});

test("partial wallet funding remains editable and survives provider changes without spending", () => {
  const planId = randomUUID(), plans = [{ id: planId, priceUgx: 5000 }];
  const balances = { availableWalletUgx: 3000, availableReferralDays: 3 };
  const draft = { purpose: "plan", planId, method: "", useWallet: false, useReferral: true, walletUgx: "0", referralDays: "1", accepted: true };
  const wallet = chooseCheckoutMethod(draft, "wallet", true, balances, plans);
  assert.equal(wallet.useWallet, true); assert.equal(wallet.walletUgx, "3000"); assert.equal(wallet.method, "");
  const partial = capCheckoutFunding({ ...wallet, walletUgx: "1000" }, balances, plans);
  const mtn = chooseCheckoutMethod(partial, "mtn", true, balances, plans);
  const airtel = chooseCheckoutMethod(mtn, "airtel", true, balances, plans);
  assert.equal(airtel.walletUgx, "1000"); assert.equal(airtel.method, "airtel"); assert.equal(airtel.referralDays, "1");
  assert.equal(airtel.accepted, false);
  const removed = chooseCheckoutMethod(airtel, "wallet", false, balances, plans);
  assert.equal(removed.walletUgx, "0"); assert.equal(removed.useWallet, false); assert.equal(removed.method, "airtel");
  const full = chooseCheckoutMethod(draft, "wallet", true, { ...balances, availableWalletUgx: 6000 }, plans);
  assert.equal(full.method, "wallet"); assert.equal(full.walletUgx, "5000");
  assert.equal(capCheckoutFunding({ ...full, walletUgx: "500" }, balances, plans).method, "");
  const legacy = { ...airtel }; delete legacy.useWallet;
  assert.equal(capCheckoutFunding(legacy, balances, plans).useWallet, true);
  assert.equal(balances.availableWalletUgx, 3000, "Choosing funding never debits the wallet.");
});

test("referral days add to a paid package and also remain redeemable alone", () => {
  const planId = randomUUID(), plans = [{ id: planId, priceUgx: 5000 }];
  const balances = { availableWalletUgx: 3000, availableReferralDays: 7 };
  const draft = { purpose: "plan", planId, method: "mtn", useWallet: false, useReferral: false, walletUgx: "0", referralDays: "0", accepted: true };
  const combined = chooseCheckoutMethod(draft, "referral", true, balances, plans);
  assert.equal(combined.method, "mtn"); assert.equal(combined.purpose, "plan"); assert.equal(combined.referralDays, "7");
  assert.equal(combined.useReferral, true); assert.equal(combined.accepted, false);
  const wallet = chooseCheckoutMethod(combined, "wallet", true, balances, plans);
  assert.equal(wallet.method, "mtn"); assert.equal(wallet.walletUgx, "3000"); assert.equal(wallet.referralDays, "7");
  const removed = chooseCheckoutMethod(wallet, "referral", false, balances, plans);
  assert.equal(removed.referralDays, "0"); assert.equal(removed.walletUgx, "3000"); assert.equal(removed.method, "mtn");
  const alone = chooseCheckoutMethod({ ...draft, method: "" }, "referral", true, balances, plans);
  assert.equal(alone.purpose, "referral"); assert.equal(alone.method, "referral");
  const thenPaid = chooseCheckoutMethod(alone, "airtel", true, balances, plans);
  assert.equal(thenPaid.purpose, "plan"); assert.equal(thenPaid.method, "airtel"); assert.equal(thenPaid.referralDays, "7");
});

test("evidence dates accept provider formats, EAT and explicit zones without normalizing invalid calendar dates", () => {
  assert.equal(paymentEvidenceDate("Paid on 2026-11-01 16:20:30"), "2026-11-01T13:20:30.000Z");
  assert.equal(paymentEvidenceDate("Date: 01/11/2026 at 4:20 PM"), "2026-11-01T13:20:00.000Z");
  assert.equal(paymentEvidenceDate("01 November 2026, 04:20 AM"), "2026-11-01T01:20:00.000Z");
  assert.equal(paymentEvidenceDate("2026-11-01T13:20:00Z"), "2026-11-01T13:20:00.000Z");
  for (const value of ["31/02/2026 16:20", "01/11/2026 25:00", "01/11/2026 12:99", "Unknown date", "01/11/2026 00:20 AM"])
    assert.equal(paymentEvidenceDate(value), null);
});

test("checkout HTTP enforces identity, origin, upload content and rate limits with private responses", async () => {
  const member = { accountId: randomUUID(), tokenHash: "a".repeat(64), phone: "256700000123", blocked: false };
  let identity = member, allowed = true, called = 0;
  const services = async () => ({ config: { production: false }, settings: { settings: { paywallMode: "test" } }, sessions: { async verify() { return identity; } }, payments: {},
    checkout: { async allow() { return allowed; }, async confirm(_member, selection, requestKey, quoteKey, confirmed, proof, image) {
      called++; assert.equal(selection.purpose, "plan"); assert.equal(confirmed, true); assert.equal(proof.original.text, "original evidence"); assert.deepEqual(image, jpeg());
      return { ok: true, value: { requestKey, quoteKey } };
    } } });
  const handler = createCheckoutHandlers(services).POST;
  const request = (site = "same-origin", image = jpeg()) => {
    const form = new FormData(); form.set("payload", JSON.stringify({ action: "confirm", selection: { purpose: "plan" }, requestKey: randomUUID(), quoteKey: "signed-quote", confirmed: true, proof: { original: { text: "original evidence" } } }));
    form.set("image", new File([image], "screenshot.jpg", { type: "image/jpeg" }));
    return new Request("http://localhost/api/account/checkout", { method: "POST", headers: { "sec-fetch-site": site }, body: form });
  };
  assert.equal((await handler(request("cross-site"))).status, 403);
  identity = null; assert.equal((await handler(request())).status, 403); identity = member;
  allowed = false; assert.equal((await handler(request())).status, 429); allowed = true;
  assert.equal((await handler(request("same-origin", Buffer.from("spoofed image")))).status, 400);
  const response = await handler(request()); assert.equal(response.status, 200); assert.equal(called, 1);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.match(response.headers.get("x-robots-tag"), /noindex/);
});
