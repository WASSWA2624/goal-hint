import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { createAuthenticatedTestSessions } from "./helpers/member-fixtures.mjs";
import { createCheckout } from "../src/server/members/checkout.ts";
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
  await database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", mtnNumber: "256700000901", mtnName: "TEST MTN", airtelNumber: "256700000902", airtelName: "TEST AIRTEL", updatedAt: at, updatedBy: "test" } }));
  await database.query(tx => tx.subscriptionPlan.create({ data: { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 1, createdAt: at, updatedAt: at } }));
  const sessions = createAuthenticatedTestSessions({ database, config, now });
  const checkout = createCheckout({ database, config, now, environment: null }), review = createCheckoutReview(database, now);
  async function member() { const signed = await sessions.signIn(`25670000${String(++phone).padStart(4, "0")}`, "unknown"); return sessions.verify(signed.token); }
  async function fund(who, credit = 0, days = 0) {
    if (credit) { const codes = createAccessCodes({ database, now, notifications: silentPaymentNotifications });
      assert.equal((await codes.adjustCredit(who.accountId, credit, "Synthetic fixture", "test")).status, "saved"); }
    for (let i = 0; i < days; i++) await database.query(tx => tx.referralCredit.create({ data: { id: randomUUID(), accountId: who.accountId, referralId: randomUUID(), requestKey: randomUUID(), days: 1, kind: "award", createdAt: new Date(now()) } }));
  }
  const select = (patch = {}) => ({ purpose: "plan", planId, method: "mtn", walletUgx: 0, referralDays: 0, topUpUgx: 0, ...patch });
  const proof = (amountUgx = 5000, transactionId = `TEST${randomUUID().replaceAll("-", "").slice(0, 18)}`) => ({ transactionId, amountUgx, payerPhone: "256700000123", paidAt: new Date(now()).toISOString(), original: { text: "Synthetic payment evidence", extracted: { amountUgx } } });
  async function submit(who, selection = select(), receipt = proof(), requestKey = randomUUID()) {
    const quote = await checkout.quote(who, selection); assert.equal(quote.ok, true, quote.message);
    const saved = await checkout.confirm(who, selection, requestKey, quote.value.quoteKey, true, selection.method === "wallet" || selection.method === "referral" ? undefined : receipt);
    assert.equal(saved.ok, true, saved.message); return saved.value;
  }
  async function act(id, action) {
    const detail = await review.detail(id);
    return review.act(id, { revision: detail.revision, ...action }, "reviewer");
  }
  async function verify(id, amountUgx, index = 0) {
    const detail = await review.detail(id), claim = detail.claims.find(c => c.amountUgx === amountUgx && !c.receipt.verifiedAt) ?? detail.claims[index];
    return act(id, { action: "verify-receipt", receiptId: claim.receipt.id, amountUgx, recipient: detail.receivingNumber, senderPhone: "256700000123",
      receivedAt: new Date(now()).toISOString(), transactionChecked: true, recipientChecked: true, successfulReceipt: true, senderChecked: true });
  }
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
  await t.test("provider and recipient contradictions are refused without reserving balances or changing evidence", async () => {
    const who = await member(); await fund(who, 1000, 1);
    const selection = select({ method: "airtel", walletUgx: 1000, referralDays: 1 }), quote = await checkout.quote(who, selection);
    for (const original of [
      { text: "Paid UGX 4,000 to 0700000901. Transaction ID: WRONG12345", extracted: {} },
      { text: "Airtel. Paid UGX 4,000 to 0700000901. Transaction ID: WRONG12345", extracted: {} },
      { text: "", extracted: { screenshotText: "Paid UGX 4,000 to 0700000901. Transaction ID: WRONG12345" } },
    ]) {
      const refused = await checkout.confirm(who, selection, randomUUID(), quote.value.quoteKey, true, { ...proof(4000), original }, original.text ? null : jpeg());
      assert.equal(refused.ok, false); assert.match(refused.message, /receiving number/);
    }
    assert.equal(await database.query(tx => tx.paymentSubmission.count({ where: { accountId: who.accountId } })), 0);
    assert.equal((await checkout.read(who)).availableWalletUgx, 1000); assert.equal((await checkout.read(who)).availableReferralDays, 1);
    const request = await submit(who, selection, proof(4000));
    const before = (await review.detail(request.id)).claims[0];
    const correction = await checkout.attach(who, request.id, { ...proof(4000, before.receipt.transactionId), original: { text: "MTN. Paid UGX 4,000 to 0700000901", extracted: {} } });
    assert.equal(correction.ok, false);
    assert.deepEqual((await review.detail(request.id)).claims[0].corrections, before.corrections);
  });
  await t.test("combined funding, shortfall plus top-up, excess and concurrent approval allocate once", async () => {
    const who = await member(); await fund(who, 2000, 1);
    const request = await submit(who, select({ walletUgx: 2000, referralDays: 1 }), proof(1000));
    assert.equal(request.status, "pending"); assert.equal((await checkout.read(who)).availableWalletUgx, 0);
    assert.equal((await verify(request.id, 1000)).ok, true);
    const short = await act(request.id, { action: "approve-checkout" }); assert.equal(short.ok, false); assert.equal(short.code, "remaining");
    assert.equal((await checkout.read(who)).requests[0].remainingUgx, 2000);
    assert.equal((await checkout.attach(who, request.id, proof(4000))).ok, true);
    assert.equal((await verify(request.id, 4000, 1)).ok, true);
    const detail = await review.detail(request.id);
    const results = await Promise.all([1, 2].map(() => review.act(request.id, { action: "approve-checkout", revision: detail.revision }, "reviewer")));
    assert.ok(results.every(r => r.ok), JSON.stringify(results));
    const view = await checkout.read(who); assert.equal(view.availableWalletUgx, 2000); assert.equal(view.requests[0].status, "approved");
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { paymentSubmissionId: request.id } })), 1);
    assert.equal(await database.query(tx => tx.walletEntry.count({ where: { paymentSubmissionId: request.id, kind: "overpayment" } })), 1);
    assert.equal(await database.query(tx => tx.paymentReceipt.count({ where: { allocatedSubmissionId: request.id } })), 2);
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
    assert.equal((await act(request.id, { action: "reject-checkout", reason: "Correction required in the request" })).ok, true);
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
