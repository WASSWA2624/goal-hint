import "server-only";

import { termsNotice } from "../../domain/terms-notice.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { MemberIdentity } from "./member-sessions.ts";

/**
 * Consent belongs to the account and terms version, independently of payment status or a device's access: a member report
 * accepted under the current terms, or an access period recorded with them (member reports, credit purchases, historical code
 * entry). Owner grants carry no version.
 */
export async function acceptedTerms(tx: Pick<Prisma.TransactionClient, "memberAccount">, member: MemberIdentity, at: Date): Promise<boolean> {
  return !!await tx.memberAccount.findFirst({ where: { id: member.accountId, phone: { not: null }, blockedAt: null, erasedAt: null,
    sessions: { some: { tokenHash: member.tokenHash, authenticatedAt: { not: null }, passwordResetAt: null, expiresAt: { gt: at } } },
    OR: [
      { submissions: { some: { source: "report", termsVersion: termsNotice.reviewedOn, acceptedAt: { not: null } } } },
      { codes: { some: { termsVersion: termsNotice.reviewedOn } } },
    ],
  }, select: { id: true } });
}
