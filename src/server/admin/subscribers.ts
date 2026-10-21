import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { getReportingDate, getReportingDayBounds, addReportingDays, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { OwnerOverview, OwnerAccount, OwnerSubscriber, OwnerAuditRow } from "../../domain/owner-members.ts";
import { normalizePhone } from "../../domain/phone.ts";
import { hashPassword } from "../analytics/analytics-password.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { lockMemberAccount, type CodeFailure, type CodeOutcome } from "../members/access-codes.ts";
import { isMemberAdminPhone } from "../members/member-admin.ts";
import { decide } from "../members/settings.ts";
import { createPaymentReview } from "./payment-review.ts";
import { auditTextErrors, ownerAuditActions, writeOwnerAudit } from "./audit.ts";

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
export type TemporaryPasswordOutcome = Readonly<{ status: "reset"; accountId: string; temporaryPassword: string; created: boolean; sessionsDeleted: number }> | CodeFailure;
export function createSubscribers(database: DatabaseRuntime, now = Date.now, adminPhone = isMemberAdminPhone) {
  return {
    async overview(): Promise<OwnerOverview> {
      const at = new Date(now()), bounds = revenueBounds(+at);
      return database.query(async tx => {
        async function revenue(since: Date) { const [payments, manual] = await Promise.all([
          tx.paymentSubmission.aggregate({ where: { status: "approved", reversedAt: null, decidedAt: { gte: since, lte: at } }, _sum: { amountReceivedUgx: true } }),
          tx.accessCode.aggregate({ where: { source: "manual", createdAt: { gte: since, lte: at } }, _sum: { amountReceivedUgx: true } }),
        ]); return (payments._sum.amountReceivedUgx ?? 0) + (manual._sum.amountReceivedUgx ?? 0); }
        const [pending, active, weekRevenue, monthRevenue, trials, busy, settings] = await Promise.all([
          tx.paymentSubmission.count({ where: { status: "pending" } }),
          tx.$queryRaw<{ total: bigint }[]>`WITH RECURSIVE PaidCodes AS (
            SELECT c.id, c.replacedById FROM AccessCode c LEFT JOIN PaymentSubmission p ON p.id = c.paymentSubmissionId
            WHERE (c.source = 'payment' AND p.status = 'approved' AND p.reversedAt IS NULL)
              OR (c.source = 'manual' AND c.amountReceivedUgx > 0)
            UNION DISTINCT SELECT c.id, c.replacedById FROM AccessCode c JOIN PaidCodes p ON c.id = p.replacedById
          ) SELECT COUNT(DISTINCT c.accountId) AS total FROM PaidCodes p JOIN AccessCode c ON c.id = p.id
            JOIN MemberAccount a ON a.id = c.accountId WHERE c.revokedAt IS NULL AND c.startsAt <= ${at} AND c.endsAt > ${at}
              AND a.blockedAt IS NULL AND a.erasedAt IS NULL`,
          revenue(bounds.week), revenue(bounds.month),
          tx.accessCode.count({ where: { source: "trial", createdAt: { gte: bounds.week, lte: at } } }),
          tx.ownerAuditEvent.count({ where: { action: "uploads_busy", at: { gte: bounds.week, lte: at } } }),
          tx.subscriptionSettings.findUnique({ where: { id: 1 }, select: { paymentNumbersChangedAt: true } }),
        ]);
        return { pending, active: Number(active[0]?.total ?? 0), weekRevenue, monthRevenue, trials, busy, paymentNumbersChangedAt: settings?.paymentNumbersChangedAt?.toISOString() ?? null };
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
        const account = await tx.memberAccount.findUnique({ where: { id }, select: { id: true, phone: true, blockedAt: true, blockedReason: true, ownerNote: true, erasedAt: true, lastSignInAt: true } });
        if (!account) return null;
        const at = new Date(now());
        const [codes, submissions, devices, unlocks] = await Promise.all([
          createPaymentReview(database, now).codes("", "all", id),
          tx.paymentSubmission.findMany({ where: { accountId: id }, orderBy: { submittedAt: "desc" }, take: 100, select: { id: true, reference: true, status: true, planName: true, claimedAmountUgx: true, amountReceivedUgx: true, submittedAt: true } }),
          tx.memberSession.findMany({ where: { accountId: id, codeEnteredAt: { not: null }, expiresAt: { gt: at } }, select: { createdAt: true, lastSeenAt: true, expiresAt: true }, orderBy: { lastSeenAt: "desc" } }),
          tx.ownerAuditEvent.count({ where: { accountId: id, action: "device_unlocked", at: { gte: new Date(+at - 30 * 86_400_000), lte: at } } }),
        ]);
        return { ...account, blockedAt: account.blockedAt?.toISOString() ?? null, erasedAt: account.erasedAt?.toISOString() ?? null, lastSignInAt: account.lastSignInAt.toISOString(), codes,
          submissions: submissions.map(r => ({ ...r, reference: `P-${r.reference}`, submittedAt: r.submittedAt.toISOString() })),
          devices: devices.map(r => ({ createdAt: r.createdAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(), expiresAt: r.expiresAt.toISOString() })), unlocks };
      });
    },
    async action(id: string, action: string, value: unknown, actor: string): Promise<CodeOutcome> {
      if (action === "note" && (typeof value !== "string" || value.length > 500) || ["block", "unblock"].includes(action) && (typeof value !== "string" || !value.trim() || value.length > 200)) return { status: "invalid", message: "Provide a reason (up to 200 characters) or a note (up to 500 characters)." };
      if (["block", "unblock"].includes(action) && auditTextErrors({ reason: value })) return { status: "invalid", message: "Use a reason without phone numbers or access codes." };
      return decide<CodeOutcome>(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, id);
        if (!account || account.erasedAt) return rollback({ status: "refused", message: "This account is unavailable." });
        const at = new Date(now()); let deleted = 0;
        switch (action) {
          case "note": await tx.memberAccount.update({ where: { id }, data: { ownerNote: (value as string).trim() || null } }); break;
          case "sign-out-all": deleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count; break;
          case "block": case "unblock":
            await tx.memberAccount.update({ where: { id }, data: { blockedAt: action === "block" ? at : null, blockedReason: action === "block" ? (value as string).trim() : null } });
            if (action === "block") deleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count;
            break;
          case "erase": {
            const rows = await tx.paymentSubmission.findMany({ where: { accountId: id }, select: { id: true } });
            await tx.paymentScreenshot.deleteMany({ where: { submissionId: { in: rows.map(r => r.id) } } });
            await tx.paymentSubmission.updateMany({ where: { accountId: id }, data: { payerPhone: null, rejectText: null, imagePurgedAt: at } });
            if (account.phone) await tx.paymentSubmission.updateMany({ where: { payerPhone: account.phone }, data: { payerPhone: null } });
            await tx.accessCode.updateMany({ where: { accountId: id }, data: { note: null } });
            deleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count;
            await tx.memberAccount.update({ where: { id }, data: { phone: null, passwordHash: null, ownerNote: null, blockedReason: null, erasedAt: at } });
            await tx.memberVerification.deleteMany({ where: { accountId: id } });
            break;
          }
          default: return rollback({ status: "invalid", message: "Unknown subscriber action." });
        }
        const auditAction = { note: "member_note_changed", "sign-out-all": "member_signed_out_all", block: "member_blocked", unblock: "member_unblocked", erase: "member_erased" }[action] as "member_note_changed" | "member_signed_out_all" | "member_blocked" | "member_unblocked" | "member_erased";
        await writeOwnerAudit(tx, { at, actor, action: auditAction, accountId: id, targetType: "member", targetId: id, details: { sessionsDeleted: deleted, ...(action === "note" ? { length: (value as string).length } : {}), ...(["block", "unblock"].includes(action) ? { reason: value } : {}) } });
        return { status: "saved" };
      });
    },
    /** Owner reset (068 D1-reset), the only password recovery: a random password the owner reads out once, stored as a scrypt
     * hash; every device of the account signs out. By phone it serves only an allow-listed administrator number, creating its
     * account when none exists, since registration refuses those numbers. The audit names the account, never the password. */
    async temporaryPassword(target: Readonly<{ id: string }> | Readonly<{ phone: string }>, actor: string): Promise<TemporaryPasswordOutcome> {
      const phone = "phone" in target ? normalizePhone(target.phone) : null;
      if ("phone" in target && (!phone || !adminPhone(phone))) return { status: "not-found", message: "Search for the member's account first." };
      const temporaryPassword = generateTemporaryPassword(), passwordHash = await hashPassword(temporaryPassword);
      return decide<TemporaryPasswordOutcome>(database, async (tx, rollback) => {
        const at = new Date(now()), fresh = randomUUID();
        if (phone) await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, createdAt, lastSignInAt) VALUES (${fresh}, ${phone}, ${at}, ${at})
          ON DUPLICATE KEY UPDATE id = id`;
        const id = phone ? (await tx.memberAccount.findUniqueOrThrow({ where: { phone }, select: { id: true } })).id : (target as { id: string }).id;
        const account = await lockMemberAccount(tx, id);
        if (!account?.phone || account.erasedAt) return rollback({ status: "refused", message: "This account is unavailable." });
        if (account.blockedAt) return rollback({ status: "refused", message: "Unblock this account before setting a password." });
        await tx.memberAccount.update({ where: { id }, data: { passwordHash } });
        const sessionsDeleted = (await tx.memberSession.deleteMany({ where: { accountId: id } })).count, created = id === fresh;
        await writeOwnerAudit(tx, { at, actor, action: "password_reset", accountId: id, targetType: "member", targetId: id, details: { sessionsDeleted, created } });
        return { status: "reset", accountId: id, temporaryPassword, created, sessionsDeleted };
      });
    },
    async audit(action = ""): Promise<readonly OwnerAuditRow[]> {
      return database.query(async tx => (await tx.ownerAuditEvent.findMany({ where: ownerAuditActions.includes(action as typeof ownerAuditActions[number]) ? { action } : {}, orderBy: [{ at: "desc" }, { id: "desc" }], take: 100,
        select: { id: true, at: true, actor: true, action: true, accountId: true, targetType: true, targetId: true } })).map(r => ({ ...r, id: String(r.id), at: r.at.toISOString() })));
    },
  };
}
