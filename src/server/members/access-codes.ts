import "server-only";

import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { accessCodeAlphabet, normalizeCode } from "../../domain/access-code.ts";
import { formatPaymentReference, normalizeTransactionId, transactionKey } from "../../domain/payment.ts";
import { normalizePhone } from "../../domain/phone.ts";
import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";
import { chainPeriods, extendPeriods, remainingDays, subscriptionDayMs } from "../../domain/subscription-period.ts";
import { activeSubscriptionUntil, type SubscriptionStatus } from "../../domain/subscription-summary.ts";
import { auditTextErrors, writeOwnerAudit, type OwnerAuditAction } from "../admin/audit.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import type { AccessCode, Prisma } from "../generated/prisma/client.ts";
import { grantDevices, liveAccessCode, unlockedDeviceLimit } from "./device-grants.ts";
import type { MemberIdentity } from "./member-sessions.ts";
import { decide, lockSettings } from "./settings.ts";
import { createPaymentNotifications, type PaymentNotifications } from "./payment-notifications.ts";

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
const refused = (): CodeFailure => ({ status: "refused", message: "We couldn't complete this. Please contact us." });

/** A new access period and the account's signed-in devices it unlocked; `payment` is its formatted payment reference, if any. */
export type AccessGrant = Readonly<{ id: string; accountId: string; reference: string; planName: string; startsAt: Date; endsAt: Date;
  source: string; devicesUnlocked: number; payment?: string; paymentSubmissionId?: string }>;
export type CodeFailure = Readonly<{ status: "invalid" | "refused" | "duplicate" | "not-found"; message: string; submissionId?: string }>;
export type CodeOutcome = Readonly<{ status: "created"; grant: AccessGrant; notification?: PaymentNotificationStatus }>
  | Readonly<{ status: "saved"; notification?: PaymentNotificationStatus }> | CodeFailure;
export type PaymentApproval = Readonly<{ network: "mtn" | "airtel"; transactionRef: string; amountReceivedUgx: number; planId: string }>;
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
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: fields.planId } });
    if (!plan) return invalid("Choose a plan.");
    const existing = submissionId ? await tx.paymentSubmission.findUnique({ where: { id: submissionId } }) : null;
    if (submissionId && (!existing || existing.accountId !== account.id || !["pending", "superseded"].includes(existing.status))) return refused();
    // Keep the offer the member actually paid for. An administrator may explicitly choose another package, but editing
    // a package's price or duration while a report waits cannot silently change the pending purchase.
    const offer = existing?.planId === plan.id ? existing : plan;
    const final = { planId: plan.id, planName: "planName" in offer ? offer.planName : offer.name, durationDays: offer.durationDays, priceUgx: offer.priceUgx,
      status: "approved", network: fields.network, transactionRef,
      amountReceivedUgx: fields.amountReceivedUgx, approvedTxnKey: `${fields.network}:${key}`, decidedAt: at, decidedBy: actor };
    const submission = existing ? await tx.paymentSubmission.update({ where: { id: existing.id }, data: final })
      : await tx.paymentSubmission.create({ data: { ...final, id: randomUUID(), accountId: account.id, reference: newReference().slice(2), source: "owner",
        submittedAt: at, claimedNetwork: fields.network, claimedTxnRef: final.transactionRef, claimedTxnKey: key, claimedAmountUgx: fields.amountReceivedUgx } });
    // The report's own session always gets a slot, even on a full account; other signed-in devices fill free slots.
    const grant = await create(tx, account, { source: "payment", paymentSubmissionId: submission.id, planId: plan.id, planName: final.planName,
      durationDays: final.durationDays, priceUgx: final.priceUgx, termsVersion: existing?.termsVersion ?? null, ...(note ? { note } : {}) }, actor, at,
      { maximum: settings.maxUnlockedDevices, prefer: existing?.submittedSessionHash ? [existing.submittedSessionHash] : [] });
    await audit(tx, account.id, submission.id, "payment_approved", actor, at, { codeId: grant.id, amountReceivedUgx: fields.amountReceivedUgx }, "payment");
    return { status: "created", grant: { ...grant, payment: formatPaymentReference(submission.reference) } };
  }

  async function notifyApproval(outcome: CodeOutcome, phone: string | null): Promise<CodeOutcome> {
    if (outcome.status !== "created") return outcome;
    const { grant } = outcome;
    const { payment, paymentSubmissionId } = grant;
    if (!payment || !paymentSubmissionId) return outcome;
    let notification: PaymentNotificationStatus;
    try { notification = await notifications.approved({ paymentId: paymentSubmissionId, accountId: grant.accountId, phone,
      reference: payment, planName: grant.planName, expiresAt: grant.endsAt }); }
    catch { notification = "failed"; }
    return { ...outcome, notification };
  }

  return Object.freeze({
    async manual(input: { phone: string; planId?: string; durationDays?: number; amountReceivedUgx: number; note: string;
      network?: "mtn" | "airtel"; transactionRef?: string }, actor: string): Promise<CodeOutcome> {
      const phone = normalizePhone(input.phone), note = input.note.trim();
      if (!phone || !note || note.length > 200 || !validAmount(input.amountReceivedUgx)
        || (!!input.network !== !!input.transactionRef) || input.transactionRef && !input.planId) return invalid();
      const outcome = await codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        const at = new Date(now()), account = await accountForPhone(tx, phone, at);
        if (account.blockedAt || account.erasedAt) return rollback(refused());
        if (input.network && input.transactionRef && input.planId) {
          const outcome = await approval(tx, account, { network: input.network, transactionRef: input.transactionRef,
            planId: input.planId, amountReceivedUgx: input.amountReceivedUgx }, actor, at, undefined, note);
          return outcome.status === "created" ? outcome : rollback(outcome);
        }
        const plan = input.planId ? await tx.subscriptionPlan.findUnique({ where: { id: input.planId } }) : null;
        const days = plan?.durationDays ?? input.durationDays ?? 0;
        if (!validDays(days) || input.planId && !plan) return rollback(invalid());
        return { status: "created", grant: await create(tx, account, { source: "manual", planId: plan?.id ?? null,
          planName: plan?.name ?? "Manual", durationDays: days, priceUgx: plan?.priceUgx ?? 0, amountReceivedUgx: input.amountReceivedUgx, note }, actor, at,
          { maximum: await unlockedDeviceLimit(tx) }) };
      });
      return notifyApproval(outcome, phone);
    },

    async approvePayment(id: string, fields: PaymentApproval, actor: string): Promise<CodeOutcome> {
      let phone: string | null = null;
      const outcome = await codeTransaction<CodeOutcome>(database, async (tx, rollback) => {
        phone = null;
        const submission = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!submission) return rollback(refused());
        const account = await lockMemberAccount(tx, submission.accountId);
        if (!account || account.blockedAt || account.erasedAt) return rollback(refused());
        phone = account.phone;
        const outcome = await approval(tx, account, fields, actor, new Date(now()), id);
        return outcome.status === "created" ? outcome : rollback(outcome);
      });
      return notifyApproval(outcome, phone);
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
        if (!destination) destination = await tx.memberAccount.create({ data: { id: randomUUID(), phone, createdAt: at, lastSignInAt: at } });
        if (destination.id === accountId) return rollback(invalid());
        for (const id of [accountId, destination.id].sort()) await lockMemberAccount(tx, id);
        const old = await tx.memberAccount.findUnique({ where: { id: accountId } });
        destination = await tx.memberAccount.findUniqueOrThrow({ where: { id: destination.id } });
        if (!old || old.blockedAt || old.erasedAt || destination.blockedAt || destination.erasedAt) return rollback(refused());
        const codes = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } } });
        const days = remainingDays(codes, at);
        if (!validDays(days)) return rollback(invalid("Remaining access must be between 1 and 366 days."));
        // The new number's signed-in devices get the remaining days; the old number's devices lock with its last period.
        const grant = await create(tx, destination, { source: "number-change", planName: "Transferred access", durationDays: days, priceUgx: 0 }, actor, at,
          { maximum: await unlockedDeviceLimit(tx) });
        for (const code of codes) await revoke(tx, code, "number-change", actor, at, grant.id, { verifiedBy: input.verifiedBy });
        await audit(tx, destination.id, grant.id, "number_changed", actor, at, { previousAccountId: accountId, verifiedBy: input.verifiedBy, days });
        return { status: "created", grant };
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
        const locked = [...new Set(chain.map((row) => row.accountId))].sort();
        const outcome = await codeTransaction<CodeOutcome | { status: "retry"; }>(database, async (tx, rollback) => {
          for (const accountId of locked) await lockMemberAccount(tx, accountId);
          const submission = await tx.paymentSubmission.findUnique({ where: { id } });
          if (!submission || submission.status !== "approved" || !chain.length) return rollback(refused());
          let live = await tx.accessCode.findUniqueOrThrow({ where: { paymentSubmissionId: id } });
          const visited = new Set<string>();
          while (live.replacedById) {
            if (visited.has(live.id)) return rollback(refused());
            visited.add(live.id); live = await tx.accessCode.findUniqueOrThrow({ where: { id: live.replacedById } });
            if (!locked.includes(live.accountId)) return rollback({ status: "retry" });
          }
          const at = new Date(now());
          await tx.paymentSubmission.update({ where: { id }, data: { status: "reversed", reversedAt: at, reverseReason: reason } });
          if (!live.revokedAt) { await revoke(tx, live, reason, actor, at); await rechain(tx, live.accountId, at); }
          await audit(tx, submission.accountId, id, "payment_reversed", actor, at, { reason, liveCodeId: live.id }, "payment");
          return { status: "saved", carriedOtherDays: live.source === "number-change" };
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

    /** A lightweight account summary for private navigation, independent of the latest payment's decision or session unlock. */
    async subscriptionStatus(member: MemberIdentity): Promise<SubscriptionStatus | null> {
      if (member.blocked) return null;
      return database.query(async (tx) => {
        const at = new Date(now());
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, select: {
          accountId: true, authenticatedAt: true, passwordResetAt: true, expiresAt: true,
          account: { select: { blockedAt: true, erasedAt: true,
            codes: { where: { revokedAt: null, endsAt: { gt: at } }, orderBy: { startsAt: "asc" },
              select: { startsAt: true, endsAt: true, revokedAt: true } },
            submissions: { orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 1, select: { status: true } },
          } },
        } });
        if (!session || session.accountId !== member.accountId || !session.authenticatedAt || session.passwordResetAt
          || session.expiresAt <= at || session.account.blockedAt || session.account.erasedAt) return null;
        return { activeUntil: activeSubscriptionUntil(session.account.codes, at),
          paymentPending: ["pending", "superseded"].includes(session.account.submissions[0]?.status ?? "") };
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
