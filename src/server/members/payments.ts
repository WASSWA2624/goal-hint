import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { formatPaymentReference, parseTransactionId, paymentRules, transactionKey, type PaymentFields, type PaymentView } from "../../domain/payment.ts";
import { normalizePhone } from "../../domain/phone.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import type { SubscriptionIdentity, SubscriptionSettings } from "../../domain/subscription-settings.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { imageDimensions } from "../images/image-format.ts";
import { lockMemberAccount, newReference } from "./access-codes.ts";
import type { MemberIdentity } from "./member-sessions.ts";
import { memberRateRules, takeMemberLimit } from "./rate-limit.ts";
import { configuredSubscriptionSettings, decide, lockSettings } from "./settings.ts";

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
  /** Consent belongs to the account and terms version, independently of payment status or a device's access. */
  async function acceptedTerms(tx: Pick<Prisma.TransactionClient, "memberAccount">, member: MemberIdentity, at: Date): Promise<boolean> {
    return !!await tx.memberAccount.findFirst({ where: { id: member.accountId, phone: { not: null }, blockedAt: null, erasedAt: null,
      sessions: { some: { tokenHash: member.tokenHash, authenticatedAt: { not: null }, passwordResetAt: null, expiresAt: { gt: at } } },
      OR: [
        { submissions: { some: { source: "report", termsVersion: termsNotice.reviewedOn, acceptedAt: { not: null } } } },
        // Existing access records retain consent from member reports or historical code entry; owner grants have no version.
        { codes: { some: { termsVersion: termsNotice.reviewedOn } } },
      ],
    }, select: { id: true } });
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
      const transactionId = parseTransactionId(fields.transactionId), payerPhone = normalizePhone(fields.payerPhone);
      if (!transactionId || !payerPhone) return { status: "invalid" };
      const key = transactionKey(transactionId), imageBytes = image?.length ?? 0;
      for (let attempt = 0; ; attempt++) {
        try { return await decide<Outcome>(database, async (tx, rollback) => {
          const at = new Date(now()), current = await currentMember(tx, member, at);
          if (!current) return rollback({ status: "refused" });
          // Shares confirmation's global lock, so a simultaneous owner approval cannot slip past this lookup.
          const settings = configuredSubscriptionSettings(await lockSettings(tx, "system", at), environment);
          if (settings.paywallMode === "off") return rollback({ status: "refused" });
          const plan = await tx.subscriptionPlan.findUnique({ where: { id: fields.planId } });
          if (!plan?.active || !settings[fields.network === "mtn" ? "mtnNumber" : "airtelNumber"]
            || !fields.accepted && !await acceptedTerms(tx, member, at)) return rollback({ status: "invalid" });
          if (await tx.paymentSubmission.findFirst({ where: { approvedTxnKey: { in: [`mtn:${key}`, `airtel:${key}`] } }, select: { id: true } })) return rollback({ status: "duplicate" });
          const stored = await bucket(tx, "upload-stored", member.tokenHash, at), site = await bucket(tx, "upload-site", "all", at);
          if (stored.count >= paymentRules.sessionStored) return rollback({ status: "busy" });
          if (site.bytes + imageBytes > paymentRules.siteBytes) { await busyAudit(tx, at); return { status: "busy" }; }
          const dimensions = image ? imageDimensions(image) : null;
          if (image && !dimensions) return rollback({ status: "invalid" });
          await tx.paymentSubmission.updateMany({ where: { accountId: member.accountId, status: "pending" },
            data: { status: "superseded", decidedAt: at, decidedBy: "system:superseded" } });
          const reference = newReference().slice(2), id = randomUUID();
          // The claimed amount is the plan's price, never a browser value; the owner records the amount actually received.
          await tx.paymentSubmission.create({ data: { id, reference, source: "report", accountId: member.accountId,
            planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx,
            payerPhone, claimedNetwork: fields.network, claimedTxnRef: transactionId,
            claimedTxnKey: key, claimedAmountUgx: plan.priceUgx, status: "pending", submittedAt: at,
            submittedSessionHash: member.tokenHash, termsVersion: termsNotice.reviewedOn, acceptedAt: at,
            ...(image && dimensions ? { imageSha256: createHash("sha256").update(image).digest("hex"), imageBytes,
              screenshot: { create: { width: dimensions.width, height: dimensions.height, bytes: imageBytes, data: new Uint8Array(image) } } } : {}) } });
          await tx.rateLimitBucket.update({ where: { key: stored.key }, data: { count: { increment: 1 }, bytes: { increment: imageBytes } } });
          await tx.rateLimitBucket.update({ where: { key: site.key }, data: { count: { increment: 1 }, bytes: { increment: imageBytes } } });
          await writeOwnerAudit(tx, { at, actor: "member", action: "payment_submitted", accountId: member.accountId,
            targetType: "payment", targetId: id, details: { bytes: imageBytes } });
          return { status: "saved", reference: formatPaymentReference(reference) };
        }); } catch (error) {
          if (attempt >= 3 || !(error instanceof DatabaseOperationError) || !["conflict", "constraint"].includes(error.code)) throw error;
        }
      }
    },

    async trial(member: MemberIdentity, address: string): Promise<"saved" | "busy" | "refused"> {
      const at = new Date(now());
      return decide(database, async (tx, rollback) => {
        const current = await currentMember(tx, member, at);
        if (!current || current.account.trialRequestedAt || await tx.accessCode.count({ where: { accountId: member.accountId } })) return rollback("refused" as const);
        const settings = await lockSettings(tx, "system", at);
        if (settings.paywallMode === "off" || settings.trialDays === 0) return rollback("refused" as const);
        if (!await takeMemberLimit(tx, config, { purpose: "trial-session", value: member.tokenHash, maximum: 1, windowMs: memberRateRules.dayMs }, at)
          || !await takeMemberLimit(tx, config, { purpose: "trial-ip", value: address, maximum: 20, windowMs: memberRateRules.dayMs }, at)) return "busy" as const;
        await tx.memberAccount.update({ where: { id: member.accountId }, data: { trialRequestedAt: at } });
        await writeOwnerAudit(tx, { at, actor: "member", action: "trial_requested", accountId: member.accountId,
          targetType: "member", targetId: member.accountId, details: address === "unknown" ? {} : { ipKey: config.key("member-trial-ip", address),
            ipCount: (await tx.rateLimitBucket.findUniqueOrThrow({ where: { key: config.key("member-trial-ip", address) } })).count } });
        return "saved" as const;
      });
    },

    /** Account-level: any authenticated, current session of an open account sees the account's latest report (068). */
    async view(member: MemberIdentity, settings: SubscriptionSettings): Promise<PaymentView> {
      return database.query(async (tx) => {
        const [account, codes, terms, status] = await Promise.all([
          tx.memberAccount.findUnique({ where: { id: member.accountId }, select: { trialRequestedAt: true, trialDismissedAt: true } }),
          tx.accessCode.count({ where: { accountId: member.accountId } }), acceptedTerms(tx, member, new Date(now())),
          tx.paymentSubmission.findFirst({ where: { accountId: member.accountId, account: { blockedAt: null, erasedAt: null,
            sessions: { some: { tokenHash: member.tokenHash, authenticatedAt: { not: null }, expiresAt: { gt: new Date(now()) } } } } },
            orderBy: [{ submittedAt: "desc" }, { id: "desc" }], select: { reference: true, status: true, rejectText: true, rejectReason: true,
              planName: true, priceUgx: true, submittedAt: true, code: { select: { endsAt: true } } } }),
        ]);
        return { acceptedTerms: terms, trialEligible: !!account && !account.trialRequestedAt && codes === 0 && settings.trialDays > 0,
          trialPending: !!account?.trialRequestedAt && !account.trialDismissedAt && codes === 0, status: status ? { reference: formatPaymentReference(status.reference), status: status.status,
            rejectText: status.rejectText, rejectReason: status.rejectReason, planName: status.planName, priceUgx: status.priceUgx,
            submittedAt: status.submittedAt.toISOString(), endsAt: status.code?.endsAt.toISOString() ?? null } : null };
      });
    },
  });
}
export type Payments = ReturnType<typeof createPayments>;
