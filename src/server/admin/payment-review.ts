import "server-only";
import type { PaymentQueue, OwnerCode } from "../../domain/owner-members.ts";
import { paymentChecks } from "../../domain/payment-checks.ts";
import { formatPaymentReference, normalizeTransactionId } from "../../domain/payment.ts";
import { normalizePhone } from "../../domain/phone.ts";
import { codeStatus } from "../../domain/subscription-period.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { lockMemberAccount, type CodeOutcome } from "../members/access-codes.ts";
import { decide } from "../members/settings.ts";
import { writeOwnerAudit } from "./audit.ts";
import type { PaymentNotifications, PaymentRejectionNotification } from "../members/payment-notifications.ts";
import { createQueuedPaymentNotifications } from "../members/payment-notification-outbox.ts";
import type { PaymentNotificationStatus } from "../../domain/payment-notification.ts";

export const rejectionReasons = ["unreadable", "amount-mismatch", "not-received", "duplicate", "wrong-number", "other"] as const;
const reference = (row?: { reference: string }) => row ? formatPaymentReference(row.reference) : null;
export function createPaymentReview(database: DatabaseRuntime, now = Date.now, { notifications = createQueuedPaymentNotifications() }: {
  notifications?: PaymentNotifications;
} = {}) {
  return {
    async list(tab = "pending"): Promise<PaymentQueue> {
      const selected = ["pending", "approved", "rejected", "superseded"].includes(tab) ? tab : "pending";
      return database.query(async tx => {
        const at = new Date(now());
        const rows = await tx.paymentSubmission.findMany({ where: { status: selected === "approved" ? { in: ["approved", "reversed"] } : selected },
          orderBy: [{ submittedAt: selected === "pending" ? "asc" : "desc" }, { id: "asc" }], take: 100,
          select: { id: true, reference: true, accountId: true, payerPhone: true, claimedNetwork: true, claimedTxnRef: true, claimedTxnKey: true,
            claimedAmountUgx: true, screenshotAmountUgx: true, purpose: true, planId: true, planName: true, durationDays: true, priceUgx: true, submittedAt: true, status: true, imageSha256: true,
            transactionRef: true, network: true, amountReceivedUgx: true, account: { select: { phone: true, creditUgx: true } }, screenshot: { select: { submissionId: true } } } });
        // A report without a transaction ID (null key) matches no other report's ID; only real keys are compared.
        const keys = [...new Set(rows.flatMap(r => r.claimedTxnKey ? [r.claimedTxnKey] : []))], hashes = [...new Set(rows.flatMap(r => r.imageSha256 ? [r.imageSha256] : []))], phones = [...new Set(rows.flatMap(r => r.payerPhone ? [r.payerPhone] : []))];
        const [related, payers, trials, pendingCount] = await Promise.all([
          keys.length || hashes.length ? tx.paymentSubmission.findMany({ where: { OR: [{ claimedTxnKey: { in: keys } }, { approvedTxnKey: { in: keys.flatMap(k => [`mtn:${k}`, `airtel:${k}`]) } }, { imageSha256: { in: hashes } }] },
            select: { id: true, accountId: true, reference: true, status: true, claimedTxnKey: true, approvedTxnKey: true, imageSha256: true } }) : [],
          phones.length ? tx.memberAccount.findMany({ where: { phone: { in: phones } }, select: { id: true, phone: true } }) : [],
          selected === "pending" ? tx.memberAccount.findMany({ where: { trialRequestedAt: { not: null }, trialDismissedAt: null, blockedAt: null, erasedAt: null, codes: { none: {} } },
            orderBy: { trialRequestedAt: "asc" }, take: 100, select: { id: true, phone: true, trialRequestedAt: true } }) : [],
          tx.paymentSubmission.count({ where: { status: "pending" } }),
        ]);
        const events = trials.length ? await tx.ownerAuditEvent.findMany({ where: { action: "trial_requested", accountId: { in: trials.map(t => t.id) } }, orderBy: { at: "desc" }, select: { accountId: true, details: true } }) : [];
        const ipKeys = [...new Set(events.flatMap(e => { const d = e.details as { ipKey?: string }; return d.ipKey ? [d.ipKey] : []; }))];
        const buckets = ipKeys.length ? await tx.rateLimitBucket.findMany({ where: { key: { in: ipKeys }, windowStartedAt: new Date(Math.floor(+at / 86_400_000) * 86_400_000) }, select: { key: true, count: true } }) : [];
        return { pendingCount, trials: trials.map(t => {
          const details = events.find(e => e.accountId === t.id)?.details as { ipKey?: string; ipCount?: number } | undefined;
          return { ...t, trialRequestedAt: t.trialRequestedAt!.toISOString(), ipCount: details?.ipKey ? buckets.find(b => b.key === details.ipKey)?.count ?? 0 : null };
        }), payments: rows.map(r => ({ id: r.id, reference: formatPaymentReference(r.reference), accountId: r.accountId, accountPhone: r.account.phone,
          payerPhone: r.payerPhone, network: r.claimedNetwork, transactionId: normalizeTransactionId(r.claimedTxnRef ?? ""), amount: r.claimedAmountUgx,
          purpose: r.purpose === "topup" ? "topup" as const : "plan" as const, accountCreditUgx: r.account.creditUgx, planId: r.planId,
          planName: r.planName, durationDays: r.durationDays, price: r.priceUgx, submittedAt: r.submittedAt.toISOString(), status: r.status, hasImage: !!r.screenshot,
          final: r.transactionRef ? { network: r.network, transactionId: normalizeTransactionId(r.transactionRef), amount: r.amountReceivedUgx } : null,
          checks: paymentChecks({ received: r.amountReceivedUgx, price: r.priceUgx, transactionId: !!r.claimedTxnKey,
            approved: r.claimedTxnKey ? reference(related.find(s => s.id !== r.id && s.approvedTxnKey?.split(":")[1] === r.claimedTxnKey)) : null,
            pending: r.claimedTxnKey ? reference(related.find(s => s.accountId !== r.accountId && s.status === "pending" && s.claimedTxnKey === r.claimedTxnKey)) : null,
            image: r.imageSha256 ? related.filter(s => s.id !== r.id && s.imageSha256 === r.imageSha256).map(s => formatPaymentReference(s.reference))[0] ?? null : null,
            payerAccount: payers.some(p => p.phone === r.payerPhone && p.id !== r.accountId), payerDiffers: !!r.payerPhone && r.payerPhone !== r.account.phone,
            ...(r.screenshot ? { screenshotAmount: r.screenshotAmountUgx } : {}), purpose: r.purpose === "topup" ? "topup" : "plan" }) })) };
      });
    },
    async screenshot(id: string) { return database.query(tx => tx.paymentScreenshot.findUnique({ where: { submissionId: id }, select: { data: true } })); },
    async reject(id: string, reason: unknown, text: unknown, deleteImage: boolean, actor: string): Promise<CodeOutcome> {
      if (!rejectionReasons.includes(reason as typeof rejectionReasons[number]) || typeof text !== "string" || text.length > 200) return { status: "invalid", message: "Choose a rejection reason and keep text within 200 characters." };
      let payment: PaymentRejectionNotification | undefined;
      const outcome = await decide<CodeOutcome>(database, async (tx, rollback) => {
        const initial = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!initial) return rollback({ status: "refused", message: "This payment cannot be rejected." });
        const account = await lockMemberAccount(tx, initial.accountId);
        const row = await tx.paymentSubmission.findUniqueOrThrow({ where: { id } });
        if (!["pending", "superseded"].includes(row.status)) return rollback({ status: "refused", message: "This payment cannot be rejected." });
        const at = new Date(now());
        await tx.paymentSubmission.update({ where: { id }, data: { status: "rejected", rejectReason: reason as string, rejectText: text.trim() || null, decidedAt: at, decidedBy: actor,
          ...(deleteImage ? { imagePurgedAt: at } : {}) } });
        if (deleteImage) await tx.paymentScreenshot.deleteMany({ where: { submissionId: id } });
        await writeOwnerAudit(tx, { at, actor, action: "payment_rejected", accountId: row.accountId, targetType: "payment", targetId: id, details: { reason, deleteImage } });
        await notifications.enqueue?.(tx, { accountId: row.accountId, targetType: "payment", targetId: id, decision: "rejected", at });
        payment = { paymentId: id, accountId: row.accountId, phone: account?.phone ?? null, reference: formatPaymentReference(row.reference), reason: reason as string };
        return { status: "saved" };
      });
      if (outcome.status !== "saved" || !payment) return outcome;
      let notification: PaymentNotificationStatus;
      try { notification = await notifications.rejected(payment); }
      catch { notification = "failed"; }
      return { ...outcome, notification };
    },
    async codes(search = "", status = "all", accountId?: string): Promise<readonly OwnerCode[]> {
      // Accept current and historical payment references without mistaking a raw four-character key for a prefix.
      const phone = normalizePhone(search), ref = search.trim().toUpperCase().replace(/^[PC]-|^P(?=[0-9A-HJKMNP-TV-Z]{4}$)/u, "");
      return database.query(async tx => {
        const at = new Date(now());
        const statusWhere = status === "revoked" ? { revokedAt: { not: null } } : status === "active" ? { revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } }
          : status === "queued" ? { revokedAt: null, startsAt: { gt: at } } : status === "expired" ? { revokedAt: null, endsAt: { lte: at } } : {};
        const codes = await tx.accessCode.findMany({ where: { ...statusWhere, ...(accountId ? { accountId } : {}), ...(search ? { OR: [{ account: { phone: phone ?? "" } }, { reference: ref }, { paymentSubmission: { reference: ref } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
          select: { id: true, accountId: true, reference: true, planName: true, durationDays: true, extensionDays: true, startsAt: true, endsAt: true, revokedAt: true, source: true, account: { select: { phone: true } } } });
        return codes.map(c => ({ id: c.id, accountId: c.accountId, reference: `C-${c.reference}`, phone: c.account.phone, planName: c.planName, source: c.source,
          startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), status: codeStatus(c, new Date(now())), daysLeft: Math.max(0, Math.ceil((+c.endsAt - Math.max(now(), +c.startsAt)) / 86_400_000)) })).filter(c => status === "all" || c.status === status);
      });
    },
  };
}
