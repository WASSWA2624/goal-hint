import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { paymentNoticeRules } from "../src/domain/payment-notification.ts";
import { createNoticeHandlers } from "../src/server/admin/notices-http.ts";
import { createPaymentNoticeAdmin } from "../src/server/admin/payment-notices.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { createPaymentOutboxWorker } from "../src/server/members/payment-notification-outbox.ts";
import { createMembersPurge } from "../src/server/members/purge.ts";
import { memberStore } from "./helpers/member-store.mjs";

const instant = Date.parse("2026-10-26T01:00:00Z"), day = 86_400_000, owner = "synthetic-owner";
function setup() {
  const store = memberStore({ instant }), clock = { at: instant }, now = () => clock.at;
  const admin = createPaymentNoticeAdmin(store.database, now), worker = createPaymentOutboxWorker({ database: store.database, now });
  return Object.assign(Object.create(store), { clock, now, admin, worker,
    row: id => store.state.paymentNotificationOutbox.find(row => row.id === id),
    async enqueue(decision = "approved", fields = {}) {
      await store.database.transaction(tx => tx.paymentNotificationOutbox.create({ data: { id: randomUUID(), accountId: store.account.id,
        targetType: decision === "renewed" ? "access-code" : "payment", targetId: randomUUID(), decision, createdAt: new Date(clock.at),
        status: "queued", channel: "sms", ...fields } }));
      return store.state.paymentNotificationOutbox.at(-1).id;
    },
  });
}
function terminal(s, id, status = "failed") {
  Object.assign(s.row(id), { status, startedAt: new Date(s.clock.at), finishedAt: new Date(s.clock.at), attemptId: randomUUID() });
}

test("an old queue appears for owner inspection and cleanup cancels it without claiming an attempt", async () => {
  const s = setup(), id = await s.enqueue();
  assert.deepEqual(await s.admin.attention(), []);
  s.clock.at += paymentNoticeRules.stuckAfterMs;
  assert.equal((await s.admin.attention())[0].id, id);
  assert.equal((await s.worker.run()).cancelled, 1);
  assert.deepEqual([s.row(id).status, s.row(id).attemptId, s.row(id).startedAt], ["cancelled", null, null]);
  assert.deepEqual(await s.admin.attention(), []);
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
  assert.ok(notices.every(row => row.phone === s.account.phone));
});

test("owner dismiss only removes closed/unconfirmed notices and erased or blocked accounts cannot reconcile", async () => {
  const s = setup(), id = await s.enqueue();
  assert.equal((await s.admin.dismiss(id, owner)).status, "refused"); terminal(s, id, "uncertain");
  s.member.blockedAt = new Date(instant); assert.equal((await s.admin.dismiss(id, owner)).status, "refused");
  s.member.blockedAt = null; assert.equal((await s.admin.dismiss(id, owner)).status, "saved"); assert.equal(s.row(id), undefined);
  assert.equal(s.state.ownerAuditEvent.at(-1).action, "payment_sms_dismissed");
  const erased = await s.enqueue(); terminal(s, erased); s.member.erasedAt = new Date(instant);
  assert.equal((await s.admin.dismiss(erased, owner)).status, "refused");
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
  const otherAccountId = randomUUID();
  s.state.memberPasswordResetRequest.push({ id: randomUUID(), accountId: s.account.id }, { id: randomUUID(), accountId: otherAccountId });
  assert.equal((await createSubscribers(s.database, s.now).action(s.account.id, "erase", null, owner)).status, "saved");
  assert.equal(s.state.paymentNotificationOutbox.length, 0); assert.equal(s.state.paymentSubmission.length, 1);
  assert.deepEqual(s.state.memberPasswordResetRequest.map(row => row.accountId), [otherAccountId]);
});

test("the private notices route validates actions and identifiers and never returns recipient details", async () => {
  const s = setup(), id = await s.enqueue(); terminal(s, id);
  const handlers = createNoticeHandlers({ now: s.now });
  const post = body => handlers.POST({ services: { database: s.database }, owner: { username: owner }, request: new Request("http://localhost/api/admin/notices", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  for (const body of [{ action: "send", id }, { action: "resend", id: "bad" }]) assert.equal((await post(body)).status, 400);
  const response = await post({ action: "resend", id }); assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { status: "refused", message: "Member account updates are available in the app." });
  assert.equal(s.row(id).status, "failed");
  assert.equal(s.state.ownerAuditEvent.length, 0);
  const dismissal = await post({ action: "dismiss", id }); assert.equal(dismissal.status, 200);
  assert.deepEqual(await dismissal.json(), { status: "saved" });
  assert.ok(!JSON.stringify(s.state.ownerAuditEvent).includes(s.account.phone));
});
