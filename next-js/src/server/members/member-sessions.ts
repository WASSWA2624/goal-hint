import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isCanonicalPhone } from "../../domain/phone.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createMemberRateLimit, memberRateRules, takeMemberLimit } from "./rate-limit.ts";
import { decide } from "./settings.ts";
import { isMemberAdminPhone, memberAdminCredential } from "./member-admin.ts";
import { developmentMemberToken } from "../demo/member.ts";

export const memberSessionRules = Object.freeze({ expiryMs: 90 * 86_400_000, touchAfterMs: 86_400_000,
  // This storage cap covers restricted flows; an authenticated login always replaces every other session.
  cookieSeconds: 400 * 86_400, maximumSessions: 10 });
export const memberTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const validMemberToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/u.test(token);
export const memberCookieName = (production: boolean) => `${production ? "__Host-" : ""}goal-hint-member`;

export type MemberIdentity = Readonly<{ tokenHash: string; accountId: string; phone: string; blocked: boolean;
  codeEnteredAt: Date | null; accessCodeId: string | null; expiresAt: Date; administrator?: boolean; whatsappNotificationsAt?: Date | null }>;
export type MemberSignIn = Readonly<{ status: "signed-in"; token: string }> | Readonly<{ status: "busy" }>;

/** The caller holds the account lock. A full login replaces every prior session atomically; restricted sessions only use the pending cap. */
export async function issueMemberSession(tx: Prisma.TransactionClient, accountId: string, at: Date, previous?: string, authenticated = false) {
  const previousHash = validMemberToken(previous) ? memberTokenHash(previous) : null;
  let otherDeviceSignedOut = false;
  if (authenticated) {
    const ended = await tx.memberSession.deleteMany({ where: { accountId, authenticatedAt: { not: null }, passwordResetAt: null,
      expiresAt: { gt: at }, ...(previousHash ? { tokenHash: { not: previousHash } } : {}) } });
    otherDeviceSignedOut = ended.count > 0;
    await tx.memberSession.deleteMany({ where: previousHash ? { OR: [{ accountId }, { tokenHash: previousHash }] } : { accountId } });
  } else {
    if (previousHash) await tx.memberSession.deleteMany({ where: { tokenHash: previousHash } });
    await tx.memberSession.deleteMany({ where: { accountId, expiresAt: { lte: at } } });
    const sessions = await tx.memberSession.findMany({ where: { accountId }, orderBy: [{ createdAt: "asc" }, { tokenHash: "asc" }],
      select: { tokenHash: true, codeEnteredAt: true, authenticatedAt: true } });
    const reports = await tx.paymentSubmission.findMany({ where: { accountId, status: { in: ["pending", "superseded"] },
      submittedSessionHash: { not: null } }, select: { submittedSessionHash: true } });
    const protectedHashes = new Set(reports.map((row) => row.submittedSessionHash));
    // Starting verification or recovery must not evict the account's authenticated device.
    const candidates = sessions.filter((row) => row.codeEnteredAt === null && row.authenticatedAt === null);
    candidates.sort((a, b) => Number(protectedHashes.has(a.tokenHash)) - Number(protectedHashes.has(b.tokenHash)));
    const evict = candidates.slice(0, Math.max(0, sessions.length - memberSessionRules.maximumSessions + 1));
    if (sessions.length - evict.length >= memberSessionRules.maximumSessions) throw new Error("Session capacity is unavailable.");
    if (evict.length) await tx.memberSession.deleteMany({ where: { tokenHash: { in: evict.map((row) => row.tokenHash) } } });
  }
  const token = randomBytes(32).toString("base64url");
  const session = await tx.memberSession.create({ data: { tokenHash: memberTokenHash(token), accountId,
    createdAt: at, lastSeenAt: at, authenticatedAt: authenticated ? at : null, expiresAt: new Date(at.getTime() + memberSessionRules.expiryMs) } });
  return { session, token, otherDeviceSignedOut };
}

export function createMemberSessions({ database, config, now = Date.now, adminPhone = isMemberAdminPhone, adminPasswordHash = memberAdminCredential }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number; adminPhone?: (phone: string) => boolean; adminPasswordHash?: () => string | null;
}) {
  const limit = createMemberRateLimit(database, config, now);
  return Object.freeze({
    async signIn(phone: string, address: string, previous?: string): Promise<MemberSignIn> {
      if (!isCanonicalPhone(phone)) throw new RangeError("A canonical phone is required.");
      if (!await limit({ purpose: "sign-ins", value: address, maximum: memberRateRules.signIns, windowMs: memberRateRules.hourMs })) return { status: "busy" };
      const at = new Date(now());
      return decide<MemberSignIn>(database, async (tx, rollback) => {
        // Upsert also handles two simultaneous first sign-ins. The row lock serializes the session cap.
        const newAccountId = randomUUID();
        await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, createdAt, lastSignInAt)
          VALUES (${newAccountId}, ${phone}, ${at}, ${at}) ON DUPLICATE KEY UPDATE lastSignInAt = ${at}`;
        const account = await tx.memberAccount.findUniqueOrThrow({ where: { phone }, select: { id: true } });
        // Identity, rather than affected-row semantics, distinguishes an insert from a duplicate on both MySQL and MariaDB.
        if (account.id === newAccountId && !await takeMemberLimit(tx, config,
          { purpose: "new-accounts", value: address, maximum: memberRateRules.newAccounts, windowMs: memberRateRules.dayMs }, at)) return rollback({ status: "busy" });
        const { token } = await issueMemberSession(tx, account.id, at, previous);
        return { status: "signed-in", token };
      });
    },

    async verify(token?: string): Promise<MemberIdentity | null> {
      token = developmentMemberToken(token);
      if (!validMemberToken(token)) return null;
      const at = new Date(now()), hash = memberTokenHash(token);
      const row = await database.query((tx) => tx.memberSession.findUnique({ where: { tokenHash: hash }, include: { account: true } }));
      if (!row || !row.authenticatedAt || row.passwordResetAt || row.expiresAt <= at || row.account.erasedAt || !row.account.phone
        || !row.account.passwordHash && !adminPhone(row.account.phone)) return null;
      const configured = adminPasswordHash();
      const administrator = !!configured && adminPhone(row.account.phone) && row.adminPasswordVersion === config.key("admin-password-version", configured);
      if (adminPhone(row.account.phone) && !administrator) return null;
      if (!administrator && !row.account.phoneVerifiedAt) return null;
      if (at.getTime() - row.lastSeenAt.getTime() >= memberSessionRules.touchAfterMs) {
        await database.query((tx) => tx.memberSession.updateMany({ where: { tokenHash: hash, expiresAt: { gt: at },
          lastSeenAt: { lte: new Date(at.getTime() - memberSessionRules.touchAfterMs) } },
        data: { lastSeenAt: at, expiresAt: new Date(at.getTime() + memberSessionRules.expiryMs) } }));
      }
      return { tokenHash: hash, accountId: row.accountId, phone: row.account.phone, blocked: row.account.blockedAt !== null,
        codeEnteredAt: row.codeEnteredAt, accessCodeId: row.accessCodeId, expiresAt: row.expiresAt,
        whatsappNotificationsAt: row.account.whatsappNotificationsAt ?? null, ...(administrator ? { administrator: true } : {}) };
    },

    async signOut(token?: string): Promise<void> {
      token = developmentMemberToken(token);
      if (validMemberToken(token)) await database.query((tx) => tx.memberSession.deleteMany({ where: { tokenHash: memberTokenHash(token) } }));
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
