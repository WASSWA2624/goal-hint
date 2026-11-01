import "server-only";
import { z } from "zod";
import { checkoutOpenStatuses, checkoutRules, fundingAmounts } from "../../domain/checkout.ts";
import { validMobilePhone } from "../../domain/phone-mobile.ts";
import { receiptEvidenceValidation } from "../../domain/checkout-evidence.ts";
import { auditTextErrors } from "./audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { accessCodeTransaction, lockMemberAccount } from "../members/access-codes.ts";
import { allocateCheckout, paymentEvent } from "../members/checkout.ts";
import { lockSettings } from "../members/settings.ts";

const reason = z.string().trim().min(3).max(500).refine(v => !auditTextErrors({ reason: v }), "Keep personal numbers out of the audit reason.");
const base = { revision: z.number().int().nonnegative() };
export const checkoutReviewSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("verify-receipt"), receiptId: z.uuid(), amountUgx: z.number().int().min(1).max(checkoutRules.maximumUgx),
    recipient: z.string(), senderPhone: z.string(), receivedAt: z.iso.datetime({ offset: true }),
    transactionChecked: z.literal(true), recipientChecked: z.literal(true), successfulReceipt: z.literal(true), senderChecked: z.literal(true) }),
  z.object({ ...base, action: z.literal("approve-checkout") }),
  z.object({ ...base, action: z.literal("review-evidence"), claimId: z.uuid(), warningsChecked: z.literal(true), reason }),
  z.object({ ...base, action: z.enum(["reject-checkout", "request-correction", "mark-disputed"]), reason }),
  z.object({ ...base, action: z.literal("resolve-dispute"), receiptId: z.uuid(), intendedSubmissionId: z.uuid(), reason,
    contactedVerifiedPayer: z.literal(true), ownershipClear: z.literal(true) }),
]);

export function createCheckoutReview(database: DatabaseRuntime, now = Date.now) {
  return {
    async detail(id: string) {
      return database.query(async tx => {
        const row = await tx.paymentSubmission.findUnique({ where: { id }, select: { workflowVersion: true, revision: true, walletUgx: true,
          referralDays: true, receivingNumber: true, reservationActive: true, reservationUntil: true, priceUgx: true, status: true } });
        if (!row || row.workflowVersion !== 2) return null;
        const claims = await tx.paymentReceiptClaim.findMany({ where: { submissionId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, receipt: { include: { claims: { select: { submissionId: true, submission: { select: { reference: true, accountId: true } } } } } },
            amountUgx: true, payerPhone: true, paidAt: true, original: true, corrections: true, imageSha256: true, withdrawn: true, purgedAt: true,
            submission: { select: { imageSha256: true, screenshot: { select: { submissionId: true } } } },
            evidence: { select: { id: true, createdAt: true } } } });
        const verifiedUgx = claims.reduce((sum, c) => sum + (!c.withdrawn && c.receipt.verifiedAt && !c.receipt.disputed && c.receipt.intendedSubmissionId === id ? c.receipt.amountUgx ?? 0 : 0), 0);
        return { ...row, verifiedUgx, ...fundingAmounts(row.priceUgx, row.walletUgx, verifiedUgx),
          claims: claims.map(({ submission, ...claim }) => ({ ...claim, validation: receiptEvidenceValidation(claim.original, claim.corrections), legacyImage: !!submission.screenshot,
            imageIsLegacy: !!submission.screenshot && claim.imageSha256 === submission.imageSha256 })),
          events: await tx.paymentEvent.findMany({ where: { submissionId: id }, orderBy: { createdAt: "desc" }, take: 100 }) };
      });
    },
    async image(id: string, claimId: string) {
      return database.query(async tx => {
        const claim = await tx.paymentReceiptClaim.findFirst({ where: { id: claimId, submissionId: id }, select: { image: true, purgedAt: true } });
        if (!claim || claim.purgedAt) return null;
        if (claim.image) return claim;
        const legacy = await tx.paymentScreenshot.findUnique({ where: { submissionId: id }, select: { data: true } });
        return legacy ? { image: legacy.data } : null;
      });
    },
    async evidence(id: string, evidenceId: string) {
      return database.query(tx => tx.paymentReceiptEvidence.findFirst({ where: { id: evidenceId, claim: { submissionId: id } }, select: { image: true } }));
    },
    async act(id: string, input: unknown, actor: string) {
      const parsed = checkoutReviewSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: "Complete the verification checks and enter a reason where required." };
      const action = parsed.data;
      return accessCodeTransaction(database, async tx => {
        const at = new Date(now()), initial = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!initial || initial.workflowVersion !== 2) return { ok: false, message: "Payment unavailable." };
        await lockMemberAccount(tx, initial.accountId); await lockSettings(tx, actor, at);
        const row = await tx.paymentSubmission.findUniqueOrThrow({ where: { id } });
        if (row.status === "approved" && action.action === "approve-checkout") return { ok: true };
        if (row.revision !== action.revision) return { ok: false, message: "Another reviewer changed this request. Refresh and check the latest details." };
        if (action.action === "approve-checkout") return allocateCheckout(tx, row, at, actor);
        if (action.action === "review-evidence") {
          if (!(checkoutOpenStatuses as readonly string[]).includes(row.status)) return { ok: false, message: "This request is closed." };
          const claim = await tx.paymentReceiptClaim.findFirst({ where: { id: action.claimId, submissionId: id, withdrawn: false } });
          const validation = claim && receiptEvidenceValidation(claim.original, claim.corrections);
          if (!claim || !validation?.warnings.length || !validation.fingerprint) return { ok: false, message: "No current evidence warnings are available for this claim." };
          const history = Array.isArray(claim.corrections) ? claim.corrections : claim.corrections ? [claim.corrections] : [];
          await tx.paymentReceiptClaim.update({ where: { id: claim.id }, data: { corrections: [...history, { kind: "warning-review",
            validationFingerprint: validation.fingerprint, actor, at: at.toISOString(), reason: action.reason }] } });
          await tx.paymentSubmission.update({ where: { id }, data: { revision: { increment: 1 } } });
          await paymentEvent(tx, id, "evidence_warnings_reviewed", actor, at, action.reason, claim.receiptId, { claimId: claim.id, warningIds: validation.warnings.map(w => w.id) });
          return { ok: true };
        }
        if (action.action === "verify-receipt") {
          const claim = await tx.paymentReceiptClaim.findUnique({ where: { submissionId_receiptId: { submissionId: id, receiptId: action.receiptId } }, include: { receipt: true } });
          const recipient = validMobilePhone(action.recipient), senderPhone = action.senderPhone ? validMobilePhone(action.senderPhone) : null;
          if (!claim || claim.withdrawn || !recipient || recipient !== row.receivingNumber || action.senderPhone && !senderPhone || Date.parse(action.receivedAt) > +at + 300_000)
            return { ok: false, message: "Check the actual receiving account, sender and payment date." };
          if (claim.receipt.allocatedSubmissionId && (claim.receipt.amountUgx !== action.amountUgx || claim.receipt.senderPhone))
            return { ok: false, message: "This receipt is already allocated. Its recorded verification cannot be changed." };
          await tx.paymentReceipt.update({ where: { id: action.receiptId }, data: { verifiedAt: at, verifiedBy: actor, amountUgx: action.amountUgx,
            recipient, senderPhone, receivedAt: new Date(action.receivedAt) } });
          await paymentEvent(tx, id, "receipt_verified", actor, at, undefined, action.receiptId,
            { amountUgx: action.amountUgx, transactionChecked: true, recipientChecked: true, successfulReceipt: true, senderChecked: true });
          const otherClaims = await tx.paymentReceiptClaim.findMany({ where: { receiptId: action.receiptId }, select: { submissionId: true } });
          await tx.paymentSubmission.updateMany({ where: { id: { in: otherClaims.map(c => c.submissionId) } }, data: { revision: { increment: 1 } } });
          const receipts = await tx.paymentReceiptClaim.findMany({ where: { submissionId: id, withdrawn: false }, select: { receipt: true } });
          const total = receipts.reduce((sum, c) => sum + (!c.receipt.disputed && c.receipt.verifiedAt && c.receipt.intendedSubmissionId === id ? c.receipt.amountUgx ?? 0 : 0), 0);
          if (row.status !== "disputed" && (checkoutOpenStatuses as readonly string[]).includes(row.status)) await tx.paymentSubmission.update({ where: { id },
            data: { status: row.reservationActive ? total + row.walletUgx < row.priceUgx ? "remaining" : "pending" : "reconfirm" } });
          return { ok: true };
        }
        if (action.action === "resolve-dispute") {
          const receipt = await tx.paymentReceipt.findUnique({ where: { id: action.receiptId }, include: { claims: true } });
          if (!receipt || !receipt.claims.some(c => c.submissionId === id) || !receipt.claims.some(c => c.submissionId === action.intendedSubmissionId)
            || !receipt.verifiedAt || !receipt.senderPhone) return { ok: false, message: "Verify the incoming sender and contact that payer before resolving ownership. Escalate unclear ownership through official provider support." };
          if (receipt.allocatedSubmissionId && receipt.allocatedSubmissionId !== action.intendedSubmissionId)
            return { ok: false, message: "Funds were already allocated. Keep the dispute open and escalate; existing access is not automatically revoked." };
          await tx.paymentReceipt.update({ where: { id: receipt.id }, data: { intendedSubmissionId: action.intendedSubmissionId,
            disputed: false, resolution: action.reason, resolvedAt: at, resolvedBy: actor } });
          for (const claim of receipt.claims) {
            await paymentEvent(tx, claim.submissionId, "ownership_resolved", actor, at, action.reason, receipt.id, { intendedSubmissionId: action.intendedSubmissionId });
            await tx.paymentSubmission.updateMany({ where: { id: claim.submissionId, status: "disputed" }, data: {
              status: claim.submissionId === action.intendedSubmissionId ? "pending" : "correction", revision: { increment: 1 } } });
          }
          return { ok: true };
        }
        if (action.action === "mark-disputed") {
          const claims = await tx.paymentReceiptClaim.findMany({ where: { submissionId: id }, select: { receiptId: true } });
          if (!claims.length) return { ok: false, message: "This request has no external receipt." };
          await tx.paymentReceipt.updateMany({ where: { id: { in: claims.map(c => c.receiptId) } }, data: { disputed: true } });
          const linked = await tx.paymentReceiptClaim.findMany({ where: { receiptId: { in: claims.map(c => c.receiptId) } }, select: { submissionId: true } });
          await tx.paymentSubmission.updateMany({ where: { id: { in: linked.map(c => c.submissionId) }, status: { in: [...checkoutOpenStatuses] } }, data: { status: "disputed", revision: { increment: 1 } } });
          await paymentEvent(tx, id, "marked_disputed", actor, at, action.reason);
          return { ok: true };
        }
        if (!(checkoutOpenStatuses as readonly string[]).includes(row.status)) return { ok: false, message: "This request is closed." };
        const rejected = action.action === "reject-checkout";
        await tx.paymentSubmission.update({ where: { id }, data: { status: rejected ? "rejected" : "correction", rejectText: action.reason,
          ...(rejected ? { reservationActive: false, decidedAt: at, decidedBy: actor, rejectReason: "other" } : {}), revision: { increment: 1 } } });
        await paymentEvent(tx, id, rejected ? "rejected" : "correction_requested", actor, at, action.reason);
        return { ok: true };
      });
    },
  };
}
