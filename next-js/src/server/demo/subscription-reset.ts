import "server-only";

import { realpath } from "node:fs/promises";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import { appendWalletEntry } from "../members/wallet.ts";
import { assertDemoDatabase, demoMember } from "./member.ts";
import { demoId } from "./forecast.ts";

const workspaceMembers = Array.from({ length: 48 }, (_, index) => ({
  accountId: demoId("workspace-member", index), paymentId: demoId("workspace-payment", index),
  transactionKey: `demo${String(index + 1).padStart(6, "0")}`,
  walletKey: `development-demo-wallet-${index}`, creditUgx: (index % 5 + 1) * 5000,
}));
export const legacyDemoPlanIds = Object.freeze([demoMember.planId,
  ...Array.from({ length: 4 }, (_, index) => demoId("workspace-plan", index))]);
const planIds = new Set<string>(legacyDemoPlanIds);
const paymentsById = new Map(workspaceMembers.map((member) => [member.paymentId, member]));
const creditFixtures = [...workspaceMembers, { accountId: demoMember.accountId,
  walletKey: "development-demo-initial-credit", creditUgx: 100000 }];
const creditsByKey = new Map(creditFixtures.map((fixture) => [fixture.walletKey, fixture]));
const correctionKey = (id: string) => `development-demo-credit-reset:${id}`;
const standardDurations = [1, 7, 30, 90, 180, 365];
const notificationKeys = (paymentIds: readonly string[], codeIds: readonly string[]) => [
  ...paymentIds.flatMap((id) => ["payment-approved", "payment-rejected"].map((kind) => `${kind}:${id}`)),
  ...codeIds.map((id) => `access-activated:${id}`),
];

async function readState(tx: Prisma.TransactionClient) {
  const plans = await tx.subscriptionPlan.findMany({ select: { id: true, name: true, active: true, durationDays: true }, orderBy: { id: "asc" } });
  const payments = await tx.paymentSubmission.findMany({ where: { planId: { in: [...legacyDemoPlanIds] } },
    select: { id: true, accountId: true, planId: true, source: true, claimedTxnKey: true, walletUgx: true } });
  const paymentIds = payments.map((payment) => payment.id);
  const codes = await tx.accessCode.findMany({ where: { OR: [
    { planId: { in: [...legacyDemoPlanIds] } }, { paymentSubmissionId: { in: paymentIds } },
  ] }, select: { id: true, accountId: true, planId: true, paymentSubmissionId: true,
    source: true, amountReceivedUgx: true, createdBy: true } });
  const codeIds = codes.map((code) => code.id);
  const accounts = await tx.memberAccount.findMany({ where: { OR: [
    { id: { in: [...creditFixtures.map((fixture) => fixture.accountId), ...codes.map((code) => code.accountId),
      ...payments.map((payment) => payment.accountId)] } }, { autoRenewPlanId: { in: [...legacyDemoPlanIds] } },
  ] }, select: { id: true, creditUgx: true, autoRenewPlanId: true } });
  const accountIds = accounts.map((account) => account.id);
  const wallets = await tx.walletEntry.findMany({ where: { OR: [{ accountId: { in: accountIds } },
    { paymentSubmissionId: { in: paymentIds } }, { accessCodeId: { in: codeIds } }] },
    select: { id: true, accountId: true, requestKey: true, kind: true, amountUgx: true, paymentSubmissionId: true, accessCodeId: true } });
  const receipts = await tx.paymentReceipt.findMany({ where: { OR: [
    { allocatedSubmissionId: { in: paymentIds } }, { intendedSubmissionId: { in: paymentIds } },
    { claims: { some: { submissionId: { in: paymentIds } } } },
  ] }, select: { id: true, transactionKey: true, allocatedSubmissionId: true, intendedSubmissionId: true,
    claims: { select: { id: true, submissionId: true, evidence: { select: { id: true } } } } } });
  const [sessions, notices, memberNotices, reservations, replacements, referralRewards, moves, accountCount] = await Promise.all([
    tx.memberSession.count({ where: { accessCodeId: { in: codeIds } } }),
    tx.paymentNotificationOutbox.count({ where: { targetId: { in: [...paymentIds, ...codeIds] } } }),
    tx.memberNotification.count({ where: { eventKey: { in: notificationKeys(paymentIds, codeIds) } } }),
    tx.paymentSubmission.groupBy({ by: ["accountId"], where: { accountId: { in: accountIds }, reservationActive: true }, _sum: { walletUgx: true } }),
    tx.accessCode.count({ where: { replacedById: { in: codeIds } } }),
    tx.memberReferral.count({ where: { accessCodeId: { in: codeIds } } }),
    tx.accountMove.count({ where: { OR: [{ fromAccountId: { in: creditFixtures.map((fixture) => fixture.accountId) } },
      { toAccountId: { in: creditFixtures.map((fixture) => fixture.accountId) } }] } }),
    tx.memberAccount.count(),
  ]);
  return { plans, payments, codes, accounts, wallets, receipts, sessions, notices, memberNotices, reservations, replacements, referralRewards, moves, accountCount };
}

type ResetState = Awaited<ReturnType<typeof readState>>;

/** Only deterministic fixture identities and their verified synthetic relationships may be removed. */
export function inspectDemoSubscriptionReset(state: ResetState) {
  const blockers: string[] = [];
  const retained = state.plans.filter((plan) => !planIds.has(plan.id));
  if (retained.length !== standardDurations.length || standardDurations.some((days) =>
    retained.filter((plan) => plan.active && plan.durationDays === days).length !== 1)) {
    blockers.push("Keep exactly one active standard plan for each of 1, 7, 30, 90, 180 and 365 days before resetting demo data.");
  }
  const paymentIds = new Set(state.payments.map((payment) => payment.id));
  const codeIds = new Set(state.codes.map((code) => code.id));
  const paymentAccounts = new Map(state.payments.map((payment) => [payment.id, payment.accountId]));
  for (const payment of state.payments) {
    const fixture = paymentsById.get(payment.id);
    if (!fixture || payment.accountId !== fixture.accountId || payment.source !== "report"
      || payment.claimedTxnKey?.toLowerCase() !== fixture.transactionKey || payment.walletUgx !== 0) {
      blockers.push("A demo plan has payment activity that is not a recognized synthetic fixture.");
    }
  }
  for (const code of state.codes) {
    const syntheticPayment = code.paymentSubmissionId && paymentIds.has(code.paymentSubmissionId)
      && paymentAccounts.get(code.paymentSubmissionId) === code.accountId;
    const syntheticGrant = code.source === "manual" && (code.amountReceivedUgx ?? 0) === 0
      && (code.createdBy === "development-demo" || code.id === demoMember.accessCodeId);
    if (!code.planId || !planIds.has(code.planId) || !syntheticPayment && !syntheticGrant) {
      blockers.push("A demo plan has access that cannot be verified as a synthetic payment or grant.");
    }
  }
  for (const receipt of state.receipts) {
    const related = [...receipt.claims.map((claim) => claim.submissionId), receipt.allocatedSubmissionId, receipt.intendedSubmissionId]
      .filter((id): id is string => id !== null);
    if (!related.length || related.some((id) => !paymentIds.has(id)
      || paymentsById.get(id)?.transactionKey !== receipt.transactionKey.toLowerCase())) {
      blockers.push("A receipt linked to demo data contains a genuine or unrecognized payment identity.");
    }
  }
  if (state.replacements || state.referralRewards) blockers.push("Demo access is linked to a replacement or referral award; review that relationship first.");
  if (state.moves) blockers.push("Synthetic starting credit was involved in an account transfer; review its current holder first.");
  if (state.wallets.some((entry) => entry.paymentSubmissionId && paymentIds.has(entry.paymentSubmissionId)
    || entry.accessCodeId && codeIds.has(entry.accessCodeId))) {
    blockers.push("A demo payment or access period is linked to wallet activity that must be preserved.");
  }
  const corrections: { accountId: string; entryId: string; amountUgx: number; requestKey: string }[] = [];
  const accounts = new Map(state.accounts.map((account) => [account.id, account]));
  const reserved = new Map(state.reservations.map((reservation) => [reservation.accountId, reservation._sum.walletUgx ?? 0]));
  const entriesByKey = new Map(state.wallets.filter((entry) => entry.requestKey).map((entry) => [entry.requestKey!, entry]));
  for (const entry of state.wallets) {
    const fixture = entry.requestKey && creditsByKey.get(entry.requestKey);
    if (!fixture) continue;
    if (entry.accountId !== fixture.accountId || entry.kind !== "adjustment" || entry.amountUgx !== fixture.creditUgx
      || entry.paymentSubmissionId || entry.accessCodeId) {
      blockers.push("A synthetic starting-credit fixture was changed; review its ledger first.");
      continue;
    }
    const requestKey = correctionKey(entry.id), correction = entriesByKey.get(requestKey);
    if (correction) {
      if (correction.accountId !== entry.accountId || correction.kind !== "adjustment" || correction.amountUgx !== -entry.amountUgx) {
        blockers.push("An existing demo credit correction does not match its original fixture.");
      }
      continue;
    }
    if ((accounts.get(entry.accountId)?.creditUgx ?? -1) - (reserved.get(entry.accountId) ?? 0) < entry.amountUgx) {
      blockers.push("Synthetic starting credit has been spent or reserved; review the available balance before correcting it.");
    } else corrections.push({ accountId: entry.accountId, entryId: entry.id, amountUgx: entry.amountUgx, requestKey });
  }
  return { blockers: [...new Set(blockers)], corrections, report: {
    plans: state.plans.filter((plan) => planIds.has(plan.id)).map(({ id, name }) => ({ id, name })),
    remainingPlans: retained.map(({ id, name, durationDays }) => ({ id, name, durationDays })),
    payments: state.payments.length, accessPeriods: state.codes.length, receipts: state.receipts.length,
    receiptClaims: state.receipts.reduce((total, receipt) => total + receipt.claims.length, 0),
    receiptEvidence: state.receipts.reduce((total, receipt) => total + receipt.claims.reduce((sum, claim) => sum + claim.evidence.length, 0), 0),
    sessionsToRelock: state.sessions, notifications: state.notices, memberNotifications: state.memberNotices,
    autoRenewals: state.accounts.filter((account) => account.autoRenewPlanId && planIds.has(account.autoRenewPlanId)).length,
    walletCorrections: corrections.length, syntheticCreditUgx: corrections.reduce((total, entry) => total + entry.amountUgx, 0),
    accountsPreserved: state.accountCount,
  } };
}

/** A dry run is the default. This deliberately cannot run against production or a configured private database. */
export async function resetDemoSubscriptions(database: DatabaseRuntime, { apply = false, expectedDatadir, now = Date.now }:
  { apply?: boolean; expectedDatadir?: string; now?: () => number } = {}) {
  assertDemoDatabase();
  if (apply && !expectedDatadir) throw new Error("Applying the demo reset requires the independently verified owned MySQL data directory.");
  return database.transaction(async (tx) => {
    const [identity] = await tx.$queryRaw<{ name: string; datadir: string }[]>`SELECT DATABASE() AS name, @@datadir AS datadir`;
    if (!identity || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(identity.name)) throw new Error("Demo subscription reset requires the isolated demo database.");
    if (expectedDatadir) {
      const [expected, actual] = await Promise.all([realpath(expectedDatadir), realpath(identity.datadir)]);
      const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
      if (normalize(expected) !== normalize(actual)) throw new Error("The demo MySQL data directory does not match the verified owned target; no records were changed.");
    }
    let state = await readState(tx);
    if (apply) {
      const accountIds = state.accounts.map((account) => account.id).sort();
      if (accountIds.length) await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id IN (${Prisma.join(accountIds)}) ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM SubscriptionSettings WHERE id=1 FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM SubscriptionPlan ORDER BY id FOR UPDATE`;
      const locked = await readState(tx);
      if (locked.accounts.some((account) => !accountIds.includes(account.id))) throw new Error("Demo subscription data changed during reset; run the preview again.");
      state = locked;
    }
    const inspection = inspectDemoSubscriptionReset(state);
    if (inspection.blockers.length || !apply) return { status: inspection.blockers.length ? "blocked" as const : "preview" as const,
      ...inspection.report, blockers: inspection.blockers };
    const at = new Date(now()), paymentIds = state.payments.map((payment) => payment.id), codeIds = state.codes.map((code) => code.id);
    const receiptIds = state.receipts.map((receipt) => receipt.id), claimIds = state.receipts.flatMap((receipt) => receipt.claims.map((claim) => claim.id));
    for (const entry of inspection.corrections) {
      await appendWalletEntry(tx, entry.accountId, { kind: "adjustment", amountUgx: -entry.amountUgx,
        actor: "admin", at, requestKey: entry.requestKey, note: "Removed synthetic development starting credit" });
    }
    await tx.memberSession.updateMany({ where: { accessCodeId: { in: codeIds } }, data: { accessCodeId: null, codeEnteredAt: null } });
    await tx.memberAccount.updateMany({ where: { autoRenewPlanId: { in: [...legacyDemoPlanIds] } },
      data: { autoRenew: false, autoRenewPlanId: null, autoRenewTermsVersion: null } });
    await tx.paymentNotificationOutbox.deleteMany({ where: { targetId: { in: [...paymentIds, ...codeIds] } } });
    await tx.memberNotification.deleteMany({ where: { eventKey: { in: notificationKeys(paymentIds, codeIds) } } });
    await tx.paymentReceiptEvidence.deleteMany({ where: { claimId: { in: claimIds } } });
    await tx.paymentReceiptClaim.deleteMany({ where: { id: { in: claimIds } } });
    await tx.paymentReceipt.deleteMany({ where: { id: { in: receiptIds } } });
    await tx.accessCode.deleteMany({ where: { id: { in: codeIds } } });
    await tx.paymentSubmission.deleteMany({ where: { id: { in: paymentIds } } });
    await tx.subscriptionPlan.deleteMany({ where: { id: { in: [...legacyDemoPlanIds] } } });
    for (const plan of inspection.report.plans) await writeOwnerAudit(tx, { at, actor: "admin:demo-reset", action: "plan_deleted",
      targetType: "plan", targetId: plan.id, details: { synthetic: true, name: plan.name } });
    return { status: "applied" as const, ...inspection.report, blockers: [] };
  }, { isolationLevel: "ReadCommitted", timeout: 60000 });
}
