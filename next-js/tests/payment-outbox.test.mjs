import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createPaymentOutboxWorker, paymentOutboxRules } from "../src/server/members/payment-notification-outbox.ts";
import { memberStore } from "./helpers/member-store.mjs";

const instant = Date.parse("2026-10-25T10:00:00Z");

function fixture() {
  const store = memberStore({ instant }), clock = { at: instant };
  const worker = () => createPaymentOutboxWorker({ database: store.database, now: () => clock.at });
  async function legacy(fields = {}) {
    return store.database.transaction(tx => tx.paymentNotificationOutbox.create({ data: { id: randomUUID(),
      accountId: store.account.id, targetType: "payment", targetId: randomUUID(), decision: "approved",
      status: "queued", channel: "sms", createdAt: new Date(instant), ...fields } }));
  }
  return { store, clock, worker, legacy };
}

test("cleanup cancels legacy SMS and WhatsApp intents without any delivery attempt", async t => {
  const f = fixture();
  t.mock.method(globalThis, "fetch", () => assert.fail("The cleanup worker has no network transport."));
  await f.legacy();
  await f.legacy({ channel: "whatsapp", decision: "welcome", targetType: "member" });
  const result = await f.worker().run();
  assert.equal(result.cancelled, 2);
  assert.equal(result.sent, 0);
  assert.deepEqual(f.store.state.paymentNotificationOutbox.map(row => [row.status, row.startedAt, row.attemptId, +row.finishedAt]),
    [["cancelled", null, null, instant], ["cancelled", null, null, instant]]);
  assert.equal((await f.worker().run()).examined, 0);
});

test("concurrent cleaners update each old row and its audit once", async () => {
  const f = fixture(); await f.legacy();
  const outcomes = await Promise.all([f.worker().run(), f.worker().run()]);
  assert.equal(outcomes.reduce((sum, result) => sum + result.cancelled, 0), 1);
  assert.equal(f.store.state.ownerAuditEvent.filter(row => row.details.status === "cancelled").length, 1);
});

test("a fresh in-flight attempt is preserved until stale, then marked uncertain once with its history", async () => {
  const f = fixture(), startedAt = new Date(instant), attemptId = randomUUID();
  const inFlight = await f.legacy({ status: "dispatching", startedAt, attemptId });
  await f.legacy({ status: "sent", startedAt, attemptId: randomUUID(), finishedAt: startedAt });
  assert.equal((await f.worker().run()).examined, 0);
  f.clock.at += paymentOutboxRules.interruptedAfterMs;
  assert.equal((await f.worker().run()).uncertain, 1);
  const row = f.store.state.paymentNotificationOutbox.find(item => item.id === inFlight.id);
  assert.deepEqual([row.status, row.attemptId, +row.startedAt, +row.finishedAt], ["uncertain", attemptId, instant, f.clock.at]);
  assert.equal(f.store.state.paymentNotificationOutbox.filter(item => item.status === "sent").length, 1);
  assert.equal((await f.worker().run()).examined, 0);
});

test("cleanup never recreates an erased account's audit data", async () => {
  const f = fixture(); await f.legacy();
  f.store.member.erasedAt = new Date(instant);
  assert.equal((await f.worker().run()).cancelled, 1);
  assert.deepEqual(f.store.state.ownerAuditEvent, []);
});

test("a failed cleanup commit keeps the legacy row available for a retry", async () => {
  const f = fixture(); await f.legacy();
  f.store.abortNextCommit(new Error("Synthetic storage failure"));
  await assert.rejects(f.worker().run(), /Synthetic storage failure/u);
  assert.equal(f.store.state.paymentNotificationOutbox[0].status, "queued");
  assert.equal((await f.worker().run()).cancelled, 1);
});

test("batch bounds leave unselected legacy rows for subsequent cleanup", async () => {
  const f = fixture(); await f.legacy(); await f.legacy(); await f.legacy();
  for (const limit of [0, 1.5, 101, NaN]) await assert.rejects(f.worker().run(limit), RangeError);
  assert.equal((await f.worker().run(2)).cancelled, 2);
  assert.equal((await f.worker().run(2)).cancelled, 1);
});
