import "server-only";

import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export type MemberLimit = Readonly<{ purpose: string; value: string; maximum: number; windowMs: number }>;
export const memberRateRules = Object.freeze({ signIns: 1_000, newAccounts: 1_000, hourMs: 3_600_000, dayMs: 86_400_000 });
const memberRateWindowStart = (at: Date, windowMs: number) => Math.floor(+at / windowMs) * windowMs;

/** Atomic fixed-window counters. No raw address/number is stored; unresolved addresses share a bounded bucket. */
export async function takeMemberLimit(tx: Prisma.TransactionClient, config: Pick<AnalyticsConfig, "key">,
  limit: MemberLimit, at: Date): Promise<boolean> {
  const key = config.key(`member-${limit.purpose}`, limit.value);
  const start = new Date(memberRateWindowStart(at, limit.windowMs));
  const end = new Date(+start + limit.windowMs);
  // Assignment order matters in MySQL: compare the old window before replacing it.
  await tx.$executeRaw`INSERT INTO RateLimitBucket (\`key\`, count, bytes, windowStartedAt, lockedUntil)
    VALUES (${key}, 1, 0, ${start}, ${end}) ON DUPLICATE KEY UPDATE
    count = IF(windowStartedAt = ${start}, LEAST(count + 1, ${limit.maximum + 1}), 1),
    bytes = IF(windowStartedAt = ${start}, bytes, 0), windowStartedAt = ${start},
    lockedUntil = GREATEST(COALESCE(lockedUntil, ${end}), ${end})`;
  const row = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key }, select: { count: true } });
  return row.count <= limit.maximum;
}

export function createMemberRateLimit(database: DatabaseRuntime, config: Pick<AnalyticsConfig, "key">, now = Date.now) {
  const retryAfter = (limit: MemberLimit) => database.transaction(async tx => {
    const at = new Date(now());
    if (await takeMemberLimit(tx, config, limit, at)) return null;
    const windowEndsAt = memberRateWindowStart(at, limit.windowMs) + limit.windowMs;
    return Math.max(1, Math.ceil((windowEndsAt - now()) / 1000));
  }, { isolationLevel: "ReadCommitted" });
  return Object.assign(async (limit: MemberLimit) => await retryAfter(limit) === null, { retryAfter });
}
