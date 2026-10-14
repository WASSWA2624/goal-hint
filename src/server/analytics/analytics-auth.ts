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
  maximumFailures: 5,
  failureWindowMs: 15 * 60_000,
  lockMs: 15 * 60_000,
  /** The exclusion cookie keeps an administrator's browser out of the statistics after sign-out. */
  excludeMaxAgeSeconds: 400 * 86_400,
});

export type Admin = Readonly<{ username: string; expiresAt: Date }>;
export type LoginResult =
  | Readonly<{ status: "signed-in"; token: string; expiresAt: Date }>
  | Readonly<{ status: "invalid" | "unavailable" }>
  | Readonly<{ status: "locked"; retryAfterSeconds: number }>;

type Clock = () => number;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function createAdminAuth({ database, config, now = Date.now }: { database: DatabaseRuntime; config: AnalyticsConfig; now?: Clock }) {
  const throttleKeys = (username: string, address: string) =>
    [config.key("login-address", address), config.key("login-user", username.trim().toLowerCase())];

  async function lockedFor(keys: string[], at: Date): Promise<number> {
    const rows = await database.query((client) => client.analyticsLoginThrottle.findMany({
      where: { key: { in: keys }, lockedUntil: { gt: at } }, select: { lockedUntil: true } }));
    const until = Math.max(0, ...rows.map((row) => row.lockedUntil?.getTime() ?? 0));
    return until > at.getTime() ? Math.ceil((until - at.getTime()) / 1000) : 0;
  }

  /** Count a failure against each key; the fifth failure inside 15 minutes locks that key for 15 minutes. */
  async function recordFailure(keys: string[], at: Date): Promise<number> {
    let locked = 0;
    await database.transaction(async (tx) => {
      for (const key of keys) {
        const [row] = await tx.$queryRaw<{ failures: number; windowStartedAt: Date }[]>`
          SELECT failures, windowStartedAt FROM AnalyticsLoginThrottle WHERE \`key\` = ${key} FOR UPDATE`;
        const fresh = !row || at.getTime() - row.windowStartedAt.getTime() >= adminSessionRules.failureWindowMs;
        const failures = fresh ? 1 : Number(row.failures) + 1;
        const lockedUntil = failures >= adminSessionRules.maximumFailures ? new Date(at.getTime() + adminSessionRules.lockMs) : null;
        if (lockedUntil) locked = Math.ceil(adminSessionRules.lockMs / 1000);
        const data = { failures, windowStartedAt: fresh ? at : row.windowStartedAt, lockedUntil };
        if (row) await tx.analyticsLoginThrottle.update({ where: { key }, data });
        else await tx.analyticsLoginThrottle.create({ data: { key, ...data } });
      }
    }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
    return locked;
  }

  return Object.freeze({
    async login(username: string, password: string, address: string): Promise<LoginResult> {
      const admin = config.admin;
      if (admin === null) return { status: "unavailable" };
      const at = new Date(now());
      const keys = throttleKeys(username, address);
      const retryAfterSeconds = await lockedFor(keys, at);
      if (retryAfterSeconds > 0) return { status: "locked", retryAfterSeconds };
      // Always derive the password key, so an unknown username costs the same time as a wrong password.
      const usernameMatches = timingSafeEqual(Buffer.from(config.key("username", username.trim())), Buffer.from(config.key("username", admin.username)));
      const passwordMatches = await verifyPassword(password, admin.passwordHash);
      if (!usernameMatches || !passwordMatches) {
        const lock = await recordFailure(keys, at);
        return lock > 0 ? { status: "locked", retryAfterSeconds: lock } : { status: "invalid" };
      }
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(at.getTime() + adminSessionRules.absoluteMs);
      await database.transaction(async (tx) => {
        await tx.analyticsLoginThrottle.deleteMany({ where: { key: { in: keys } } });
        await tx.analyticsAdminSession.create({ data: { tokenHash: tokenHash(token), username: admin.username, createdAt: at, lastSeenAt: at, expiresAt } });
      }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
      return { status: "signed-in", token, expiresAt };
    },

    /** A valid session within both its absolute and idle limits; otherwise null. */
    async verify(token: string | undefined): Promise<Admin | null> {
      if (config.admin === null || !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const at = now();
      const hash = tokenHash(token);
      const session = await database.query((client) => client.analyticsAdminSession.findUnique({ where: { tokenHash: hash } }));
      if (!session || session.username !== config.admin.username || session.expiresAt.getTime() <= at
        || at - session.lastSeenAt.getTime() >= adminSessionRules.idleMs) return null;
      if (at - session.lastSeenAt.getTime() >= adminSessionRules.touchAfterMs) {
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
