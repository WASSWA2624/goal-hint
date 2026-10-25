import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { paymentNoticeRules } from "../src/domain/payment-notification.ts";
import { createNoticeHandlers } from "../src/server/admin/notices-http.ts";
import { createPaymentNoticeAdmin } from "../src/server/admin/payment-notices.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { createPaymentOutboxWorker, createQueuedPaymentNotifications } from "../src/server/members/payment-notification-outbox.ts";
import { createMembersPurge } from "../src/server/members/purge.ts";
import { memberStore, recordingDelivery } from "./helpers/member-store.mjs";

const instant = Date.parse("2026-10-26T01:00:00Z"), day = 86_400_000, owner = "synthetic-owner";
function setup({ answer, configured = true } = {}) {
  const store = memberStore({ instant }), clock = { at: instant }, now = () => clock.at;
  const { sent, delivery } = recordingDelivery({ answer, configured });
  const admin = createPaymentNoticeAdmin(store.database, now), worker = createPaymentOutboxWorker({ database: store.database, now, delivery });
  return Object.assign(Object.create(store), { clock, now, sent, delivery, admin, worker,
    row: id => store.state.paymentNotificationOutbox.find(row => row.id === id),
    async enqueue(decision = "approved", fields = {}) {
      await store.database.transaction(tx => createQueuedPaymentNotifications().enqueue(tx, { accountId: store.account.id,
        targetType: decision === "renewed" ? "access-code" : "payment", targetId: randomUUID(), decision, at: new Date(clock.at), ...fields }));
      return store.state.paymentNotificationOutbox.at(-1).id;
    },
  });
}
function terminal(s, id, status = "failed") {
  Object.assign(s.row(id), { status, startedAt: new Date(s.clock.at), finishedAt: new Date(s.clock.at), attemptId: randomUUID() });
}

test("missing worker credentials preserve the queued intent without consuming its automatic attempt", async () => {
  const s = setup({ configured: false }), id = await s.enqueue();
  assert.equal((await s.worker.run()).skipped, 1); assert.equal(s.sent.length, 0);
  assert.deepEqual([s.row(id).status, s.row(id).attemptId, s.row(id).startedAt], ["queued", null, null]);
  assert.deepEqual(await s.admin.attention(), []);
  s.clock.at += paymentNoticeRules.stuckAfterMs;
  assert.equal((await s.admin.attention())[0].id, id);
});

test("owner attention resolves original payment and renewal references without sending any message", async () => {
  const s = setup(), payment = s.report({ reference: "WXYZ" });
  const paymentId = await s.enqueue("rejected", { targetId: payment.id }); terminal(s, paymentId, "uncertain");
  const period = { id: randomUUID(), accountId: s.account.id, reference: "RNEW" }; s.state.accessCode.push(period);
  const renewal = await s.enqueue("renewed", { targetId: period.id });
  Object.assign(s.row(renewal), { status: "dispatching", startedAt: new Date(instant), attemptId: randomUUID() });
  s.clock.at += paymentNoticeRules.interruptedAfterMs;
  const notices = await s.admin.attention();
  assert.deepEqual(notices.map(row => [row.kind, row.reference, row.state]).sort(), [["rejected", "PWXYZ", "uncertain"], ["renewed", "C-RNEW", "uncertain"]]);
  assert.equal(s.sent.length, 0);
  assert.ok(notices.every(row => row.phone === s.account.phone));
});

test("explicit owner resend queues one fresh fenced attempt and is audited without gateway I/O", async () => {
  const s = setup(), id = await s.enqueue(); terminal(s, id);
  assert.deepEqual(await s.admin.resend(id, owner), { status: "saved", notification: "queued" });
  assert.deepEqual([s.row(id).status, s.row(id).startedAt, s.row(id).finishedAt, s.row(id).attemptId], ["queued", null, null, null]);
  assert.equal(s.sent.length, 0); assert.equal((await s.admin.resend(id, owner)).status, "refused");
  assert.equal(s.state.ownerAuditEvent.at(-1).action, "payment_sms_resent");
  assert.equal((await s.worker.run()).sent, 1); assert.equal(s.sent.length, 1);
});

test("concurrent owner retries queue only one replacement attempt", async () => {
  const s = setup(), id = await s.enqueue(); terminal(s, id, "uncertain");
  const outcomes = await Promise.all([s.admin.resend(id, owner), s.admin.resend(id, owner)]);
  assert.deepEqual(outcomes.map(row => row.status).sort(), ["refused", "saved"]);
  assert.equal(s.state.ownerAuditEvent.filter(row => row.action === "payment_sms_resent").length, 1);
  assert.equal(s.sent.length, 0);
});

test("an old attempt cannot overwrite a manually requeued notice when its late answer arrives", async () => {
  let begin, release;
  const started = new Promise(resolve => { begin = resolve; }), response = new Promise(resolve => { release = resolve; });
  const s = setup({ answer: async () => { begin(); await response; } }), id = await s.enqueue();
  const running = s.worker.run(); await started;
  s.clock.at += paymentNoticeRules.interruptedAfterMs;
  assert.equal((await s.admin.resend(id, owner)).status, "saved");
  release(); await running;
  assert.equal(s.row(id).status, "queued"); assert.equal(s.row(id).attemptId, null);
  assert.equal(s.state.ownerAuditEvent.filter(row => row.action === "payment_sms_attempted").length, 0);
});

test("owner dismiss only removes closed/unconfirmed notices and erased or blocked accounts cannot reconcile", async () => {
  const s = setup(), id = await s.enqueue();
  assert.equal((await s.admin.dismiss(id, owner)).status, "refused"); terminal(s, id, "uncertain");
  s.member.blockedAt = new Date(instant); assert.equal((await s.admin.resend(id, owner)).status, "refused");
  s.member.blockedAt = null; assert.equal((await s.admin.dismiss(id, owner)).status, "saved"); assert.equal(s.row(id), undefined);
  assert.equal(s.state.ownerAuditEvent.at(-1).action, "payment_sms_dismissed");
  const erased = await s.enqueue(); terminal(s, erased); s.member.erasedAt = new Date(instant);
  assert.equal((await s.admin.dismiss(erased, owner)).status, "refused"); assert.equal((await s.admin.resend(erased, owner)).status, "refused");
});

test("terminal retention removes closed rows after 7/30 days and retains every open intent", async () => {
  const s = setup(), rows = [];
  for (const [status, age] of [["sent", 7], ["unsupported", 8], ["failed", 30], ["sent", 6], ["uncertain", 29], ["queued", null]]) {
    const id = await s.enqueue(); rows.push({ id, status, age });
    if (status !== "queued") {
      if (status === "unsupported") Object.assign(s.row(id), { status, finishedAt: new Date(instant - age * day) });
      else { terminal(s, id, status); s.row(id).finishedAt = new Date(instant - age * day); }
    }
  }
  const result = await createMembersPurge(s.database, s.now).run(); assert.equal(result.notices, 3);
  assert.deepEqual(s.state.paymentNotificationOutbox.map(row => row.id).sort(), rows.slice(3).map(row => row.id).sort());
});

test("erasure removes delivery history and intents atomically while keeping financial decisions", async () => {
  const s = setup(); s.report(); await s.enqueue();
  assert.equal((await createSubscribers(s.database, s.now).action(s.account.id, "erase", null, owner)).status, "saved");
  assert.equal(s.state.paymentNotificationOutbox.length, 0); assert.equal(s.state.paymentSubmission.length, 1);
});

test("the private notices route validates actions and identifiers and never returns recipient details", async () => {
  const s = setup(), id = await s.enqueue(); terminal(s, id);
  const handlers = createNoticeHandlers({ now: s.now });
  const post = body => handlers.POST({ services: { database: s.database }, owner: { username: owner }, request: new Request("http://localhost/api/admin/notices", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  for (const body of [{ action: "send", id }, { action: "resend", id: "bad" }]) assert.equal((await post(body)).status, 400);
  const response = await post({ action: "resend", id }); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "saved", notification: "queued" }); assert.equal(s.sent.length, 0);
  assert.equal((await post({ action: "resend", id })).status, 409);
  assert.ok(!JSON.stringify(s.state.ownerAuditEvent).includes(s.account.phone));
});
