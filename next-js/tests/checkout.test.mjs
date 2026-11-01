import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { checkoutMethodAvailable, checkoutSelectionSchema, receiptInputSchema, fundingAmounts } from "../src/domain/checkout.ts";
import { createCheckoutHandlers } from "../src/server/members/checkout-http.ts";
import { jpeg } from "./helpers/payment-fixtures.mjs";
import { paymentDateNotExtracted, paymentEvidenceDate } from "../src/domain/payment-evidence-date.ts";
import { checkoutDetailsIssue, checkoutEvidenceWarnings, inspectPaymentMessage, paymentDestinationMismatch, receiptEvidenceValidation } from "../src/domain/checkout-evidence.ts";
import { deleteGroupedDigit, digitCaret, groupInteger } from "../src/domain/input-format.ts";
import { formatNationalPhone, splitPhoneValue } from "../src/domain/phone-countries.ts";
import { capCheckoutFunding, chooseCheckoutMethod, chooseCheckoutPackage } from "../src/components/members/checkout-draft.ts";
import { inspectPaymentScreenshot, unreadableScreenshotMessage } from "../src/domain/payment-screenshot.ts";

test("screenshots need a readable transaction ID and amount, without treating OCR as verification", () => {
  const valid = inspectPaymentScreenshot("MTN Mobile Money. Paid UGX 5,000. Transaction ID: DEMO123456");
  assert.equal(valid.ok, true); assert.equal(valid.evidence.transactionId, "DEMO123456");
  for (const text of ["Holiday photo", "UGX 5,000", "Transaction ID: DEMO123456", "DEMO123456"])
    assert.deepEqual(inspectPaymentScreenshot(text), { ok: false, message: unreadableScreenshotMessage });
  assert.equal(inspectPaymentScreenshot("Airtel Money. Paid UGX 5,000. Transaction ID: DEMO123456").ok, true);
});

test("provider checks compare receiving numbers separately from branding and exclude the payer", () => {
  const numbers = { mtn: "256700000901", airtel: "256700000902" };
  for (const text of ["Paid UGX 5,000 to 0700000901. Transaction ID: TEST12345", "MTN. Paid UGX 5,000. Transaction ID: TEST12345", "Paid UGX 5,000. Transaction ID: TEST12345\n0700 000 901"])
    assert.match(paymentDestinationMismatch(text, "airtel", numbers), /selected Airtel/);
  assert.match(paymentDestinationMismatch("Airtel. Paid UGX 5,000 to 0700000901", "airtel", numbers), /receiving number/);
  assert.match(paymentDestinationMismatch("MTN. Paid UGX 5,000 to 0700000999", "mtn", numbers), /0700000901/);
  assert.equal(paymentDestinationMismatch("From: 0700000901. Paid UGX 5,000 to 0700000902", "airtel", numbers), null);
  const thread = "Paid UGX 1,000 to 0700000901. Transaction ID: OLD12345\nPaid UGX 5,000 to 0700000902. Transaction ID: NEW12345";
  assert.equal(paymentDestinationMismatch(thread, "airtel", numbers), null);
});

test("message paste requires a complete readable transaction; discrepancies are separate warnings", () => {
  const message = "MTN Mobile Money. You have sent UGX 5,000 to 0700000901. Transaction ID: TEST123456";
  const valid = inspectPaymentMessage(message);
  assert.equal(valid.ok, true); assert.equal(valid.evidence.transactionId, "TEST123456"); assert.equal(valid.evidence.amount, 5000);
  for (const text of ["", "shopping list", "5000", "TEST123456", "Transaction ID: TEST123456", "Paid UGX 5,000", "Fee UGX 500. Balance UGX 12,000. Transaction ID: TEST123456", `${message}${" ".repeat(12001)}`]) {
    const rejected = inspectPaymentMessage(text);
    assert.equal(rejected.ok, false); assert.match(rejected.message, /complete MTN or Airtel message/);
  }
  assert.equal(inspectPaymentMessage("Airtel Money. Paid UGX 5,000 to 0700000902. TID: AIR123456").ok, true);
});

test("structural validation requires evidence and valid fields while discrepancies remain advisory", () => {
  const text = "MTN. Paid UGX 5,000 to 0700000901. Transaction ID: TEST12345";
  const input = { text, screenshotText: "", hasImage: false, screenshotReady: false, transactionId: "TEST12345", amountUgx: "5000", payerPhone: "256700000123" };
  assert.equal(checkoutDetailsIssue(input), null);
  assert.match(checkoutDetailsIssue({ ...input, text: "" }), /at least one/);
  assert.equal(checkoutDetailsIssue({ ...input, text: "", screenshotText: text, hasImage: true, screenshotReady: true }), null);
  assert.match(checkoutDetailsIssue({ ...input, text: "", hasImage: true }), /Recheck/);
  assert.equal(checkoutDetailsIssue({ ...input, screenshotText: text.replace("TEST12345", "DIFFERENT998877"), hasImage: true, screenshotReady: true }), null);
});

test("advisory warnings cover method, source disagreements, entered fields and uncertain providers", () => {
  const numbers = { mtn: "256700000901", airtel: "256700000902" };
  const text = "MTN Mobile Money. Paid UGX 5,000 to 0700000901. Transaction ID: TEST12345";
  const input = { text, screenshotText: text, hasImage: true, transactionId: "TEST12345", amountUgx: "5000" };
  assert.deepEqual(checkoutEvidenceWarnings(input, "mtn", numbers), []);
  assert.ok(checkoutEvidenceWarnings({ ...input, screenshotText: text.replace("TEST12345", "TEST12346") }, "mtn", numbers).some(w => w.id === "sources.id"), "Even one differing ID character warrants an advisory check");
  assert.ok(checkoutEvidenceWarnings(input, "airtel", numbers).some(w => w.id === "message.method"));
  const other = "Airtel Money. Paid UGX 6,000 to 0700000902. Transaction ID: OTHER99887766";
  const ids = checkoutEvidenceWarnings({ ...input, screenshotText: other }, "mtn", numbers).map(w => w.id);
  for (const id of ["screenshot.method", "screenshot.reported-id", "screenshot.reported-amount", "sources.id", "sources.amount", "sources.provider", "sources.recipient"]) assert.ok(ids.includes(id), id);
  assert.ok(checkoutEvidenceWarnings({ ...input, text: "Transaction ID: TEST12345. Paid UGX 5,000", hasImage: false }, "mtn", numbers).some(w => w.id === "message.unknown-provider"));
  const warning = { id: "message.method", message: "Provider differs" }, fingerprint = "a".repeat(64);
  const original = { extracted: { validationVersion: 1, validationWarnings: JSON.stringify([warning]), validationFingerprint: fingerprint, selectedProvider: "mtn" } };
  assert.equal(receiptEvidenceValidation(original, []).reviewed, false);
  const history = [{ kind: "warning-review", validationFingerprint: fingerprint }];
  assert.equal(receiptEvidenceValidation(original, history).reviewed, true);
  assert.equal(receiptEvidenceValidation(original, [...history, { evidence: { extracted: { ...original.extracted, validationFingerprint: "b".repeat(64) } } }]).reviewed, false);
});

test("amount and phone displays retain canonical values and support edits around separators", () => {
  assert.equal(groupInteger("2500000"), "2,500,000"); assert.equal(groupInteger(""), "");
  assert.equal(digitCaret("2,500,000", 2), 3);
  assert.deepEqual(deleteGroupedDigit("12,345", 3, 3, "Backspace"), { value: "1,345", digitsBefore: 1 });
  assert.deepEqual(deleteGroupedDigit("12,345", 2, 2, "Delete"), { value: "12,45", digitsBefore: 2 });
  assert.equal(formatNationalPhone(splitPhoneValue("256700123456")), "700 123 456");
  assert.equal(formatNationalPhone(splitPhoneValue("12025550123")), "202 555 0123");
  assert.equal(formatNationalPhone(splitPhoneValue("447911123456")), "7911 123456");
  assert.equal(paymentDateNotExtracted({ extracted: { paymentDateSource: "submission" } }), true);
  for (const original of [null, {}, { extracted: { paymentDateSource: "evidence" } }]) assert.equal(paymentDateNotExtracted(original), false);
});

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
  const alone = chooseCheckoutMethod(chooseCheckoutPackage(draft, false, balances, plans), "referral", true, balances, plans);
  assert.equal(alone.purpose, "referral"); assert.equal(alone.method, "referral");
  const thenPaid = chooseCheckoutMethod(alone, "airtel", true, balances, plans);
  assert.equal(thenPaid.purpose, "plan"); assert.equal(thenPaid.method, "airtel"); assert.equal(thenPaid.referralDays, "7");
});

test("package selection is independent of provider, wallet and referral choices across edits and restoration", () => {
  const plans = [{ id: randomUUID(), priceUgx: 5000 }, { id: randomUUID(), priceUgx: 1000 }];
  const balances = { availableWalletUgx: 3000, availableReferralDays: 7 };
  const draft = { purpose: "plan", usePackage: true, planId: plans[0].id, method: "", useWallet: false, useReferral: false,
    walletUgx: "0", referralDays: "0", accepted: false };
  const both = chooseCheckoutMethod(draft, "referral", true, balances, plans);
  assert.equal(both.purpose, "plan", "Selecting referral days before a provider does not silently remove the package.");
  assert.equal(both.method, ""); assert.equal(both.referralDays, "7");
  const partial = chooseCheckoutMethod(both, "wallet", true, balances, plans);
  const alone = chooseCheckoutPackage(partial, false, balances, plans);
  assert.equal(alone.purpose, "referral"); assert.equal(alone.method, "referral");
  assert.equal(alone.walletUgx, "0"); assert.equal(alone.useWallet, false); assert.equal(alone.referralDays, "7");
  assert.equal(capCheckoutFunding(alone, balances, plans), alone, "Saved referral-only intent survives restoration.");
  const reselected = chooseCheckoutPackage(alone, true, balances, plans);
  assert.equal(reselected.purpose, "plan"); assert.equal(reselected.method, "");
  assert.equal(reselected.planId, plans[0].id); assert.equal(reselected.referralDays, "7");
  const packageOnly = chooseCheckoutMethod(reselected, "referral", false, balances, plans);
  assert.equal(packageOnly.purpose, "plan"); assert.equal(packageOnly.referralDays, "0");
  assert.equal(capCheckoutFunding({ ...both, referralDays: "99" }, { ...balances, availableReferralDays: 0 }, plans).referralDays, "0");
  const legacy = { ...alone }; delete legacy.usePackage;
  assert.equal(capCheckoutFunding(legacy, balances, plans).purpose, "referral");
  assert.deepEqual(balances, { availableWalletUgx: 3000, availableReferralDays: 7 }, "Choice changes never debit balances.");
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
  let identity = member, allowed = true, called = 0, checked = 0;
  const services = async () => ({ config: { production: false }, settings: { settings: { paywallMode: "test" } }, sessions: { async verify() { return identity; } }, payments: {},
    checkout: { async allow() { return allowed; }, async checkEvidence(_member, input) { checked++; assert.equal(input.provider, "mtn"); return { ok: true, value: { reuse: "available", imageRepeated: false } }; }, async confirm(_member, selection, requestKey, quoteKey, confirmed, proof, image) {
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
  const duplicatePhotos = await request().formData(); duplicatePhotos.append("image", new File([jpeg()], "second.jpg", { type: "image/jpeg" }));
  const refused = await handler(new Request("http://localhost/api/account/checkout", { method: "POST", headers: { "sec-fetch-site": "same-origin" }, body: duplicatePhotos }));
  assert.equal(refused.status, 400); assert.match((await refused.json()).message, /one screenshot per transaction/);
  const check = new FormData(); check.set("payload", JSON.stringify({ action: "check-evidence", evidence: { provider: "mtn", transactionId: "TEST1234" } }));
  const checkResponse = await handler(new Request("http://localhost/api/account/checkout", { method: "POST", headers: { "sec-fetch-site": "same-origin" }, body: check }));
  assert.equal(checkResponse.status, 200); assert.equal(checked, 1); assert.equal(checkResponse.headers.get("cache-control"), "no-store");
  const response = await handler(request()); assert.equal(response.status, 200); assert.equal(called, 1);
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.match(response.headers.get("x-robots-tag"), /noindex/);
});
