import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";

const targetId = "22222222-2222-4222-8222-222222222222";
const payment = (id, status = "approved") => ({
  id, status, reference: "ABCD", accountId: "11111111-1111-4111-8111-111111111111", payerPhone: null,
  claimedNetwork: "mtn", claimedTxnRef: null, claimedTxnKey: null, claimedAmountUgx: 5000, screenshotAmountUgx: null,
  purpose: "plan", planId: null, planName: "Weekly", durationDays: 7, priceUgx: 5000,
  submittedAt: new Date("2026-01-01T09:00:00Z"), imageSha256: null, transactionRef: null, network: null,
  amountReceivedUgx: 5000, account: { phone: null, creditUgx: 0 }, screenshot: null,
});

function fixture(target, rows = []) {
  const reads = [];
  const database = { query: async run => run({ paymentSubmission: {
    findUnique: async query => { reads.push({ kind: "target", query }); return target; },
    findMany: async query => { reads.push({ kind: "queue", query }); return [...rows]; },
    count: async () => 4,
  } }) };
  return { review: createPaymentReview(database), reads };
}

test("a historical payment uses its current status and remains selectable beyond the queue limit", async () => {
  const target = payment(targetId, "reversed"), rows = Array.from({ length: 100 }, (_, index) => payment(`queue-${index}`));
  const { review, reads } = fixture(target, rows);
  const queue = await review.list("pending", targetId);
  assert.equal(queue.tab, "approved");
  assert.equal(queue.targetFound, true);
  assert.equal(queue.payments.length, 100);
  assert.equal(queue.payments.at(-1).id, targetId);
  assert.deepEqual(reads.find(read => read.kind === "queue").query.where, { status: { in: ["approved", "reversed"] } });
});

test("an already loaded exact payment is not duplicated and rejected reports select that queue", async () => {
  const target = payment(targetId, "rejected"), { review, reads } = fixture(target, [target]);
  const queue = await review.list("pending", targetId);
  assert.equal(queue.tab, "rejected");
  assert.equal(queue.payments.length, 1);
  assert.deepEqual(reads.find(read => read.kind === "queue").query.where, { status: "rejected" });
});

test("a deleted target is explicitly unavailable even when the ordinary queue has other payments", async () => {
  const { review } = fixture(null, [payment("other", "pending")]);
  const queue = await review.list("pending", targetId);
  assert.equal(queue.targetFound, false);
  assert.equal(queue.payments.some(row => row.id === targetId), false);
});

test("ordinary queue requests keep their existing status filter without an exact-record lookup", async () => {
  const { review, reads } = fixture(null);
  const queue = await review.list("superseded");
  assert.deepEqual(queue, { pendingCount: 4, payments: [] });
  assert.deepEqual(reads.find(read => read.kind === "queue").query.where, { status: "superseded" });
  assert.equal(reads.some(read => read.kind === "target"), false);
});
