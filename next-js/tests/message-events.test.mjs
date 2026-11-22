import assert from "node:assert/strict";
import test from "node:test";
import { defaultMessageTemplates } from "../src/domain/message-templates.ts";
import { createPayments } from "../src/server/members/payments.ts";
import { memberStore } from "./helpers/member-store.mjs";

const instant = Date.parse("2026-10-29T12:00:00Z");
function fixture() {
  const templates = structuredClone(defaultMessageTemplates); templates.events["payment-received"].enabled = true;
  const f = memberStore({ instant, settings: { messageTemplates: templates, paywallMode: "on", mtnEnabled: true, mtnNumber: "256700000999", mtnName: "Synthetic" } });
  const member = { accountId: f.account.id, tokenHash: "synthetic-session", phone: f.account.phone, blocked: false };
  f.state.memberSession.push({ accountId: f.account.id, tokenHash: member.tokenHash, authenticatedAt: new Date(instant), passwordResetAt: null,
    expiresAt: new Date(instant + 86_400_000) });
  f.tx.rateLimitBucket = { async findUniqueOrThrow({ where }) { return { key: where.key, count: 0, bytes: 0 }; }, async update() {} };
  const payments = createPayments({ database: f.database, config: { key: (purpose, value) => `${purpose}:${value}` }, now: () => instant });
  const fields = { purpose: "plan", planId: f.plan.id, network: "mtn", payerPhone: f.account.phone, transactionId: "SYNTHETICRECEIVED",
    accepted: true, screenshotAmount: null };
  return { ...f, store: f, member, fields, payments };
}

test("the real payment report persists without a message intent even with a legacy template enabled", async () => {
  const f = fixture(), result = await f.payments.submit(f.member, f.fields);
  assert.equal(result.status, "saved");
  assert.equal(f.store.state.paymentSubmission.length, 1);
  assert.equal(f.store.state.paymentSubmission[0].status, "pending");
  assert.equal(f.store.state.paymentNotificationOutbox.length, 0);
});

test("a rolled-back payment report leaves neither the report nor a message intent", async () => {
  const f = fixture(); f.abortNextCommit(new Error("Synthetic commit refusal"));
  await assert.rejects(f.payments.submit(f.member, f.fields), /Synthetic commit refusal/u);
  assert.equal(f.store.state.paymentSubmission.length, 0); assert.equal(f.store.state.paymentNotificationOutbox.length, 0);
});
