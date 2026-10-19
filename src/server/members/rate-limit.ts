import "server-only";

import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";

export type MemberLimit = Readonly<{ purpose: string; value: string; maximum: number; windowMs: number }>;
export const memberRateRules = Object.freeze({ signIns: 1_000, newAccounts: 1_000, hourMs: 3_600_000, dayMs: 86_400_000 });

/** Atomic fixed-window counters. No raw address or number is stored; unknown proxy addresses share no bucket. */
export async function takeMemberLimit(tx: Prisma.TransactionClient, config: Pick<AnalyticsConfig, "key">,
  limit: MemberLimit, at: Date): Promise<boolean> {
  if (limit.value === "unknown") return true;
  const key = config.key(`member-${limit.purpose}`, limit.value);
  const start = new Date(Math.floor(at.getTime() / limit.windowMs) * limit.windowMs);
  // Assignment order matters in MySQL: compare the old window before replacing it.
  await tx.$executeRaw`INSERT INTO RateLimitBucket (\`key\`, count, bytes, windowStartedAt)
    VALUES (${key}, 1, 0, ${start}) ON DUPLICATE KEY UPDATE
    count = IF(windowStartedAt = ${start}, LEAST(count + 1, ${limit.maximum + 1}), 1),
    bytes = IF(windowStartedAt = ${start}, bytes, 0), windowStartedAt = ${start}`;
  const row = await tx.rateLimitBucket.findUniqueOrThrow({ where: { key }, select: { count: true } });
  return row.count <= limit.maximum;
}

export function createMemberRateLimit(database: DatabaseRuntime, config: Pick<AnalyticsConfig, "key">, now = Date.now) {
  return (limit: MemberLimit) => database.transaction((tx) => takeMemberLimit(tx, config, limit, new Date(now())),
    { isolationLevel: "ReadCommitted" });
}
