import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseRuntime } from "../database/client.ts";
import type { AnalyticsConfig } from "./analytics-config.ts";
import { verifyPassword } from "./analytics-password.ts";

export const adminSessionRules = Object.freeze({
  absoluteMs: 12 * 3_600_000,
  idleMs: 2 * 3_600_000,
  /** Sliding expiry is written at most once a minute per session. */
  touchAfterMs: 60_000,
  /** Per address, and per username on one address: the fifth failure inside 15 minutes locks that key for 15 minutes. */
  maximumFailures: 5,
  failureWindowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
  /** Username-wide, across every address: only the 50th failure inside an hour locks it, so one network cannot lock the owner out. */
  usernameMaximumFailures: 50,
  usernameFailureWindowMs: 3_600_000,
  /** The exclusion cookie keeps an administrator's browser out of the statistics after sign-out. */
  excludeMaxAgeSeconds: 400 * 86_400,
});

export type Admin = Readonly<{ username: string; expiresAt: Date }>;
/**
 * `ownerUsername`: the typed username is the owner's, case and spaces aside, so the attempt counts against the owner's
 * username-wide limit. `newlyLocked` marks the attempt that started a lock; attempts refused during one are not counted.
 */
export type LoginResult =
  | Readonly<{ status: "signed-in"; token: string; expiresAt: Date; username: string }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "invalid"; ownerUsername: boolean }>
  | Readonly<{ status: "locked"; retryAfterSeconds: number; newlyLocked: boolean; ownerUsername: boolean }>;
/** `touch: false` checks a session without extending it (public pages previewing as the owner). */
export type VerifyOptions = Readonly<{ touch?: boolean }>;

type Clock = () => number;
type ThrottleKey = Readonly<{ key: string; maximumFailures: number; windowMs: number }>;
type ThrottleRow = Readonly<{ failures: number; windowStartedAt: Date; lockedUntil: Date | null }>;
/** What counting an attempt left on the username-wide key, so a right password can hand the attempt back. */
type Reservation =
  | Readonly<{ status: "locked"; retryAfterSeconds: number }>
  | Readonly<{ status: "reserved"; lockSeconds: number; user: Readonly<{ windowStartedAt: Date; lockedUntil: Date | null }> }>;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Every transaction takes the throttle rows in this one order, so concurrent sign-ins queue instead of deadlocking. */
const inLockOrder = (keys: readonly ThrottleKey[]) => [...keys].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

export function createAdminAuth({ database, config, now = Date.now }: { database: DatabaseRuntime; config: AnalyticsConfig; now?: Clock }) {
  /** A successful sign-in clears the address and (username, address) keys; the username-wide key runs out its hour. */
  const throttleKeys = (username: string, address: string) => {
    const user = username.trim().toLowerCase();
    const local = { maximumFailures: adminSessionRules.maximumFailures, windowMs: adminSessionRules.failureWindowMs };
    const cleared: ThrottleKey[] = [{ key: config.key("login-address", address), ...local },
      { key: config.key("login-user-address", `${user}\0${address}`), ...local }];
    const wide: ThrottleKey = { key: config.key("login-user", user), maximumFailures: adminSessionRules.usernameMaximumFailures,
      windowMs: adminSessionRules.usernameFailureWindowMs };
    return { cleared, user: wide, all: [...cleared, wide] };
  };

  async function lockedFor(keys: string[], at: Date): Promise<number> {
    const rows = await database.query((client) => client.analyticsLoginThrottle.findMany({
      where: { key: { in: keys }, lockedUntil: { gt: at } }, select: { lockedUntil: true } }));
    const until = Math.max(0, ...rows.map((row) => row.lockedUntil?.getTime() ?? 0));
    return until > at.getTime() ? Math.ceil((until - at.getTime()) / 1000) : 0;
  }

  /**
   * Count the attempt against every key before its password is checked: concurrent attempts queue on the locked rows, so at
   * most a key's maximum ever reach the check inside its window. A key that is already locked refuses the attempt uncounted;
   * reaching a key's maximum locks that key for 15 minutes.
   */
  async function reserve(keys: readonly ThrottleKey[], userKey: string, at: Date): Promise<Reservation> {
    const ordered = inLockOrder(keys);
    return database.transaction(async (tx) => {
      const rows: ThrottleRow[] = [];
      for (const { key } of ordered) {
        // Creates a missing row so that it, too, is locked; an existing row is only locked.
        await tx.$executeRaw`INSERT INTO AnalyticsLoginThrottle (\`key\`, failures, windowStartedAt) VALUES (${key}, 0, ${at})
          ON DUPLICATE KEY UPDATE \`key\` = \`key\``;
        const [row] = await tx.$queryRaw<ThrottleRow[]>`
          SELECT failures, windowStartedAt, lockedUntil FROM AnalyticsLoginThrottle WHERE \`key\` = ${key} FOR UPDATE`;
        rows.push(row!);
      }
      const until = Math.max(0, ...rows.map((row) => row.lockedUntil?.getTime() ?? 0));
      if (until > at.getTime()) return { status: "locked", retryAfterSeconds: Math.ceil((until - at.getTime()) / 1000) };
      let lockSeconds = 0;
      let user: Readonly<{ windowStartedAt: Date; lockedUntil: Date | null }> = { windowStartedAt: at, lockedUntil: null };
      for (const [index, { key, maximumFailures, windowMs }] of ordered.entries()) {
        const row = rows[index]!;
        // A row created above holds no failure yet, so its window starts with this attempt.
        const fresh = Number(row.failures) === 0 || at.getTime() - row.windowStartedAt.getTime() >= windowMs;
        const failures = fresh ? 1 : Number(row.failures) + 1;
        const lockedUntil = failures >= maximumFailures ? new Date(at.getTime() + adminSessionRules.lockMs) : null;
        if (lockedUntil) lockSeconds = Math.ceil(adminSessionRules.lockMs / 1000);
        const windowStartedAt = fresh ? at : row.windowStartedAt;
        await tx.analyticsLoginThrottle.update({ where: { key }, data: { failures, windowStartedAt, lockedUntil } });
        if (key === userKey) user = { windowStartedAt, lockedUntil };
      }
      return { status: "reserved", lockSeconds, user };
    }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
  }

  return Object.freeze({
    async login(username: string, password: string, address: string): Promise<LoginResult> {
      const admin = config.admin;
      if (admin === null) return { status: "unavailable" };
      const at = new Date(now());
      const keys = throttleKeys(username, address);
      const ownerUsername = keys.user.key === config.key("login-user", admin.username.trim().toLowerCase());
      // A lock already in place refuses cheaply, without a write; the reservation rechecks it under the row locks.
      const retryAfterSeconds = await lockedFor(keys.all.map(({ key }) => key), at);
      if (retryAfterSeconds > 0) return { status: "locked", retryAfterSeconds, newlyLocked: false, ownerUsername };
      const reserved = await reserve(keys.all, keys.user.key, at);
      if (reserved.status === "locked") return { ...reserved, newlyLocked: false, ownerUsername };
      // Always derive the password key, so an unknown username costs the same time as a wrong password.
      const usernameMatches = timingSafeEqual(Buffer.from(config.key("username", username.trim())), Buffer.from(config.key("username", admin.username)));
      const passwordMatches = await verifyPassword(password, admin.passwordHash);
      if (!usernameMatches || !passwordMatches) {
        return reserved.lockSeconds > 0 ? { status: "locked", retryAfterSeconds: reserved.lockSeconds, newlyLocked: true, ownerUsername }
          : { status: "invalid", ownerUsername };
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(at.getTime() + adminSessionRules.absoluteMs);
      await database.transaction(async (tx) => {
        for (const { key } of inLockOrder(keys.all)) {
          if (key !== keys.user.key) await tx.analyticsLoginThrottle.deleteMany({ where: { key } });
          // The right password hands its counted attempt back to the username-wide key, with any lock that attempt started.
          else await tx.analyticsLoginThrottle.updateMany({ where: { key, windowStartedAt: reserved.user.windowStartedAt },
            data: { failures: { decrement: 1 }, ...(reserved.user.lockedUntil ? { lockedUntil: null } : {}) } });
        }
        await tx.analyticsAdminSession.create({ data: { tokenHash: tokenHash(token), username: admin.username, createdAt: at, lastSeenAt: at, expiresAt } });
      }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
      return { status: "signed-in", token, expiresAt, username: admin.username };
    },

    /** A valid session within both its absolute and idle limits; otherwise null. Only a touching check extends the idle limit. */
    async verify(token: string | undefined, { touch = true }: VerifyOptions = {}): Promise<Admin | null> {
      if (config.admin === null || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const at = now();
      const hash = tokenHash(token);
      const session = await database.query((client) => client.analyticsAdminSession.findUnique({ where: { tokenHash: hash } }));
      if (!session || session.username !== config.admin.username || session.expiresAt.getTime() <= at
        || at - session.lastSeenAt.getTime() >= adminSessionRules.idleMs) return null;
      if (touch && at - session.lastSeenAt.getTime() >= adminSessionRules.touchAfterMs) {
        await database.query((client) => client.analyticsAdminSession.update({ where: { tokenHash: hash }, data: { lastSeenAt: new Date(at) } }));
      }
      return { username: session.username, expiresAt: session.expiresAt };
    },

    async logout(token: string | undefined): Promise<void> {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
      await database.query((client) => client.analyticsAdminSession.deleteMany({ where: { tokenHash: tokenHash(token) } }));
    },
  });
}
export type AdminAuth = ReturnType<typeof createAdminAuth>;
