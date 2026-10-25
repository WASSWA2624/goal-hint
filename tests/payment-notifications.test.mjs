import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createReviewHandlers } from "../src/server/admin/codes-http.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createPaymentNotifications, enqueuePaymentNotice } from "../src/server/members/payment-notifications.ts";
import { YoolaMessagingError } from "../src/server/members/yoola-messaging.ts";
import { memberStore, recordingDelivery } from "./helpers/member-store.mjs";

const instant = Date.parse("2026-12-24T22:30:00Z"), day = 86_400_000;
const owner = "synthetic-owner";

/** Decisions with an injected delivery that records the committed notice it was handed. */
function fixture() {
  const f = memberStore({ instant }), delivered = [];
  const notifications = { async deliver(id) {
    const row = f.committed.paymentNotice.find(notice => notice.id === id);
    assert.ok(row, "delivery follows the committed notice");
    delivered.push(row); return "sent";
  } };
  const of = kind => delivered.filter(row => row.kind === kind);
  // The store's getters (state, committed, member) stay live through the prototype.
  return Object.assign(Object.create(f), { delivered, notifications, approvals: () => of("approved"), rejections: () => of("rejected"),
    codes: (overrides = {}) => createAccessCodes({ database: f.database, now: () => instant, notifications, ...overrides }),
    review: (overrides = {}) => createPaymentReview(f.database, () => instant, { notifications, ...overrides }) });
}
/** One committed notice of `kind` and the real outbox service sending it through a recording adapter. */
async function sent(kind, { answer, phone } = {}) {
  const f = memberStore({ instant }), { sent: messages, delivery } = recordingDelivery({ answer });
  if (phone !== undefined) f.member.phone = phone;
  const notifications = createPaymentNotifications({ database: f.database, now: () => instant, delivery });
  const id = await f.database.transaction(tx => enqueuePaymentNotice(tx, { accountId: f.account.id, kind, targetId: randomUUID(), at: new Date(instant) }));
  return { f, messages, status: await notifications.deliver(id), notice: () => f.state.paymentNotice.find(row => row.id === id) };
}

test("payment approval writes its notice in the decision and delivers it after commit, with the real renewal expiry", async () => {
  const f = fixture(), first = f.report(), codes = f.codes();
  const approved = await codes.approvePayment(first.id, f.fields(), owner);
  assert.equal(approved.status, "created"); assert.equal(approved.notification, "sent");
  assert.equal(f.approvals().length, 1);
  assert.deepEqual([f.approvals()[0].accountId, f.approvals()[0].targetId, f.approvals()[0].state], [f.account.id, first.id, "pending"]);
  assert.equal(approved.grant.payment, `P${first.reference}`);
  assert.equal(f.state.paymentSubmission[0].transactionRef, "SYNTHETICPAID");
  assert.equal((await codes.extend(approved.grant.id, 2, owner)).status, "saved");
  assert.equal(f.approvals().length, 1);
  const next = f.report({ reference: "EFGH" });
  const renewed = await codes.approvePayment(next.id, f.fields("SYNTHETIC-RENEWAL"), owner);
  assert.equal(+renewed.grant.startsAt, +approved.grant.endsAt + 2 * day);
  assert.equal(f.approvals().length, 2); assert.equal(f.approvals()[1].targetId, next.id);
});

test("replayed and concurrent payment approvals produce a single notice", async () => {
  const f = fixture(), row = f.report(), codes = f.codes();
  const outcomes = await Promise.all([codes.approvePayment(row.id, f.fields(), owner), codes.approvePayment(row.id, f.fields(), owner)]);
  assert.deepEqual(outcomes.map(row => row.status).sort(), ["created", "duplicate"]);
  assert.equal((await codes.approvePayment(row.id, f.fields(), owner)).status, "duplicate");
  assert.equal(f.approvals().length, 1); assert.equal(f.state.accessCode.length, 1); assert.equal(f.state.paymentNotice.length, 1);
});

test("rolled back payments leave no notice; a retried transaction leaves one, delivered after its final commit", async () => {
  const f = fixture(), row = f.report(), codes = f.codes();
  f.abortNextCommit(new DatabaseOperationError("unavailable"));
  await assert.rejects(codes.approvePayment(row.id, f.fields(), owner), DatabaseOperationError);
  assert.equal(f.approvals().length, 0); assert.equal(f.committed.paymentSubmission[0].status, "pending"); assert.equal(f.committed.paymentNotice.length, 0);
  f.abortNextCommit(new DatabaseOperationError("conflict"));
  assert.equal((await codes.approvePayment(row.id, f.fields(), owner)).status, "created");
  assert.equal(f.transactions, 3); assert.equal(f.approvals().length, 1); assert.equal(f.state.accessCode.length, 1); assert.equal(f.state.paymentNotice.length, 1);
});

test("missing, invalid and blocked approvals write and deliver no notice", async () => {
  const f = fixture(), row = f.report(), codes = f.codes();
  assert.equal((await codes.approvePayment(randomUUID(), f.fields(), owner)).status, "refused");
  assert.equal((await codes.approvePayment(row.id, { ...f.fields(), transactionRef: "" }, owner)).status, "invalid");
  f.member.blockedAt = new Date(instant);
  assert.equal((await codes.approvePayment(row.id, f.fields(), owner)).status, "refused");
  assert.equal(f.delivered.length, 0); assert.equal(f.state.paymentNotice.length, 0);
});

test("only manual grants that record actual payment details notify", async () => {
  const f = fixture(), codes = f.codes();
  const fields = { phone: f.account.phone, planId: f.plan.id, amountReceivedUgx: 5000, note: "Synthetic owner confirmation" };
  assert.equal((await codes.manual(fields, owner)).status, "created"); assert.equal(f.delivered.length, 0);
  const paid = await codes.manual({ ...fields, network: "mtn", transactionRef: "SYNTHETIC-MANUAL" }, owner);
  assert.equal(paid.status, "created"); assert.equal(paid.notification, "sent"); assert.equal(f.approvals().length, 1);
  assert.equal(f.approvals()[0].targetId, paid.grant.paymentSubmissionId);
  assert.equal(f.state.paymentSubmission[0].transactionRef, "SYNTHETICMANUAL");
  assert.equal((await codes.manual({ ...fields, network: "airtel", transactionRef: "SYNTHETICMANUAL" }, owner)).status, "duplicate");
  await codes.extend(paid.grant.id, 1, owner); await codes.revoke(paid.grant.id, "owner-revoked", owner);
  assert.equal((await codes.reversePayment(paid.grant.paymentSubmissionId, "network-reversal", owner)).status, "saved");
  assert.equal(f.state.paymentNotice.length, 1); assert.equal(f.rejections().length, 0);
});

test("rejection writes its notice in the decision, delivers once after commit and keeps private admin text out", async () => {
  const f = fixture(), row = f.report(), review = f.review();
  const result = await review.reject(row.id, "unreadable", "Private administrator investigation", true, owner);
  assert.equal(result.status, "saved"); assert.equal(result.notification, "sent");
  assert.equal(f.rejections().length, 1); assert.equal(f.rejections()[0].targetId, row.id); assert.equal(f.rejections()[0].accountId, f.account.id);
  assert.ok(!JSON.stringify(f.state.paymentNotice).includes("Private administrator investigation"));
  assert.equal((await review.reject(row.id, "other", "", false, owner)).status, "refused");
  assert.equal((await review.reject(randomUUID(), "other", "", false, owner)).status, "refused");
  assert.equal((await review.reject(row.id, "invalid", "", false, owner)).status, "invalid");
  assert.equal(f.rejections().length, 1); assert.equal(f.state.paymentNotice.length, 1);
});

test("concurrent rejections notify once, while a rolled back rejection leaves no notice", async () => {
  const f = fixture(), row = f.report(), review = f.review();
  f.abortNextCommit(new DatabaseOperationError("unavailable"));
  await assert.rejects(review.reject(row.id, "other", "", false, owner), DatabaseOperationError);
  assert.equal(f.rejections().length, 0); assert.equal(f.committed.paymentSubmission[0].status, "pending"); assert.equal(f.committed.paymentNotice.length, 0);
  const results = await Promise.all([review.reject(row.id, "other", "", false, owner), review.reject(row.id, "other", "", false, owner)]);
  assert.deepEqual(results.map(result => result.status).sort(), ["refused", "saved"]);
  assert.equal(f.rejections().length, 1); assert.equal(f.state.paymentNotice.length, 1);
});

test("trial grants write no payment notice", async () => {
  const f = fixture();
  assert.equal((await f.codes().sendTrial(f.account.id, 2, owner)).status, "created");
  assert.equal(f.delivered.length, 0); assert.equal(f.state.paymentNotice.length, 0);
});

test("delivery failures cannot roll back a completed approval or rejection, and leave the notice queued", async () => {
  const f = fixture(), a = f.report(), b = f.report({ reference: "EFGH" });
  const notifications = { async deliver() { throw new Error("Synthetic delivery outage"); } };
  const approved = await f.codes({ notifications }).approvePayment(a.id, f.fields(), owner);
  const rejected = await f.review({ notifications }).reject(b.id, "not-received", "", false, owner);
  assert.equal(approved.status, "created"); assert.equal(approved.notification, "queued");
  assert.equal(rejected.status, "saved"); assert.equal(rejected.notification, "queued");
  assert.deepEqual(f.committed.paymentSubmission.map(row => row.status), ["approved", "rejected"]);
  assert.deepEqual(f.committed.paymentNotice.map(row => [row.kind, row.state]), [["approved", "pending"], ["rejected", "pending"]]);
});

test("payment decision HTTP responses report notification status without a notice id or changing decisions", async () => {
  const f = fixture(), a = f.report(), b = f.report({ reference: "EFGH" });
  const handlers = createReviewHandlers({ notifications: { async deliver(id) { return f.committed.paymentNotice.find(row => row.id === id).kind === "approved" ? "queued" : "sent"; } } });
  const context = (id, body) => ({ services: { database: f.database }, owner: { username: owner }, request: new Request(`http://localhost/api/admin/payments/${id}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) });
  const approval = await handlers.POST(context(a.id, { action: "approve", planId: f.plan.id, network: "mtn", transactionId: "SYNTHETIC-HTTP", amount: 5000 }));
  assert.equal(approval.status, 201); const approved = await approval.json();
  assert.equal(approved.status, "approved"); assert.equal(approved.notification, "queued");
  assert.equal(approved.reference, `P${a.reference}`);
  assert.equal(f.committed.paymentSubmission[0].transactionRef, "SYNTHETICHTTP");
  assert.equal(approved.endsAt, f.committed.accessCode[0].endsAt.toISOString());
  const rejection = await handlers.POST(context(b.id, { action: "reject", reason: "not-received", text: "Private text" }));
  assert.equal(rejection.status, 200); assert.deepEqual(await rejection.json(), { status: "saved", notification: "sent" });
  for (const notice of f.state.paymentNotice) assert.ok(!JSON.stringify([approved]).includes(notice.id));
});

test("approval SMS directs the member to sign in without disclosing payment or subscription details", async () => {
  const { f, messages, status, notice } = await sent("approved");
  assert.equal(status, "sent"); assert.equal(messages.length, 1); assert.equal(messages[0].phone, f.account.phone);
  assert.match(messages[0].message, /Sign in/u);
  assert.doesNotMatch(messages[0].message, /PABCD|Weekly|2027|EAT|payment|approved/iu);
  assert.equal(notice().state, "accepted");
  assert.equal(f.state.ownerAuditEvent[0].action, "payment_sms_attempted");
  assert.deepEqual(f.state.ownerAuditEvent[0].details, { decision: "approved", status: "sent" });
  for (const value of [f.account.phone, messages[0].message]) {
    assert.ok(!JSON.stringify(f.state.ownerAuditEvent).includes(value)); assert.ok(!JSON.stringify(f.state.paymentNotice).includes(value));
  }
});

test("rejection SMS excludes payment references, decisions, reasons and private administrator text", async () => {
  const f = fixture(), row = f.report();
  await f.review({ notifications: { async deliver() { return "queued"; } } }).reject(row.id, "not-received", "Private admin text: secret 256700000333", false, owner);
  const { delivery, sent: messages } = recordingDelivery();
  await createPaymentNotifications({ database: f.database, now: () => instant, delivery }).run();
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /Sign in/u); assert.doesNotMatch(messages[0].message, /PABCD|reject|not.received|could not be confirmed/iu);
  assert.ok(!messages[0].message.includes("Private admin text")); assert.ok(!messages[0].message.includes("256700000333"));
});

test("credit and renewal SMS exclude amounts, balances, plan names and expiry times", async () => {
  for (const kind of ["credited", "renewed"]) {
    const { f, messages } = await sent(kind);
    for (const { message } of messages) {
      assert.match(message, /Sign in/u); assert.ok(message.length <= 160);
      assert.doesNotMatch(message, /PCREDIT|25000|25,000|32000|17000|UGX|credit|Private Weekly|2027|EAT/iu);
    }
    assert.equal(f.state.ownerAuditEvent.at(-1).targetType, kind === "renewed" ? "access-code" : "payment");
  }
});

test("SMS delivery failures return safe statuses without leaking provider diagnostics", async () => {
  for (const [error, status, state] of [[new YoolaMessagingError("configuration"), "queued", "pending"], [new YoolaMessagingError("unsupported-country"), "unsupported", "skipped"],
    [new YoolaMessagingError("delivery"), "uncertain", "uncertain"], [new YoolaMessagingError("delivery", "rejected"), "queued", "pending"]]) {
    const { f, status: result, notice } = await sent("rejected", { answer: async () => { throw error; } });
    assert.equal(result, status); assert.equal(notice().state, state);
    assert.equal(f.state.ownerAuditEvent[0].action, "payment_sms_attempted");
    assert.ok(!JSON.stringify(f.state.ownerAuditEvent).includes(f.account.phone));
  }
  const secret = "Synthetic private provider payload 256700000333";
  const { f, status } = await sent("rejected", { answer: async () => { throw new Error(secret); } });
  assert.equal(status, "uncertain");
  assert.ok(!JSON.stringify([f.state.ownerAuditEvent, f.state.paymentNotice]).includes(secret));
});

test("missing or unsupported registered numbers do not call the SMS provider", async () => {
  for (const [phone, status] of [[null, "unavailable"], ["551155550123", "unsupported"]]) {
    const { messages, status: result, notice } = await sent("rejected", { phone });
    assert.equal(result, status); assert.equal(messages.length, 0); assert.equal(notice().state, "skipped");
  }
});

test("an audit outage does not undo an SMS accepted by the provider", async () => {
  const f = memberStore({ instant }), { delivery, sent: messages } = recordingDelivery();
  const id = await f.database.transaction(tx => enqueuePaymentNotice(tx, { accountId: f.account.id, kind: "rejected", targetId: randomUUID(), at: new Date(instant) }));
  let claims = 0;
  const database = { query: f.database.query, async transaction(run) { if (claims++ === 0) return f.database.transaction(run); throw new Error("Synthetic audit outage"); } };
  assert.equal(await createPaymentNotifications({ database, now: () => instant, delivery }).deliver(id), "sent");
  assert.equal(messages.length, 1);
  assert.equal(f.state.paymentNotice[0].state, "sending", "an unrecorded answer is recovered later as uncertain, never resent");
});
