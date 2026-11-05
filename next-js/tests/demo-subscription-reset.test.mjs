import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { demoId } from "../src/server/demo/forecast.ts";
import { inspectDemoSubscriptionReset, legacyDemoPlanIds, resetDemoSubscriptions } from "../src/server/demo/subscription-reset.ts";

function snapshot() {
  const accountId = demoId("workspace-member", 0), paymentId = demoId("workspace-payment", 0), codeId = demoId("workspace-access", 0);
  return {
    plans: [...[1, 7, 30, 90, 180, 365].map((durationDays) => ({ id: randomUUID(), name: String(durationDays), durationDays, active: true })),
      ...legacyDemoPlanIds.map((id) => ({ id, name: "Synthetic offer", durationDays: 14, active: false }))],
    payments: [{ id: paymentId, accountId, planId: legacyDemoPlanIds[1], source: "report", claimedTxnKey: "demo000001", walletUgx: 0 }],
    codes: [{ id: codeId, accountId, planId: legacyDemoPlanIds[1], paymentSubmissionId: paymentId,
      source: "payment", amountReceivedUgx: null, createdBy: "member-admin:test" }],
    accounts: [{ id: accountId, creditUgx: 6500, autoRenewPlanId: null }],
    wallets: [{ id: "seed-credit", accountId, requestKey: "development-demo-wallet-0", kind: "adjustment", amountUgx: 5000,
      paymentSubmissionId: null, accessCodeId: null }],
    receipts: [{ id: "receipt", transactionKey: "DEMO000001", allocatedSubmissionId: paymentId, intendedSubmissionId: paymentId,
      claims: [{ id: "claim", submissionId: paymentId, evidence: [] }] }],
    sessions: 1, notices: 0, memberNotices: 0, reservations: [], replacements: 0, referralRewards: 0, moves: 0, accountCount: 3,
  };
}

test("preview recognizes admin-approved synthetic payments and case-sensitive legacy receipt duplicates", () => {
  const state = snapshot();
  state.receipts.push({ ...structuredClone(state.receipts[0]), id: "receipt-lower", transactionKey: "demo000001" });
  const result = inspectDemoSubscriptionReset(state);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.report.plans.length, 5);
  assert.equal(result.report.remainingPlans.length, 6);
  assert.equal(result.report.receipts, 2);
  assert.equal(result.report.walletCorrections, 1);
  assert.equal(result.report.syntheticCreditUgx, 5000);
  assert.equal(result.report.accountsPreserved, 3);
});

test("genuine payment identities, receipt claims and wallet links block all cleanup", () => {
  for (const mutate of [
    (state) => { state.payments[0].id = randomUUID(); },
    (state) => { state.payments[0].claimedTxnKey = "REAL123"; },
    (state) => { state.payments[0].transactionRef = "REAL123"; },
    (state) => { state.payments[0].approvedTxnKey = "mtn:REAL123"; },
    (state) => { state.receipts[0].transactionKey = "REAL123"; },
    (state) => { state.receipts[0].claims[0].submissionId = randomUUID(); },
    (state) => { state.wallets[0].accessCodeId = state.codes[0].id; },
    (state) => { state.codes[0].planId = state.plans[0].id; },
    (state) => { state.codes[0].paymentSubmissionId = null; state.codes[0].source = "manual"; state.codes[0].amountReceivedUgx = 1000; },
  ]) {
    const state = snapshot(); mutate(state);
    assert.ok(inspectDemoSubscriptionReset(state).blockers.length);
  }
});

test("credit corrections preserve genuine balances and are idempotent without deleting ledger history", () => {
  const state = snapshot(), entry = state.wallets[0];
  const first = inspectDemoSubscriptionReset(state);
  assert.equal(first.corrections[0].amountUgx, 5000);
  state.wallets.push({ ...entry, id: "reset-credit", requestKey: first.corrections[0].requestKey, amountUgx: -5000 });
  state.accounts[0].creditUgx = 1500;
  const repeated = inspectDemoSubscriptionReset(state);
  assert.deepEqual(repeated.blockers, []);
  assert.equal(repeated.report.walletCorrections, 0);
  assert.equal(state.wallets.length, 2);
});

test("spent or transferred synthetic credit and unexpected standard catalogs require review", () => {
  for (const mutate of [
    (state) => { state.accounts[0].creditUgx = 4999; },
    (state) => { state.reservations = [{ accountId: state.accounts[0].id, _sum: { walletUgx: 2000 } }]; },
    (state) => { state.moves = 1; },
    (state) => { state.plans[0].durationDays = 2; },
    (state) => { state.replacements = 1; },
    (state) => { state.referralRewards = 1; },
  ]) {
    const state = snapshot(); mutate(state);
    assert.ok(inspectDemoSubscriptionReset(state).blockers.length);
  }
});

test("reset refuses production/private targets before executing SQL", async (t) => {
  const previous = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_GOAL_HINT_DEMO: process.env.NEXT_PUBLIC_GOAL_HINT_DEMO,
    DATABASE_URL: process.env.DATABASE_URL };
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const database = { transaction: () => assert.fail("A refused target must not execute SQL") };
  for (const [mode, url] of [["production", "mysql://demo@127.0.0.1/goal_hint_demo"],
    ["development", "mysql://demo@127.0.0.1/private_application"], ["development", "mysql://demo@remote.invalid/goal_hint_demo"]]) {
    Object.assign(process.env, { NODE_ENV: mode, NEXT_PUBLIC_GOAL_HINT_DEMO: "true", DATABASE_URL: url });
    await assert.rejects(resetDemoSubscriptions(database), /development demo mode|loopback/u);
  }
});
