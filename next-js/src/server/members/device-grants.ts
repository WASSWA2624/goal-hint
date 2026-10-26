import "server-only";

import { defaultSubscriptionSettings } from "../../domain/subscription-settings.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/**
 * Paid access without codes (068): an access period (AccessCode) unlocks the account's signed-in sessions directly. An
 * unlock always names a code of the session's own account (MemberSession_unlock_check and the composite foreign key), so
 * both columns are set or cleared together. Sessions keep their tokens: an owner's request cannot replace a member's cookie,
 * and every unlocked session was already authenticated by password. Every caller holds the account lock.
 */
type Grant = Readonly<{ accountId: string; codeId: string; at: Date; maximum: number; actor: string }>;

/** The owner's unlocked-device cap, read without the settings lock; a missing settings row means the default. */
export async function unlockedDeviceLimit(tx: Prisma.TransactionClient): Promise<number> {
  return (await tx.subscriptionSettings.findUnique({ where: { id: 1 }, select: { maxUnlockedDevices: true } }))?.maxUnlockedDevices
    ?? defaultSubscriptionSettings.maxUnlockedDevices;
}

/** The latest unrevoked code of the account whose period has not ended (endsAt > at), or null. Queued periods count. */
export async function liveAccessCode(tx: Prisma.TransactionClient, accountId: string, at: Date): Promise<{ id: string } | null> {
  return tx.accessCode.findFirst({ where: { accountId, revokedAt: null, endsAt: { gt: at } }, orderBy: [{ endsAt: "desc" }, { id: "asc" }], select: { id: true } });
}

/** Unlocks `candidates` in order. A preferred one evicts the oldest earlier unlocks beyond the cap; any other only fills a free slot. */
async function unlockSessions(tx: Prisma.TransactionClient, grant: Grant, candidates: readonly string[], preferred: ReadonlySet<string>): Promise<number> {
  const { accountId, codeId, at, actor } = grant, maximum = Math.max(1, grant.maximum);
  const audit = (tokenHash: string, action: "device_unlocked" | "device_evicted", details: Record<string, unknown> = {}) =>
    writeOwnerAudit(tx, { at, actor, action, accountId, targetType: "member-session", targetId: tokenHash, details });
  // Only unlocks that existed before this grant can be evicted, oldest code entry first, never a preferred session.
  const earlier = (await tx.memberSession.findMany({ where: { accountId, codeEnteredAt: { not: null }, expiresAt: { gt: at } },
    orderBy: [{ codeEnteredAt: "asc" }, { tokenHash: "asc" }], select: { tokenHash: true } })).map((row) => row.tokenHash);
  let held = earlier.length, unlocked = 0;
  for (const tokenHash of candidates) {
    if (held >= maximum && (!preferred.has(tokenHash) || !earlier.some((hash) => !preferred.has(hash)))) continue;
    // A session signed out meanwhile simply matches nothing, and then evicts nothing.
    if (!(await tx.memberSession.updateMany({ where: { tokenHash, accountId, codeEnteredAt: null, authenticatedAt: { not: null }, expiresAt: { gt: at } },
      data: { codeEnteredAt: at, accessCodeId: codeId } })).count) continue;
    await audit(tokenHash, "device_unlocked", { codeId }); held++; unlocked++;
    for (let index = earlier.findIndex((hash) => !preferred.has(hash)); held > maximum && index >= 0; index = earlier.findIndex((hash) => !preferred.has(hash))) {
      const oldest = earlier.splice(index, 1)[0]!; held--;
      if ((await tx.memberSession.updateMany({ where: { tokenHash: oldest, accountId }, data: { codeEnteredAt: null, accessCodeId: null } })).count) await audit(oldest, "device_evicted");
    }
  }
  return unlocked;
}

/** Unlocks authenticated, unexpired, locked sessions of the account with codeId, preferring `prefer` hashes, then
 * most recent lastSeenAt. Never exceeds `maximum` unlocked sessions: a preferred session always gets a slot by
 * evicting the oldest unlocked (by codeEnteredAt), others only fill free slots. Updates in place (no token rotation),
 * audits device_unlocked / device_evicted with `actor`. Caller holds the account lock. Returns the number unlocked. */
export async function grantDevices(tx: Prisma.TransactionClient, input: { accountId: string; codeId: string; at: Date; maximum: number;
  prefer?: readonly string[]; actor: string }): Promise<number> {
  const prefer = input.prefer ?? [], rank = (hash: string) => prefer.includes(hash) ? prefer.indexOf(hash) : prefer.length;
  const sessions = await tx.memberSession.findMany({ where: { accountId: input.accountId, codeEnteredAt: null, authenticatedAt: { not: null },
    expiresAt: { gt: input.at } }, orderBy: [{ lastSeenAt: "desc" }, { tokenHash: "asc" }], select: { tokenHash: true } });
  // The sort is stable, so sessions outside `prefer` keep their most-recent-first order.
  const candidates = sessions.map((row) => row.tokenHash).sort((a, b) => rank(a) - rank(b));
  return unlockSessions(tx, input, candidates, new Set(prefer));
}

/** For a just-authenticated session: if the account has a live code, unlock this session (preferred) under the cap. A
 * session already carrying an unlock (a rotated profile change) keeps it. Reads the cap without the settings lock. Caller
 * holds the account lock. True when the session holds an unlock afterwards. */
export async function grantSessionAccess(tx: Prisma.TransactionClient, input: { accountId: string; tokenHash: string; at: Date; actor: string }): Promise<boolean> {
  const session = await tx.memberSession.findUnique({ where: { tokenHash: input.tokenHash }, select: { accountId: true, authenticatedAt: true, expiresAt: true, codeEnteredAt: true } });
  if (!session || session.accountId !== input.accountId || !session.authenticatedAt || session.expiresAt <= input.at) return false;
  if (session.codeEnteredAt) return true;
  const code = await liveAccessCode(tx, input.accountId, input.at);
  if (!code) return false;
  return await unlockSessions(tx, { accountId: input.accountId, codeId: code.id, at: input.at, actor: input.actor, maximum: await unlockedDeviceLimit(tx) },
    [input.tokenHash], new Set([input.tokenHash])) > 0;
}
