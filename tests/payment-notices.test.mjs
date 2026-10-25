import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { paymentNoticeRules } from "../src/domain/payment-notification.ts";
import { createNoticeHandlers } from "../src/server/admin/notices-http.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createPaymentNotifications, enqueuePaymentNotice } from "../src/server/members/payment-notifications.ts";
import { createMembersPurge } from "../src/server/members/purge.ts";
import { YoolaMessagingError } from "../src/server/members/yoola-messaging.ts";
import { memberStore, recordingDelivery } from "./helpers/member-store.mjs";

const start = Date.parse("2026-12-24T22:30:00Z"), minute = 60_000, day = 86_400_000, owner = "synthetic-owner";
const message = "Goal Hint: Your account has been updated. Sign in to view the details or contact admin for help.";

/** A store with a movable clock, an outbox service over a recording adapter, and decisions whose delivery never runs. */
function setup({ answer, configured = true, settings } = {}) {
  const f = memberStore({ instant: start, settings }), clock = { at: start };
  const now = () => clock.at, { sent, delivery } = recordingDelivery({ answer, configured });
  const notices = createPaymentNotifications({ database: f.database, now, delivery });
  // As if the process died between commit and delivery: the row is all that remains.
  const crashed = { async deliver(id) { assert.ok(f.committed.paymentNotice.some(row => row.id === id), "delivery follows the committed notice"); return "queued"; } };
  const codes = createAccessCodes({ database: f.database, now, notifications: crashed });
  const review = createPaymentReview(f.database, now, { notifications: crashed });
  const enqueue = (kind = "approved", fields = {}) => f.database.transaction(tx => enqueuePaymentNotice(tx, { accountId: f.account.id, kind, targetId: randomUUID(),
    at: new Date(clock.at), ...fields }));
  const row = id => f.state.paymentNotice.find(notice => notice.id === id);
  const audits = action => f.state.ownerAuditEvent.filter(event => event.action === action);
  return Object.assign(Object.create(f), { clock, now, sent, delivery, notices, codes, review, enqueue, row, audits });
}
const advance = (s, ms) => { s.clock.at += ms; };

test("each payment decision writes exactly one notice of its kind in its own transaction", async () => {
  const s = setup({ settings: { paywallMode: "on" } });
  const plan = s.report(), topup = s.report({ reference: "TOPU", purpose: "topup", planId: null, planName: "Account credit", durationDays: null, priceUgx: 10_000, claimedAmountUgx: 10_000 });
  const rejected = s.report({ reference: "REJE" });
  assert.equal((await s.codes.approvePayment(plan.id, s.fields(), owner)).status, "created");
  assert.equal((await s.codes.approvePayment(topup.id, { network: "mtn", transactionRef: "SYNTHETIC-TOPUP", amountReceivedUgx: 10_000 }, owner)).status, "credited");
  const manual = await s.codes.manual({ phone: s.account.phone, planId: s.plan.id, amountReceivedUgx: 5000, note: "Synthetic owner record", network: "airtel", transactionRef: "SYNTHETIC-MANUAL" }, owner);
  assert.equal(manual.status, "created");
  assert.equal((await s.review.reject(rejected.id, "other", "", false, owner)).status, "saved");
  // Auto-renewal from credit: the chain ends within the lead and the balance covers the plan.
  Object.assign(s.member, { autoRenew: true, autoRenewPlanId: s.plan.id });
  s.clock.at = Math.max(...s.state.accessCode.map(code => +code.endsAt)) - 30 * minute;
  const renewal = await s.codes.renewDue(s.account.id);
  assert.equal(renewal, "renewed");
  const period = s.state.accessCode.find(code => code.source === "renewal");
  assert.deepEqual(s.state.paymentNotice.map(row => [row.kind, row.targetId]).sort(), [["approved", manual.grant.paymentSubmissionId], ["approved", plan.id],
    ["credited", topup.id], ["rejected", rejected.id], ["renewed", period.id]].sort());
  for (const row of s.state.paymentNotice) {
    assert.equal(row.state, "pending"); assert.equal(row.attempts, 0); assert.equal(row.accountId, s.account.id);
    assert.equal(+row.expiresAt, +row.createdAt + paymentNoticeRules.sendWithinMs);
  }
  assert.equal(s.sent.length, 0, "a renewal is never sent inline; the decisions' delivery here never runs");
});

test("a rolled back credit approval or renewal leaves no notice", async () => {
  const s = setup({ settings: { paywallMode: "on" } });
  const topup = s.report({ reference: "TOPU", purpose: "topup", planId: null, planName: "Account credit", durationDays: null, priceUgx: 10_000, claimedAmountUgx: 10_000 });
  s.abortNextCommit(new DatabaseOperationError("unavailable"));
  await assert.rejects(s.codes.approvePayment(topup.id, { network: "mtn", transactionRef: "SYNTHETIC-TOPUP", amountReceivedUgx: 10_000 }, owner), DatabaseOperationError);
  assert.equal(s.committed.paymentNotice.length, 0);
  s.state.accessCode.push({ id: randomUUID(), accountId: s.account.id, reference: "LIVE", source: "payment", planName: "Weekly", durationDays: 7, extensionDays: 0,
    startsAt: new Date(start - 7 * day), endsAt: new Date(start + 30 * minute), revokedAt: null, createdAt: new Date(start - 7 * day) });
  Object.assign(s.member, { autoRenew: true, autoRenewPlanId: s.plan.id, creditUgx: 10_000 });
  s.abortNextCommit(new DatabaseOperationError("unavailable"));
  await assert.rejects(s.codes.renewDue(s.account.id), DatabaseOperationError);
  assert.equal(s.state.paymentNotice.length, 0);
});

test("trial, manual grants without a payment, reversal and number change write no notice", async () => {
  const s = setup();
  assert.equal((await s.codes.sendTrial(s.account.id, 2, owner)).status, "created");
  assert.equal((await s.codes.manual({ phone: s.account.phone, durationDays: 3, amountReceivedUgx: 0, note: "Synthetic courtesy days" }, owner)).status, "created");
  assert.equal(s.state.paymentNotice.length, 0);
  const paid = s.report();
  assert.equal((await s.codes.approvePayment(paid.id, s.fields(), owner)).status, "created");
  assert.equal(s.state.paymentNotice.length, 1);
  assert.equal((await s.codes.reversePayment(paid.id, "network-reversal", owner)).status, "saved");
  assert.equal((await s.codes.changeNumber(s.account.id, { newPhone: "256700000222", verifiedBy: "payment-details" }, owner)).status, "created");
  assert.deepEqual(s.state.paymentNotice.map(row => row.kind), ["approved"]);
});

test("after a crash between commit and delivery, run() sends once to the registered number with the fixed text", async () => {
  const s = setup(), paid = s.report();
  const approved = await s.codes.approvePayment(paid.id, s.fields(), owner);
  assert.equal(approved.notification, "queued");
  const result = await s.notices.run();
  assert.deepEqual(result, { recovered: 0, expired: 0, accepted: 1, retrying: 0, failed: 0, uncertain: 0, skipped: 0, configured: true });
  assert.deepEqual(s.sent, [{ phone: s.account.phone, message }]);
  const [row] = s.state.paymentNotice;
  assert.equal(row.state, "accepted"); assert.equal(row.attempts, 1); assert.ok(row.closedAt); assert.equal(row.leaseUntil, null);
  assert.deepEqual((await s.notices.run()).accepted, 0); assert.equal(s.sent.length, 1);
});

test("two concurrent dispatchers send each notice once", async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const s = setup({ answer: () => gate }), ids = [await s.enqueue(), await s.enqueue("rejected")];
  const other = createPaymentNotifications({ database: s.database, now: s.now, delivery: s.delivery });
  const runs = [s.notices.run(), other.run()];
  await new Promise(resolve => setTimeout(resolve, 20)); release();
  const results = await Promise.all(runs);
  assert.equal(s.sent.length, 2);
  assert.equal(results.reduce((total, result) => total + result.accepted, 0), 2);
  for (const id of ids) assert.equal(s.row(id).state, "accepted");
});

test("a definite refusal backs off within the retry bounds, at most four times, then fails as refused", async () => {
  const s = setup({ answer: async () => { throw new YoolaMessagingError("delivery", "rejected"); } }), id = await s.enqueue();
  for (let attempt = 1; attempt <= paymentNoticeRules.maxAttempts; attempt++) {
    const at = s.clock.at;
    assert.equal(await s.notices.deliver(id), attempt < paymentNoticeRules.maxAttempts ? "queued" : "failed");
    assert.equal(s.sent.length, attempt);
    const row = s.row(id);
    if (attempt < paymentNoticeRules.maxAttempts) {
      const ceiling = Math.min(paymentNoticeRules.backoff.maxMs, paymentNoticeRules.backoff.baseMs * 2 ** (attempt - 1));
      assert.equal(row.state, "pending"); assert.equal(row.lastError, "rejected"); assert.equal(row.attempts, attempt);
      assert.ok(+row.availableAt >= at + ceiling / 2 && +row.availableAt <= at + ceiling, `attempt ${attempt}: ${+row.availableAt - at}`);
      assert.equal(await s.notices.deliver(id), "queued", "not before its retry time"); assert.equal(s.sent.length, attempt);
      s.clock.at = +row.availableAt;
    } else {
      assert.deepEqual([row.state, row.lastError, row.attempts], ["failed", "rejected", 4]); assert.ok(row.closedAt);
    }
  }
  advance(s, day);
  assert.equal((await s.notices.run()).accepted, 0); assert.equal(s.sent.length, 4);
});

test("an uncertain send or an unexpected error closes as uncertain and is never sent again automatically", async () => {
  for (const error of [new YoolaMessagingError("delivery"), new YoolaMessagingError("delivery", "uncertain"), new Error("Synthetic adapter bug")]) {
    const s = setup({ answer: async () => { throw error; } }), id = await s.enqueue();
    assert.equal(await s.notices.deliver(id), "uncertain");
    assert.deepEqual([s.row(id).state, s.row(id).lastError], ["uncertain", "uncertain"]);
    advance(s, 2 * paymentNoticeRules.backoff.maxMs);
    const result = await s.notices.run();
    assert.equal(result.accepted + result.retrying + result.uncertain, 0); assert.equal(s.sent.length, 1);
  }
});

test("an expired lease is recovered as uncertain without a resend; only its own late answer may land", async () => {
  let answer = 0, releaseFirst;
  const first = new Promise(resolve => { releaseFirst = resolve; });
  const s = setup({ answer: () => answer++ === 0 ? first : undefined }), id = await s.enqueue();
  const pending = s.notices.deliver(id);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(s.row(id).state, "sending"); assert.equal(s.inTransaction, false, "the send holds no transaction");
  advance(s, paymentNoticeRules.leaseMs + 1);
  const recovery = await s.notices.run();
  assert.equal(recovery.recovered, 1); assert.equal(s.sent.length, 1, "recovery never resends");
  assert.deepEqual([s.row(id).state, s.row(id).lastError], ["uncertain", "uncertain"]);
  assert.equal(s.audits("payment_sms_attempted").at(-1).details.status, "uncertain");
  releaseFirst();
  assert.equal(await pending, "sent");
  assert.equal(s.row(id).state, "accepted", "the gateway's real answer replaces the recovered uncertain state");
  assert.equal(s.audits("payment_sms_attempted").length, 2);
});

test("a stale lease owner cannot overwrite a resent notice and writes no audit", async () => {
  let answer = 0, releaseFirst;
  const first = new Promise((_, reject) => { releaseFirst = () => reject(new YoolaMessagingError("delivery", "rejected")); });
  const s = setup({ answer: () => answer++ === 0 ? first : undefined }), id = await s.enqueue();
  const stale = s.notices.deliver(id);
  await new Promise(resolve => setTimeout(resolve, 10));
  advance(s, paymentNoticeRules.leaseMs + 1);
  assert.equal((await s.notices.run()).recovered, 1);
  assert.deepEqual(await s.notices.resend(id, owner), { status: "saved", notification: "sent" });
  const audits = s.state.ownerAuditEvent.length;
  releaseFirst();
  assert.equal(await stale, "queued", "the stale attempt's own answer");
  assert.deepEqual([s.row(id).state, s.row(id).attempts], ["accepted", 1]);
  assert.equal(s.state.ownerAuditEvent.length, audits, "a fenced-out completion writes nothing");
  assert.equal(s.sent.length, 2);
});

test("erased, phone-less and unsupported accounts are skipped without a provider call; erasure deletes the account's notices", async () => {
  for (const [change, lastError] of [[{ erasedAt: new Date(start), phone: null }, "unavailable"], [{ phone: null }, "unavailable"], [{ phone: "551155550123" }, "unsupported"]]) {
    const s = setup(), id = await s.enqueue();
    Object.assign(s.member, change);
    assert.equal(await s.notices.deliver(id), lastError);
    assert.deepEqual([s.row(id).state, s.row(id).lastError, s.row(id).attempts], ["skipped", lastError, 0]);
    assert.equal(s.sent.length, 0);
    assert.equal(s.audits("payment_sms_attempted").length, change.erasedAt ? 0 : 1, "an erased account gets no new audit");
  }
  const s = setup(), paid = s.report();
  await s.codes.approvePayment(paid.id, s.fields(), owner);
  await s.enqueue("rejected");
  assert.equal(s.state.paymentNotice.length, 2);
  assert.equal((await createSubscribers(s.database, s.now).action(s.account.id, "erase", null, owner)).status, "saved");
  assert.equal(s.state.paymentNotice.length, 0);
  assert.deepEqual(await s.notices.run(), { recovered: 0, expired: 0, accepted: 0, retrying: 0, failed: 0, uncertain: 0, skipped: 0, configured: true });
});

test("notices not sent within a day fail as expired without sending, even with no configured dispatcher", async () => {
  for (const configured of [true, false]) {
    const s = setup({ configured }), id = await s.enqueue();
    advance(s, paymentNoticeRules.sendWithinMs);
    const result = await s.notices.run();
    assert.equal(result.expired, 1); assert.equal(result.configured, configured);
    assert.deepEqual([s.row(id).state, s.row(id).lastError], ["failed", "expired"]);
    assert.equal(s.sent.length, 0);
    assert.equal(s.audits("payment_sms_attempted").at(-1).details.status, "failed");
  }
});

test("an unconfigured process claims nothing and spends no attempt; the owner sees the notice after 15 minutes", async () => {
  const s = setup({ configured: false }), id = await s.enqueue();
  assert.equal(await s.notices.deliver(id), "queued");
  assert.deepEqual(await s.notices.run(), { recovered: 0, expired: 0, accepted: 0, retrying: 0, failed: 0, uncertain: 0, skipped: 0, configured: false });
  assert.deepEqual([s.row(id).state, s.row(id).attempts, s.row(id).leaseOwner], ["pending", 0, null]);
  assert.deepEqual(await s.notices.attention(), []);
  advance(s, paymentNoticeRules.stuckAfterMs + 1);
  const [notice] = await s.notices.attention();
  assert.equal(notice.id, id); assert.equal(notice.state, "pending"); assert.equal(notice.phone, s.account.phone);
});

test("the owner's list names references and kinds, and shows an expired lease as unconfirmed", async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const s = setup({ answer: () => gate }), paid = s.report({ reference: "WXYZ" });
  await s.review.reject(paid.id, "other", "", false, owner);
  const renewalPeriod = randomUUID();
  s.state.accessCode.push({ id: renewalPeriod, accountId: s.account.id, reference: "RNEW", source: "renewal", revokedAt: null });
  const renewal = await s.enqueue("renewed", { targetId: renewalPeriod });
  const sending = s.notices.deliver(renewal);
  await new Promise(resolve => setTimeout(resolve, 10));
  advance(s, paymentNoticeRules.stuckAfterMs + 1);
  const notices = await s.notices.attention();
  assert.deepEqual(notices.map(notice => [notice.kind, notice.reference, notice.state]).sort(), [["rejected", "PWXYZ", "pending"], ["renewed", "C-RNEW", "uncertain"]]);
  release(); await sending;
  assert.deepEqual((await s.notices.attention()).map(notice => notice.kind), ["rejected"]);
});

test("rows, audits and run results never hold the phone number or the message text", async () => {
  const s = setup({ answer: async ({ phone }) => { if (phone.endsWith("1")) throw new YoolaMessagingError("delivery", "rejected"); } });
  const paid = s.report();
  await s.codes.approvePayment(paid.id, s.fields(), owner);
  const result = await s.notices.run();
  advance(s, day);
  const later = await s.notices.run();
  const stored = JSON.stringify([s.state.paymentNotice, s.state.ownerAuditEvent.filter(event => event.action.startsWith("payment_sms")), result, later]);
  for (const value of [s.account.phone, message, "Sign in"]) assert.ok(!stored.includes(value), value);
  assert.equal(s.sent.length, 1);
});

test("the members purge removes closed notices after 7 or 30 days and never an open one", async () => {
  const s = setup(), at = s.clock.at, ago = days => new Date(at - days * day - 1);
  const notice = (state, closedDays, extra = {}) => {
    const createdAt = new Date(at - 40 * day), id = randomUUID();
    s.state.paymentNotice.push({ id, accountId: s.account.id, kind: "approved", targetId: randomUUID(), state, attempts: 1, availableAt: createdAt,
      expiresAt: new Date(+createdAt + day), leaseOwner: null, leaseUntil: null, lastError: null, createdAt, attemptedAt: createdAt,
      closedAt: closedDays === null ? null : ago(closedDays), ...extra });
    return id;
  };
  const kept = [notice("accepted", 6), notice("skipped", 6, { lastError: "unavailable" }), notice("uncertain", 29, { lastError: "uncertain" }),
    notice("failed", 29, { lastError: "rejected" }), notice("pending", null)];
  notice("accepted", 7); notice("skipped", 8, { lastError: "unsupported" }); notice("failed", 30, { lastError: "expired" }); notice("uncertain", 31, { lastError: "uncertain" });
  const result = await createMembersPurge(s.database, s.now).run();
  assert.equal(result.claimed, true); assert.equal(result.notices, 4);
  assert.deepEqual(s.state.paymentNotice.map(row => row.id).sort(), kept.sort());
  assert.equal(s.audits("members_purged").at(-1).details.notices, 4);
});

test("resend works only on failed or unconfirmed notices, is audited and delivers once; dismiss removes closed ones", async () => {
  const s = setup({ answer: async () => { throw new YoolaMessagingError("delivery"); } });
  const uncertain = await s.enqueue(), accepted = await s.enqueue("rejected"), pending = await s.enqueue("credited");
  assert.equal(await s.notices.deliver(uncertain), "uncertain");
  s.row(accepted).state = "accepted"; s.row(accepted).closedAt = new Date(s.clock.at);
  for (const id of [accepted, pending, randomUUID()]) {
    assert.equal((await s.notices.resend(id, owner)).status, "refused");
    assert.equal((await s.notices.dismiss(id, owner)).status, "refused");
  }
  const delivered = s.sent.length;
  const outcome = await s.notices.resend(uncertain, owner);
  assert.deepEqual(outcome, { status: "saved", notification: "uncertain" });
  assert.equal(s.sent.length, delivered + 1);
  const [resent] = s.audits("payment_sms_resent");
  assert.deepEqual([resent.accountId, resent.actor, resent.targetType, resent.targetId], [s.account.id, owner, "payment", s.row(uncertain).targetId]);
  assert.deepEqual(resent.details, { decision: "approved" });
  assert.deepEqual(await s.notices.dismiss(uncertain, owner), { status: "saved" });
  assert.equal(s.row(uncertain), undefined);
  assert.equal(s.audits("payment_sms_dismissed")[0].accountId, s.account.id);
  const failed = await s.enqueue("approved");
  Object.assign(s.row(failed), { state: "failed", lastError: "expired", closedAt: new Date(s.clock.at) });
  s.member.erasedAt = new Date(s.clock.at);
  assert.equal((await s.notices.resend(failed, owner)).status, "refused");
  assert.equal((await s.notices.dismiss(failed, owner)).status, "refused");
});

test("the notices route validates the action and id, answers refusals with 409 and never returns a notice's number", async () => {
  const s = setup(), id = await s.enqueue();
  Object.assign(s.row(id), { state: "failed", lastError: "rejected", attempts: 4, closedAt: new Date(s.clock.at) });
  const handlers = createNoticeHandlers({ delivery: s.delivery, now: s.now });
  const post = body => handlers.POST({ services: { database: s.database }, owner: { username: owner }, request: new Request("http://localhost/api/admin/notices", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  for (const body of [{ action: "resend", id: "not-a-uuid" }, { action: "delete", id }, { id }]) assert.equal((await post(body)).status, 400);
  assert.equal((await post({ action: "dismiss", id: randomUUID() })).status, 409);
  const resent = await post({ action: "resend", id });
  assert.equal(resent.status, 200);
  const body = await resent.text();
  assert.deepEqual(JSON.parse(body), { status: "saved", notification: "sent" });
  assert.ok(!body.includes(s.account.phone));
  assert.equal((await post({ action: "resend", id })).status, 409, "an accepted notice is not sent again");
  assert.equal((await handlers.POST({ services: { database: null }, owner: { username: owner }, request: new Request("http://localhost/api/admin/notices", { method: "POST" }) })).status, 503);
});

test("decision responses carry the notification status, never a notice id; a renewal makes no inline provider call", async () => {
  const s = setup({ settings: { paywallMode: "on" } }), paid = s.report();
  const approved = await createAccessCodes({ database: s.database, now: s.now, notifications: s.notices }).approvePayment(paid.id, s.fields(), owner);
  assert.equal(approved.notification, "sent");
  assert.ok(!JSON.stringify(approved).includes(s.state.paymentNotice[0].id));
  Object.assign(s.member, { autoRenew: true, autoRenewPlanId: s.plan.id, creditUgx: 10_000 });
  advance(s, 7 * day - 30 * minute);
  const delivered = s.sent.length;
  assert.equal(await createAccessCodes({ database: s.database, now: s.now, notifications: s.notices }).renewDue(s.account.id), "renewed");
  assert.equal(s.sent.length, delivered, "the renewal SMS waits for the outbox");
  assert.equal((await s.notices.run()).accepted, 1);
});
