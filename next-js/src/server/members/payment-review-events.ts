import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.ts";

/** Called under checkout's existing account/settings locks, before its transaction commits. */
export async function reconcileReviewEvent(tx: Prisma.TransactionClient, paymentId: string, action: string, at: Date) {
  const creates = ["receipt_attached", "receipt_corrected", "reconfirmed"].includes(action);
  const closes = ["approved", "rejected", "cancelled", "correction_requested", "reservation_expired", "awaiting_remaining", "funding_changed"].includes(action);
  if (!creates && !closes) return;
  const row = await tx.paymentSubmission.findUnique({ where: { id: paymentId }, select: { revision: true, status: true } });
  if (!row) return;
  const actionable = ["pending", "disputed"].includes(row.status) && await tx.paymentReceiptClaim.count({ where: { submissionId: paymentId, withdrawn: false } }) > 0;
  // Edits while an existing decision is outstanding refresh that same review.
  // Correction/shortfall decisions resolve it; their meaningful resubmission creates the next event.
  if (creates && actionable && await tx.paymentReviewEvent.findFirst({ where: { paymentId, resolvedAt: null }, select: { id: true } })) return;
  await tx.paymentReviewEvent.updateMany({ where: { paymentId, resolvedAt: null }, data: { resolvedAt: at } });
  if (!creates || !actionable) return;
  await tx.paymentReviewEvent.upsert({ where: { eventKey: `review:${paymentId}:${row.revision}` }, update: {},
    create: { id: randomUUID(), eventKey: `review:${paymentId}:${row.revision}`, paymentId, revision: row.revision, createdAt: at } });
}
