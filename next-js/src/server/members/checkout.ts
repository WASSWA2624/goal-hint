import { authCopy } from "../../i18n/messages/auth.ts";
import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { checkoutEvidenceSchema, checkoutOpenStatuses, checkoutRules, checkoutSelectionSchema, duplicateReceiptMessage, fundingAmounts, receiptInputSchema,
  type CheckoutQuote, type CheckoutRequest, type CheckoutSelection, type CheckoutView, type ReceiptInput } from "../../domain/checkout.ts";
import { formatPaymentReference, parseTransactionId, transactionKey } from "../../domain/payment.ts";
import { validMobilePhone } from "../../domain/phone-mobile.ts";
import { checkoutEvidenceWarnings, receiptEvidenceValidation } from "../../domain/checkout-evidence.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import { validTopUp } from "../../domain/wallet.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { PaymentSubmission, Prisma } from "../generated/prisma/client.ts";
import { accessCodeTransaction, createAccessPeriod, lockMemberAccount, newReference } from "./access-codes.ts";
import type { MemberIdentity } from "./member-sessions.ts";
import { configuredSubscriptionSettings, lockSettings } from "./settings.ts";
import { appendWalletEntry, lockedCredit } from "./wallet.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import type { SubscriptionIdentity } from "../../domain/subscription-settings.ts";
import { takeMemberLimit, memberRateRules } from "./rate-limit.ts";

type Tx = Prisma.TransactionClient;
type Result<T> = { ok: true; value: T } | { ok: false; message: string; code?: string };
const fail = (message: string, code?: string): Result<never> => ({ ok: false, message, ...(code ? { code } : {}) });
const open = (status: string) => (checkoutOpenStatuses as readonly string[]).includes(status);
const claimsSelect = { id: true, amountUgx: true, paidAt: true, receipt: true, withdrawn: true } as const;

export async function paymentEvent(tx: Tx, submissionId: string, action: string, actor: string, at: Date,
  reason?: string, receiptId?: string, details?: Prisma.InputJsonObject) {
  await tx.paymentEvent.create({ data: { id: randomUUID(), submissionId, action, actor, createdAt: at,
    reason: reason ?? null, receiptId: receiptId ?? null, ...(details ? { details } : {}) } });
  const row = await tx.paymentSubmission.findUnique({ where: { id: submissionId }, select: { accountId: true } });
  if (row && !["approved", "rejected", "receipt_attached", "receipt_corrected", "evidence_withdrawn"].includes(action)) await tx.memberNotification.create({ data: { id: randomUUID(), accountId: row.accountId,
    eventKey: `payment-update:${randomUUID()}`, kind: "payment-updated", occurredAt: at, createdAt: at } });
}

/** Callers hold the account lock. Expiration releases only reservations, never verified money. */
async function expire(tx: Tx, accountId: string, at: Date) {
  const rows = await tx.paymentSubmission.findMany({ where: { accountId, reservationActive: true, reservationUntil: { lte: at } }, select: { id: true, status: true } });
  for (const row of rows) {
    await tx.paymentSubmission.update({ where: { id: row.id }, data: { reservationActive: false,
      ...(row.status === "disputed" ? {} : { status: "reconfirm" }), revision: { increment: 1 } } });
    await paymentEvent(tx, row.id, "reservation_expired", "system", at);
  }
}

export async function checkoutBalances(tx: Tx, accountId: string) {
  const [credit, days, reserved] = await Promise.all([
    lockedCredit(tx, accountId), tx.referralCredit.aggregate({ where: { accountId }, _sum: { days: true } }),
    tx.paymentSubmission.aggregate({ where: { accountId, reservationActive: true }, _sum: { walletUgx: true, referralDays: true } }),
  ]);
  return { availableWalletUgx: Math.max(0, (credit ?? 0) - (reserved._sum.walletUgx ?? 0)),
    availableReferralDays: Math.max(0, (days._sum.days ?? 0) - (reserved._sum.referralDays ?? 0)) };
}

async function requestView(tx: Tx, row: PaymentSubmission): Promise<CheckoutRequest> {
  const claims = await tx.paymentReceiptClaim.findMany({ where: { submissionId: row.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: claimsSelect });
  const verifiedUgx = claims.reduce((sum, c) => sum + (!c.withdrawn && c.receipt.verifiedAt && !c.receipt.disputed
    && c.receipt.intendedSubmissionId === row.id ? c.receipt.amountUgx ?? 0 : 0), 0);
  const latest = row.status === "approved" ? await tx.accessCode.findFirst({ where: { accountId: row.accountId, revokedAt: null }, orderBy: { endsAt: "desc" }, select: { endsAt: true } }) : null;
  return { id: row.id, reference: formatPaymentReference(row.reference), status: row.status, purpose: row.purpose, method: row.method ?? row.claimedNetwork,
    planId: row.planId, planName: row.planName, priceUgx: row.priceUgx, durationDays: row.durationDays ?? 0, walletUgx: row.walletUgx, referralDays: row.referralDays,
    reportedUgx: claims.reduce((sum, c) => sum + (c.withdrawn ? 0 : c.amountUgx), 0), verifiedUgx,
    ...fundingAmounts(row.priceUgx, row.walletUgx, verifiedUgx), endsAt: latest?.endsAt.toISOString() ?? null,
    reservationUntil: row.reservationActive ? row.reservationUntil?.toISOString() ?? null : null,
    reason: row.rejectText, revision: row.revision, receipts: claims.map(c => ({ id: c.id, transactionId: c.receipt.transactionId,
      amountUgx: c.amountUgx, paidAt: c.paidAt.toISOString(), verified: !!c.receipt.verifiedAt,
      disputed: c.receipt.disputed || !!c.receipt.intendedSubmissionId && c.receipt.intendedSubmissionId !== row.id, withdrawn: c.withdrawn })) };
}

async function currentMember(tx: Tx, member: MemberIdentity, at: Date) {
  const account = await lockMemberAccount(tx, member.accountId);
  const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
  return account?.phone && !account.blockedAt && !account.erasedAt && session?.accountId === account.id
    && session.authenticatedAt && !session.passwordResetAt && session.expiresAt > at && !member.administrator ? account : null;
}

export function createCheckout({ database, config, now = Date.now, environment = getRuntimePolicy().choices.subscriptionIdentity }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number; environment?: SubscriptionIdentity | null;
}) {
  const run = <T>(fn: (tx: Tx, at: Date) => Promise<T>) => accessCodeTransaction(database, tx => fn(tx, new Date(now())));
  async function quote(tx: Tx, selection: CheckoutSelection, at: Date, accountId: string): Promise<Result<CheckoutQuote>> {
    const settings = configuredSubscriptionSettings(await lockSettings(tx, "checkout", at), environment);
    if (settings.paywallMode === "off") return fail("Subscriptions are not open yet.");
    const balances = await checkoutBalances(tx, accountId);
    const plan = selection.purpose === "plan" && selection.planId ? await tx.subscriptionPlan.findUnique({ where: { id: selection.planId } }) : null;
    if (selection.purpose === "plan" && (!plan?.active || selection.topUpUgx !== 0)
      || selection.purpose === "referral" && (selection.planId !== null || selection.method !== "referral" || selection.walletUgx !== 0 || selection.referralDays < 1)
      || selection.purpose === "topup" && (!validTopUp(selection.topUpUgx) || selection.planId !== null || selection.walletUgx !== 0 || selection.referralDays !== 0)
      || selection.purpose !== "plan" && selection.purpose !== "referral" && selection.method === "referral") return fail("Check the package and payment method.");
    const priceUgx = plan?.priceUgx ?? (selection.purpose === "topup" ? selection.topUpUgx : 0);
    if (selection.walletUgx > priceUgx || selection.walletUgx > balances.availableWalletUgx || selection.referralDays > balances.availableReferralDays)
      return fail("Your available balance changed. Check the funding breakdown and confirm again.", "balance-changed");
    const { amountToSend } = fundingAmounts(priceUgx, selection.walletUgx);
    if (selection.method === "wallet" && (selection.purpose !== "plan" || amountToSend !== 0)
      || selection.method === "referral" && selection.purpose !== "referral"
      || ["mtn", "airtel"].includes(selection.method) && amountToSend === 0) return fail("Choose a usable payment method.");
    const recipient = selection.method === "mtn" ? settings.mtnNumber : selection.method === "airtel" ? settings.airtelNumber : null;
    if (["mtn", "airtel"].includes(selection.method) && !recipient) return fail("This provider is unavailable. Choose another method.");
    const value = { ...selection, ...balances, priceUgx, durationDays: plan?.durationDays ?? 0,
      planName: plan?.name ?? (selection.purpose === "referral" ? "Referral days" : "Account credit"), amountToSend,
      recipient, recipientName: selection.method === "mtn" ? settings.mtnName : selection.method === "airtel" ? settings.airtelName : null };
    return { ok: true, value: { ...value, quoteKey: config.key("checkout-quote", JSON.stringify([accountId, value])) } };
  }

  async function reserveImage(tx: Tx, image: Buffer | null, at: Date) {
    if (!image) return true;
    const key = config.key("member-upload-site", "all"), start = new Date(Math.floor(+at / memberRateRules.dayMs) * memberRateRules.dayMs);
    const end = new Date(+start + memberRateRules.dayMs);
    await tx.$executeRaw`INSERT INTO RateLimitBucket (\`key\`, count, bytes, windowStartedAt, lockedUntil) VALUES (${key}, 0, 0, ${start}, ${end})
        ON DUPLICATE KEY UPDATE bytes = IF(windowStartedAt = ${start}, bytes, 0), count = IF(windowStartedAt = ${start}, count, 0), windowStartedAt = ${start}, lockedUntil = ${end}`;
    const reserved = await tx.rateLimitBucket.updateMany({ where: { key, bytes: { lte: 100_000_000 - image.length } }, data: { bytes: { increment: image.length }, count: { increment: 1 } } });
    return reserved.count === 1;
  }

  async function attach(tx: Tx, row: PaymentSubmission, input: ReceiptInput, image: Buffer | null, at: Date): Promise<Result<{ id: string; duplicate: boolean }>> {
    if (!image && !input.original.text.trim()) return fail("Add a transaction message or screenshot for this payment.");
    const transactionId = parseTransactionId(input.transactionId), payerPhone = validMobilePhone(input.payerPhone), paidAt = new Date(input.paidAt);
    if (!transactionId || !payerPhone || +paidAt > +at + 300_000 || !["mtn", "airtel"].includes(row.method ?? "")) return fail("Check the transaction details.");
    const provider = row.method!, key = transactionKey(transactionId);
    const settings = configuredSubscriptionSettings(await lockSettings(tx, "checkout", at), environment);
    const numbers = { mtn: settings.mtnNumber, airtel: settings.airtelNumber, [provider]: row.receivingNumber ?? (provider === "mtn" ? settings.mtnNumber : settings.airtelNumber) };
    const screenshotText = image && typeof input.original.extracted.screenshotText === "string" ? input.original.extracted.screenshotText : "";
    const warnings = checkoutEvidenceWarnings({ text: input.original.text, screenshotText, hasImage: !!image, transactionId, amountUgx: String(input.amountUgx) }, provider as "mtn" | "airtel", numbers);
    if (warnings.length && !input.warningsAccepted) return fail("Review the payment details and choose Confirm before submitting.", "evidence-warning");
    const fingerprint = createHash("sha256").update(JSON.stringify([provider, transactionId, input.amountUgx, payerPhone, input.paidAt, input.original.text, screenshotText,
      image ? createHash("sha256").update(image).digest("hex") : null, warnings])).digest("hex");
    const original = { ...input.original, extracted: { ...input.original.extracted, validationVersion: 1, selectedProvider: provider,
      validationWarnings: JSON.stringify(warnings), validationFingerprint: fingerprint, validationAcknowledgedAt: warnings.length ? at.toISOString() : null } };
    let receipt = await tx.paymentReceipt.findUnique({ where: { provider_transactionKey: { provider, transactionKey: key } } });
    if (!receipt) {
      // Legacy approvals made after migration also block reuse in this workflow.
      const historical = await tx.paymentSubmission.findUnique({ where: { approvedTxnKey: `${provider}:${key}` } });
      receipt = await tx.paymentReceipt.create({ data: { id: randomUUID(), provider, transactionKey: key, transactionId,
        ...(historical ? { verifiedAt: historical.decidedAt, verifiedBy: historical.decidedBy ?? "historical", amountUgx: historical.amountReceivedUgx,
          recipient: "historical", receivedAt: historical.submittedAt, allocatedSubmissionId: historical.id, allocatedAt: historical.decidedAt, intendedSubmissionId: historical.id } : {}) } });
    }
    const existing = await tx.paymentReceiptClaim.findUnique({ where: { submissionId_receiptId: { submissionId: row.id, receiptId: receipt.id } } });
    if (existing) {
      if (!await reserveImage(tx, image, at)) return fail("Screenshot storage is busy. Keep your draft and try later.");
      if (!receipt.verifiedAt && !receipt.allocatedSubmissionId) {
        const corrections = Array.isArray(existing.corrections) ? existing.corrections : existing.corrections ? [existing.corrections] : [];
        await tx.paymentReceiptClaim.update({ where: { id: existing.id }, data: { amountUgx: input.amountUgx, payerPhone, paidAt, withdrawn: false,
          corrections: [...corrections, { transactionId, amountUgx: input.amountUgx, payerPhone, paidAt: input.paidAt, evidence: original }],
          ...(!existing.image && image ? { image: new Uint8Array(image), imageSha256: createHash("sha256").update(image).digest("hex") } : {}) } });
        if (existing.image && image) {
          const imageSha256 = createHash("sha256").update(image).digest("hex");
          if (imageSha256 !== existing.imageSha256 && !await tx.paymentReceiptEvidence.findUnique({ where: { claimId_imageSha256: { claimId: existing.id, imageSha256 } } }))
            await tx.paymentReceiptEvidence.create({ data: { id: randomUUID(), claimId: existing.id, image: new Uint8Array(image), imageSha256, createdAt: at } });
        }
        await tx.paymentSubmission.update({ where: { id: row.id }, data: { revision: { increment: 1 }, ...(row.status === "disputed" ? {} : { status: "pending" }) } });
        await paymentEvent(tx, row.id, "receipt_corrected", "member", at, undefined, receipt.id);
      }
      return { ok: true, value: { id: row.id, duplicate: true } };
    }
    const others = await tx.paymentReceiptClaim.findMany({ where: { receiptId: receipt.id }, select: { submissionId: true, submission: { select: { accountId: true } } } });
    const sameAccount = others.find(c => c.submission.accountId === row.accountId);
    if (sameAccount) return { ok: true, value: { id: sameAccount.submissionId, duplicate: true } };
    const collision = others.some(c => c.submission.accountId !== row.accountId)
      || !!receipt.allocatedSubmissionId && receipt.allocatedSubmissionId !== row.id;
    const correction = { transactionId, amountUgx: input.amountUgx, payerPhone, paidAt: input.paidAt };
    if (!await reserveImage(tx, image, at)) return fail("Screenshot storage is busy. Keep your draft and try later, or submit manual details.");
    await tx.paymentReceiptClaim.create({ data: { id: randomUUID(), submissionId: row.id, receiptId: receipt.id, amountUgx: input.amountUgx,
      payerPhone, paidAt, original, corrections: correction, createdAt: at,
      ...(image ? { image: new Uint8Array(image), imageSha256: createHash("sha256").update(image).digest("hex") } : {}) } });
    if (collision) {
      await tx.paymentReceipt.update({ where: { id: receipt.id }, data: { disputed: true } });
      await tx.paymentSubmission.updateMany({ where: { id: { in: [row.id, ...others.map(c => c.submissionId)] }, status: { in: [...checkoutOpenStatuses] } },
        data: { status: "disputed", revision: { increment: 1 } } });
      await paymentEvent(tx, row.id, "competing_claim", "member", at, undefined, receipt.id);
    } else {
      await tx.paymentReceipt.update({ where: { id: receipt.id }, data: { intendedSubmissionId: row.id } });
      await tx.paymentSubmission.update({ where: { id: row.id }, data: { status: "pending", revision: { increment: 1 } } });
    }
    await paymentEvent(tx, row.id, "receipt_attached", "member", at, undefined, receipt.id, { correctedFields: Object.keys(correction) });
    return { ok: true, value: { id: row.id, duplicate: collision } };
  }

  return Object.freeze({
    async checkEvidence(member: MemberIdentity, input: unknown) {
      const parsed = checkoutEvidenceSchema.safeParse(input);
      if (!parsed.success || !parseTransactionId(parsed.data.transactionId)) return fail("Enter a valid transaction ID and payment provider.");
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return fail(authCopy.paymentLoginAgain);
        if (!await takeMemberLimit(tx, config, { purpose: "checkout-evidence", value: member.accountId, maximum: 30, windowMs: 60_000 }, at))
          return fail("Too many payment checks. Wait a minute and try again.");
        const { provider, transactionId, submissionId, imageSha256 } = parsed.data;
        const receipt = await tx.paymentReceipt.findUnique({ where: { provider_transactionKey: { provider, transactionKey: transactionKey(transactionId) } },
          select: { id: true, allocatedSubmissionId: true } });
        const own = receipt ? await tx.paymentReceiptClaim.findFirst({ where: { receiptId: receipt.id, submission: { accountId: member.accountId } },
          select: { submissionId: true, submission: { select: { reference: true } } } }) : null;
        const allocation = !own && receipt?.allocatedSubmissionId ? await tx.paymentSubmission.findFirst({
          where: { id: receipt.allocatedSubmissionId, accountId: member.accountId }, select: { id: true, reference: true } }) : null;
        const ownId = own?.submissionId ?? allocation?.id, reference = own?.submission.reference ?? allocation?.reference;
        const current = !!ownId && ownId === submissionId;
        // Only this member's image history is checked; never disclose another member's evidence or identity.
        const repeated = imageSha256 ? await tx.paymentSubmission.findFirst({ where: { accountId: member.accountId, id: { not: submissionId ?? "" }, OR: [
          { imageSha256 }, { receiptClaims: { some: { OR: [{ imageSha256 }, { evidence: { some: { imageSha256 } } }] } } },
        ] }, select: { id: true } }) : null;
        const reuse = current ? "current" as const : ownId ? "own" as const : receipt ? "reported" as const : "available" as const;
        return { ok: true as const, value: { reuse, imageRepeated: !!repeated, ...(reference ? { reference: formatPaymentReference(reference) } : {}) } };
      });
    },
    async allow(member: MemberIdentity, address: string): Promise<boolean> {
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return false;
        return await takeMemberLimit(tx, config, { purpose: "checkout-minute", value: member.tokenHash, maximum: 120, windowMs: 60_000 }, at)
          && await takeMemberLimit(tx, config, { purpose: "checkout-day", value: member.accountId, maximum: 1000, windowMs: memberRateRules.dayMs }, at)
          && await takeMemberLimit(tx, config, { purpose: "checkout-ip", value: address, maximum: 5000, windowMs: memberRateRules.hourMs }, at);
      });
    },
    async read(member: MemberIdentity): Promise<CheckoutView | null> {
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return null;
        await expire(tx, member.accountId, at);
        const rows = await tx.paymentSubmission.findMany({ where: { accountId: member.accountId, workflowVersion: 2 }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 20 });
        const last = await tx.paymentSubmission.findFirst({ where: { accountId: member.accountId, status: "approved" }, orderBy: { decidedAt: "desc" }, select: { method: true, network: true } });
        return { ...await checkoutBalances(tx, member.accountId), lastMethod: last?.method ?? last?.network ?? null, requests: await Promise.all(rows.map(r => requestView(tx, r))) };
      });
    },
    async quote(member: MemberIdentity, input: unknown): Promise<Result<CheckoutQuote>> {
      const parsed = checkoutSelectionSchema.safeParse(input); if (!parsed.success) return fail("Check the payment choices.");
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return fail(authCopy.loginAgain);
        await expire(tx, member.accountId, at);
        return quote(tx, parsed.data, at, member.accountId);
      });
    },
    async confirm(member: MemberIdentity, input: unknown, requestKey: string, quoteKey: string, confirmed: boolean, proof?: unknown, image: Buffer | null = null): Promise<Result<CheckoutRequest>> {
      const parsed = checkoutSelectionSchema.safeParse(input), receipt = proof === undefined ? null : receiptInputSchema.safeParse(proof);
      if (!parsed.success || !confirmed || !/^[a-f0-9-]{36}$/iu.test(requestKey) || receipt && !receipt.success) return fail("Confirm the payment details and terms.");
      return accessCodeTransaction(database, async (tx, rollback) => {
        const at = new Date(now()), account = await currentMember(tx, member, at);
        if (!account) return rollback(fail(authCopy.loginAgain));
        const previous = await tx.paymentSubmission.findUnique({ where: { requestKey } });
        if (previous) return previous.accountId === account.id ? { ok: true, value: await requestView(tx, previous) } : fail("Request unavailable.");
        await expire(tx, account.id, at);
        const quoted = await quote(tx, parsed.data, at, account.id);
        if (!quoted.ok) return quoted;
        const q = quoted.value;
        if (q.quoteKey !== quoteKey) return fail("The payable amount or balances changed. Review the updated breakdown and confirm again.", "quote-changed");
        if (q.amountToSend > 0 && !receipt?.success) return fail("Add transaction details for review.");
        // An identical receipt from this customer restores its original request before making any new reservation.
        if (receipt?.success) {
          const key = transactionKey(receipt.data.transactionId);
          const prior = await tx.paymentReceiptClaim.findFirst({ where: { receipt: { provider: q.method, transactionKey: key }, submission: { accountId: account.id } },
            orderBy: { submission: { submittedAt: "desc" } }, select: { submission: true } });
          if (prior) return { ok: true, value: await requestView(tx, prior.submission) };
        }
        const row = await tx.paymentSubmission.create({ data: { id: randomUUID(), requestKey, reference: newReference().slice(2), source: "checkout", workflowVersion: 2,
          accountId: account.id, purpose: q.purpose, planId: q.purpose === "plan" ? q.planId : null, planName: q.planName,
          priceUgx: q.priceUgx, durationDays: q.purpose === "topup" ? null : q.durationDays, method: q.method, receivingNumber: q.recipient,
          walletUgx: q.walletUgx, referralDays: q.referralDays, claimedNetwork: q.method, claimedAmountUgx: q.priceUgx,
          payerPhone: receipt?.success ? validMobilePhone(receipt.data.payerPhone) : null,
          claimedTxnRef: receipt?.success ? parseTransactionId(receipt.data.transactionId) : null,
          claimedTxnKey: receipt?.success ? transactionKey(receipt.data.transactionId) : null,
          status: "pending", submittedAt: at, submittedSessionHash: member.tokenHash, termsVersion: termsNotice.reviewedOn, acceptedAt: at,
          reservationActive: true, reservationUntil: new Date(+at + checkoutRules.reservationMs) } });
        await paymentEvent(tx, row.id, "submitted", "member", at, undefined, undefined, { walletUgx: q.walletUgx, referralDays: q.referralDays });
        if (q.amountToSend > 0 && receipt?.success) {
          const result = await attach(tx, row, receipt.data, image, at);
          if (!result.ok) return rollback(result);
        } else {
          const result = await allocateCheckout(tx, row, at, "member");
          if (!result.ok) return rollback(result);
        }
        return { ok: true, value: await requestView(tx, await tx.paymentSubmission.findUniqueOrThrow({ where: { id: row.id } })) };
      });
    },
    async attach(member: MemberIdentity, id: string, proof: unknown, image: Buffer | null = null): Promise<Result<CheckoutRequest>> {
      const parsed = receiptInputSchema.safeParse(proof); if (!parsed.success) return fail("Check the transaction details.");
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return fail(authCopy.loginAgain);
        await lockSettings(tx, "checkout", at);
        await expire(tx, member.accountId, at);
        const row = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!row || row.accountId !== member.accountId || row.workflowVersion !== 2 || !open(row.status)) return fail("This request is closed.");
        if (!row.reservationActive) return fail("Review your funding and confirm again before attaching payment.", "reconfirm");
        const result = await attach(tx, row, parsed.data, image, at);
        if (!result.ok) return result;
        return { ok: true, value: await requestView(tx, await tx.paymentSubmission.findUniqueOrThrow({ where: { id: result.value.id } })) };
      });
    },
    async reconfirm(member: MemberIdentity, id: string, walletUgx: number, referralDays: number, amountToSend: number, confirmed: boolean): Promise<Result<CheckoutRequest>> {
      if (!confirmed || ![walletUgx, referralDays, amountToSend].every(v => Number.isSafeInteger(v) && v >= 0)) return fail("Confirm your funding choices.");
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return fail(authCopy.loginAgain);
        await lockSettings(tx, "checkout", at); await expire(tx, member.accountId, at);
        const row = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!row || row.workflowVersion !== 2 || row.accountId !== member.accountId || ![...checkoutOpenStatuses, "rejected", "cancelled", "superseded"].includes(row.status) || row.reservationActive) return fail("This request cannot be reconfirmed.");
        const balances = await checkoutBalances(tx, member.accountId);
        if (walletUgx > balances.availableWalletUgx || walletUgx > row.priceUgx || referralDays > Math.min(365, balances.availableReferralDays)
          || row.priceUgx - walletUgx !== amountToSend || row.purpose === "referral" && (walletUgx !== 0 || referralDays < 1)
          || row.method === "wallet" && walletUgx !== row.priceUgx) return fail("The payable amount changed. Review and confirm again.", "quote-changed");
        const updated = await tx.paymentSubmission.update({ where: { id }, data: { walletUgx, referralDays, reservationActive: true,
          reservationUntil: new Date(+at + checkoutRules.reservationMs), status: row.status === "disputed" ? "disputed" : "pending", revision: { increment: 1 } } });
        await paymentEvent(tx, id, "reconfirmed", "member", at, undefined, undefined, { walletUgx, referralDays, amountToSend });
        return { ok: true, value: await requestView(tx, updated) };
      });
    },
    async cancel(member: MemberIdentity, id: string): Promise<Result<CheckoutRequest>> {
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return fail(authCopy.loginAgain);
        await lockSettings(tx, "checkout", at);
        const row = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!row || row.accountId !== member.accountId || row.workflowVersion !== 2) return fail("Request unavailable.");
        if (row.status === "cancelled") return { ok: true, value: await requestView(tx, row) };
        if (!open(row.status)) return fail("This request is closed.");
        const updated = await tx.paymentSubmission.update({ where: { id }, data: { status: "cancelled", reservationActive: false, decidedAt: at, decidedBy: "member", revision: { increment: 1 } } });
        await paymentEvent(tx, id, "cancelled", "member", at);
        return { ok: true, value: await requestView(tx, updated) };
      });
    },
    async withdraw(member: MemberIdentity, id: string, claimId: string): Promise<Result<CheckoutRequest>> {
      return run(async (tx, at) => {
        if (!await currentMember(tx, member, at)) return fail(authCopy.loginAgain);
        await lockSettings(tx, "checkout", at);
        const row = await tx.paymentSubmission.findUnique({ where: { id } });
        const claim = await tx.paymentReceiptClaim.findFirst({ where: { id: claimId, submissionId: id }, include: { receipt: true } });
        if (!row || row.accountId !== member.accountId || !open(row.status) || !claim || claim.receipt.verifiedAt || claim.receipt.allocatedSubmissionId)
          return fail("Only unverified evidence can be withdrawn. Verified money stays for reconciliation.");
        await tx.paymentReceiptClaim.update({ where: { id: claimId }, data: { withdrawn: true } });
        await tx.paymentSubmission.update({ where: { id }, data: { revision: { increment: 1 } } });
        await paymentEvent(tx, id, "evidence_withdrawn", "member", at, undefined, claim.receiptId);
        return { ok: true, value: await requestView(tx, row) };
      });
    },
  });
}

/** The account and settings locks cover every receipt verification/allocation path. */
export async function allocateCheckout(tx: Tx, row: PaymentSubmission, at: Date, actor: string): Promise<Result<{ endsAt: string | null }>> {
  if (row.status === "approved") return { ok: true, value: { endsAt: (await requestView(tx, row)).endsAt } };
  if (!open(row.status) || row.status === "disputed") return fail("Resolve ownership before approval.");
  if (!row.reservationActive || !row.reservationUntil || row.reservationUntil <= at) return fail("The customer must reconfirm expired funding choices.", "reconfirm");
  const account = await tx.memberAccount.findUniqueOrThrow({ where: { id: row.accountId } });
  if (!account.phone || account.blockedAt || account.erasedAt) return fail("This account cannot receive access.");
  const reserved = await tx.paymentSubmission.aggregate({ where: { accountId: row.accountId, reservationActive: true }, _sum: { walletUgx: true, referralDays: true } });
  const days = await tx.referralCredit.aggregate({ where: { accountId: row.accountId }, _sum: { days: true } });
  if (account.creditUgx < (reserved._sum.walletUgx ?? 0) || (days._sum.days ?? 0) < (reserved._sum.referralDays ?? 0)) {
    await tx.paymentSubmission.update({ where: { id: row.id }, data: { reservationActive: false, status: "reconfirm", revision: { increment: 1 } } });
    await paymentEvent(tx, row.id, "funding_changed", actor, at);
    return fail("Available funding changed. The customer must check and confirm the new payable amount.", "reconfirm");
  }
  const claims = await tx.paymentReceiptClaim.findMany({ where: { submissionId: row.id, withdrawn: false }, select: { receipt: true, original: true, corrections: true } });
  if (claims.some(claim => !receiptEvidenceValidation(claim.original, claim.corrections).reviewed))
    return fail("Review the evidence discrepancies and record the admin's findings before approval.", "evidence-review");
  if (claims.some(c => c.receipt.disputed)) return fail("Resolve ownership before approval.");
  const receipts = claims.map(c => c.receipt).filter(r => r.verifiedAt && r.intendedSubmissionId === row.id);
  if (claims.some(c => !c.receipt.verifiedAt)) return fail("Verify each attached receipt or request correction of unverified evidence before approval.");
  if (receipts.some(r => r.allocatedSubmissionId && r.allocatedSubmissionId !== row.id)) return fail("A receipt is already allocated. Mark the ownership dispute.");
  const received = receipts.reduce((sum, r) => sum + (r.amountUgx ?? 0), 0);
  const amounts = fundingAmounts(row.priceUgx, row.walletUgx, received);
  const added = row.purpose === "topup" ? received : amounts.excessUgx;
  if (added > checkoutRules.maximumUgx || account.creditUgx - row.walletUgx + added > checkoutRules.maximumUgx)
    return fail("Verified funds remain unallocated for reconciliation because the resulting wallet would exceed the supported integer balance.");
  if (amounts.remainingUgx > 0) {
    await tx.paymentSubmission.update({ where: { id: row.id }, data: { status: "remaining", revision: { increment: 1 } } });
    await paymentEvent(tx, row.id, "awaiting_remaining", actor, at, undefined, undefined, { remainingUgx: amounts.remainingUgx });
    return fail(`UGX ${amounts.remainingUgx.toLocaleString("en-UG")} remains. Verify another receipt before approval.`, "remaining");
  }
  const settings = await lockSettings(tx, actor, at);
  // Release this request's reservation before its ledger debit. Other reservations still constrain spending.
  await tx.paymentSubmission.update({ where: { id: row.id }, data: { reservationActive: false } });
  const grant = row.purpose !== "topup" ? await createAccessPeriod(tx, account, { source: "payment", paymentSubmissionId: row.id, planId: row.planId,
    planName: row.planName, priceUgx: row.priceUgx, durationDays: row.durationDays || row.referralDays,
    extensionDays: row.durationDays ? row.referralDays : 0, termsVersion: row.termsVersion }, actor, at,
    { maximum: settings.maxUnlockedDevices, prefer: row.submittedSessionHash ? [row.submittedSessionHash] : [], appendAfterCurrent: true }) : null;
  if (row.walletUgx) await appendWalletEntry(tx, row.accountId, { kind: "purchase", amountUgx: -row.walletUgx, actor: "member", at,
    accessCodeId: grant!.id, requestKey: `checkout:${row.id}` });
  if (row.referralDays) {
    const balances = await checkoutBalances(tx, row.accountId);
    if (balances.availableReferralDays < row.referralDays) throw new Error("Reserved referral balance is unavailable.");
    await tx.referralCredit.create({ data: { id: randomUUID(), accountId: row.accountId, requestKey: `checkout:${row.id}`, days: -row.referralDays, kind: "redeem", createdAt: at } });
  }
  const credit = row.purpose === "topup" ? received : amounts.excessUgx;
  if (row.purpose === "topup") await appendWalletEntry(tx, row.accountId, { kind: "topup", amountUgx: row.priceUgx,
    actor: "admin", at, paymentSubmissionId: row.id, requestKey: `checkout-topup:${row.id}` });
  if (amounts.excessUgx) await appendWalletEntry(tx, row.accountId, { kind: "overpayment", amountUgx: amounts.excessUgx,
    actor: "admin", at, paymentSubmissionId: row.id, requestKey: `checkout-credit:${row.id}` });
  for (const receipt of receipts) await tx.paymentReceipt.update({ where: { id: receipt.id }, data: { allocatedSubmissionId: row.id, allocatedAt: at } });
  await tx.paymentSubmission.update({ where: { id: row.id }, data: { status: "approved", amountReceivedUgx: received, decidedAt: at, decidedBy: actor,
    rejectReason: null, rejectText: null, revision: { increment: 1 } } });
  await paymentEvent(tx, row.id, "approved", actor, at, undefined, undefined, { receivedUgx: received, walletUgx: row.walletUgx, referralDays: row.referralDays, creditUgx: credit });
  const last = await tx.accessCode.findFirst({ where: { accountId: row.accountId, revokedAt: null }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
  return { ok: true, value: { endsAt: last?.endsAt.toISOString() ?? null } };
}

export type Checkout = ReturnType<typeof createCheckout>;
export { duplicateReceiptMessage };
