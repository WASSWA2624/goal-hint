import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { createPaymentOutboxWorker, createQueuedPaymentNotifications, paymentOutboxRules } from "../src/server/members/payment-notification-outbox.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

test("payment notification outbox on restricted genuine MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const db = f.database, instant = Date.parse("2026-10-25T10:00:00Z"); let clock = instant;
  const at = new Date(instant), planId = randomUUID(), accountId = randomUUID();
  await db.query(tx => tx.subscriptionPlan.create({ data: { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000,
    active: true, sortOrder: 0, createdAt: at, updatedAt: at } }));
  await db.query(tx => tx.memberAccount.create({ data: { id: accountId, phone: "256700000111", createdAt: at, lastSignInAt: at } }));
  const codes = createAccessCodes({ database: db, now: () => clock });
  const producer = createQueuedPaymentNotifications();
  const calls = [], worker = () => createPaymentOutboxWorker({ database: db, now: () => clock, delivery: { async sendSms(message) { calls.push(message); } } });
  const event = () => ({ accountId, targetType: "payment", targetId: randomUUID(), decision: "approved", at });

  await t.test("committed approval survives without inline gateway I/O and retains one intent", async () => {
    const approved = await codes.manual({ phone: "256700000111", planId, amountReceivedUgx: 5000, network: "mtn",
      transactionRef: "SYNTHETICOUTBOX", note: "Synthetic acceptance" }, "owner");
    assert.equal(approved.status, "created"); assert.equal(approved.notification, "queued");
    const rows = await db.query(tx => tx.paymentNotificationOutbox.findMany());
    assert.equal(rows.length, 1); assert.equal(rows[0].targetId, approved.grant.paymentSubmissionId);
    assert.equal(rows[0].decision, "approved"); assert.equal(rows[0].status, "queued"); assert.equal(calls.length, 0);
    assert.ok(!JSON.stringify(rows).includes("256700000111")); assert.ok(!JSON.stringify(rows).includes("SYNTHETICOUTBOX"));
    const duplicate = await codes.manual({ phone: "256700000111", planId, amountReceivedUgx: 5000, network: "mtn",
      transactionRef: "SYNTHETICOUTBOX", note: "Synthetic repeat" }, "owner");
    assert.equal(duplicate.status, "duplicate"); assert.equal(await db.query(tx => tx.paymentNotificationOutbox.count()), 1);
  });
  await t.test("rollbacks remove the intent and uniqueness refuses a second decision key", async () => {
    const value = event();
    await assert.rejects(db.transaction(async tx => { await producer.enqueue(tx, value); throw new Error("Synthetic rollback"); }));
    assert.equal(await db.query(tx => tx.paymentNotificationOutbox.count({ where: { targetId: value.targetId } })), 0);
    await db.transaction(tx => producer.enqueue(tx, value));
    await assert.rejects(db.transaction(tx => producer.enqueue(tx, value)));
    assert.equal(await db.query(tx => tx.paymentNotificationOutbox.count({ where: { targetId: value.targetId } })), 1);
  });
  await t.test("concurrent workers send each committed intent exactly once automatically", async () => {
    const outcomes = await Promise.all([worker().run(), worker().run()]);
    assert.equal(outcomes.reduce((sum, result) => sum + result.sent, 0), 2); assert.equal(calls.length, 2);
    assert.equal((await worker().run()).examined, 0);
    assert.equal(await db.query(tx => tx.paymentNotificationOutbox.count({ where: { status: "sent" } })), 2);
  });
  await t.test("interrupted claims are visible as uncertain and never automatically replayed", async () => {
    const value = event(); await db.transaction(tx => producer.enqueue(tx, value));
    await db.query(tx => tx.paymentNotificationOutbox.updateMany({ where: { targetId: value.targetId },
      data: { status: "dispatching", startedAt: at, attemptId: randomUUID() } }));
    clock += paymentOutboxRules.interruptedAfterMs;
    assert.equal((await worker().run()).uncertain, 1); assert.equal(calls.length, 2);
    assert.equal((await worker().status()).uncertain, 1);
  });
  await t.test("rejection commits its own durable intent and omits review text", async () => {
    const id = randomUUID();
    await db.query(tx => tx.paymentSubmission.create({ data: { id, accountId, planId, reference: "QRST", source: "report", planName: "Weekly",
      durationDays: 7, priceUgx: 5000, claimedNetwork: "mtn", claimedTxnRef: "SYNTHETICREJECT", claimedTxnKey: "SYNTHETICREJECT",
      claimedAmountUgx: 5000, status: "pending", submittedAt: new Date(clock) } }));
    const result = await createPaymentReview(db, () => clock).reject(id, "other", "Private review text", false, "owner");
    assert.equal(result.status, "saved"); assert.equal(result.notification, "queued");
    const row = await db.query(tx => tx.paymentNotificationOutbox.findFirst({ where: { targetId: id } }));
    assert.equal(row.decision, "rejected"); assert.ok(!JSON.stringify(row).includes("Private review text"));
    assert.equal((await worker().run()).sent, 1);
  });
  await t.test("erased accounts are cancelled without gateway dispatch or recreated audit data", async () => {
    const value = event(); await db.transaction(tx => producer.enqueue(tx, value));
    await db.query(tx => tx.memberAccount.update({ where: { id: accountId }, data: { phone: null, erasedAt: new Date(clock) } }));
    const before = await db.query(tx => tx.ownerAuditEvent.count({ where: { action: "payment_sms_attempted" } }));
    assert.equal((await worker().run()).cancelled, 1); assert.equal(calls.length, 3);
    assert.equal(await db.query(tx => tx.ownerAuditEvent.count({ where: { action: "payment_sms_attempted" } })), before);
  });
  await t.test("database constraints refuse unbound accounts and invalid delivery states", async () => {
    await assert.rejects(db.transaction(tx => producer.enqueue(tx, { ...event(), accountId: randomUUID() })));
    // A real row ensures the state check runs rather than vacuously updating no rows.
    const value = event(); await db.transaction(tx => producer.enqueue(tx, value));
    await assert.rejects(db.query(tx => tx.paymentNotificationOutbox.updateMany({ where: { targetId: value.targetId }, data: { status: "sent" } })));
  });
});
