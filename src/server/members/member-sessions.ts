import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isCanonicalPhone } from "../../domain/phone.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { createMemberRateLimit, memberRateRules, takeMemberLimit } from "./rate-limit.ts";
import { decide } from "./settings.ts";

export const memberSessionRules = Object.freeze({ expiryMs: 90 * 86_400_000, touchAfterMs: 86_400_000,
  cookieSeconds: 400 * 86_400, maximumSessions: 10 });
export const memberTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const validToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/u.test(token);
export const memberCookieName = (production: boolean) => `${production ? "__Host-" : ""}goal-hint-member`;

export type MemberIdentity = Readonly<{ tokenHash: string; accountId: string; phone: string; blocked: boolean;
  codeEnteredAt: Date | null; accessCodeId: string | null; expiresAt: Date }>;
export type MemberSignIn = Readonly<{ status: "signed-in"; token: string }> | Readonly<{ status: "busy" }>;

export function createMemberSessions({ database, config, now = Date.now }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number;
}) {
  const limit = createMemberRateLimit(database, config, now);
  return Object.freeze({
    async signIn(phone: string, address: string, previous?: string): Promise<MemberSignIn> {
      if (!isCanonicalPhone(phone)) throw new RangeError("A canonical phone is required.");
      if (!await limit({ purpose: "sign-ins", value: address, maximum: memberRateRules.signIns, windowMs: memberRateRules.hourMs })) return { status: "busy" };
      const at = new Date(now()), token = randomBytes(32).toString("base64url");
      return decide<MemberSignIn>(database, async (tx, rollback) => {
        // Upsert also handles two simultaneous first sign-ins. The row lock serializes the session cap.
        const newAccountId = randomUUID();
        await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, createdAt, lastSignInAt)
          VALUES (${newAccountId}, ${phone}, ${at}, ${at}) ON DUPLICATE KEY UPDATE lastSignInAt = ${at}`;
        const account = await tx.memberAccount.findUniqueOrThrow({ where: { phone }, select: { id: true } });
        // Identity, rather than affected-row semantics, distinguishes an insert from a duplicate on both MySQL and MariaDB.
        if (account.id === newAccountId && !await takeMemberLimit(tx, config,
          { purpose: "new-accounts", value: address, maximum: memberRateRules.newAccounts, windowMs: memberRateRules.dayMs }, at)) return rollback({ status: "busy" });
        if (validToken(previous)) await tx.memberSession.deleteMany({ where: { tokenHash: memberTokenHash(previous) } });
        await tx.memberSession.deleteMany({ where: { accountId: account.id, expiresAt: { lte: at } } });
        const sessions = await tx.memberSession.findMany({ where: { accountId: account.id }, orderBy: [{ createdAt: "asc" }, { tokenHash: "asc" }],
          select: { tokenHash: true, codeEnteredAt: true } });
        const protectedSubmissions = await tx.paymentSubmission.findMany({ where: { accountId: account.id, status: { in: ["pending", "superseded"] },
          submittedSessionHash: { not: null } }, select: { submittedSessionHash: true } });
        const protectedHashes = new Set(protectedSubmissions.map((row) => row.submittedSessionHash));
        const candidates = sessions.filter((row) => row.codeEnteredAt === null);
        candidates.sort((a, b) => Number(protectedHashes.has(a.tokenHash)) - Number(protectedHashes.has(b.tokenHash)));
        const evict = candidates.slice(0, Math.max(0, sessions.length - memberSessionRules.maximumSessions + 1));
        // With the reviewed maximum of five unlocked devices there is always a non-unlocked candidate.
        if (sessions.length - evict.length >= memberSessionRules.maximumSessions) throw new Error("Session capacity is unavailable.");
        if (evict.length) await tx.memberSession.deleteMany({ where: { tokenHash: { in: evict.map((row) => row.tokenHash) } } });
        await tx.memberSession.create({ data: { tokenHash: memberTokenHash(token), accountId: account.id,
          createdAt: at, lastSeenAt: at, expiresAt: new Date(at.getTime() + memberSessionRules.expiryMs) } });
        return { status: "signed-in", token };
      });
    },

    async verify(token?: string): Promise<MemberIdentity | null> {
      if (!validToken(token)) return null;
      const at = new Date(now()), hash = memberTokenHash(token);
      const row = await database.query((tx) => tx.memberSession.findUnique({ where: { tokenHash: hash }, include: { account: true } }));
      if (!row || row.expiresAt <= at || row.account.erasedAt || !row.account.phone) return null;
      if (at.getTime() - row.lastSeenAt.getTime() >= memberSessionRules.touchAfterMs) {
        await database.query((tx) => tx.memberSession.updateMany({ where: { tokenHash: hash, expiresAt: { gt: at },
          lastSeenAt: { lte: new Date(at.getTime() - memberSessionRules.touchAfterMs) } },
        data: { lastSeenAt: at, expiresAt: new Date(at.getTime() + memberSessionRules.expiryMs) } }));
      }
      return { tokenHash: hash, accountId: row.accountId, phone: row.account.phone, blocked: row.account.blockedAt !== null,
        codeEnteredAt: row.codeEnteredAt, accessCodeId: row.accessCodeId, expiresAt: row.expiresAt };
    },

    async signOut(token?: string): Promise<void> {
      if (validToken(token)) await database.query((tx) => tx.memberSession.deleteMany({ where: { tokenHash: memberTokenHash(token) } }));
    },

    async signOutOthers(member: MemberIdentity): Promise<boolean> {
      const at = new Date(now());
      return database.transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${member.accountId} FOR UPDATE`;
        const current = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, include: { account: true } });
        if (!current || current.expiresAt <= at || current.codeEnteredAt === null || current.account.blockedAt || current.account.erasedAt) return false;
        await tx.memberSession.deleteMany({ where: { accountId: current.accountId, tokenHash: { not: current.tokenHash } } });
        return true;
      }, { isolationLevel: "ReadCommitted" });
    },
  });
}
export type MemberSessions = ReturnType<typeof createMemberSessions>;
