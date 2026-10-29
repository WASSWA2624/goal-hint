import "server-only";

import { paymentNoticeRules } from "../../domain/payment-notification.ts";
import type { OwnerNotice } from "../../domain/owner-members.ts";
import { formatPaymentReference } from "../../domain/payment.ts";
import { writeOwnerAudit } from "./audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { PaymentNotificationOutbox, Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "../members/access-codes.ts";

type NoticeAction = Readonly<{ status: "saved"; notification?: "queued" }> | Readonly<{ status: "refused"; message: string }>;
const refused = (): NoticeAction => ({ status: "refused", message: "This message notice can no longer be changed. Refresh to see its status." });
const interrupted = (row: PaymentNotificationOutbox, at: Date) => row.status === "dispatching" && row.startedAt !== null && +row.startedAt <= +at - paymentNoticeRules.interruptedAfterMs;
const unconfirmed = (row: PaymentNotificationOutbox, at: Date) => ["failed", "uncertain"].includes(row.status) || interrupted(row, at);

/** Owner inspection and explicit reconciliation only. Reading or changing a notice never contacts the SMS gateway. */
export function createPaymentNoticeAdmin(database: DatabaseRuntime, now = Date.now) {
  async function change(id: string, actor: string, action: "resend" | "dismiss"): Promise<NoticeAction> {
    return database.transaction<NoticeAction>(async tx => {
      const initial = await tx.paymentNotificationOutbox.findUnique({ where: { id } });
      if (!initial) return refused();
      const account = await lockMemberAccount(tx, initial.accountId);
      const row = await tx.paymentNotificationOutbox.findUnique({ where: { id } });
      const at = new Date(now());
      if (!account || account.erasedAt || account.blockedAt || !row) return refused();
      const eligible = action === "resend" ? unconfirmed(row, at) : unconfirmed(row, at) || ["unsupported", "unavailable", "cancelled", "skipped"].includes(row.status);
      if (!eligible) return refused();
      const where = { id, status: row.status, attemptId: row.attemptId };
      const changed = action === "resend"
        ? await tx.paymentNotificationOutbox.updateMany({ where, data: { status: "queued", startedAt: null, finishedAt: null, attemptId: null } })
        : await tx.paymentNotificationOutbox.deleteMany({ where });
      if (changed.count !== 1) return refused();
      // Clearing the attempt token fences any late gateway answer from the prior attempt.
      await writeOwnerAudit(tx, { at, actor, action: action === "resend" ? "payment_sms_resent" : "payment_sms_dismissed", accountId: row.accountId,
        targetType: row.targetType as "payment" | "access-code" | "member", targetId: row.targetId, details: { decision: row.decision, channel: row.channel ?? "sms", ...(action === "resend" ? { status: "queued" } : {}) } });
      return { status: "saved", ...(action === "resend" ? { notification: "queued" as const } : {}) };
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  }
  return Object.freeze({
    resend: (id: string, actor: string) => change(id, actor, "resend"),
    dismiss: (id: string, actor: string) => change(id, actor, "dismiss"),
    async attention(): Promise<readonly OwnerNotice[]> {
      const at = new Date(now());
      return database.query(async tx => {
        const where: Prisma.PaymentNotificationOutboxWhereInput = { OR: [
          { status: { in: ["failed", "uncertain", "unsupported", "unavailable", "skipped"] } },
          { status: "queued", createdAt: { lte: new Date(+at - paymentNoticeRules.stuckAfterMs) } },
          { status: "dispatching", startedAt: { lte: new Date(+at - paymentNoticeRules.interruptedAfterMs) } },
        ] };
        const rows = await tx.paymentNotificationOutbox.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
          include: { account: { select: { phone: true } } } });
        const paymentIds = rows.filter(row => row.targetType === "payment").map(row => row.targetId);
        const codeIds = rows.filter(row => row.targetType === "access-code").map(row => row.targetId);
        const [payments, codes] = await Promise.all([
          paymentIds.length ? tx.paymentSubmission.findMany({ where: { id: { in: paymentIds } }, select: { id: true, reference: true } }) : [],
          codeIds.length ? tx.accessCode.findMany({ where: { id: { in: codeIds } }, select: { id: true, reference: true } }) : [],
        ]);
        return rows.map(row => {
          const reference = row.targetType === "access-code" ? codes.find(code => code.id === row.targetId)?.reference
            : payments.find(payment => payment.id === row.targetId)?.reference;
          return { id: row.id, accountId: row.accountId, phone: row.account.phone, kind: row.decision, channel: row.channel === "whatsapp" ? "whatsapp" as const : "sms" as const, reference: reference
            ? row.targetType === "access-code" ? `C-${reference}` : formatPaymentReference(reference) : null,
            state: interrupted(row, at) ? "uncertain" : row.status, lastError: null, attempts: row.attemptId === null ? 0 : 1,
            createdAt: row.createdAt.toISOString(), attemptedAt: row.startedAt?.toISOString() ?? null };
        });
      });
    },
  });
}
