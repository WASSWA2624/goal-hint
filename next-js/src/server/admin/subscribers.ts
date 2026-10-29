import "server-only";
import { auditDateBounds, type AuditFilters } from "../../domain/admin-audit.ts";
import { randomInt } from "node:crypto";
import { getReportingDate, getReportingDayBounds, addReportingDays, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { OwnerOverview, OwnerAccount, OwnerSubscriber, OwnerAuditRow, OwnerPaymentSummary } from "../../domain/owner-members.ts";
import { normalizePhone } from "../../domain/phone.ts";
import { formatPaymentReference } from "../../domain/payment.ts";
import { getAnalyticsConfig, type AnalyticsConfig } from "../analytics/analytics-config.ts";
import { hashPassword } from "../analytics/analytics-password.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { lockMemberAccount, type CodeFailure, type CodeOutcome } from "../members/access-codes.ts";
import { isMemberAdminPhone } from "../members/member-admin.ts";
import { passwordRecoveryRules } from "../members/password-recovery.ts";
import { decide } from "../members/settings.ts";
import { appendWalletEntry, lockedCredit, walletHistory } from "../members/wallet.ts";
import { createPaymentReview } from "./payment-review.ts";
import { auditTextErrors, ownerAuditActions, writeOwnerAudit } from "./audit.ts";
import { deleteSubscriber } from "./delete-subscriber.ts";
import { countedManualWhere, countedPaymentWhere } from "./revenue.ts";

export function revenueBounds(now: number) {
  const today = getReportingDate(utcInstantFromEpochMilliseconds(now));
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const week = addReportingDays(today, -(weekday + 6) % 7), month = parseReportingDate(today.slice(0, 7) + "-01");
  return { week: new Date(getReportingDayBounds(week).startInclusive), month: new Date(getReportingDayBounds(month).startInclusive) };
}
/** Read out on a phone call and typed on a phone: lower case, without i, l, o, 0 or 1. */
export const temporaryPasswordRules = Object.freeze({ alphabet: "abcdefghjkmnpqrstuvwxyz23456789", length: 10 });
export const generateTemporaryPassword = () => Array.from({ length: temporaryPasswordRules.length },
  () => temporaryPasswordRules.alphabet[randomInt(temporaryPasswordRules.alphabet.length)]).join("");
export type TemporaryPasswordOutcome = Readonly<{ status: "reset"; accountId: string; temporaryPassword: string; expiresAt: string; created: boolean; sessionsDeleted: number }> | CodeFailure;
export function createSubscribers(database: DatabaseRuntime, now = Date.now, adminPhone = isMemberAdminPhone, config?: Pick<AnalyticsConfig, "key">) {
  return {
    async pendingPayments(): Promise<readonly OwnerPaymentSummary[]> {
      return database.query(async tx => (await tx.paymentSubmission.findMany({ where: { status: "pending" },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }], take: 2,
        select: { id: true, reference: true, claimedNetwork: true, claimedAmountUgx: true, submittedAt: true } }))
        .map(row => ({ id: row.id, reference: formatPaymentReference(row.reference), network: row.claimedNetwork,
          amount: row.claimedAmountUgx, submittedAt: row.submittedAt.toISOString() })));
    },
    async passwordResetRequests(): Promise<readonly Readonly<{ id: string; phone: string; requestedAt: string }>[]> {
      return database.query(async tx => (await tx.memberAccount.findMany({ where: { passwordResetRequestedAt: { not: null }, blockedAt: null, erasedAt: null, phone: { not: null } },
        orderBy: { passwordResetRequestedAt: "asc" }, take: 100, select: { id: true, phone: true, passwordResetRequestedAt: true } }))
        .filter(row => row.phone && !adminPhone(row.phone)).map(row => ({ id: row.id, phone: row.phone!, requestedAt: row.passwordResetRequestedAt!.toISOString() })));
    },
    async overview(): Promise<OwnerOverview> {
      const at = new Date(now()), bounds = revenueBounds(+at);
      return database.query(async tx => {
        async function revenue(since: Date) { const [payments, manual] = await Promise.all([
          tx.paymentSubmission.aggregate({ where: countedPaymentWhere({ gte: since, lte: at }), _sum: { amountReceivedUgx: true } }),
          tx.accessCode.aggregate({ where: countedManualWhere({ gte: since, lte: at }), _sum: { amountReceivedUgx: true } }),
        ]); return (payments._sum.amountReceivedUgx ?? 0) + (manual._sum.amountReceivedUgx ?? 0); }
        const [pending, active, weekRevenue, monthRevenue, trials, busy, settings] = await Promise.all([
          tx.paymentSubmission.count({ where: { status: "pending" } }),
          tx.$queryRaw<{ total: bigint }[]>`WITH RECURSIVE PaidCodes AS (
            SELECT c.id, c.replacedById FROM AccessCode c LEFT JOIN PaymentSubmission p ON p.id = c.paymentSubmissionId
            WHERE (c.source = 'payment' AND p.status = 'approved' AND p.reversedAt IS NULL)
              OR (c.source = 'manual' AND c.amountReceivedUgx > 0)
              OR (c.source IN ('credit', 'renewal') AND c.priceUgx > 0)
            UNION DISTINCT SELECT c.id, c.replacedById FROM AccessCode c JOIN PaidCodes p ON c.id = p.replacedById
          ) SELECT COUNT(DISTINCT c.accountId) AS total FROM PaidCodes p JOIN AccessCode c ON c.id = p.id
            JOIN MemberAccount a ON a.id = c.accountId WHERE c.revokedAt IS NULL AND c.startsAt <= ${at} AND c.endsAt > ${at}
              AND a.blockedAt IS NULL AND a.erasedAt IS NULL`,
          revenue(bounds.week), revenue(bounds.month),
          tx.accessCode.count({ where: { source: "trial", createdAt: { gte: bounds.week, lte: at } } }),
          tx.ownerAuditEvent.count({ where: { action: "uploads_busy", at: { gte: bounds.week, lte: at } } }),
          tx.subscriptionSettings.findUnique({ where: { id: 1 }, select: { paymentNumbersChangedAt: true } }),
        ]);
        // Revenue stays cash: approved payments already include top-ups and overpayments, so spending credit is never counted again.
        const [held, owed] = await Promise.all([
          tx.memberAccount.aggregate({ where: { erasedAt: null, creditUgx: { gt: 0 } }, _sum: { creditUgx: true } }),
          tx.memberAccount.aggregate({ where: { erasedAt: null, creditUgx: { lt: 0 } }, _sum: { creditUgx: true } }),
        ]);
        return { pending, active: Number(active[0]?.total ?? 0), weekRevenue, monthRevenue, trials, busy, paymentNumbersChangedAt: settings?.paymentNumbersChangedAt?.toISOString() ?? null,
          creditHeld: held._sum.creditUgx ?? 0, creditOwed: -(owed._sum.creditUgx ?? 0) };
      });
    },
    async search(input = ""): Promise<readonly OwnerAccount[]> {
      const phone = input ? normalizePhone(input) : null;
      if (input && !phone) return [];
      return database.query(async tx => (await tx.memberAccount.findMany({ where: phone ? { phone } : {}, orderBy: { lastSignInAt: "desc" }, take: 100,
        select: { id: true, phone: true, blockedAt: true, erasedAt: true, lastSignInAt: true } })).map(r => ({ id: r.id, phone: r.phone, status: r.erasedAt ? "erased" : r.blockedAt ? "blocked" : "open", lastSignInAt: r.lastSignInAt.toISOString() })));
    },
    async detail(id: string): Promise<OwnerSubscriber | null> {
      return database.query(async tx => {
        const account = await tx.memberAccount.findUnique({ where: { id }, select: { id: true, phone: true, blockedAt: true, blockedReason: true, ownerNote: true, erasedAt: true, lastSignInAt: true,
          creditUgx: true, autoRenew: true, autoRenewPlan: { select: { name: true } } } });
        if (!account) return null;
        const at = new Date(now());
        const [codes, submissions, devices, unlocks, wallet] = await Promise.all([
          createPaymentReview(database, now).codes("", "all", id),
          tx.paymentSubmission.findMany({ where: { accountId: id }, orderBy: { submittedAt: "desc" }, take: 100, select: { id: true, reference: true, status: true, purpose: true, planName: true, claimedAmountUgx: true, amountReceivedUgx: true, submittedAt: true } }),
          tx.memberSession.findMany({ where: { accountId: id, codeEnteredAt: { not: null }, expiresAt: { gt: at } }, select: { createdAt: true, lastSeenAt: true, expiresAt: true }, orderBy: { lastSeenAt: "desc" } }),
          tx.ownerAuditEvent.count({ where: { accountId: id, action: "device_unlocked", at: { gte: new Date(+at - 30 * 86_400_000), lte: at } } }),
          walletHistory(tx, id, 100),
        ]);
        const { autoRenewPlan, ...rest } = account;
        return { ...rest, autoRenewPlanName: autoRenewPlan?.name ?? null, wallet,
          blockedAt: account.blockedAt?.toISOString() ?? null, erasedAt: account.erasedAt?.toISOString() ?? null, lastSignInAt: account.lastSignInAt.toISOString(), codes,
          submissions: submissions.map(r => ({ ...r, purpose: r.purpose === "topup" ? "topup" as const : "plan" as const, reference: formatPaymentReference(r.reference), submittedAt: r.submittedAt.toISOString() })),
          devices: devices.map(r => ({ createdAt: r.createdAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(), expiresAt: r.expiresAt.toISOString() })), unlocks };
      });
    },
    async action(id: string, action: string, value: unknown, actor: string): Promise<CodeOutcome> {
      if (action === "delete") return deleteSubscriber(database, id, config ?? await getAnalyticsConfig());
      if (action === "note" && (typeof value !== "string" || value.length > 500) || ["block", "unblock"].includes(action) && (typeof value !== "string" || !value.trim() || value.length > 200)) return { status: "invalid", message: "Provide a reason (up to 200 characters) or a note (up to 500 characters)." };
      if (["block", "unblock"].includes(action) && auditTextErrors({ reason: value })) return { status: "invalid", message: "Use a reason without phone numbers or access codes." };
      return decide<CodeOutcome>(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, id);
        if (!account || account.erasedAt) return rollback({ status: "refused", message: "This account is unavailable." });
        const at = new Date(now()); let deleted = 0;
        switch (action) {
          case "note": await tx.memberAccount.update({ where: { id }, data: { ownerNote: (value as string).trim() || null } }); break;
          case "sign-out-all": deleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count; break;
          case "auto-renew-off":
            if (!account.autoRenew) return rollback({ status: "invalid", message: "Auto-renewal is already off." });
            await tx.memberAccount.update({ where: { id }, data: { autoRenew: false } });
            break;
          case "block": case "unblock":
            await tx.memberAccount.update({ where: { id }, data: { blockedAt: action === "block" ? at : null, blockedReason: action === "block" ? (value as string).trim() : null } });
            if (action === "block") deleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count;
            break;
          case "erase": {
            await tx.savedSlip.deleteMany({ where: { accountId: id } });
            const rows = await tx.paymentSubmission.findMany({ where: { accountId: id }, select: { id: true } });
            await tx.paymentScreenshot.deleteMany({ where: { submissionId: { in: rows.map(r => r.id) } } });
            await tx.paymentSubmission.updateMany({ where: { accountId: id }, data: { payerPhone: null, rejectText: null, imagePurgedAt: at } });
            if (account.phone) await tx.paymentSubmission.updateMany({ where: { payerPhone: account.phone }, data: { payerPhone: null } });
            await tx.accessCode.updateMany({ where: { accountId: id }, data: { note: null } });
            deleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count;
            // Credit is non-refundable and an erased account can never sign in to spend it, so a positive balance is forfeited;
            // the ledger keeps its amounts for accounting (it holds no personal data). A debt stays recorded.
            const credit = await lockedCredit(tx, id) ?? 0;
            if (credit > 0) {
              const entry = await appendWalletEntry(tx, id, { kind: "adjustment", amountUgx: -credit, actor: "admin", at, note: "Forfeited when the account was erased" });
              await writeOwnerAudit(tx, { at, actor, action: "credit_forfeited", accountId: id, targetType: "member", targetId: id, details: { amountUgx: credit, walletEntryId: entry.id } });
            }
            await tx.memberAccount.update({ where: { id }, data: { phone: null, passwordHash: null, temporaryPasswordHash: null, temporaryPasswordExpiresAt: null,
              passwordResetRequestedAt: null, phoneVerifiedAt: null, passwordChangedAt: null, whatsappNotificationsAt: null, ownerNote: null, blockedReason: null, erasedAt: at, autoRenew: false } });
            await tx.memberVerification.deleteMany({ where: { accountId: id } });
            // Outbox rows hold no number, but an erased account is never notified again and keeps no delivery history.
            await tx.paymentNotificationOutbox.deleteMany({ where: { accountId: id } });
            break;
          }
          default: return rollback({ status: "invalid", message: "Unknown subscriber action." });
        }
        const auditAction = { note: "member_note_changed", "sign-out-all": "member_signed_out_all", block: "member_blocked", unblock: "member_unblocked", erase: "member_erased",
          "auto-renew-off": "auto_renew_changed" }[action] as "member_note_changed" | "member_signed_out_all" | "member_blocked" | "member_unblocked" | "member_erased" | "auto_renew_changed";
        await writeOwnerAudit(tx, { at, actor, action: auditAction, accountId: id, targetType: "member", targetId: id, details: { sessionsDeleted: deleted, ...(action === "note" ? { length: (value as string).length } : {}), ...(["block", "unblock"].includes(action) ? { reason: value } : {}) } });
        return { status: "saved" };
      });
    },
    /** The admin reads a random single-use password out once. Only its hash survives, for 15 minutes;
     * every existing device signs out, and the member must choose a new password before authenticating. */
    async temporaryPassword(target: Readonly<{ id: string }> | Readonly<{ phone: string }>, actor: string): Promise<TemporaryPasswordOutcome> {
      if ("phone" in target) return { status: "refused", message: "Administrator credentials are configured in the environment. Search for the member's account first." };
      const temporaryPassword = generateTemporaryPassword(), temporaryPasswordHash = await hashPassword(temporaryPassword);
      return decide<TemporaryPasswordOutcome>(database, async (tx, rollback) => {
        const at = new Date(now()), id = target.id, expiresAt = new Date(+at + passwordRecoveryRules.temporaryMs);
        const account = await lockMemberAccount(tx, id);
        if (!account?.phone || account.erasedAt) return rollback({ status: "refused", message: "This account is unavailable." });
        if (adminPhone(account.phone)) return rollback({ status: "refused", message: "Administrator passwords are managed in the environment." });
        if (account.blockedAt) return rollback({ status: "refused", message: "Unblock this account before setting a password." });
        await tx.memberAccount.update({ where: { id }, data: { passwordHash: null, temporaryPasswordHash, temporaryPasswordExpiresAt: expiresAt,
          passwordResetRequestedAt: null, passwordChangedAt: null } });
        await tx.memberVerification.updateMany({ where: { accountId: id, consumedAt: null }, data: { consumedAt: at } });
        const sessionsDeleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count;
        await writeOwnerAudit(tx, { at, actor, action: "password_reset", accountId: id, targetType: "member", targetId: id, details: { sessionsDeleted, created: false, expiresAt: expiresAt.toISOString() } });
        return { status: "reset", accountId: id, temporaryPassword, expiresAt: expiresAt.toISOString(), created: false, sessionsDeleted };
      });
    },
    async audit(action = "", dates: Pick<AuditFilters, "period" | "startDate" | "endDate"> = {}): Promise<readonly OwnerAuditRow[]> {
      const bounds = auditDateBounds({ ...dates, now: now() });
      return database.query(async tx => (await tx.ownerAuditEvent.findMany({ where: {
        ...(ownerAuditActions.includes(action as typeof ownerAuditActions[number]) ? { action } : {}), ...(bounds ? { at: bounds } : {}),
      }, orderBy: [{ at: "desc" }, { id: "desc" }], take: 100,
        select: { id: true, at: true, actor: true, action: true, accountId: true, targetType: true, targetId: true } })).map(r => ({ ...r, id: String(r.id), at: r.at.toISOString() })));
    },
  };
}
