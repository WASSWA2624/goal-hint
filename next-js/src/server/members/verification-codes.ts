import "server-only";

import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { verificationCodeLifetimeMs, verificationRequestLimit, verificationRequestWindowMs, type MessageChannel } from "../../domain/member-verification.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { MemberAccount, Prisma } from "../generated/prisma/client.ts";
import type { MemberMessaging, VerificationMessage } from "./yoola-messaging.ts";
import { takeMemberLimit } from "./rate-limit.ts";

type Purpose = "account" | "reset";
type Reservation = Readonly<{ id: string; message: VerificationMessage }>;
export const verificationAttemptLimit = 5;

/** Call reserve/consume only while holding the account lock. Delivery runs after committing the reservation. */
export function createVerificationCodes({ database, config, delivery, now }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; delivery: MemberMessaging; now: () => number;
}) {
  const digest = (account: MemberAccount, purpose: Purpose, code: string) =>
    config.key("member-verification-code", `${account.id}:${account.phone}:${purpose}:${code}`);
  return Object.freeze({
    async reserve(tx: Prisma.TransactionClient, account: MemberAccount, purpose: Purpose, channel: MessageChannel, at: Date): Promise<Reservation | null> {
      const recent = await tx.memberVerification.findMany({ where: { OR: [{ accountId: account.id }, { phone: account.phone! }], purpose,
        createdAt: { gt: new Date(+at - verificationRequestWindowMs) } }, select: { codeHash: true } });
      if (recent.length >= verificationRequestLimit) return null;
      let code: string, codeHash: string;
      do { code = randomInt(100_000, 1_000_000).toString(); codeHash = digest(account, purpose, code); }
      while (recent.some(row => row.codeHash === codeHash));
      await tx.memberVerification.updateMany({ where: { accountId: account.id, purpose, consumedAt: null }, data: { consumedAt: at } });
      if (purpose === "reset") await tx.memberSession.deleteMany({ where: { accountId: account.id, passwordResetAt: { not: null } } });
      const id = randomUUID();
      await tx.memberVerification.create({ data: { id, accountId: account.id, phone: account.phone!, purpose, channel,
        bindingHash: config.key("member-verification-binding", account.id), codeHash, createdAt: at,
        expiresAt: new Date(+at + verificationCodeLifetimeMs) } });
      return { id, message: { phone: account.phone!, channel, purpose: purpose === "account" ? "account" : "password-reset", code } };
    },

    async deliver(reservation: Reservation): Promise<boolean> {
      try { await delivery.send(reservation.message); }
      catch {
        await database.query(tx => tx.memberVerification.updateMany({ where: { id: reservation.id, consumedAt: null }, data: { consumedAt: new Date(now()) } }));
        return false;
      }
      await database.query(tx => tx.memberVerification.updateMany({ where: { id: reservation.id, consumedAt: null }, data: { sentAt: new Date(now()) } }));
      return true;
    },

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
