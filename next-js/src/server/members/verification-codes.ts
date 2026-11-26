import "server-only";

import { timingSafeEqual } from "node:crypto";
import { verificationRequestLimit } from "../../domain/member-verification.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { MemberAccount, Prisma } from "../generated/prisma/client.ts";
import { takeMemberLimit } from "./rate-limit.ts";

type Purpose = "account" | "reset";
export const verificationAttemptLimit = 5;

/** Previously delivered account or reset codes can be consumed under the account lock until they expire. */
export function createVerificationCodes(config: Pick<AnalyticsConfig, "key">) {
  const digest = (account: MemberAccount, purpose: Purpose, code: string) =>
    config.key("member-verification-code", `${account.id}:${account.phone}:${purpose}:${code}`);
  return Object.freeze({
    async consume(tx: Prisma.TransactionClient, account: MemberAccount, purpose: Purpose, code: unknown, at: Date): Promise<boolean> {
      const current = await tx.memberVerification.findFirst({ where: { accountId: account.id, phone: account.phone!, purpose, consumedAt: null },
        orderBy: { createdAt: "desc" } });
      if (!current?.sentAt || current.expiresAt <= at || current.attempts >= verificationAttemptLimit) return false;
      // Survives code replacement, session rotation and network changes; still keep five guesses per code.
      if (!await takeMemberLimit(tx, config, { purpose: `verification-${purpose}-attempts`, value: account.id,
        maximum: verificationAttemptLimit * verificationRequestLimit, windowMs: 15 * 60_000 }, at)) return false;
      const matched = typeof code === "string" && /^\d{6}$/u.test(code)
        && timingSafeEqual(Buffer.from(current.codeHash, "hex"), Buffer.from(digest(account, purpose, code), "hex"));
      const attempts = current.attempts + 1;
      await tx.memberVerification.update({ where: { id: current.id }, data: { attempts,
        ...(matched ? { confirmedAt: at, consumedAt: at } : attempts >= verificationAttemptLimit ? { consumedAt: at } : {}) } });
      return matched;
    },
  });
}
