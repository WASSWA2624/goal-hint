import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { formatPaymentReference, parseTransactionId, paymentRules, transactionKey, type PaymentFields, type PaymentStatus, type PaymentView } from "../../domain/payment.ts";
import { validMobilePhone } from "../../domain/phone-mobile.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import type { SubscriptionIdentity } from "../../domain/subscription-settings.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { imageDimensions } from "../images/image-format.ts";
import { lockMemberAccount, newReference } from "./access-codes.ts";
import type { MemberIdentity } from "./member-sessions.ts";
import { acceptedTerms } from "./member-terms.ts";
import { walletHistory } from "./wallet.ts";
import { validTopUp } from "../../domain/wallet.ts";
import { memberRateRules, takeMemberLimit } from "./rate-limit.ts";
import { configuredSubscriptionSettings, decide, lockSettings } from "./settings.ts";
import { enqueueMemberMessage } from "./payment-notification-outbox.ts";

type Outcome = Readonly<{ status: "saved"; reference: string }> | Readonly<{ status: "busy" | "refused" | "invalid" | "duplicate" }>;
type Bucket = { key: string; count: number; bytes: number };
export const duplicatePaymentMessage = "This transaction ID was already used. If you made this payment, call admin with the ID.";

export function createPayments({ database, config, now = Date.now, environment = getRuntimePolicy().choices.subscriptionIdentity }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number;
  /** Explicit null is for isolated historical-storage fixtures only. */
  environment?: SubscriptionIdentity | null;
}) {
  async function bucket(tx: Prisma.TransactionClient, purpose: string, value: string, at: Date): Promise<Bucket> {
    const key = config.key(`member-${purpose}`, value), start = new Date(Math.floor(+at / memberRateRules.dayMs) * memberRateRules.dayMs);
    const end = new Date(+start + memberRateRules.dayMs);
    await tx.$executeRaw`INSERT INTO RateLimitBucket (\`key\`, count, bytes, windowStartedAt, lockedUntil) VALUES (${key}, 0, 0, ${start}, ${end})
      ON DUPLICATE KEY UPDATE count = IF(windowStartedAt = ${start}, count, 0),
      bytes = IF(windowStartedAt = ${start}, bytes, 0), windowStartedAt = ${start},
      lockedUntil = GREATEST(COALESCE(lockedUntil, ${end}), ${end})`;
    return tx.rateLimitBucket.findUniqueOrThrow({ where: { key }, select: { key: true, count: true, bytes: true } });
  }
  const busyAudit = (tx: Prisma.TransactionClient, at: Date) => writeOwnerAudit(tx, { at, actor: "system", action: "uploads_busy",
    targetType: "payment", targetId: "daily-upload-ceiling", details: { ceilingBytes: paymentRules.siteBytes } });

  async function currentMember(tx: Prisma.TransactionClient, member: MemberIdentity, at: Date) {
    const account = await lockMemberAccount(tx, member.accountId);
    const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
    return account && !account.blockedAt && !account.erasedAt && account.phone && session?.accountId === account.id
      && session.authenticatedAt && !session.passwordResetAt && session.expiresAt > at ? { account, session } : null;
  }
  return Object.freeze({
    /** Reserve attempts and declared IP bytes before touching the body. Failed reads never consume stored-submission allowances. */
    async begin(member: MemberIdentity, address: string, bytes: number): Promise<boolean> {
      const at = new Date(now());
      return database.transaction(async (tx) => {
        // Authentication may have completed before deletion; serialize metadata reservations with account removal.
        if (!await currentMember(tx, member, at)) return false;
        if (!await takeMemberLimit(tx, config, { purpose: "upload-attempts", value: member.tokenHash, maximum: paymentRules.sessionAttempts, windowMs: memberRateRules.dayMs }, at)) return false;
        const stored = await bucket(tx, "upload-stored", member.tokenHash, at);
        if (stored.count >= paymentRules.sessionStored) return false;
        if (address !== "unknown") {
          const ip = await bucket(tx, "upload-ip", address, at);
          if (ip.count >= paymentRules.ipAttempts || ip.bytes + bytes > paymentRules.ipBytes) return false;
          await tx.rateLimitBucket.update({ where: { key: ip.key }, data: { count: { increment: 1 }, bytes: { increment: bytes } } });
        }
        const site = await bucket(tx, "upload-site", "all", at);
        if (site.bytes >= paymentRules.siteBytes) { await busyAudit(tx, at); return false; }
        return true;
      }, { isolationLevel: "ReadCommitted" });
    },

    async submit(member: MemberIdentity, fields: PaymentFields, image: Buffer | null = null): Promise<Outcome> {
      // The transaction ID is required; a screenshot is optional evidence for manual review.
      const transactionId = parseTransactionId(fields.transactionId), payerPhone = validMobilePhone(fields.payerPhone);
      // The browser's reading of the screenshot is kept only as a bounded hint for the owner.
      const read = fields.screenshotAmount, screenshotAmount = image && typeof read === "number" && Number.isSafeInteger(read) && read >= 100 && read <= 10_000_000 ? read : null;
      if (!transactionId || !payerPhone) return { status: "invalid" };
      const key = transactionKey(transactionId), imageBytes = image?.length ?? 0, topUp = fields.purpose === "topup" ? fields.topUpUgx : null;
      if (fields.purpose === "topup" && !validTopUp(topUp)) return { status: "invalid" };
      for (let attempt = 0; ; attempt++) {
        try { return await decide<Outcome>(database, async (tx, rollback) => {
          const at = new Date(now()), current = await currentMember(tx, member, at);
          if (!current) return rollback({ status: "refused" });
          // Shares confirmation's global lock, so a simultaneous owner approval cannot slip past this lookup.
          const settings = configuredSubscriptionSettings(await lockSettings(tx, "system", at), environment);
          if (settings.paywallMode === "off") return rollback({ status: "refused" });
          const plan = topUp === null && fields.planId ? await tx.subscriptionPlan.findUnique({ where: { id: fields.planId } }) : null;
          if (topUp === null && !plan?.active || !settings[fields.network === "mtn" ? "mtnNumber" : "airtelNumber"]
            || !fields.accepted && !await acceptedTerms(tx, member, at)) return rollback({ status: "invalid" });
          if (await tx.paymentSubmission.findFirst({ where: { approvedTxnKey: { in: [`mtn:${key}`, `airtel:${key}`] } }, select: { id: true } })) return rollback({ status: "duplicate" });
          const stored = await bucket(tx, "upload-stored", member.tokenHash, at), site = await bucket(tx, "upload-site", "all", at);
          if (stored.count >= paymentRules.sessionStored) return rollback({ status: "busy" });
          if (site.bytes + imageBytes > paymentRules.siteBytes) { await busyAudit(tx, at); return { status: "busy" }; }
          const dimensions = image ? imageDimensions(image) : null;
          if (image && !dimensions) return rollback({ status: "invalid" });
          // A new report replaces only a waiting report of the same purpose: a top-up never cancels a pending plan payment.
          const purpose = topUp === null ? "plan" : "topup";
          await tx.paymentSubmission.updateMany({ where: { accountId: member.accountId, status: "pending", purpose },
            data: { status: "superseded", decidedAt: at, decidedBy: "system:superseded" } });
          const reference = newReference().slice(2), id = randomUUID();
          // The claim is the plan's price, or the top-up the member chose; the owner records the amount actually received.
          const offer = plan ? { planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx }
            : { planId: null, planName: "Account credit", durationDays: null, priceUgx: topUp! };
          await tx.paymentSubmission.create({ data: { id, reference, source: "report", accountId: member.accountId, purpose, ...offer,
            payerPhone, claimedNetwork: fields.network, claimedTxnRef: transactionId,
            claimedTxnKey: key, claimedAmountUgx: offer.priceUgx, screenshotAmountUgx: screenshotAmount, status: "pending", submittedAt: at,
            submittedSessionHash: member.tokenHash, termsVersion: termsNotice.reviewedOn, acceptedAt: at,
            ...(image && dimensions ? { imageSha256: createHash("sha256").update(image).digest("hex"), imageBytes,
              screenshot: { create: { width: dimensions.width, height: dimensions.height, bytes: imageBytes, data: new Uint8Array(image) } } } : {}) } });
          await tx.rateLimitBucket.update({ where: { key: stored.key }, data: { count: { increment: 1 }, bytes: { increment: imageBytes } } });
          await tx.rateLimitBucket.update({ where: { key: site.key }, data: { count: { increment: 1 }, bytes: { increment: imageBytes } } });
          await writeOwnerAudit(tx, { at, actor: "member", action: "payment_submitted", accountId: member.accountId,
            targetType: "payment", targetId: id, details: { bytes: imageBytes, ...(topUp === null ? {} : { purpose, topUpUgx: topUp }) } });
          await enqueueMemberMessage(tx, { accountId: member.accountId, targetType: "payment", targetId: id, decision: "received", at }, settings.messageTemplates);
          return { status: "saved", reference: formatPaymentReference(reference) };
        }); } catch (error) {
          if (attempt >= 3 || !(error instanceof DatabaseOperationError) || !["conflict", "constraint"].includes(error.code)) throw error;
        }
      }
    },

    /** Account-level: any authenticated, current session of an open account sees the account's latest report (068). */
    async view(member: MemberIdentity): Promise<PaymentView> {
      return database.query(async (tx) => {
        const reportOf = { accountId: member.accountId, account: { blockedAt: null, erasedAt: null,
          sessions: { some: { tokenHash: member.tokenHash, authenticatedAt: { not: null }, expiresAt: { gt: new Date(now()) } } } } } as const;
        const shown = { reference: true, status: true, rejectText: true, rejectReason: true, planName: true, priceUgx: true, submittedAt: true, purpose: true,
          decidedAt: true, reversedAt: true, code: { select: { endsAt: true } } } as const;
        const [account, terms, status, history] = await Promise.all([
          tx.memberAccount.findUnique({ where: { id: member.accountId }, select: { creditUgx: true, autoRenew: true,
            autoRenewPlanId: true, blockedAt: true, erasedAt: true } }),
          acceptedTerms(tx, member, new Date(now())),
          tx.paymentSubmission.findFirst({ where: reportOf, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], select: shown }),
          walletHistory(tx, member.accountId),
        ]);
        const hidden = status ? await tx.paymentSubmission.findFirst({ where: { ...reportOf, purpose: status.purpose === "topup" ? "plan" : "topup" },
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }], select: shown }) : null;
        type Shown = NonNullable<typeof status>;
        const view = (row: Shown): PaymentStatus => ({ reference: formatPaymentReference(row.reference), status: row.status, rejectText: row.rejectText,
          rejectReason: row.rejectReason, planName: row.planName, priceUgx: row.priceUgx, submittedAt: row.submittedAt.toISOString(),
          endsAt: row.code?.endsAt.toISOString() ?? null, purpose: row.purpose === "topup" ? "topup" : "plan" });
        // A newer report of one purpose hides the other's; the hidden one still shows while it waits or once it is decided against later.
        const decidedLater = (row: Shown) => +(row.reversedAt ?? row.decidedAt ?? 0) > +(status?.submittedAt ?? 0);
        const otherStatus = hidden && status && hidden.reference !== status.reference && (["pending", "superseded"].includes(hidden.status)
          || ["rejected", "reversed"].includes(hidden.status) && decidedLater(hidden)) ? view(hidden) : null;
        // Credit is the account's, not a device's, so any current session of an open account sees it.
        const credit = account && !account.blockedAt && !account.erasedAt
          ? { balanceUgx: account.creditUgx, autoRenew: account.autoRenew, autoRenewPlanId: account.autoRenewPlanId, history } : null;
        return { acceptedTerms: terms, credit, status: status ? view(status) : null, otherStatus };
      });
    },
  });
}
export type Payments = ReturnType<typeof createPayments>;
