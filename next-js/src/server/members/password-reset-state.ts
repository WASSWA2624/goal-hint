import "server-only";

import { passwordChangeWindowMs } from "../../domain/member-verification.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/** Call while holding the account lock, alongside the credential or account change. */
export function invalidatePasswordResetRequests(tx: Prisma.TransactionClient, accountId: string, at: Date) {
  return tx.memberPasswordResetRequest.updateMany({
    where: { accountId, status: { in: ["pending", "link-generated"] } },
    data: { status: "cancelled", cancelledAt: at, tokenHash: null, tokenCiphertext: null },
  });
}

export const memberPasswordMaximum = 128;
export const memberPasswordCooldownMessage = "You can change your password only once within 24 hours. Please try again after the limit resets.";

export function validReplacementPassword(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= memberPasswordMaximum;
}

export function canChangeMemberPassword(account: { passwordChangedAt: Date | null }, at: Date): boolean {
  return !account.passwordChangedAt || +at - +account.passwordChangedAt >= passwordChangeWindowMs;
}
