import "server-only";

import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { accessCodeAlphabet, normalizeCode } from "../../domain/access-code.ts";
import { formatPaymentReference, normalizeTransactionId, transactionKey } from "../../domain/payment.ts";
import { normalizePhone, validMobilePhone } from "../../domain/phone.ts";
import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";
import { chainPeriods, extendPeriods, remainingDays, subscriptionDayMs } from "../../domain/subscription-period.ts";
import { activeSubscriptionUntil, type SubscriptionStatus } from "../../domain/subscription-summary.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import { renewalDue, walletRules } from "../../domain/wallet.ts";
import { auditTextErrors, writeOwnerAudit, type OwnerAuditAction } from "../admin/audit.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import type { AccessCode, Prisma } from "../generated/prisma/client.ts";
import { grantDevices, liveAccessCode, unlockedDeviceLimit } from "./device-grants.ts";
import type { MemberIdentity } from "./member-sessions.ts";
import { decide, lockSettings } from "./settings.ts";
import { createPaymentNotifications, enqueuePaymentNotice, type PaymentNotifications } from "./payment-notifications.ts";
import { acceptedTerms } from "./member-terms.ts";
import { appendWalletEntry, creditPath, InsufficientCredit, lastEntryNumber, lockedCredit } from "./wallet.ts";

export const generateCode = () => Array.from({ length: 12 }, () => accessCodeAlphabet[randomInt(32)]).join("");
export const newSalt = () => randomBytes(16);
export function hashCode(salt: Uint8Array, code: string): string {
  const normalized = normalizeCode(code);
  if (salt.length !== 16 || !normalized) throw new RangeError("A salt and valid code are required.");
  return createHash("sha256").update("goal-hint-access-code:v1:").update(salt).update(normalized).digest("hex");
}
export const newReference = () => `C-${Array.from({ length: 4 }, () => accessCodeAlphabet[randomInt(32)]).join("")}`;
export { transactionKey } from "../../domain/payment.ts";
const options = { isolationLevel: "ReadCommitted", timeout: 15_000 } as const;
const validDays = (days: number, maximum = 366) => Number.isInteger(days) && days >= 1 && days <= maximum;
const validAmount = (amount: number) => Number.isInteger(amount) && amount >= 0 && amount <= 4_294_967_295;
const invalid = (message = "Check the values and try again."): CodeFailure => ({ status: "invalid", message });
const newNumberInvalid = "Enter a mobile number that is valid for its country.";
const refused = (): CodeFailure => ({ status: "refused", message: "We couldn't complete this. Please contact us." });
const insufficient = (message = "Your credit doesn't cover this plan."): CodeFailure => ({ status: "insufficient", message });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/**
 * A ledger note: a short reason without long numbers, even ones split by spaces, dots, dashes, brackets or plus signs (the
 * database refuses the same shapes). Ledger rows cannot be erased, so a note must never hold a phone number.
 */
const validNote = (note: string) => note.length > 0 && note.length <= 200 && note === note.trim() && !/\d(?:[\s().+-]*\d){8,}/u.test(note) && !auditTextErrors({ note });

/** A new access period and the account's signed-in devices it unlocked; `payment` is its formatted payment reference, if any. */
/** A change to an account's credit: what this decision added (negative when spent) and the balance after it. */
export type CreditChange = Readonly<{ addedUgx: number; balanceUgx: number }>;
export type AccessGrant = Readonly<{ id: string; accountId: string; reference: string; planName: string; startsAt: Date; endsAt: Date;
  source: string; devicesUnlocked: number; payment?: string; paymentSubmissionId?: string; credit?: CreditChange }>;
export type CodeFailure = Readonly<{ status: "invalid" | "refused" | "duplicate" | "not-found" | "insufficient"; message: string; submissionId?: string }>;
export type CodeOutcome = Readonly<{ status: "created"; grant: AccessGrant; notification?: PaymentNotificationStatus }>
  | Readonly<{ status: "credited"; accountId: string; credit: CreditChange; payment: string; paymentSubmissionId: string; notification?: PaymentNotificationStatus }>
  | Readonly<{ status: "saved"; notification?: PaymentNotificationStatus }> | CodeFailure;
/** planId names the plan of a plan payment; a top-up report's approval takes none, since the report decides its purpose. */
export type PaymentApproval = Readonly<{ network: "mtn" | "airtel"; transactionRef: string; amountReceivedUgx: number; planId?: string }>;
type Snapshot = Readonly<{ planId?: string | null; planName: string; durationDays: number; priceUgx: number; extensionDays?: number }>;
type Creation = Snapshot & Readonly<{ source: string; paymentSubmissionId?: string; amountReceivedUgx?: number; note?: string; termsVersion?: string | null }>;
/** Who gets a new period's unlocks: the owner's device cap, and sessions that always get a slot (the submitting one). */
type Devices = Readonly<{ maximum: number; prefer?: readonly string[] }>;

export async function lockMemberAccount(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${id} FOR UPDATE`;
  return tx.memberAccount.findUnique({ where: { id } });
}

/** The account lock serializes confirmation and renewal. */
export async function activate(tx: Prisma.TransactionClient, accountId: string, code: Snapshot, now: Date, termsVersion: string | null) {
  const latest = await tx.accessCode.findFirst({ where: { accountId, revokedAt: null }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
  const startsAt = new Date(Math.max(now.getTime(), latest?.endsAt.getTime() ?? 0));
  return { activatedAt: now, startsAt, endsAt: new Date(startsAt.getTime() + (code.durationDays + (code.extensionDays ?? 0)) * subscriptionDayMs), termsVersion };
}

/** Retries only database-only, rolled-back work (a random reference collision or a concurrent row lock). */
async function codeTransaction<T>(database: DatabaseRuntime, run: (tx: Prisma.TransactionClient, rollback: (outcome: T) => never) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await decide(database, run); }
    catch (error) {
      if (attempt >= 3 || !(error instanceof DatabaseOperationError) || !["constraint", "conflict"].includes(error.code)) throw error;
    }
  }
}

/** Access periods without codes to send (068): every new period unlocks the account's signed-in devices directly. */
export function createAccessCodes({ database, now = Date.now, notifications = createPaymentNotifications({ database, now }) }: {
  database: DatabaseRuntime; now?: () => number; notifications?: PaymentNotifications;
  /** Accepted for existing callers; nothing here is keyed since code entry (and its throttle) was removed. */
  config?: Pick<AnalyticsConfig, "key">;
}) {
  const audit = (tx: Prisma.TransactionClient, accountId: string, id: string, action: OwnerAuditAction, actor: string, at: Date,
    details: Record<string, unknown> = {}, targetType: "access-code" | "member" | "payment" | "member-session" = "access-code") =>
    writeOwnerAudit(tx, { at, actor, action, accountId, targetType, targetId: id, details });

  async function create(tx: Prisma.TransactionClient, account: { id: string; phone: string | null }, fields: Creation, actor: string, at: Date,
    devices: Devices): Promise<AccessGrant> {
    if (!account.phone) throw new Error("An erased account cannot receive access.");
    // The code columns stay NOT NULL, so each period keeps a random code's salted hash; the plain code is never kept or shown.
    const salt = newSalt(), reference = newReference(), period = await activate(tx, account.id, fields, at, fields.termsVersion ?? null);
    const code = await tx.accessCode.create({ data: { ...fields, ...period, id: randomUUID(), accountId: account.id,
      codeSalt: salt, codeHash: hashCode(salt, generateCode()), reference: reference.slice(2), createdAt: at, createdBy: actor } });
    await audit(tx, account.id, code.id, "code_created", actor, at, { source: fields.source, reference, durationDays: code.durationDays,
      extensionDays: code.extensionDays, startsAt: code.startsAt, endsAt: code.endsAt });
    const devicesUnlocked = await grantDevices(tx, { accountId: account.id, codeId: code.id, at, maximum: devices.maximum, prefer: devices.prefer ?? [], actor });
    await audit(tx, account.id, code.id, "access_granted", actor, at, { source: fields.source, devicesUnlocked });
    return { id: code.id, accountId: account.id, reference, planName: code.planName, startsAt: code.startsAt, endsAt: code.endsAt, source: fields.source, devicesUnlocked,
      ...(fields.paymentSubmissionId ? { paymentSubmissionId: fields.paymentSubmissionId } : {}) };
  }

  async function rechain(tx: Prisma.TransactionClient, accountId: string, at: Date) {
    const codes = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } } });
    for (const code of chainPeriods(codes, at)) {
      const old = codes.find((row) => row.id === code.id)!;
      if (+old.startsAt !== +code.startsAt || +old.endsAt !== +code.endsAt) {
        await tx.accessCode.update({ where: { id: code.id }, data: { startsAt: code.startsAt, endsAt: code.endsAt } });
      }
    }
  }

  async function revoke(tx: Prisma.TransactionClient, code: AccessCode, reason: string, actor: string, at: Date, replacement?: string,
    details: Record<string, unknown> = {}) {
    await tx.accessCode.update({ where: { id: code.id }, data: { revokedAt: at, revokedReason: reason, ...(replacement ? { replacedById: replacement } : {}) } });
    // Devices keep their unlock through another live period of the account; only the last one locks them.
    const live = await liveAccessCode(tx, code.accountId, at);
    await tx.memberSession.updateMany({ where: { accountId: code.accountId, accessCodeId: code.id },
      data: live ? { accessCodeId: live.id } : { codeEnteredAt: null, accessCodeId: null } });
    await audit(tx, code.accountId, code.id, "code_revoked", actor, at, { reason, ...details });
  }

  async function accountForPhone(tx: Prisma.TransactionClient, phone: string, at: Date) {
    await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, createdAt, lastSignInAt) VALUES (${randomUUID()}, ${phone}, ${at}, ${at})
      ON DUPLICATE KEY UPDATE id = id`;
    return tx.memberAccount.findUniqueOrThrow({ where: { phone } });
  }

  async function approval(tx: Prisma.TransactionClient, account: { id: string; phone: string | null }, fields: PaymentApproval,
    actor: string, at: Date, submissionId?: string, note?: string): Promise<CodeOutcome> {
    const transactionRef = normalizeTransactionId(fields.transactionRef), key = transactionKey(transactionRef);
    if (!key || transactionRef.length > 40 || !["mtn", "airtel"].includes(fields.network) || !validAmount(fields.amountReceivedUgx)) return invalid();
    // The existing singleton lock serializes owner confirmations across accounts and networks, independently of key rotation.
    const settings = await lockSettings(tx, actor, at);
    const duplicate = await tx.paymentSubmission.findFirst({ where: { approvedTxnKey: { in: [`mtn:${key}`, `airtel:${key}`] } }, select: { id: true } });
    if (duplicate) return { status: "duplicate", message: "This transaction ID was already approved.", submissionId: duplicate.id };
    const existing = submissionId ? await tx.paymentSubmission.findUnique({ where: { id: submissionId } }) : null;
    if (submissionId && (!existing || existing.accountId !== account.id || !["pending", "superseded"].includes(existing.status))) return refused();
    const decision = { status: "approved", network: fields.network, transactionRef, amountReceivedUgx: fields.amountReceivedUgx,
      approvedTxnKey: `${fields.network}:${key}`, decidedAt: at, decidedBy: actor };
    // A top-up's purpose comes from the report, never the request: the money actually received becomes credit.
    if (existing?.purpose === "topup") {
      if (fields.amountReceivedUgx < walletRules.topUpMinUgx || fields.amountReceivedUgx > walletRules.topUpMaxUgx) {
        return invalid(`A top-up must be UGX ${walletRules.topUpMinUgx.toLocaleString("en-UG")} to ${walletRules.topUpMaxUgx.toLocaleString("en-UG")} received.`);
      }
      const submission = await tx.paymentSubmission.update({ where: { id: existing.id }, data: decision });
      const entry = await appendWalletEntry(tx, account.id, { kind: "topup", amountUgx: fields.amountReceivedUgx, actor: "admin", at, paymentSubmissionId: submission.id });
      await audit(tx, account.id, submission.id, "payment_approved", actor, at, { purpose: "topup", amountReceivedUgx: fields.amountReceivedUgx,
        creditAddedUgx: fields.amountReceivedUgx, balanceUgx: entry.balanceAfter }, "payment");
      return { status: "credited", accountId: account.id, credit: { addedUgx: fields.amountReceivedUgx, balanceUgx: entry.balanceAfter },
        payment: formatPaymentReference(submission.reference), paymentSubmissionId: submission.id };
    }
    // Without an explicit choice, a report is approved for the plan it names.
    const planId = fields.planId ?? existing?.planId;
    const plan = planId ? await tx.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
    if (!plan) return invalid("Choose a plan.");
    // Keep the offer the member actually paid for. An administrator may explicitly choose another package, but editing
    // a package's price or duration while a report waits cannot silently change the pending purchase.
    const offer = existing?.planId === plan.id ? existing : plan;
    const final = { planId: plan.id, planName: "planName" in offer ? offer.planName : offer.name, durationDays: offer.durationDays ?? plan.durationDays,
      priceUgx: offer.priceUgx, ...decision };
    // What was received above the price actually charged becomes credit; a larger excess is more likely a typing slip.
    const excess = fields.amountReceivedUgx - final.priceUgx;
    if (excess > walletRules.excessMaxUgx) return invalid(`UGX ${excess.toLocaleString("en-UG")} above the price is more than UGX ${walletRules.excessMaxUgx.toLocaleString("en-UG")}; check the amount received.`);
    const submission = existing ? await tx.paymentSubmission.update({ where: { id: existing.id }, data: final })
      : await tx.paymentSubmission.create({ data: { ...final, id: randomUUID(), accountId: account.id, reference: newReference().slice(2), source: "owner",
        submittedAt: at, claimedNetwork: fields.network, claimedTxnRef: final.transactionRef, claimedTxnKey: key, claimedAmountUgx: fields.amountReceivedUgx } });
    // The report's own session always gets a slot, even on a full account; other signed-in devices fill free slots.
    const grant = await create(tx, account, { source: "payment", paymentSubmissionId: submission.id, planId: plan.id, planName: final.planName,
      durationDays: final.durationDays, priceUgx: final.priceUgx, termsVersion: existing?.termsVersion ?? null, ...(note ? { note } : {}) }, actor, at,
      { maximum: settings.maxUnlockedDevices, prefer: existing?.submittedSessionHash ? [existing.submittedSessionHash] : [] });
    const credit = excess > 0 ? await appendWalletEntry(tx, account.id, { kind: "overpayment", amountUgx: excess, actor: "admin", at,
      paymentSubmissionId: submission.id }) : null;
    await audit(tx, account.id, submission.id, "payment_approved", actor, at, { codeId: grant.id, amountReceivedUgx: fields.amountReceivedUgx,
      ...(credit ? { creditAddedUgx: excess, balanceUgx: credit.balanceAfter } : {}) }, "payment");
    return { status: "created", grant: { ...grant, payment: formatPaymentReference(submission.reference),
      ...(credit ? { credit: { addedUgx: excess, balanceUgx: credit.balanceAfter } } : {}) } };
  }

  /** A session that may act for its account now: authenticated, not mid-reset, unexpired, on an open account with a number. */
  async function currentMember(tx: Prisma.TransactionClient, member: MemberIdentity, at: Date) {
    const account = await lockMemberAccount(tx, member.accountId);
    const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
    return account && !account.blockedAt && !account.erasedAt && account.phone && session?.accountId === account.id
      && session.authenticatedAt && !session.passwordResetAt && session.expiresAt > at ? account : null;
  }
  const salesOpen = async (tx: Prisma.TransactionClient) =>
    ((await tx.subscriptionSettings.findUnique({ where: { id: 1 }, select: { paywallMode: true } }))?.paywallMode ?? "off") !== "off";
  const grantOf = (code: AccessCode): AccessGrant => ({ id: code.id, accountId: code.accountId, reference: `C-${code.reference}`, planName: code.planName,
    startsAt: code.startsAt, endsAt: code.endsAt, source: code.source, devicesUnlocked: 0 });

  /** The approval's account-update notice, written in its own transaction: a plan payment's or a top-up's, never a free grant's. */
  async function approvalNotice(tx: Prisma.TransactionClient, outcome: CodeOutcome, at: Date): Promise<string | null> {
    if (outcome.status === "credited") return enqueuePaymentNotice(tx, { accountId: outcome.accountId, kind: "credited", targetId: outcome.paymentSubmissionId, at });
    if (outcome.status === "created" && outcome.grant.paymentSubmissionId) {
      return enqueuePaymentNotice(tx, { accountId: outcome.grant.accountId, kind: "approved", targetId: outcome.grant.paymentSubmissionId, at });
    }
    return null;
  }

  /** After commit only. A delivery failure leaves the committed notice for the outbox's dispatcher. */
  async function notifyApproval(outcome: CodeOutcome, noticeId: string | null): Promise<CodeOutcome> {
    if (!noticeId || (outcome.status !== "created" && outcome.status !== "credited")) return outcome;
    let notification: PaymentNotificationStatus;
    try { notification = await notifications.deliver(noticeId); }
    catch { notification = "queued"; }
    return { ...outcome, notification };
  }

  return Object.freeze({
    async manual(input: { phone: string; planId?: string; durationDays?: number; amountReceivedUgx: number; note: string;
      network?: "mtn" | "airtel"; transactionRef?: string }, actor: string): Promise<CodeOutcome> {
      const phone = normalizePhone(input.phone), note = input.note.trim();
      if (!phone || !note || note.length > 200 || !validAmount(input.amountReceivedUgx)
        || (!!input.network !== !!input.transactionRef) || input.transactionRef && !input.planId) return invalid();
      let noticeId: string | null = null;
      const outcome = await codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        noticeId = null;
        // A grant may create the account, which then needs a valid mobile number; an existing account keeps its number.
        if (!validMobilePhone(phone) && !await tx.memberAccount.findUnique({ where: { phone } })) return rollback(invalid(newNumberInvalid));
        const account = await accountForPhone(tx, phone, new Date(now()));
        const at = new Date(now());
        if (account.blockedAt || account.erasedAt) return rollback(refused());
        if (input.network && input.transactionRef && input.planId) {
          const outcome = await approval(tx, account, { network: input.network, transactionRef: input.transactionRef,
            planId: input.planId, amountReceivedUgx: input.amountReceivedUgx }, actor, at, undefined, note);
          if (outcome.status !== "created" && outcome.status !== "credited") return rollback(outcome);
          noticeId = await approvalNotice(tx, outcome, at);
          return outcome;
        }
        const plan = input.planId ? await tx.subscriptionPlan.findUnique({ where: { id: input.planId } }) : null;
        const days = plan?.durationDays ?? input.durationDays ?? 0;
        if (!validDays(days) || input.planId && !plan) return rollback(invalid());
        return { status: "created", grant: await create(tx, account, { source: "manual", planId: plan?.id ?? null,
          planName: plan?.name ?? "Manual", durationDays: days, priceUgx: plan?.priceUgx ?? 0, amountReceivedUgx: input.amountReceivedUgx, note }, actor, at,
          { maximum: await unlockedDeviceLimit(tx) }) };
      });
      return notifyApproval(outcome, noticeId);
    },

    async approvePayment(id: string, fields: PaymentApproval, actor: string): Promise<CodeOutcome> {
      let noticeId: string | null = null;
      const outcome = await codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        noticeId = null;
        const submission = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!submission) return rollback(refused());
        const account = await lockMemberAccount(tx, submission.accountId);
        if (!account || account.blockedAt || account.erasedAt) return rollback(refused());
        const at = new Date(now());
        const outcome = await approval(tx, account, fields, actor, at, id);
        if (outcome.status !== "created" && outcome.status !== "credited") return rollback(outcome);
        noticeId = await approvalNotice(tx, outcome, at);
        return outcome;
      });
      return notifyApproval(outcome, noticeId);
    },

    async revoke(id: string, reason: string, actor: string): Promise<CodeOutcome> {
      if (!reason.trim() || reason.length > 32 || auditTextErrors({ reason })) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const initial = await tx.accessCode.findUnique({ where: { id } });
        if (!initial) return rollback(refused());
        await lockMemberAccount(tx, initial.accountId);
        const code = await tx.accessCode.findUniqueOrThrow({ where: { id } });
        if (code.revokedAt) return rollback(refused());
        const at = new Date(now());
        await revoke(tx, code, reason.trim(), actor, at); await rechain(tx, code.accountId, at);
        return { status: "saved" };
      });
    },

    async extend(id: string, days: number, actor: string): Promise<CodeOutcome> {
      if (!validDays(days, 60)) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const initial = await tx.accessCode.findUnique({ where: { id } });
        if (!initial) return rollback(refused());
        await lockMemberAccount(tx, initial.accountId);
        const code = await tx.accessCode.findUniqueOrThrow({ where: { id } });
        if (code.revokedAt || code.extensionDays + days > 65_535) return rollback(refused());
        const at = new Date(now());
        const periods = await tx.accessCode.findMany({ where: { accountId: code.accountId, revokedAt: null } });
        for (const period of extendPeriods(periods, id, days)) {
          if (period.id !== id && period.startsAt < code.endsAt) continue;
          await tx.accessCode.update({ where: { id: period.id }, data: { extensionDays: period.extensionDays, startsAt: period.startsAt, endsAt: period.endsAt } });
        }
        await audit(tx, code.accountId, id, "code_extended", actor, at, { days });
        return { status: "saved" };
      });
    },

    async changeNumber(accountId: string, input: { newPhone: string; verifiedBy: "old-number" | "payment-details" }, actor: string): Promise<CodeOutcome> {
      const phone = normalizePhone(input.newPhone);
      if (!phone || !["old-number", "payment-details"].includes(input.verifiedBy)) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const at = new Date(now());
        let destination = await tx.memberAccount.findUnique({ where: { phone } });
        if (!destination) {
          if (!validMobilePhone(phone)) return rollback(invalid(newNumberInvalid));
          destination = await tx.memberAccount.create({ data: { id: randomUUID(), phone, createdAt: at, lastSignInAt: at } });
        }
        if (destination.id === accountId) return rollback(invalid());
        for (const id of [accountId, destination.id].sort()) await lockMemberAccount(tx, id);
        const old = await tx.memberAccount.findUnique({ where: { id: accountId } });
        destination = await tx.memberAccount.findUniqueOrThrow({ where: { id: destination.id } });
        if (!old || old.blockedAt || old.erasedAt || destination.blockedAt || destination.erasedAt) return rollback(refused());
        const codes = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } } });
        const days = remainingDays(codes, at), credit = await lockedCredit(tx, accountId) ?? 0;
        // Reports never change account, so a waiting top-up would be credited to the old number: decide it first.
        if (await tx.paymentSubmission.count({ where: { accountId, purpose: "topup", status: { in: ["pending", "superseded"] } } })) {
          return rollback(invalid("Approve or reject the waiting credit top-up first, so its credit moves too."));
        }
        if (days === 0 && credit === 0) return rollback(invalid("There is no remaining access or credit to move."));
        if (days !== 0 && !validDays(days)) return rollback(invalid("Remaining access must be between 1 and 366 days."));
        // The new number's signed-in devices get the remaining days; the old number's devices lock with its last period.
        const grant = days ? await create(tx, destination, { source: "number-change", planName: "Transferred access", durationDays: days, priceUgx: 0 }, actor, at,
          { maximum: await unlockedDeviceLimit(tx) }) : null;
        for (const code of codes) await revoke(tx, code, "number-change", actor, at, grant?.id, { verifiedBy: input.verifiedBy });
        // The move is recorded before its own ledger rows: credit at or before the old account's newest entry moved with the
        // person, which is how a later reversal finds who holds it.
        await tx.accountMove.create({ data: { fromAccountId: accountId, toAccountId: destination.id, fromEntryNumber: await lastEntryNumber(tx, accountId),
          movedAt: new Date(now()) } });
        // Credit follows the person, a debt included; both accounts are already locked in sorted order.
        if (credit) {
          await appendWalletEntry(tx, accountId, { kind: "transfer", amountUgx: -credit, actor: "admin", at, note: "Moved to the account's new number", allowNegative: true });
          await appendWalletEntry(tx, destination.id, { kind: "transfer", amountUgx: credit, actor: "admin", at, note: "Moved from the account's old number", allowNegative: true });
        }
        if (old.autoRenew) {
          await tx.memberAccount.update({ where: { id: accountId }, data: { autoRenew: false } });
          await tx.memberAccount.update({ where: { id: destination.id }, data: { autoRenew: true, autoRenewPlanId: old.autoRenewPlanId,
            autoRenewTermsVersion: old.autoRenewTermsVersion } });
        }
        await audit(tx, destination.id, grant?.id ?? destination.id, "number_changed", actor, at, { previousAccountId: accountId, verifiedBy: input.verifiedBy, days,
          creditMovedUgx: credit }, grant ? "access-code" : "member");
        return grant ? { status: "created", grant } : { status: "saved" };
      });
    },

    async reversePayment(id: string, reason: "network-reversal" | "wrong-account", actor: string): Promise<CodeOutcome & { carriedOtherDays?: boolean }> {
      if (!["network-reversal", "wrong-account"].includes(reason)) return invalid();
      // Discover account locks first, then re-read the chain while holding all of them. A concurrent transfer retries discovery.
      for (let attempt = 0; attempt < 4; attempt++) {
        const chain = await database.query(async (tx) => {
          const rows: AccessCode[] = [];
          let code = await tx.accessCode.findUnique({ where: { paymentSubmissionId: id } });
          while (code && !rows.some((row) => row.id === code!.id)) { rows.push(code); code = code.replacedById ? await tx.accessCode.findUnique({ where: { id: code.replacedById } }) : null; }
          return rows;
        });
        const owner = await database.query((tx) => tx.paymentSubmission.findUnique({ where: { id }, select: { accountId: true } }));
        // Number changes moved the person: the debt for credit they took along follows them to the account holding it now.
        const moves = owner ? await database.query(async (tx) => {
          const given = await tx.walletEntry.findFirst({ where: { paymentSubmissionId: id, accountId: owner.accountId, kind: { in: ["topup", "overpayment"] } },
            select: { entryNumber: true } });
          return given ? creditPath(tx, owner.accountId, given.entryNumber) : [];
        }) : [];
        const locked = [...new Set([...chain.map((row) => row.accountId), ...owner ? [owner.accountId] : [], ...moves])].sort();
        const outcome = await codeTransaction<CodeOutcome | { status: "retry"; }>(database, async (tx, rollback) => {
          for (const accountId of locked) await lockMemberAccount(tx, accountId);
          const submission = await tx.paymentSubmission.findUnique({ where: { id } });
          if (!submission || submission.status !== "approved" || !locked.includes(submission.accountId)) return rollback(refused());
          const topup = submission.purpose === "topup";
          if (!topup && !chain.length) return rollback(refused());
          let live = topup ? null : await tx.accessCode.findUniqueOrThrow({ where: { paymentSubmissionId: id } });
          const visited = new Set<string>();
          while (live?.replacedById) {
            if (visited.has(live.id)) return rollback(refused());
            visited.add(live.id); live = await tx.accessCode.findUniqueOrThrow({ where: { id: live.replacedById } });
            if (!locked.includes(live.accountId)) return rollback({ status: "retry" });
          }
          const given = await tx.walletEntry.findFirst({ where: { paymentSubmissionId: id, accountId: submission.accountId, kind: { in: ["topup", "overpayment"] } } });
          // The debt goes where the credit went: along each number change made after it was given, to the account holding it
          // now. Credit an old account got after its move stayed there, and so does its debt.
          const path = given ? await creditPath(tx, submission.accountId, given.entryNumber) : [submission.accountId];
          if (path.some((accountId) => !locked.includes(accountId))) return rollback({ status: "retry" });
          const holderId = path.at(-1)!;
          const holder = await tx.memberAccount.findUnique({ where: { id: holderId }, select: { erasedAt: true } });
          const at = new Date(now());
          await tx.paymentSubmission.update({ where: { id }, data: { status: "reversed", reversedAt: at, reverseReason: reason } });
          if (live && !live.revokedAt) { await revoke(tx, live, reason, actor, at); await rechain(tx, live.accountId, at); }
          // The credit this payment gave is taken back even if spent: only here (and with a moved debt) may a balance go negative.
          // Erasure already forfeited it and nobody can spend on an erased account, so no debt is recorded there.
          const debit = given && holder && !holder.erasedAt ? await appendWalletEntry(tx, submission.accountId, { kind: "reversal", amountUgx: -given.amountUgx,
            actor: "admin", at, paymentSubmissionId: id, allowNegative: true,
            note: reason === "network-reversal" ? "Payment reversed by the network" : "Payment approved on the wrong account" }) : null;
          // The reversal row must name its payment's own account (composite key); the debt then moves like a number change's.
          const moved = debit && holderId !== submission.accountId ? await (async () => {
            await appendWalletEntry(tx, submission.accountId, { kind: "transfer", amountUgx: given!.amountUgx, actor: "admin", at, allowNegative: true,
              note: "Reversed payment debt moved to the new number" });
            return appendWalletEntry(tx, holderId, { kind: "transfer", amountUgx: -given!.amountUgx, actor: "admin", at, allowNegative: true,
              note: "Reversed payment debt moved from the old number" });
          })() : null;
          await audit(tx, submission.accountId, id, "payment_reversed", actor, at, { reason, ...(live ? { liveCodeId: live.id } : {}),
            ...(debit ? { creditDebitedUgx: given!.amountUgx, balanceUgx: (moved ?? debit).balanceAfter, ...(moved ? { debtAccountId: holderId } : {}) } : {}) }, "payment");
          return { status: "saved", carriedOtherDays: live?.source === "number-change" };
        });
        if (outcome.status !== "retry") return outcome;
      }
      return refused();
    },

    async sendTrial(accountId: string, trialDays: number, actor: string): Promise<CodeOutcome> {
      if (!validDays(trialDays, 7)) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, accountId);
        if (!account || account.blockedAt || account.erasedAt || !account.trialRequestedAt || account.trialDismissedAt
          || await tx.accessCode.count({ where: { accountId } })) return rollback(refused());
        const at = new Date(now()), grant = await create(tx, account, { source: "trial", planName: "Free trial", durationDays: trialDays,
          priceUgx: 0, amountReceivedUgx: 0 }, actor, at, { maximum: await unlockedDeviceLimit(tx) });
        await audit(tx, accountId, grant.id, "trial_sent", actor, at, { days: trialDays });
        return { status: "created", grant };
      });
    },

    async dismissTrial(accountId: string, actor: string): Promise<CodeOutcome> {
      return codeTransaction(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, accountId);
        if (!account?.trialRequestedAt || account.trialDismissedAt || await tx.accessCode.count({ where: { accountId } })) return rollback(refused());
        const at = new Date(now());
        await tx.memberAccount.update({ where: { id: accountId }, data: { trialDismissedAt: at } });
        await audit(tx, accountId, accountId, "trial_dismissed", actor, at, {}, "member");
        return { status: "saved" };
      });
    },

    /**
     * Buys a plan with credit at once, without approval. requestKey (a client UUID) makes a repeated submit return the first
     * purchase instead of buying twice. The period starts at the end of the account's chain, or now after a lapse.
     */
    async purchaseWithCredit(member: MemberIdentity, input: { planId: string; requestKey: string; accepted: boolean }): Promise<CodeOutcome> {
      if (typeof input.planId !== "string" || !uuid.test(input.planId) || typeof input.requestKey !== "string" || !uuid.test(input.requestKey)) return invalid();
      return codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        const at = new Date(now()), account = await currentMember(tx, member, at);
        if (!account || member.administrator) return rollback(refused());
        const requestKey = `buy:${account.id}:${input.requestKey}`; // 77 characters, within the 80-character column
        const replay = await tx.walletEntry.findUnique({ where: { requestKey }, include: { accessCode: true } });
        if (replay?.accessCode && replay.accessCode.planId !== input.planId) {
          return rollback(invalid(`Your earlier purchase of ${replay.accessCode.planName} from credit went through. Refresh to see it.`));
        }
        if (replay?.accessCode) return { status: "created", grant: { ...grantOf(replay.accessCode), credit: { addedUgx: replay.amountUgx, balanceUgx: replay.balanceAfter } } };
        if (!await salesOpen(tx)) return rollback(refused());
        const plan = await tx.subscriptionPlan.findUnique({ where: { id: input.planId } });
        if (!plan?.active) return rollback(invalid("Choose a plan."));
        if (!input.accepted && !await acceptedTerms(tx, member, at)) return rollback(invalid("Accept the terms to continue."));
        const balance = await lockedCredit(tx, account.id);
        if (balance === null || balance < plan.priceUgx) return rollback(insufficient());
        const grant = await create(tx, account, { source: "credit", planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx,
          termsVersion: termsNotice.reviewedOn }, "member", at, { maximum: await unlockedDeviceLimit(tx), prefer: [member.tokenHash] });
        const entry = await appendWalletEntry(tx, account.id, { kind: "purchase", amountUgx: -plan.priceUgx, actor: "member", at, accessCodeId: grant.id, requestKey });
        await audit(tx, account.id, grant.id, "credit_spent", "member", at, { priceUgx: plan.priceUgx, balanceUgx: entry.balanceAfter });
        return { status: "created", grant: { ...grant, credit: { addedUgx: -plan.priceUgx, balanceUgx: entry.balanceAfter } } };
      });
    },

    /**
     * Renews one account from credit when its chain ends within the lead and the credit covers the auto-renew plan. The due
     * check runs again under the account lock and the request key names the chain end it renews, so the background job and a
     * member's request can race safely: the second finds nothing due. maxLapseMs bounds how long ago the chain may have
     * ended (the job's limit); a member's own request has none, and the new period then starts now, never backdated.
     */
    async renewDue(accountId: string, { prefer = [], maxLapseMs }: { prefer?: readonly string[]; maxLapseMs?: number } = {}): Promise<"renewed" | "skipped"> {
      // A cheap look outside the transaction (whose snapshot must start after the lock): most callers have nothing due.
      const due = await database.query(async (tx) => {
        const peek = await tx.memberAccount.findUnique({ where: { id: accountId }, select: { autoRenew: true, autoRenewPlanId: true } });
        if (!peek?.autoRenew || !peek.autoRenewPlanId) return false;
        const end = await tx.accessCode.findFirst({ where: { accountId, revokedAt: null }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
        return !!end && renewalDue(end.endsAt, new Date(now()), walletRules.renewLeadMs, maxLapseMs)
          && !await tx.walletEntry.findUnique({ where: { requestKey: `renewal:${accountId}:${+end.endsAt}` }, select: { id: true } });
      });
      if (!due) return "skipped";
      return codeTransaction<"renewed" | "skipped">(database, async (tx) => {
        const account = await lockMemberAccount(tx, accountId);
        if (!account || account.blockedAt || account.erasedAt || !account.phone || !account.autoRenew || !account.autoRenewPlanId) return "skipped";
        const at = new Date(now());
        const latest = await tx.accessCode.findFirst({ where: { accountId, revokedAt: null }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
        if (!latest || !renewalDue(latest.endsAt, at, walletRules.renewLeadMs, maxLapseMs) || !await salesOpen(tx)) return "skipped";
        const plan = await tx.subscriptionPlan.findUnique({ where: { id: account.autoRenewPlanId } });
        const balance = await lockedCredit(tx, accountId);
        if (!plan?.active || balance === null || balance < plan.priceUgx) return "skipped";
        // One renewal per period end. If the owner revoked it, the same end is not bought again; the member buys by hand.
        const requestKey = `renewal:${accountId}:${+latest.endsAt}`;
        if (await tx.walletEntry.findUnique({ where: { requestKey }, select: { id: true } })) return "skipped";
        const grant = await create(tx, account, { source: "renewal", planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx,
          termsVersion: account.autoRenewTermsVersion }, "system:auto-renew", at, { maximum: await unlockedDeviceLimit(tx), prefer });
        const entry = await appendWalletEntry(tx, accountId, { kind: "renewal", amountUgx: -plan.priceUgx, actor: "system", at, accessCodeId: grant.id, requestKey });
        await audit(tx, accountId, grant.id, "credit_renewed", "system:auto-renew", at, { priceUgx: plan.priceUgx, balanceUgx: entry.balanceAfter });
        // Its account-update SMS goes out from the outbox (the cron's notify step or an owner page load), so a member's own
        // page never waits on the gateway; a renewal stands whether or not that SMS is delivered.
        await enqueuePaymentNotice(tx, { accountId, kind: "renewed", targetId: grant.id, at });
        return "renewed";
      });
    },

    /**
     * Turns auto-renewal on for an active plan, or off. Turning it on needs the current terms accepted (now, or with an earlier
     * report under them); renewals record that version. Turning it off needs nothing, even while sales are closed.
     */
    async setAutoRenew(member: MemberIdentity, input: { on: boolean; planId?: string; accepted?: boolean }): Promise<CodeOutcome> {
      if (typeof input.on !== "boolean" || input.on && (typeof input.planId !== "string" || !uuid.test(input.planId))) return invalid();
      return codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        const at = new Date(now()), account = await currentMember(tx, member, at);
        if (!account || member.administrator) return rollback(refused());
        if (input.on) {
          const plan = await tx.subscriptionPlan.findUnique({ where: { id: input.planId! } });
          if (!plan?.active || !await salesOpen(tx)) return rollback(invalid("Choose a plan to renew."));
          if (!input.accepted && !await acceptedTerms(tx, member, at)) return rollback(invalid("Accept the terms to continue."));
          await tx.memberAccount.update({ where: { id: account.id }, data: { autoRenew: true, autoRenewPlanId: plan.id, autoRenewTermsVersion: termsNotice.reviewedOn } });
        } else await tx.memberAccount.update({ where: { id: account.id }, data: { autoRenew: false } });
        await audit(tx, account.id, account.id, "auto_renew_changed", "member", at, { on: input.on, ...(input.on ? { planId: input.planId } : {}) }, "member");
        return { status: "saved" };
      });
    },

    /** Owner correction of an account's credit, with a reason. It may lift a negative balance but never make one. */
    async adjustCredit(accountId: string, amountUgx: number, note: string, actor: string): Promise<CodeOutcome> {
      const reason = typeof note === "string" ? note.trim() : "";
      if (!Number.isSafeInteger(amountUgx) || amountUgx === 0 || Math.abs(amountUgx) > walletRules.adjustmentMaxUgx || !validNote(reason)) {
        return invalid(`Enter a whole amount up to UGX ${walletRules.adjustmentMaxUgx.toLocaleString("en-UG")} and a short reason without long numbers.`);
      }
      return codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, accountId);
        if (!account || account.erasedAt) return rollback(refused());
        const at = new Date(now());
        try {
          const entry = await appendWalletEntry(tx, accountId, { kind: "adjustment", amountUgx, actor: "admin", at, note: reason });
          await audit(tx, accountId, accountId, "credit_adjusted", actor, at, { amountUgx, balanceUgx: entry.balanceAfter, walletEntryId: entry.id }, "member");
          return { status: "saved" };
        } catch (error) {
          if (error instanceof InsufficientCredit) return rollback(insufficient("This adjustment would leave a negative balance."));
          throw error;
        }
      });
    },

    /** A lightweight account summary for private navigation, independent of the latest payment's decision or session unlock. */
    async subscriptionStatus(member: MemberIdentity): Promise<SubscriptionStatus | null> {
      if (member.blocked) return null;
      return database.query(async (tx) => {
        const at = new Date(now());
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, select: {
          accountId: true, authenticatedAt: true, passwordResetAt: true, expiresAt: true,
          account: { select: { blockedAt: true, erasedAt: true, creditUgx: true, autoRenew: true,
            autoRenewPlan: { select: { priceUgx: true, active: true } },
            codes: { where: { revokedAt: null, endsAt: { gt: at } }, orderBy: { startsAt: "asc" },
              select: { startsAt: true, endsAt: true, revokedAt: true } },
            submissions: { orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 1, select: { status: true } },
          } },
        } });
        if (!session || session.accountId !== member.accountId || !session.authenticatedAt || session.passwordResetAt
          || session.expiresAt <= at || session.account.blockedAt || session.account.erasedAt) return null;
        const { creditUgx, autoRenew, autoRenewPlan } = session.account;
        // Renewal also needs open sales and a period end not yet renewed (a renewal the owner revoked is not bought again);
        // those are read only when the rest would renew.
        const end = session.account.codes.reduce<Date | null>((latest, code) => !latest || code.endsAt > latest ? code.endsAt : latest, null);
        const covered = autoRenew && !!autoRenewPlan?.active && creditUgx >= autoRenewPlan.priceUgx && !!end;
        const renewsFromCredit = covered && !await tx.walletEntry.findUnique({ where: { requestKey: `renewal:${session.accountId}:${+end!}` }, select: { id: true } })
          && await salesOpen(tx);
        // The newest report decides, unless an older report of the other purpose still waits (a plan and a top-up may both).
        const paymentPending = ["pending", "superseded"].includes(session.account.submissions[0]?.status ?? "")
          || !!session.account.submissions[0] && await tx.paymentSubmission.count({ where: { accountId: session.accountId, status: "pending" } }) > 0;
        return { activeUntil: activeSubscriptionUntil(session.account.codes, at), paymentPending, creditUgx, autoRenew, renewsFromCredit };
      });
    },

    async accountView(member: MemberIdentity) {
      if (!member.codeEnteredAt || member.blocked) return null;
      return database.transaction(async (tx) => {
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, include: { account: true } });
        const at = new Date(now());
        if (!session?.codeEnteredAt || session.expiresAt <= at || session.account.blockedAt || session.account.erasedAt) return null;
        const codes = await tx.accessCode.findMany({ where: { accountId: member.accountId, revokedAt: null }, orderBy: { startsAt: "asc" },
          select: { id: true, startsAt: true, endsAt: true, durationDays: true, extensionDays: true, revokedAt: true, planName: true } });
        const devices = await tx.memberSession.findMany({ where: { accountId: member.accountId, codeEnteredAt: { not: null }, expiresAt: { gt: at } },
          orderBy: { lastSeenAt: "desc" }, select: { tokenHash: true, lastSeenAt: true } });
        return { codes, devices };
      }, options);
    },
  });
}
export type AccessCodes = ReturnType<typeof createAccessCodes>;
