import "server-only";
import type { Prisma } from "../generated/prisma/client.ts";

/** Caller already holds both account locks and has inserted the immutable AccountMove in this transaction. */
export async function transferReferralReviewClaims(tx: Prisma.TransactionClient, fromAccountId: string, toAccountId: string) {
  await tx.referralGrantReversal.updateMany({ where: { holderAccountId: fromAccountId }, data: { holderAccountId: toAccountId } });
}
