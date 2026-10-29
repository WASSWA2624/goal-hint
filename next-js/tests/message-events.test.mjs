import assert from "node:assert/strict";
import test from "node:test";
import { defaultMessageTemplates } from "../src/domain/message-templates.ts";
import { createPayments } from "../src/server/members/payments.ts";
import { createPaymentOutboxWorker } from "../src/server/members/payment-notification-outbox.ts";
import { memberStore } from "./helpers/member-store.mjs";

const instant = Date.parse("2026-10-29T12:00:00Z");
function fixture() {
  const templates = structuredClone(defaultMessageTemplates); templates.events["payment-received"].enabled = true;
  const f = memberStore({ instant, settings: { messageTemplates: templates, paywallMode: "test", mtnNumber: "256700000999", mtnName: "Synthetic" } });
  const member = { accountId: f.account.id, tokenHash: "synthetic-session", phone: f.account.phone, blocked: false };
  f.state.memberSession.push({ accountId: f.account.id, tokenHash: member.tokenHash, authenticatedAt: new Date(instant), passwordResetAt: null,
    expiresAt: new Date(instant + 86_400_000) });
  f.tx.rateLimitBucket = { async findUniqueOrThrow({ where }) { return { key: where.key, count: 0, bytes: 0 }; }, async update() {} };
  const payments = createPayments({ database: f.database, config: { key: (purpose, value) => `${purpose}:${value}` }, now: () => instant, environment: null });
  const fields = { purpose: "plan", planId: f.plan.id, network: "mtn", payerPhone: f.account.phone, transactionId: "SYNTHETICRECEIVED",
    accepted: true, screenshotAmount: null };
  return { ...f, store: f, member, fields, payments };
}

test("the real payment submission service atomically queues configured report-received content without claiming received money", async () => {
  const f = fixture(), result = await f.payments.submit(f.member, f.fields);
  assert.equal(result.status, "saved");
  assert.equal(f.store.state.paymentSubmission.length, 1); assert.equal(f.store.state.paymentNotificationOutbox.length, 1);
  assert.equal(f.store.state.paymentNotificationOutbox[0].decision, "received");
  const calls = [], worker = createPaymentOutboxWorker({ database: f.database, now: () => instant, delivery: { async sendSms(value) { calls.push(value); } } });
  assert.equal((await worker.run()).sent, 1); assert.equal(calls.length, 1);
  assert.match(calls[0].message, /Payment report .* is waiting for review/u);
  assert.equal(JSON.stringify(f.store.state.paymentNotificationOutbox).includes(f.account.phone), false);
});

test("a rolled-back payment report leaves neither the report nor a message intent", async () => {
  const f = fixture(); f.abortNextCommit(new Error("Synthetic commit refusal"));
  await assert.rejects(f.payments.submit(f.member, f.fields), /Synthetic commit refusal/u);
  assert.equal(f.store.state.paymentSubmission.length, 0); assert.equal(f.store.state.paymentNotificationOutbox.length, 0);
});
