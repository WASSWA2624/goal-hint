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
import type { Prisma } from "../generated/prisma/client.ts";
import { checkoutOpenStatuses } from "../../domain/checkout.ts";
import { paymentDateNotExtracted } from "../../domain/payment-evidence-date.ts";
import { maximumPaymentQueuePage, paymentQueueStatusLabels, type PaymentFilters } from "../../domain/payment-queue-filters.ts";
import { paymentRejectionReasons as rejectionReasons } from "../../domain/payment-rejection.ts";

export { rejectionReasons };
const reference = (row?: { reference: string }) => row ? formatPaymentReference(row.reference) : null;
const paymentSelect = {
  id: true, reference: true, accountId: true, payerPhone: true, claimedNetwork: true, claimedTxnRef: true, claimedTxnKey: true,
  claimedAmountUgx: true, screenshotAmountUgx: true, purpose: true, planId: true, planName: true, durationDays: true, priceUgx: true, submittedAt: true, status: true, imageSha256: true,
  transactionRef: true, network: true, amountReceivedUgx: true, account: { select: { phone: true, creditUgx: true } }, screenshot: { select: { submissionId: true } },
  workflowVersion: true, decidedAt: true, code: { select: { startsAt: true, endsAt: true } },
  receiptClaims: {
    where: { withdrawn: false }, orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: { amountUgx: true, payerPhone: true, paidAt: true, original: true,
      receipt: { select: { amountUgx: true, senderPhone: true, receivedAt: true } } },
  },
} as const satisfies Prisma.PaymentSubmissionSelect;

function statusFilter(status: string, openQueue = false): Prisma.PaymentSubmissionWhereInput {
  if (status === "reconciliation") return { receiptClaims: { some: { receipt: { verifiedAt: { not: null }, allocatedSubmissionId: null } } } };
  if (status === "approved") return { status: { in: ["approved", "reversed"] } };
  if (openQueue && status === "pending") return { status: { in: [...checkoutOpenStatuses] } };
  return { status };
}

function queueFilter(filters: PaymentFilters): Prisma.PaymentSubmissionWhereInput {
  const statuses = filters.statuses.includes("all") ? [] : filters.statuses.map(status => statusFilter(status));
  const providers = filters.providers.filter(provider => provider !== "all");
  return {
    ...(statuses.length === 1 ? statuses[0] : statuses.length ? { OR: statuses } : {}),
    ...(providers.length && !filters.providers.includes("all") ? { AND: [{ OR: [
      { transactionRef: { not: null }, network: { in: providers } },
      { OR: [{ transactionRef: null }, { network: null }, { network: "" }], claimedNetwork: { in: providers } },
    ] }] } : {}),
  };
}

type PaymentRow = Prisma.PaymentSubmissionGetPayload<{ select: typeof paymentSelect }>;
function relativeTo(row: { id: string; submittedAt: Date }, oldest: boolean, after: boolean): Prisma.PaymentSubmissionWhereInput {
  return { OR: [
    { submittedAt: oldest === after ? { gt: row.submittedAt } : { lt: row.submittedAt } },
    { submittedAt: row.submittedAt, id: after ? { gt: row.id } : { lt: row.id } },
  ] };
}
function receiptSummary(row: PaymentRow) {
  const latest = row.receiptClaims[0];
  const paidAt = latest?.receipt.receivedAt ?? (latest && !paymentDateNotExtracted(latest.original) ? latest.paidAt : null);
  return {
    amount: latest ? row.receiptClaims.reduce((sum, claim) => sum + (claim.receipt.amountUgx ?? claim.amountUgx), 0) : null,
    payerPhone: latest?.receipt.senderPhone ?? latest?.payerPhone ?? row.payerPhone,
    paidAt: paidAt?.toISOString() ?? null,
  };
}

export function createPaymentReview(database: DatabaseRuntime, now = Date.now, { notifications = createQueuedPaymentNotifications(database) }: {
  notifications?: PaymentNotifications;
} = {}) {
  return {
    async list(tab = "pending", paymentId?: string, options: { page?: number; search?: string; filters?: PaymentFilters; focus?: string } = {}): Promise<PaymentQueue & Readonly<{ tab?: string; targetFound?: boolean }>> {
      return database.query(async tx => {
        // An old audit event may describe a payment whose status has since changed.
        const target = paymentId ? await tx.paymentSubmission.findUnique({ where: { id: paymentId }, select: paymentSelect }) : null;
        const requested = target?.status === "reversed" ? "approved" : target?.status ?? tab;
        const selected = Object.hasOwn(paymentQueueStatusLabels, requested) ? requested : "pending";
        const filters = target ? undefined : options.filters;
        const requestedPage = Math.max(1, Math.min(maximumPaymentQueuePage, Math.floor(options.page ?? 1) || 1));
        const search = (options.search ?? "").trim().slice(0, 100), pageSize = 30;
        const where = filters ? queueFilter(filters) : statusFilter(selected, !options.filters);
        const normalized = search.toUpperCase().replace(/[^A-Z0-9]/gu, ""), phone = search.replace(/[^0-9]/gu, "");
        if (search) where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: [{ reference: { contains: search.toUpperCase().replace(/^P-?/u, "") } },
          ...(phone ? [{ payerPhone: { contains: phone } }] : []),
          ...(normalized ? [{ claimedTxnKey: { contains: normalized } }, { receiptClaims: { some: { OR: [
            { receipt: { transactionKey: { contains: normalized } } }, ...(phone ? [{ payerPhone: { contains: phone } }, { receipt: { senderPhone: { contains: phone } } }] : [])] } } }] : [])] }];
        const total = await tx.paymentSubmission.count({ where });
        let page = options.filters ? Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize))) : requestedPage;
        const orderStatus = filters ? (filters.statuses.length === 1 ? filters.statuses[0] : undefined) : selected;
        const oldest = !!orderStatus && (checkoutOpenStatuses as readonly string[]).includes(orderStatus);
        const orderBy: Prisma.PaymentSubmissionOrderByWithRelationInput[] = [{ submittedAt: oldest ? "asc" : "desc" }, { id: "asc" }];
        const pendingWhere: Prisma.PaymentSubmissionWhereInput = { AND: [where, { status: "pending" }] };
        const focus = filters && options.focus ? await tx.paymentSubmission.findFirst({
          where: { AND: [pendingWhere, { id: options.focus }] }, select: { id: true, submittedAt: true },
        }) : null;
        if (focus) {
          const before = await tx.paymentSubmission.count({ where: { AND: [where, relativeTo(focus, oldest, false)] } });
          page = Math.min(maximumPaymentQueuePage, Math.floor(before / pageSize) + 1);
        }
        const rows = await tx.paymentSubmission.findMany({ where, orderBy, take: pageSize, skip: (page - 1) * pageSize, select: paymentSelect });
        // Keep the queue bounded while making the exact historical report available.
        if (target && !rows.some(row => row.id === target.id)) rows.splice(pageSize - 1, rows.length >= pageSize ? 1 : 0, target);
        const last = rows.at(-1);
        // A report without a transaction ID (null key) matches no other report's ID; only real keys are compared.
        const keys = [...new Set(rows.flatMap(r => r.claimedTxnKey ? [r.claimedTxnKey] : []))], hashes = [...new Set(rows.flatMap(r => r.imageSha256 ? [r.imageSha256] : []))], phones = [...new Set(rows.flatMap(r => r.payerPhone ? [r.payerPhone] : []))];
        const [related, payers, pendingCount, nextPending] = await Promise.all([
          keys.length || hashes.length ? tx.paymentSubmission.findMany({ where: { OR: [{ claimedTxnKey: { in: keys } }, { approvedTxnKey: { in: keys.flatMap(k => [`mtn:${k}`, `airtel:${k}`]) } }, { imageSha256: { in: hashes } }] },
            select: { id: true, accountId: true, reference: true, status: true, claimedTxnKey: true, approvedTxnKey: true, imageSha256: true } }) : [],
          phones.length ? tx.memberAccount.findMany({ where: { phone: { in: phones } }, select: { id: true, phone: true } }) : [],
          tx.paymentSubmission.count({ where: { status: { in: [...checkoutOpenStatuses] } } }),
          filters && last && total > rows.length && filters.statuses.some(status => status === "pending" || status === "all" || status === "reconciliation")
            ? tx.paymentSubmission.findFirst({ where: { AND: [pendingWhere, relativeTo(last, oldest, true)] }, orderBy, select: { id: true } })
              .then(next => next ?? tx.paymentSubmission.findFirst({ where: { AND: [pendingWhere, { id: { notIn: rows.map(row => row.id) } }] }, orderBy, select: { id: true } }))
            : null,
        ]);
        return { pendingCount, page, pageSize, total, search, ...(paymentId ? { tab: selected, targetFound: !!target } : {}),
          ...(nextPending ? { nextPendingId: nextPending.id } : {}), ...(focus && rows.some(row => row.id === focus.id) ? { focusId: focus.id } : {}),
          payments: rows.map(r => ({ id: r.id, workflowVersion: r.workflowVersion, reference: formatPaymentReference(r.reference), accountId: r.accountId, accountPhone: r.account.phone,
          payerPhone: r.payerPhone, network: r.claimedNetwork, transactionId: normalizeTransactionId(r.claimedTxnRef ?? ""), amount: r.claimedAmountUgx,
          purpose: r.purpose === "topup" ? "topup" as const : "plan" as const, accountCreditUgx: r.account.creditUgx, planId: r.planId,
          planName: r.planName, durationDays: r.durationDays, price: r.priceUgx, submittedAt: r.submittedAt.toISOString(), status: r.status, hasImage: !!r.screenshot,
          ...(options.filters ? { decidedAt: r.decidedAt?.toISOString() ?? null,
            ...(r.code ? { accessPeriod: { startsAt: r.code.startsAt.toISOString(), endsAt: r.code.endsAt.toISOString() } } : {}) } : {}),
          ...(r.workflowVersion === 2 ? { receiptSummary: receiptSummary(r) } : {}),
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
        if (row.workflowVersion === 2) return rollback({ status: "refused", message: "Use the checkout review controls to release reservations and retain receipt accounting." });
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
