import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { createPaymentOutboxWorker, paymentOutboxRules } from "../src/server/members/payment-notification-outbox.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

test("retired member message outbox on restricted genuine MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const db = f.database, instant = Date.parse("2026-10-25T10:00:00Z"); let clock = instant;
  const at = new Date(instant), planId = randomUUID(), accountId = randomUUID();
  await db.query(tx => tx.subscriptionPlan.create({ data: { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000,
    active: true, sortOrder: 0, createdAt: at, updatedAt: at } }));
  await db.query(tx => tx.memberAccount.create({ data: { id: accountId, phone: "256700000111", phoneVerifiedAt: at, createdAt: at, lastSignInAt: at } }));
  const codes = createAccessCodes({ database: db, now: () => clock });
  const worker = () => createPaymentOutboxWorker({ database: db, now: () => clock });
  const legacy = (fields = {}) => ({ id: randomUUID(), accountId, targetType: "payment", targetId: randomUUID(), decision: "approved",
    status: "queued", channel: "sms", createdAt: at, ...fields });
  const insert = row => db.query(tx => tx.paymentNotificationOutbox.create({ data: row }));

  await t.test("committed approval and rejection leave no new message rows", async () => {
    const approved = await codes.manual({ phone: "256700000111", planId, amountReceivedUgx: 5000, network: "mtn",
      transactionRef: "SYNTHETICOUTBOX", note: "Synthetic acceptance" }, "owner");
    assert.equal(approved.status, "created"); assert.equal(approved.notification, "skipped");
    const duplicate = await codes.manual({ phone: "256700000111", planId, amountReceivedUgx: 5000, network: "mtn",
      transactionRef: "SYNTHETICOUTBOX", note: "Synthetic repeat" }, "owner");
    assert.equal(duplicate.status, "duplicate");
    const id = randomUUID();
    await db.query(tx => tx.paymentSubmission.create({ data: { id, accountId, planId, reference: "QRST", source: "report", planName: "Weekly",
      durationDays: 7, priceUgx: 5000, claimedNetwork: "mtn", claimedTxnRef: "SYNTHETICREJECT", claimedTxnKey: "SYNTHETICREJECT",
      claimedAmountUgx: 5000, status: "pending", submittedAt: new Date(clock) } }));
    const result = await createPaymentReview(db, () => clock).reject(id, "other", "Private review text", false, "owner");
    assert.equal(result.status, "saved"); assert.equal(result.notification, "skipped");
    assert.equal(await db.query(tx => tx.paymentNotificationOutbox.count()), 0);
  });

  await t.test("concurrent workers cancel each queued legacy row once", async () => {
    await insert(legacy());
    await insert(legacy({ channel: "whatsapp" }));
    const outcomes = await Promise.all([worker().run(), worker().run()]);
    assert.equal(outcomes.reduce((sum, result) => sum + result.cancelled, 0), 2);
    assert.equal(outcomes.reduce((sum, result) => sum + result.sent, 0), 0);
    assert.equal((await worker().status()).cancelled, 2);
  });

  await t.test("in-flight attempts keep their history when stale", async () => {
    const row = legacy({ status: "dispatching", startedAt: at, attemptId: randomUUID() });
    await insert(row);
    assert.equal((await worker().run()).examined, 0);
    clock += paymentOutboxRules.interruptedAfterMs;
    assert.equal((await worker().run()).uncertain, 1);
    assert.equal((await worker().status()).uncertain, 1);
    const saved = await db.query(tx => tx.paymentNotificationOutbox.findUnique({ where: { id: row.id } }));
    assert.deepEqual([saved.attemptId, +saved.startedAt, +saved.finishedAt], [row.attemptId, instant, clock]);
  });

  await t.test("legacy rows for erased accounts are cancelled without recreating audit data", async () => {
    await insert(legacy());
    await db.query(tx => tx.memberAccount.update({ where: { id: accountId }, data: { phone: null, erasedAt: new Date(clock) } }));
    const count = () => db.query(tx => tx.ownerAuditEvent.count({ where: { action: "payment_sms_attempted" } }));
    const before = await count();
    assert.equal((await worker().run()).cancelled, 1);
    assert.equal(await count(), before);
  });

  await t.test("database constraints refuse duplicates, unbound accounts and invalid delivery states", async () => {
    await assert.rejects(insert(legacy({ accountId: randomUUID() })));
    const row = legacy(); await insert(row);
    await assert.rejects(insert({ ...row, id: randomUUID() }));
    await assert.rejects(db.query(tx => tx.paymentNotificationOutbox.update({ where: { id: row.id }, data: { status: "sent" } })));
  });
});
