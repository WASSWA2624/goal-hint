import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { createAuthenticatedTestSessions } from "./helpers/member-fixtures.mjs";
import { createCheckout } from "../src/server/members/checkout.ts";
import { createSettingsService } from "../src/server/members/settings.ts";
import { createCheckoutReview } from "../src/server/admin/checkout-review.ts";
import { createMembersPurge } from "../src/server/members/purge.ts";
import { createAccessCodes, createAccessPeriod, lockMemberAccount } from "../src/server/members/access-codes.ts";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";
import { jpeg } from "./helpers/payment-fixtures.mjs";

test("checkout accounting and concurrent receipt reconciliation on real MySQL", { timeout: 240_000 }, async t => {
  let fixture;
  try { fixture = await paidDatabase(); } catch (e) { if (!(e instanceof MysqlServerUnavailableError)) throw e; t.skip(e.message); return; }
  t.after(() => fixture.close());
  const { database, config } = fixture;
  let instant = Date.parse("2026-11-01T09:00:00Z"), phone = 100;
  const now = () => instant, at = new Date(instant), planId = randomUUID();
  await database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test",
    mtnEnabled: true, mtnNumber: "256700000901", mtnName: "TEST MTN",
    airtelEnabled: true, airtelNumber: "256700000902", airtelName: "TEST AIRTEL", updatedAt: at, updatedBy: "test" } }));
  await database.query(tx => tx.subscriptionPlan.create({ data: { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 1, createdAt: at, updatedAt: at } }));
  const sessions = createAuthenticatedTestSessions({ database, config, now });
  const checkout = createCheckout({ database, config, now }), review = createCheckoutReview(database, now);
  async function member() { const signed = await sessions.signIn(`25670000${String(++phone).padStart(4, "0")}`, "unknown"); return sessions.verify(signed.token); }
  async function fund(who, credit = 0, days = 0) {
    if (credit) { const codes = createAccessCodes({ database, now, notifications: silentPaymentNotifications });
      assert.equal((await codes.adjustCredit(who.accountId, credit, "Synthetic fixture", "test")).status, "saved"); }
    for (let i = 0; i < days; i++) await database.query(tx => tx.referralCredit.create({ data: { id: randomUUID(), accountId: who.accountId, referralId: randomUUID(), requestKey: randomUUID(), days: 1, kind: "award", createdAt: new Date(now()) } }));
  }
  const select = (patch = {}) => ({ purpose: "plan", planId, method: "mtn", walletUgx: 0, referralDays: 0, topUpUgx: 0, ...patch });
  const proof = (amountUgx = 5000, transactionId = `TEST${randomUUID().replaceAll("-", "").slice(0, 18)}`) => ({ transactionId, amountUgx, warningsAccepted: true, payerPhone: "256700000123", paidAt: new Date(now()).toISOString(), original: { text: "Synthetic payment evidence", extracted: { amountUgx } } });
  async function submit(who, selection = select(), receipt = proof(), requestKey = randomUUID()) {
    const quote = await checkout.quote(who, selection); assert.equal(quote.ok, true, quote.message);
    const saved = await checkout.confirm(who, selection, requestKey, quote.value.quoteKey, true, selection.method === "wallet" || selection.method === "referral" ? undefined : receipt);
    assert.equal(saved.ok, true, saved.message); return saved.value;
  }
  async function act(id, action) {
    const detail = await review.detail(id);
    return review.act(id, { revision: detail.revision, ...action }, "reviewer");
  }
  const verification = (detail, claim, amountUgx) => ({
    receiptId: claim.receipt.id, amountUgx, recipient: detail.receivingNumber, senderPhone: "256700000123",
    receivedAt: new Date(now()).toISOString(), transactionChecked: true, recipientChecked: true, successfulReceipt: true, senderChecked: true,
  });
  async function reviewWarnings(id, claim) {
    if (!claim.validation.reviewed) assert.equal((await act(id, {
      action: "review-evidence", claimId: claim.id, warningsChecked: true, reason: "Checked the original evidence and incoming account records",
    })).ok, true);
  }
  async function verify(id, amountUgx, index = 0) {
    const detail = await review.detail(id), claim = detail.claims.find(c => c.amountUgx === amountUgx && !c.receipt.verifiedAt) ?? detail.claims[index];
    await reviewWarnings(id, claim);
    return act(id, { action: "verify-receipt", ...verification(detail, claim, amountUgx) });
  }
  await t.test("remembered provider follows the latest approved subscription, including legacy payments", async () => {
    const who = await member(), other = await member();
    let sequence = 0;
    const historyStart = now() - 86_400_000;
    async function history(patch = {}) {
      const reference = `H${String(++sequence).padStart(3, "0")}`;
      const decidedAt = new Date(historyStart + sequence * 60_000);
      return database.query(tx => tx.paymentSubmission.create({ data: {
        id: randomUUID(), reference, source: "checkout", accountId: who.accountId, workflowVersion: 2,
        purpose: "plan", planId, planName: "Weekly", durationDays: 7, priceUgx: 5000,
        method: "airtel", claimedNetwork: "airtel", claimedAmountUgx: 5000,
        status: "approved", submittedAt: decidedAt, decidedAt, decidedBy: "test", amountReceivedUgx: 5000,
        ...patch,
      } }));
    }
    assert.equal((await checkout.read(who)).lastMethod, null);
    await history({ source: "report", workflowVersion: 1, method: null, network: "mtn", approvedTxnKey: "mtn:HISTORYMTN001" });
    assert.equal((await checkout.read(who)).lastMethod, "mtn", "Legacy approval uses its verified network, not the claimed provider");

    await history({ purpose: "topup", planId: null, planName: "Account credit", durationDays: null });
    await history({ method: "wallet", claimedNetwork: "wallet", network: "airtel", walletUgx: 5000, amountReceivedUgx: 0 });
    await history({ purpose: "referral", planId: null, planName: "Referral days", durationDays: 0, priceUgx: 0,
      method: "referral", claimedNetwork: "referral", referralDays: 3, claimedAmountUgx: 0, amountReceivedUgx: 0 });
    for (const status of ["pending", "superseded", "rejected", "reversed", "remaining", "disputed", "correction", "reconfirm", "cancelled"]) {
      await history({ status });
    }
    await history({ reversedAt: new Date(now()) });
    await history({ accountId: other.accountId });
    assert.equal((await checkout.read(who)).lastMethod, "mtn", "Other purposes, unsuccessful reports, reversals and other accounts do not change the subscription preference");
    assert.equal((await checkout.read(other)).lastMethod, "airtel");

    const airtel = await history();
    assert.equal((await checkout.read(who)).lastMethod, "airtel");
    await history({ method: "mtn", claimedNetwork: "mtn", decidedAt: new Date(airtel.decidedAt.getTime() - 1) });
    assert.equal((await checkout.read(who)).lastMethod, "airtel", "Approval time takes precedence over report time");
    await history({ method: "mtn", claimedNetwork: "mtn", submittedAt: new Date(historyStart) });
    assert.equal((await checkout.read(who)).lastMethod, "mtn", "A later approval updates the preference even for an older report");

    const fresh = await member();
    await history({ accountId: fresh.accountId, purpose: "topup", planId: null, planName: "Account credit", durationDays: null });
    assert.equal((await checkout.read(fresh)).lastMethod, null, "A top-up alone does not establish a subscription provider");
  });
  await t.test("stored provider settings drive quotes and pending review even as payment destinations change", async () => {
    const who = await member();
    const settings = createSettingsService(database, { now, environment: null });
    const authorized = { password: null, sessionAuthorized: true, confirm: async () => assert.fail() };
    const mtn = select(), airtel = select({ method: "airtel" });
    const old = await checkout.quote(who, mtn);
    const other = await checkout.quote(who, airtel);
    assert.deepEqual([old.value.recipient, old.value.recipientName, other.value.recipient, other.value.recipientName],
      ["256700000901", "TEST MTN", "256700000902", "TEST AIRTEL"]);
    try {
      const disabled = await settings.save("test", { mtnEnabled: false }, authorized);
      assert.equal(disabled.status, "saved");
      assert.equal(disabled.settings.mtnNumber, "256700000901");
      const blocked = await checkout.quote(who, mtn);
      assert.deepEqual([blocked.ok, blocked.code], [false, "provider-unavailable"]);
      assert.match(blocked.message, /disabled/u);
      assert.equal((await checkout.quote(who, airtel)).ok, true);

      assert.equal((await settings.save("test", { mtnEnabled: true, mtnName: null }, authorized)).status, "saved");
      assert.match((await checkout.quote(who, mtn)).message, /incomplete or invalid/u);
      assert.equal((await settings.save("test", { mtnNumber: "0700000904", mtnName: "NEW MTN" }, authorized)).status, "saved");
      const current = await checkout.quote(who, mtn);
      assert.deepEqual([current.value.recipient, current.value.recipientName, current.value.priceUgx, current.value.amountToSend, current.value.durationDays],
        ["256700000904", "NEW MTN", 5000, 5000, 7]);
      assert.equal((await checkout.confirm(who, mtn, randomUUID(), old.value.quoteKey, true, proof())).code, "quote-changed");
      const request = await submit(who, mtn);
      assert.equal(request.status, "pending");
      assert.equal(await database.query(tx => tx.accessCode.count({ where: { accountId: who.accountId } })), 0);
      assert.equal((await settings.save("test", { mtnEnabled: false }, authorized)).status, "saved");
      assert.equal((await review.detail(request.id)).receivingNumber, "256700000904");
      assert.equal((await verify(request.id, 5000)).ok, true);
      assert.equal((await act(request.id, { action: "approve-checkout" })).ok, true);
      const audit = await database.query(tx => tx.ownerAuditEvent.findFirst({ where: { action: "settings_changed" }, orderBy: { id: "desc" } }));
      assert.deepEqual(audit.details.changes.mtnEnabled, { from: true, to: false });
    } finally {
      assert.equal((await settings.save("test", { mtnEnabled: true, mtnNumber: "0700000901", mtnName: "TEST MTN" }, authorized)).status, "saved");
    }
  });
  await t.test("wallet and referral purchases are explicit, immediate and idempotent", async () => {
    const who = await member(); await fund(who, 5000, 3);
    const selection = select({ method: "wallet", walletUgx: 5000, referralDays: 1 }), key = randomUUID();
    const quote = await checkout.quote(who, selection);
    assert.equal((await checkout.confirm(who, selection, key, quote.value.quoteKey, false)).ok, false);
    assert.equal((await checkout.read(who)).availableWalletUgx, 5000);
    const results = await Promise.all([1, 2].map(() => checkout.confirm(who, selection, key, quote.value.quoteKey, true)));
    assert.ok(results.every(r => r.ok)); assert.equal(results[0].value.id, results[1].value.id);
    assert.equal(results[0].value.status, "approved");
    assert.equal(Date.parse(results[0].value.endsAt) - now(), 8 * 86_400_000);
    const redeemed = await submit(who, select({ purpose: "referral", planId: null, method: "referral", referralDays: 2 }));
    assert.equal(redeemed.status, "approved"); assert.equal(redeemed.priceUgx, 0);
    assert.equal(Date.parse(redeemed.endsAt) - now(), 10 * 86_400_000);
    assert.equal((await checkout.read(who)).availableReferralDays, 0);
  });
  await t.test("a weekly purchase plus seven referral days grants fourteen days without reducing its cash price", async () => {
    const who = await member(); await fund(who, 0, 7);
    const selection = select({ referralDays: 7 }), quoted = await checkout.quote(who, selection);
    assert.equal(quoted.value.priceUgx, 5000); assert.equal(quoted.value.amountToSend, 5000);
    assert.equal(quoted.value.durationDays, 7); assert.equal(quoted.value.referralDays, 7);
    const request = await submit(who, selection, proof(5000));
    assert.equal(request.status, "pending");
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { paymentSubmissionId: request.id } })), 0);
    assert.equal((await verify(request.id, 5000)).ok, true);
    assert.equal((await act(request.id, { action: "approve-checkout" })).ok, true);
    const view = await checkout.read(who);
    assert.equal(Date.parse(view.requests[0].endsAt) - now(), 14 * 86_400_000);
    assert.equal(view.availableReferralDays, 0);
  });
  await t.test("external funding rejects contributions above spendable balances without creating a request", async () => {
    const who = await member(); await fund(who, 2000, 2);
    for (const method of ["mtn", "airtel"]) for (const patch of [{ walletUgx: 2001 }, { referralDays: 3 }]) {
      const selection = select({ method, ...patch }), quoted = await checkout.quote(who, selection);
      assert.equal(quoted.ok, false); assert.equal(quoted.code, "balance-changed");
      assert.equal((await checkout.confirm(who, selection, randomUUID(), "invalid", true, proof())).ok, false);
    }
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: who.accountId } })), 0);
    assert.equal((await checkout.read(who)).availableWalletUgx, 2000);
    assert.equal((await checkout.read(who)).availableReferralDays, 2);
  });
  await t.test("an external receipt requires a message or screenshot; extraction failure still allows manual corrections", async () => {
    const who = await member(), selection = select(), quoted = await checkout.quote(who, selection);
    const missing = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true,
      { ...proof(), original: { text: "   ", extracted: {} } });
    assert.equal(missing.ok, false); assert.match(missing.message, /message or screenshot/);
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: who.accountId } })), 0);
    const valid = await submit(who, selection, { ...proof(), original: { text: "Unreadable transaction message; fields corrected manually", extracted: {} } });
    assert.equal(valid.status, "pending");
  });
  await t.test("image transcripts require their image and cannot corroborate their own OCR", async () => {
    const who = await member(), selection = select(), quoted = await checkout.quote(who, selection);
    const receipt = proof(), raw = `Paid UGX 5,000. Transaction ID: ${receipt.transactionId}`;
    const original = { text: `MTN. ${raw}`, extracted: { messageSource: "image", screenshotText: raw } };
    const imageProof = { ...receipt, original, warningsAccepted: false };
    const orphan = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, imageProof);
    assert.equal(orphan.ok, false); assert.equal(orphan.code, "evidence-source");
    const missingRaw = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true,
      { ...imageProof, original: { ...original, extracted: { messageSource: "image" } } }, jpeg());
    assert.equal(missingRaw.ok, false); assert.equal(missingRaw.code, "evidence-source");
    const malformed = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true,
      { ...imageProof, original: { ...original, extracted: { ...original.extracted, messageSource: null } } }, jpeg());
    assert.equal(malformed.ok, false);
    const unacknowledged = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, imageProof, jpeg());
    assert.equal(unacknowledged.ok, false); assert.equal(unacknowledged.code, "evidence-warning");
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: who.accountId } })), 0);

    const saved = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, { ...imageProof, warningsAccepted: true }, jpeg());
    assert.equal(saved.ok, true); assert.equal(saved.value.status, "pending");
    const detail = await review.detail(saved.value.id), claim = detail.claims[0];
    assert.equal(claim.original.text, original.text);
    assert.equal(claim.original.extracted.screenshotText, raw);
    assert.equal(claim.original.extracted.messageSource, "image");
    assert.deepEqual(claim.validation.warnings.map(warning => warning.id), ["screenshot.unknown-provider"]);
    assert.equal(claim.validation.reviewed, false);
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { accountId: who.accountId } })), 0);

    const detached = await checkout.attach(who, saved.value.id, { ...imageProof, warningsAccepted: true });
    assert.equal(detached.ok, false); assert.equal(detached.code, "evidence-source");
    const after = await review.detail(saved.value.id);
    assert.deepEqual(after.claims[0].original, claim.original, "Rejected detachment preserves the original evidence");
    assert.equal(after.revision, detail.revision);
  });
  await t.test("evidence checks find reused IDs privately, scope images to their owner and preserve one photo", async () => {
    const a = await member(), b = await member(), image = jpeg(), receipt = proof(), selection = select();
    const quote = await checkout.quote(a, selection);
    const saved = await checkout.confirm(a, selection, randomUUID(), quote.value.quoteKey, true, receipt, image);
    assert.equal(saved.ok, true);
    const input = { provider: "mtn", transactionId: receipt.transactionId, imageSha256: createHash("sha256").update(image).digest("hex") };
    const own = await checkout.checkEvidence(a, input);
    assert.equal(own.value.reuse, "own"); assert.equal(own.value.reference, saved.value.reference); assert.equal(own.value.imageRepeated, true);
    const current = await checkout.checkEvidence(a, { ...input, submissionId: saved.value.id });
    assert.equal(current.value.reuse, "current"); assert.equal(current.value.imageRepeated, false);
    const other = await checkout.checkEvidence(b, { ...input, submissionId: saved.value.id });
    assert.deepEqual(other.value, { reuse: "reported", imageRepeated: false });
    const another = await checkout.checkEvidence(a, { ...input, transactionId: "UNUSED123456" });
    assert.equal(another.value.reuse, "available"); assert.equal(another.value.imageRepeated, true);
    assert.equal((await checkout.checkEvidence(b, { ...input, provider: "airtel" })).value.reuse, "available");
    for (let i = 0; i < 2; i++) assert.equal((await checkout.attach(a, saved.value.id, receipt, image)).ok, true);
    assert.equal(await database.query(tx => tx.paymentReceiptClaim.count({ where: { submissionId: saved.value.id } })), 1);
    assert.equal(await database.query(tx => tx.paymentReceiptEvidence.count({ where: { claim: { submissionId: saved.value.id } } })), 0);
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: b.accountId } })), 0);
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { paymentSubmissionId: saved.value.id } })), 0);
  });
  await t.test("completed weak OCR accepts manual corrections only as unverified evidence with fresh warning consent", async () => {
    const who = await member(), selection = select(), quoted = await checkout.quote(who, selection), image = jpeg();
    const receipt = proof(), quality = { confidence: 100, fieldConfidence: { transactionId: 100, amountUgx: 100 },
      uncertainFields: [], attempts: 1, enhanced: false };
    const imageProof = { ...receipt, warningsAccepted: false, original: { text: `MTN. Paid UGX 5,000. Transaction ID: ${receipt.transactionId}`,
      extracted: { messageSource: "image", screenshotText: "", screenshotOcr: JSON.stringify(quality) } } };
    const unacknowledged = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, imageProof, image);
    assert.equal(unacknowledged.ok, false); assert.equal(unacknowledged.code, "evidence-warning");
    const detached = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, { ...imageProof, warningsAccepted: true });
    assert.equal(detached.ok, false); assert.equal(detached.code, "evidence-source");
    const saved = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, { ...imageProof, warningsAccepted: true }, image);
    assert.equal(saved.ok, true); assert.equal(saved.value.status, "pending"); assert.equal(saved.value.verifiedUgx, 0);
    let detail = await review.detail(saved.value.id), claim = detail.claims[0];
    assert.equal(claim.receipt.verifiedAt, null); assert.equal(claim.validation.reviewed, false);
    assert.equal(claim.original.extracted.screenshotText, "");
    for (const id of ["screenshot.ocr-transactionId", "screenshot.ocr-amountUgx"])
      assert.ok(claim.validation.warnings.some(warning => warning.id === id), "Claimed perfect confidence cannot erase missing raw evidence");
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { accountId: who.accountId } })), 0);
    assert.equal((await checkout.checkEvidence(who, { provider: "mtn", transactionId: receipt.transactionId })).value.reuse, "own");
    await reviewWarnings(saved.value.id, claim);
    const reviewed = await review.detail(saved.value.id);
    assert.equal(reviewed.claims[0].validation.reviewed, true);
    const corrected = { ...imageProof, warningsAccepted: true, original: { ...imageProof.original,
      extracted: { ...imageProof.original.extracted, screenshotOcr: JSON.stringify({ ...quality, confidence: 50, attempts: 2, enhanced: true }) } } };
    const correction = await checkout.attach(who, saved.value.id, corrected, image);
    assert.equal(correction.ok, true);
    detail = await review.detail(saved.value.id); claim = detail.claims[0];
    assert.notEqual(claim.validation.fingerprint, reviewed.claims[0].validation.fingerprint);
    assert.equal(claim.validation.reviewed, false, "Changed recognition evidence requires fresh admin review");
    assert.equal(claim.receipt.verifiedAt, null);
    const malformed = await checkout.attach(who, saved.value.id, { ...corrected, original: { ...corrected.original,
      extracted: { ...corrected.original.extracted, screenshotOcr: JSON.stringify({ ...quality, confidence: 101 }) } } }, image);
    assert.equal(malformed.ok, false);
    assert.equal((await review.detail(saved.value.id)).revision, detail.revision);

    const other = await member(), complete = proof(), otherQuote = await checkout.quote(other, selection);
    const text = `MTN. Paid UGX 5,000 to 0700000901. Transaction ID: ${complete.transactionId}`;
    const highConfidence = await checkout.confirm(other, selection, randomUUID(), otherQuote.value.quoteKey, true,
      { ...complete, warningsAccepted: false, original: { text, extracted: { messageSource: "image", screenshotText: text, screenshotOcr: JSON.stringify(quality) } } }, image);
    assert.equal(highConfidence.ok, true); assert.equal(highConfidence.value.status, "pending"); assert.equal(highConfidence.value.verifiedUgx, 0);
    const highClaim = (await review.detail(highConfidence.value.id)).claims[0];
    assert.deepEqual(highClaim.validation.warnings, []); assert.equal(highClaim.receipt.verifiedAt, null, "Recognition confidence never verifies payment");
  });
  await t.test("evidence warnings require customer acknowledgement and a separate admin review before approval", async () => {
    const who = await member(); await fund(who, 1000, 1);
    const selection = select({ method: "airtel", walletUgx: 1000, referralDays: 1 }), quote = await checkout.quote(who, selection);
    for (const original of [
      { text: "Paid UGX 4,000 to 0700000901. Transaction ID: WRONG12345", extracted: {} },
      { text: "Airtel. Paid UGX 4,000 to 0700000901. Transaction ID: WRONG12345", extracted: {} },
      { text: "", extracted: { screenshotText: "Paid UGX 4,000 to 0700000901. Transaction ID: WRONG12345" } },
      { text: "MTN. Paid UGX 4,000 to 0700000901", extracted: { validationVersion: 1, validationWarnings: "[]", validationFingerprint: "forged" } },
    ]) {
      const refused = await checkout.confirm(who, selection, randomUUID(), quote.value.quoteKey, true, { ...proof(4000), warningsAccepted: false, original }, original.text ? null : jpeg());
      assert.equal(refused.ok, false); assert.equal(refused.code, "evidence-warning");
    }
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: who.accountId } })), 0);
    assert.equal((await checkout.read(who)).availableWalletUgx, 1000); assert.equal((await checkout.read(who)).availableReferralDays, 1);
    const request = await submit(who, selection, proof(4000));
    const before = (await review.detail(request.id)).claims[0];
    const correction = await checkout.attach(who, request.id, { ...proof(4000, before.receipt.transactionId), original: { text: "MTN. Paid UGX 4,000 to 0700000901", extracted: {} } });
    assert.equal(correction.ok, true);
    let claim = (await review.detail(request.id)).claims[0];
    assert.equal(claim.validation.reviewed, false); assert.ok(claim.validation.warnings.some(w => w.id === "message.method"));
    assert.equal((await act(request.id, { action: "approve-checkout" })).code, "evidence-review");
    assert.equal((await act(request.id, { action: "review-evidence", claimId: claim.id, warningsChecked: false, reason: "Checked incoming records" })).ok, false);
    assert.equal((await act(request.id, { action: "verify-receipt", receiptId: claim.receipt.id, amountUgx: 4000, recipient: "256700000901", senderPhone: "256700000123",
      receivedAt: new Date(now()).toISOString(), transactionChecked: true, recipientChecked: true, successfulReceipt: true, senderChecked: true })).ok, false, "An MTN transfer cannot be verified against the selected Airtel receiving account");
    assert.equal((await act(request.id, { action: "review-evidence", claimId: claim.id, warningsChecked: true, reason: "Requested clarification of the provider discrepancy" })).ok, true);
    assert.equal((await review.detail(request.id)).claims[0].validation.reviewed, true);
    assert.equal((await act(request.id, { action: "approve-checkout" })).ok, false, "Reviewing a warning never verifies incoming funds");
    await checkout.attach(who, request.id, { ...proof(4001, claim.receipt.transactionId), original: { text: "MTN. Paid UGX 4,001 to 0700000901", extracted: {} } });
    claim = (await review.detail(request.id)).claims[0]; assert.equal(claim.validation.reviewed, false, "New evidence invalidates the previous admin review");
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { paymentSubmissionId: request.id } })), 0);
  });
  await t.test("combined funding, shortfall plus top-up, excess and concurrent approval allocate once", async () => {
    const who = await member(); await fund(who, 2000, 1);
    const request = await submit(who, select({ walletUgx: 2000, referralDays: 1 }), proof(1000));
    assert.equal(request.status, "pending"); assert.equal((await checkout.read(who)).availableWalletUgx, 0);
    const initial = await review.detail(request.id);
    await reviewWarnings(request.id, initial.claims[0]);
    const short = await act(request.id, { action: "approve-checkout", receipts: [verification(initial, initial.claims[0], 1000)] });
    assert.equal(short.ok, false); assert.equal(short.code, "remaining");
    assert.equal((await review.detail(request.id)).verifiedUgx, 1000);
    assert.equal((await checkout.read(who)).requests[0].remainingUgx, 2000);
    assert.equal((await checkout.attach(who, request.id, proof(4000))).ok, true);
    const attached = await review.detail(request.id);
    for (const claim of attached.claims) await reviewWarnings(request.id, claim);
    const detail = await review.detail(request.id);
    const first = detail.claims.find(claim => claim.amountUgx === 1000), second = detail.claims.find(claim => claim.amountUgx === 4000);
    const invalid = await act(request.id, { action: "approve-checkout", receipts: [verification(detail, first, 1500), {
      ...verification(detail, second, 4000), recipient: "256700000999",
    }] });
    assert.equal(invalid.ok, false);
    assert.equal((await review.detail(request.id)).verifiedUgx, 1000, "An invalid second receipt must leave the first receipt intact");
    const receipts = [verification(detail, second, 4000)];
    const results = await Promise.all([1, 2].map(() => review.act(request.id, { action: "approve-checkout", revision: detail.revision, receipts }, "reviewer")));
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    const view = await checkout.read(who); assert.equal(view.availableWalletUgx, 2000); assert.equal(view.requests[0].status, "approved");
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { paymentSubmissionId: request.id } })), 1);
    assert.equal(await database.query(tx => tx.walletEntry.count({ where: { paymentSubmissionId: request.id, kind: "overpayment" } })), 1);
    assert.equal(await database.query(tx => tx.paymentReceipt.count({ where: { allocatedSubmissionId: request.id } })), 2);
  });
  await t.test("wallet top-ups credit verified funds once without granting access or replacing a pending subscription", async () => {
    const who = await member(), selection = select({ purpose: "topup", planId: null, topUpUgx: 5000 });
    for (const topUpUgx of [999, 500001]) assert.equal((await checkout.quote(who, { ...selection, topUpUgx })).ok, false);
    const subscription = await submit(who), topUp = await submit(who, selection);
    const pending = await checkout.read(who);
    assert.equal(pending.availableWalletUgx, 0);
    assert.equal(pending.requests.find(request => request.id === subscription.id).status, "pending");
    assert.equal(pending.requests.find(request => request.id === topUp.id).status, "pending");

    assert.equal((await verify(topUp.id, 5000)).ok, true);
    assert.equal((await checkout.read(who)).availableWalletUgx, 0, "Verification alone does not credit the wallet");
    assert.equal((await act(topUp.id, { action: "approve-checkout" })).ok, true);
    assert.equal((await act(topUp.id, { action: "approve-checkout" })).ok, true);
    const approved = await checkout.read(who);
    assert.equal(approved.availableWalletUgx, 5000);
    assert.equal(approved.requests.find(request => request.id === topUp.id).status, "approved");
    assert.equal(approved.requests.find(request => request.id === subscription.id).status, "pending");
    assert.equal(await database.query(tx => tx.walletEntry.count({ where: { paymentSubmissionId: topUp.id, kind: "topup" } })), 1);
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { accountId: who.accountId } })), 0);
  });
  await t.test("duplicate same-customer receipts restore request; competing ownership blocks allocation and preserves approved access", async () => {
    const a = await member(), b = await member(), receipt = proof();
    const original = await submit(a, select(), receipt), duplicate = await submit(a, select(), receipt);
    assert.equal(duplicate.id, original.id);
    const competing = await submit(b, select(), receipt); assert.equal(competing.status, "disputed");
    assert.equal((await act(original.id, { action: "approve-checkout" })).ok, false);
    assert.equal((await verify(original.id, 5000)).ok, true);
    const detail = await review.detail(original.id), receiptId = detail.claims[0].receipt.id;
    assert.equal((await act(original.id, { action: "resolve-dispute", receiptId, intendedSubmissionId: original.id, reason: "Verified payer intended this subscriber", contactedVerifiedPayer: true, ownershipClear: true })).ok, true);
    assert.equal((await act(original.id, { action: "approve-checkout" })).ok, true);
    const third = await member(); const late = await submit(third, select(), receipt);
    assert.equal(late.status, "disputed");
    assert.equal((await checkout.read(a)).requests[0].status, "approved");
    assert.equal((await act(late.id, { action: "approve-checkout" })).ok, false);
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { accountId: a.accountId, revokedAt: null } })), 1);
  });
  await t.test("rejection/cancellation release reservations and retain verified unapplied money", async () => {
    const who = await member(); await fund(who, 2000, 2);
    const request = await submit(who, select({ walletUgx: 2000, referralDays: 1 }), proof(3000)); await verify(request.id, 3000);
    assert.equal((await act(request.id, { action: "reject-checkout", preset: "other" })).ok, false);
    assert.equal((await act(request.id, { action: "reject-checkout", presets: [] })).ok, false);
    assert.equal((await act(request.id, { action: "reject-checkout", presets: ["amount-mismatch", "other"] })).ok, false);
    assert.equal((await act(request.id, { action: "reject-checkout", presets: ["amount-mismatch", "wrong-number"] })).ok, true);
    const rejected = await database.query(tx => tx.paymentSubmission.findUniqueOrThrow({ where: { id: request.id }, select: { rejectReason: true, rejectText: true } }));
    assert.deepEqual(rejected, { rejectReason: "amount-mismatch", rejectText: "Wrong amount · Wrong recipient" });
    assert.equal((await checkout.read(who)).availableWalletUgx, 2000);
    const receipt = (await review.detail(request.id)).claims[0].receipt;
    assert.ok(receipt.verifiedAt); assert.equal(receipt.allocatedSubmissionId, null);
    const second = await submit(who, select({ walletUgx: 1000, referralDays: 1 }));
    assert.equal((await checkout.cancel(who, second.id)).ok, true);
    assert.equal((await checkout.read(who)).availableReferralDays, 2);
  });
  await t.test("stale quotes and expired reservations require explicit confirmation", async () => {
    const who = await member(); await fund(who, 1000, 1);
    const selection = select({ walletUgx: 1000 }), quote = await checkout.quote(who, selection);
    await fund(who, 1000);
    const stale = await checkout.confirm(who, selection, randomUUID(), quote.value.quoteKey, true, proof());
    assert.equal(stale.ok, false); assert.equal(stale.code, "quote-changed");
    const request = await submit(who, selection, proof(4000)); await verify(request.id, 4000);
    instant += 49 * 3_600_000;
    assert.equal((await act(request.id, { action: "approve-checkout" })).ok, false);
    assert.equal((await checkout.read(who)).requests[0].status, "reconfirm");
    assert.equal((await checkout.reconfirm(who, request.id, 1000, 0, 4000, false)).ok, false);
    assert.equal((await checkout.reconfirm(who, request.id, 1000, 0, 4000, true)).ok, true);
    assert.equal((await act(request.id, { action: "approve-checkout" })).ok, true);
    assert.equal(Date.parse((await checkout.read(who)).requests[0].endsAt) - now(), 7 * 86_400_000);
  });
  await t.test("provider identity is independent of images and another provider's transaction IDs", async () => {
    const a = await member(), b = await member(), input = proof(), image = jpeg();
    const firstQuote = await checkout.quote(a, select());
    const first = await checkout.confirm(a, select(), randomUUID(), firstQuote.value.quoteKey, true, input, image);
    const airtel = select({ method: "airtel" }), secondQuote = await checkout.quote(b, airtel);
    const second = await checkout.confirm(b, airtel, randomUUID(), secondQuote.value.quoteKey, true, input, image);
    assert.equal(first.value.status, "pending"); assert.equal(second.value.status, "pending");
    assert.equal((await verify(first.value.id, 5000)).ok, true); assert.equal((await verify(second.value.id, 5000)).ok, true);
    assert.equal((await act(first.value.id, { action: "approve-checkout" })).ok, true);
    assert.equal((await act(second.value.id, { action: "approve-checkout" })).ok, true);
  });
  await t.test("corrections retain original evidence and incorrect unverified claims can be withdrawn", async () => {
    const who = await member(), original = proof(1000), request = await submit(who, select(), original);
    const before = await review.detail(request.id);
    const corrected = { ...original, amountUgx: 5000, original: { text: "Additional customer statement", extracted: {} } };
    assert.equal((await checkout.attach(who, request.id, corrected)).ok, true);
    const after = await review.detail(request.id);
    assert.equal(after.claims[0].original.text, original.original.text);
    assert.equal(after.claims[0].amountUgx, 5000); assert.ok(Array.isArray(after.claims[0].corrections));
    assert.equal((await checkout.withdraw(who, request.id, before.claims[0].id)).ok, true);
    assert.equal((await checkout.read(who)).requests[0].receipts[0].withdrawn, true);
    assert.equal((await checkout.attach(who, request.id, corrected)).ok, true);
    assert.equal((await verify(request.id, 5000)).ok, true);
    assert.equal((await checkout.withdraw(who, request.id, before.claims[0].id)).ok, false);
    assert.equal((await act(request.id, { action: "approve-checkout" })).ok, true);
  });
  await t.test("concurrent distinct wallet confirmations cannot spend the same funds twice", async () => {
    const who = await member(); await fund(who, 5000);
    const selection = select({ method: "wallet", walletUgx: 5000 }), quote = await checkout.quote(who, selection);
    const results = await Promise.all([1, 2].map(() => checkout.confirm(who, selection, randomUUID(), quote.value.quoteKey, true)));
    assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await checkout.read(who)).availableWalletUgx, 0);
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { accountId: who.accountId } })), 1);
  });
  await t.test("legacy wallet purchases respect external reservations", async () => {
    const who = await member(); await fund(who, 5000);
    const request = await submit(who, select({ walletUgx: 4000 }), proof(1000));
    const codes = createAccessCodes({ database, now, notifications: silentPaymentNotifications });
    const denied = await codes.purchaseWithCredit(who, { planId, requestKey: randomUUID(), accepted: true });
    assert.equal(denied.status, "insufficient");
    assert.equal((await checkout.cancel(who, request.id)).ok, true);
    assert.equal((await codes.purchaseWithCredit(who, { planId, requestKey: randomUUID(), accepted: true })).status, "created");
  });
  await t.test("renewal starts at the existing expiry including historical earned access, without counting it twice", async () => {
    const who = await member(); await fund(who, 5000, 1);
    const reward = await database.transaction(async tx => createAccessPeriod(tx, await lockMemberAccount(tx, who.accountId), {
      source: "referral", planName: "Historical earned day", durationDays: 1, priceUgx: 0, amountReceivedUgx: 0,
    }, "historical-fixture", new Date(now()), { maximum: 1 }));
    const request = await submit(who, select({ method: "wallet", walletUgx: 5000, referralDays: 1 }));
    const code = await database.query(tx => tx.accessCode.findUniqueOrThrow({ where: { paymentSubmissionId: request.id } }));
    assert.equal(+code.startsAt, +reward.endsAt); assert.equal(Date.parse(request.endsAt), +reward.endsAt + 8 * 86_400_000);
    const codes = createAccessCodes({ database, now, notifications: silentPaymentNotifications });
    await codes.manual({ phone: who.phone, durationDays: 2, amountReceivedUgx: 0, note: "Synthetic later manual grant" }, "test");
    const last = await database.query(tx => tx.accessCode.findFirst({ where: { accountId: who.accountId, revokedAt: null }, orderBy: { endsAt: "desc" } }));
    assert.equal(+last.endsAt, +reward.endsAt + 10 * 86_400_000);
  });
  await t.test("pending evidence leaves the trial available, and approved paid access forfeits or follows it", async () => {
    const codes = createAccessCodes({ database, now, notifications: silentPaymentNotifications });
    for (const method of ["mtn", "airtel"]) {
      const who = await member(), activateFirst = method === "airtel";
      await database.query(tx => tx.memberAccount.update({ where: { id: who.accountId }, data: { trialEligibleAt: new Date(now()) } }));
      const request = await submit(who, select({ method }));
      assert.equal(request.status, "pending");
      assert.deepEqual((await codes.subscriptionStatus(who)).trial, { state: "available" });
      const trial = activateFirst ? await codes.activateTrial(who) : null;
      if (activateFirst) {
        assert.equal(trial.state, "active");
        await database.transaction(async tx => createAccessPeriod(tx, await lockMemberAccount(tx, who.accountId), {
          source: "referral", planName: "Earned day", durationDays: 1, priceUgx: 0, amountReceivedUgx: 0,
        }, "test", new Date(now()), { maximum: 2 }));
        await fund(who, 0, 1);
        const redemption = await submit(who, select({ purpose: "referral", planId: null, method: "referral", referralDays: 1 }));
        assert.equal(redemption.status, "approved");
      }
      assert.equal((await verify(request.id, 5000)).ok, true);
      assert.equal((await codes.subscriptionStatus(who)).trial.state, activateFirst ? "active" : "available");
      assert.equal((await act(request.id, { action: "approve-checkout" })).ok, true);
      const paid = await database.query(tx => tx.accessCode.findUniqueOrThrow({ where: { paymentSubmissionId: request.id } }));
      assert.equal(+paid.startsAt, trial ? Date.parse(trial.endsAt) : now());
      assert.equal(+paid.endsAt - +paid.startsAt, 7 * 86_400_000);
      if (trial) {
        const earned = await database.query(tx => tx.accessCode.findMany({ where: { accountId: who.accountId, priceUgx: 0, source: { not: "trial" } }, orderBy: { startsAt: "asc" } }));
        assert.deepEqual(earned.map(code => [+code.startsAt - +paid.endsAt, +code.endsAt - +code.startsAt]), [[0, 86_400_000], [86_400_000, 86_400_000]]);
      } else {
        assert.deepEqual((await codes.subscriptionStatus(who)).trial, { state: "forfeited" });
        assert.deepEqual(await codes.activateTrial(who), { state: "unavailable" });
      }
    }
  });
  await t.test("retention removes closed evidence while preserving disputed and verified-unallocated funds", async () => {
    const closed = await member(), held = await member(), disputed = await member();
    async function withImage(who) {
      const selection = select(), quoted = await checkout.quote(who, selection);
      const result = await checkout.confirm(who, selection, randomUUID(), quoted.value.quoteKey, true, proof(), jpeg());
      assert.equal(result.ok, true, result.message); return result.value;
    }
    const a = await withImage(closed), b = await withImage(held), c = await withImage(disputed);
    await verify(a.id, 5000); await act(a.id, { action: "approve-checkout" });
    await verify(b.id, 5000); await checkout.cancel(held, b.id);
    await act(c.id, { action: "mark-disputed", reason: "Ownership requires provider reconciliation" });
    const oldClaim = (await review.detail(a.id)).claims[0].id;
    const heldClaim = (await review.detail(b.id)).claims[0].id;
    const disputedClaim = (await review.detail(c.id)).claims[0].id;
    instant += 100 * 86_400_000;
    assert.equal((await createMembersPurge(database, now).run()).claimed, true);
    assert.equal(await review.image(a.id, oldClaim), null);
    assert.ok(await review.image(b.id, heldClaim)); assert.ok(await review.image(c.id, disputedClaim));
    assert.equal((await review.detail(b.id)).claims[0].receipt.allocatedSubmissionId, null);
  });
});
