import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

const clock = Date.parse("2026-10-23T12:00:00Z");
const payment = (id, status = "pending", change = {}) => ({ id, status, reference: id.toUpperCase(), accountId: `account-${id}`,
  account: { phone: "256700000101" }, payerPhone: null, claimedNetwork: "mtn", claimedTxnRef: null, claimedTxnKey: null,
  claimedAmountUgx: 5000, planId: "old-plan", planName: "Saved offer", durationDays: 17, priceUgx: 5000,
  submittedAt: new Date(clock), imageSha256: null, screenshot: null, transactionRef: null, approvedTxnKey: null,
  amountReceivedUgx: null, network: null, submittedSessionHash: "never-expose-session-hash", ...change });

function fixture(rows = [], accounts = []) {
  const calls = [];
  const tx = {
    paymentSubmission: {
      async findMany(query) {
        if (query.where.status) {
          calls.push("payments");
          const status = query.where.status;
          return rows.filter(row => typeof status === "string" ? row.status === status : status.in.includes(row.status))
            .sort((a, b) => (query.orderBy[0].submittedAt === "asc" ? 1 : -1) * (+a.submittedAt - +b.submittedAt) || a.id.localeCompare(b.id))
            .slice(0, query.take);
        }
        calls.push("related");
        return rows.filter(row => query.where.OR.some(condition => Object.entries(condition).some(([field, filter]) => filter.in.includes(row[field]))));
      },
      async count() { calls.push("count"); return rows.filter(row => row.status === "pending").length; },
    },
    memberAccount: { async findMany(query) {
      calls.push(query.where.phone ? "payers" : "trials");
      return query.where.phone ? accounts.filter(account => query.where.phone.in.includes(account.phone)) : accounts.filter(account => account.trialRequestedAt);
    } },
    ownerAuditEvent: { async findMany() { calls.push("trial-events"); return []; } },
    rateLimitBucket: { async findMany() { calls.push("trial-buckets"); return []; } },
  };
  return { calls, review: createPaymentReview({ query: run => run(tx) }, () => clock, { notifications: silentPaymentNotifications }) };
}

test("pending review is strict, oldest first, and invalid tabs use the same queue", async () => {
  const f = fixture([payment("later", "pending", { submittedAt: new Date(clock + 1) }), payment("oldest"),
    payment("replaced", "superseded"), payment("accepted", "approved"), payment("declined", "rejected")]);
  for (const tab of [undefined, "pending", "unknown", ""]) {
    const queue = await f.review.list(tab);
    assert.deepEqual(queue.payments.map(row => row.id), ["oldest", "later"]);
    assert.equal(queue.pendingCount, 2);
  }
});

test("history tabs keep superseded reports separate, retain reversals, and omit pending trial work", async () => {
  const trial = { id: "trial-account", phone: "256700000108", trialRequestedAt: new Date(clock) };
  const f = fixture([payment("pending"), payment("old", "superseded"), payment("approved", "approved"),
    payment("reversed", "reversed", { submittedAt: new Date(clock + 1) }), payment("rejected", "rejected")], [trial]);
  assert.deepEqual((await f.review.list("approved")).payments.map(row => row.id), ["reversed", "approved"]);
  assert.deepEqual((await f.review.list("superseded")).payments.map(row => row.id), ["old"]);
  const rejected = await f.review.list("rejected");
  assert.deepEqual(rejected.payments.map(row => row.id), ["rejected"]);
  assert.deepEqual(rejected.trials, []);
  assert.ok(!f.calls.includes("trials"));
  const pending = await f.review.list();
  assert.equal(pending.trials[0].id, trial.id);
  assert.equal(pending.trials[0].ipCount, null);
  assert.ok(!f.calls.includes("trial-buckets"), "No IP keys means no rate-bucket query.");
});

test("review exposes the saved duration and safe evidence while preserving duplicate and wallet warnings", async () => {
  const current = payment("report", "pending", { claimedTxnRef: "SAME-ID", claimedTxnKey: "SAMEID", imageSha256: "image-digest",
    payerPhone: "256700000202", screenshot: { submissionId: "report" } });
  const approved = payment("previous", "approved", { approvedTxnKey: "airtel:SAMEID", imageSha256: "image-digest" });
  const other = payment("other", "pending", { claimedTxnKey: "SAMEID" });
  const f = fixture([current, approved, other], [{ id: "payer-account", phone: current.payerPhone }]);
  const card = (await f.review.list()).payments.find(row => row.id === current.id);
  assert.equal(card.durationDays, 17, "Duration comes from the submission snapshot.");
  assert.equal(card.planName, "Saved offer");
  assert.equal(card.reference, "PREPORT");
  assert.equal(card.transactionId, "SAMEID");
  assert.equal(card.hasImage, true);
  assert.equal(card.final, null);
  assert.ok(card.checks.some(check => /Check your wallet SMS/u.test(check.text)));
  for (const text of ["Already approved in PPREVIOUS", "Also in POTHER", "Same file as PPREVIOUS", "Payer has its own", "verify the sender"]) {
    assert.ok(card.checks.some(check => check.tone === "warning" && check.text.includes(text)), text);
  }
  assert.doesNotMatch(JSON.stringify(card), /never-expose|image-digest|approvedTxnKey|submittedSessionHash/u);
});

test("legacy confirmed transaction IDs are displayed without hyphens while storage is preserved", async () => {
  const row = payment("paid", "approved", { transactionRef: "LEGACY-ID-001", network: "mtn", amountReceivedUgx: 5000 });
  const card = (await fixture([row]).review.list("approved")).payments[0];
  assert.equal(card.final.transactionId, "LEGACYID001");
  assert.equal(row.transactionRef, "LEGACY-ID-001");
});

test("code lookup accepts current and legacy payment references and preserves raw keys", async () => {
  const queries = [];
  const review = createPaymentReview({ query: run => run({ accessCode: { async findMany(query) { queries.push(query); return []; } } }) }, () => clock, { notifications: silentPaymentNotifications });
  for (const [search, key] of [["PABCD", "ABCD"], ["P-ABCD", "ABCD"], ["C-ABCD", "ABCD"], ["ABCD", "ABCD"], ["PABC", "PABC"], ["PPABC", "PABC"]]) {
    await review.codes(search);
    const conditions = queries.at(-1).where.OR;
    assert.equal(conditions[1].reference, key);
    assert.equal(conditions[2].paymentSubmission.reference, key);
  }
});

test("empty queues avoid unrelated proof, payer and trial evidence queries", async () => {
  const f = fixture();
  assert.deepEqual(await f.review.list(), { pendingCount: 0, payments: [], trials: [] });
  assert.deepEqual(f.calls, ["payments", "trials", "count"]);
  f.calls.length = 0;
  await f.review.list("approved");
  assert.deepEqual(f.calls, ["payments", "count"]);
});
