import "server-only";

import type { Prisma } from "../generated/prisma/client.ts";

/** A legacy verified member and a newly admitted member both have ordinary account access. */
export function hasMemberAdmission(account: { phoneVerifiedAt: Date | null; memberAdmittedAt?: Date | null }): boolean {
  return !!(account.phoneVerifiedAt || account.memberAdmittedAt);
}

export const memberAdmissionWhere = {
  OR: [{ phoneVerifiedAt: { not: null } }, { memberAdmittedAt: { not: null } }],
} satisfies Prisma.MemberAccountWhereInput;
