import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { costTestEnvironment } from "./helpers/cost-fixtures.mjs";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { appendWalletEntry } from "../src/server/members/wallet.ts";
import { demoId } from "../src/server/demo/forecast.ts";
import { demoMember } from "../src/server/demo/member.ts";
import { seedDemoMember } from "../src/server/demo/member-seed.ts";
import { seedDemoWorkspace } from "../src/server/demo/workspace-seed.ts";
import { legacyDemoPlanIds, resetDemoSubscriptions } from "../src/server/demo/subscription-reset.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";

test("owned MySQL demo cleanup preserves accounts, real access, history and balances atomically across retries and reseeding", { timeout: 180000 }, async (t) => {
  const fixture = await paidDatabase({ seedPlans: true, databaseName: "goal_hint_demo_subscription_reset" });
  t.after(() => fixture.close());
  const database = createDatabase(parseRuntimePolicy(costTestEnvironment(fixture.instance.url, fixture.instance.url)));
  t.after(() => database.disconnect());
  const environment = { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true", DATABASE_URL: fixture.instance.url };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const at = new Date(), accountId = demoId("workspace-member", 0), paymentId = demoId("workspace-payment", 0);
  const codeId = randomUUID(), realAccountId = randomUUID(), realCodeId = randomUUID();
  const expectedDatadir = join(fixture.instance.directory, "data");
  await seedDemoMember(database, +at);
  await fixture.root.query("CREATE TABLE AnalyticsSetting (`key` VARCHAR(64) PRIMARY KEY, value VARCHAR(256) NOT NULL, updatedAt DATETIME(3) NOT NULL)");
  await fixture.root.query("INSERT INTO AnalyticsSetting (`key`,value,updatedAt) VALUES (?, 'synthetic', ?)",
    [`demo-visits:${getReportingDate(utcInstantFromEpochMilliseconds(+at))}`, at]);
  let stage = "standard plans";
  await database.transaction(async (tx) => {
    for (const [name, durationDays, priceUgx] of [["Quarterly", 90, 50000], ["6 months", 180, 90000], ["Annually", 365, 150000]]) {
      await tx.subscriptionPlan.create({ data: { id: randomUUID(), name, durationDays, priceUgx, active: true, sortOrder: durationDays, createdAt: at, updatedAt: at } });
    }
    stage = "legacy demo plans";
    for (const [index, id] of legacyDemoPlanIds.entries()) await tx.subscriptionPlan.create({ data: {
      id, name: `Legacy demo ${index}`, durationDays: 1, priceUgx: 1000, active: false, sortOrder: index, createdAt: at, updatedAt: at,
    } });
    stage = "fixture accounts";
    for (const [id, phone] of [[accountId, "256700001000"], [realAccountId, "256700001234"]]) {
      await tx.memberAccount.create({ data: { id, phone, createdAt: at, lastSignInAt: at } });
    }
    await tx.memberAccount.update({ where: { id: accountId }, data: {
      autoRenew: true, autoRenewPlanId: legacyDemoPlanIds[1], autoRenewTermsVersion: "fixture" } });
    stage = "synthetic payment";
    await tx.paymentSubmission.create({ data: { id: paymentId, reference: "D100", source: "report", accountId,
      planId: legacyDemoPlanIds[1], planName: "Legacy demo 1", durationDays: 1, priceUgx: 1000,
      claimedNetwork: "mtn", claimedTxnRef: "DEMO000001", claimedTxnKey: "demo000001", claimedAmountUgx: 1000,
      status: "approved", submittedAt: at, decidedAt: at, decidedBy: "member-admin:fixture", network: "mtn",
      transactionRef: "DEMO000001", amountReceivedUgx: 1000, approvedTxnKey: "mtn:DEMO000001" } });
    stage = "access periods";
    const code = { codeSalt: new Uint8Array(16), codeHash: "a".repeat(64), durationDays: 1, createdAt: at,
      activatedAt: at, startsAt: at, endsAt: new Date(+at + 86400000) };
    await tx.accessCode.create({ data: { ...code, id: codeId, reference: "CDMM", accountId, source: "payment",
      paymentSubmissionId: paymentId, planId: legacyDemoPlanIds[1], planName: "Legacy demo 1", priceUgx: 1000, createdBy: "member-admin:fixture" } });
    await tx.accessCode.create({ data: { ...code, id: demoMember.accessCodeId, reference: "DM01", accountId: demoMember.accountId,
      source: "manual", planId: demoMember.planId, planName: "Legacy demo 0", priceUgx: 0, amountReceivedUgx: 0, createdBy: "development-demo" } });
    await tx.accessCode.create({ data: { ...code, id: realCodeId, reference: "REAL", accountId: realAccountId,
      source: "trial", planName: "Free trial", priceUgx: 0, createdBy: "registration" } });
    stage = "fixture session";
    await tx.memberSession.create({ data: { tokenHash: "b".repeat(64), accountId, createdAt: at, lastSeenAt: at,
      expiresAt: new Date(+at + 86400000), authenticatedAt: at, accessCodeId: codeId, codeEnteredAt: at } });
    stage = "receipt evidence";
    for (const [index, transactionKey] of ["DEMO000001", "demo000001"].entries()) {
      const receipt = await tx.paymentReceipt.create({ data: { id: randomUUID(), provider: "mtn", transactionKey,
        transactionId: transactionKey, intendedSubmissionId: paymentId,
        ...(index === 0 ? { allocatedSubmissionId: paymentId, allocatedAt: at, verifiedAt: at,
          verifiedBy: "member-admin:fixture", amountUgx: 1000, recipient: "historical", receivedAt: at } : {}) } });
      const claim = await tx.paymentReceiptClaim.create({ data: { id: randomUUID(), submissionId: paymentId, receiptId: receipt.id,
        amountUgx: 1000, paidAt: at, original: { legacy: true }, createdAt: at } });
      if (index === 0) await tx.paymentReceiptEvidence.create({ data: { id: randomUUID(), claimId: claim.id,
        image: new Uint8Array([1]), imageSha256: "c".repeat(64), createdAt: at } });
    }
    stage = "payment audit fixture";
    await tx.paymentEvent.create({ data: { id: randomUUID(), submissionId: paymentId, action: "legacy_import", actor: "system:migration", createdAt: at } });
    stage = "workspace synthetic credit";
    await appendWalletEntry(tx, accountId, { kind: "adjustment", amountUgx: 5000, actor: "admin", at,
      note: "Synthetic development credit", requestKey: "development-demo-wallet-0" });
    stage = "genuine credit";
    await appendWalletEntry(tx, accountId, { kind: "adjustment", amountUgx: 1500, actor: "admin", at,
      note: "Genuine fixture correction", requestKey: "genuine-fixture-credit" });
    stage = "main demo synthetic credit";
    await appendWalletEntry(tx, demoMember.accountId, { kind: "adjustment", amountUgx: 100000, actor: "admin", at,
      note: "Synthetic development starting credit", requestKey: "development-demo-initial-credit" });
    stage = "fixture notifications";
    for (const [memberId, kind, eventKey] of [[accountId, "payment-approved", `payment-approved:${paymentId}`],
      [accountId, "access-activated", `access-activated:${codeId}`], [realAccountId, "access-activated", `access-activated:${realCodeId}`]]) {
      await tx.memberNotification.create({ data: { id: randomUUID(), accountId: memberId, kind, eventKey, occurredAt: at, createdAt: at } });
    }
  }, { timeout: 60000, maxWait: 15000 }).catch((error) => { throw new Error(`Fixture failed during ${stage}: ${error.message}`); });
  async function records() {
    return database.query(async (tx) => ({ plans: await tx.subscriptionPlan.count(), payments: await tx.paymentSubmission.count(),
      codes: await tx.accessCode.findMany({ orderBy: { id: "asc" } }), receipts: await tx.paymentReceipt.count(), claims: await tx.paymentReceiptClaim.count(),
      evidence: await tx.paymentReceiptEvidence.count(), wallet: await tx.walletEntry.count(), events: await tx.paymentEvent.count(),
      notices: await tx.memberNotification.count(), accounts: await tx.memberAccount.findMany({ select: { id: true, creditUgx: true, autoRenew: true, autoRenewPlanId: true }, orderBy: { id: "asc" } }) }));
  }
  const before = await records(), preview = await resetDemoSubscriptions(database, { expectedDatadir });
  assert.equal(preview.status, "preview");
  assert.deepEqual([preview.plans.length, preview.payments, preview.accessPeriods, preview.receipts, preview.receiptClaims,
    preview.receiptEvidence, preview.walletCorrections, preview.syntheticCreditUgx, preview.memberNotifications], [5, 1, 2, 2, 2, 1, 2, 105000, 2]);
  assert.deepEqual(await records(), before, "dry run writes nothing");
  await assert.rejects(resetDemoSubscriptions(database, { apply: true, expectedDatadir: fixture.instance.directory }));
  assert.deepEqual(await records(), before, "a mismatched owned directory writes nothing");
  await fixture.root.query("CREATE TRIGGER reset_fixture_failure BEFORE DELETE ON SubscriptionPlan FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected reset rollback'");
  await assert.rejects(resetDemoSubscriptions(database, { apply: true, expectedDatadir }));
  assert.deepEqual(await records(), before, "failure after financial cleanup rolls every mutation back");
  await fixture.root.query("DROP TRIGGER reset_fixture_failure");
  const applied = await resetDemoSubscriptions(database, { apply: true, expectedDatadir });
  assert.equal(applied.status, "applied");
  const after = await records();
  assert.deepEqual([after.plans, after.payments, after.codes.length, after.receipts, after.claims, after.evidence, after.wallet, after.events, after.notices],
    [6, 0, 1, 0, 0, 0, 5, 1, 1]);
  assert.deepEqual(after.codes[0], before.codes.find((code) => code.id === realCodeId), "the unrelated registration trial is unchanged");
  assert.equal(after.accounts.length, 3);
  assert.equal(after.accounts.find((account) => account.id === accountId).creditUgx, 1500);
  assert.equal(after.accounts.find((account) => account.id === demoMember.accountId).creditUgx, 0);
  assert.equal(after.accounts.find((account) => account.id === accountId).autoRenew, false);
  const session = await database.query((tx) => tx.memberSession.findUnique({ where: { tokenHash: "b".repeat(64) } }));
  assert.equal(session.accessCodeId, null); assert.equal(session.codeEnteredAt, null);
  await assert.rejects(fixture.root.query("DELETE FROM WalletEntry"), /append.only/u, "ledger protection remains enabled");
  const repeated = await resetDemoSubscriptions(database, { apply: true, expectedDatadir });
  assert.equal(repeated.status, "applied"); assert.equal(repeated.walletCorrections, 0); assert.equal(repeated.plans.length, 0);
  await seedDemoMember(database, +at + 1000);
  await seedDemoWorkspace(database, +at + 1000);
  assert.deepEqual(await records(), after, "retries and normal demo preparation do not restore demo subscriptions or credit");
});
