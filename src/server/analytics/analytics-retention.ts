import "server-only";

import { analyticsRules } from "../../domain/analytics.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

const settingKeys = Object.freeze({ retentionDays: "retentionDays", lastPurgedAt: "lastPurgedAt" });
/** Automatic purges run at most hourly per database, triggered by collection or the dashboard. */
const purgeIntervalMs = 3_600_000;
const batchSize = 5_000;

export type RetentionState = Readonly<{ retentionDays: number; source: "dashboard" | "environment"; lastPurgedAt: string | null }>;
export type PurgeResult = Readonly<{ cutoff: string; sessions: number; pageviews: number; events: number; visitors: number;
  adminSessions: number; loginThrottles: number }>;

export function isRetentionDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= analyticsRules.maximumRangeDays;
}

export function createAnalyticsRetention(database: DatabaseRuntime, { defaultDays, now = Date.now }: { defaultDays: number; now?: () => number }) {
  async function setting(key: string): Promise<string | null> {
    const row = await database.query((client) => client.analyticsSetting.findUnique({ where: { key } }));
    return row?.value ?? null;
  }
  async function write(key: string, value: string) {
    const updatedAt = new Date(now());
    await database.query((client) => client.analyticsSetting.upsert({ where: { key }, create: { key, value, updatedAt }, update: { value, updatedAt } }));
  }

  async function state(): Promise<RetentionState> {
    const [stored, lastPurgedAt] = await Promise.all([setting(settingKeys.retentionDays), setting(settingKeys.lastPurgedAt)]);
    const days = stored === null ? NaN : Number(stored);
    return isRetentionDays(days) ? { retentionDays: days, source: "dashboard", lastPurgedAt } : { retentionDays: defaultDays, source: "environment", lastPurgedAt };
  }

  /** Delete in bounded batches so a large purge never holds long table locks. */
  async function drain(statement: (cutoff: Date) => Promise<number>, cutoff: Date): Promise<number> {
    let total = 0;
    for (let round = 0; round < 1_000; round++) {
      const removed = await statement(cutoff);
      total += removed;
      if (removed < batchSize) break;
    }
    return total;
  }

  async function purge(): Promise<PurgeResult> {
    const { retentionDays } = await state();
    const at = now();
    const cutoff = new Date(at - retentionDays * 86_400_000);
    const day = new Date(at - 86_400_000);
    const run = (sql: (client: PrismaClient, value: Date) => Promise<number>) => (value: Date) => database.query((client) => sql(client, value));
    const result = {
      cutoff: cutoff.toISOString(),
      events: await drain(run((client, value) => client.$executeRaw`DELETE FROM AnalyticsEvent WHERE occurredAt < ${value} LIMIT ${batchSize}`), cutoff),
      pageviews: await drain(run((client, value) => client.$executeRaw`DELETE FROM AnalyticsPageview WHERE occurredAt < ${value} LIMIT ${batchSize}`), cutoff),
      sessions: await drain(run((client, value) => client.$executeRaw`DELETE FROM AnalyticsSession WHERE lastSeenAt < ${value} LIMIT ${batchSize}`), cutoff),
      visitors: await drain(run((client, value) => client.$executeRaw`DELETE FROM AnalyticsVisitor WHERE lastSeenAt < ${value} LIMIT ${batchSize}`), cutoff),
      adminSessions: await database.query((client) => client.$executeRaw`DELETE FROM AnalyticsAdminSession WHERE expiresAt < ${new Date(at)}`),
      loginThrottles: await database.query((client) => client.$executeRaw`DELETE FROM AnalyticsLoginThrottle
        WHERE windowStartedAt < ${day} AND (lockedUntil IS NULL OR lockedUntil < ${new Date(at)})`),
    };
    await write(settingKeys.lastPurgedAt, new Date(at).toISOString());
    return result;
  }

  let pending: Promise<unknown> | null = null;
  let checkedAt = -Infinity;

  return Object.freeze({
    state,
    purge,
    async setRetentionDays(days: number): Promise<RetentionState> {
      if (!isRetentionDays(days)) throw new RangeError("Retention must be 1-1095 whole days.");
      await write(settingKeys.retentionDays, String(days));
      return state();
    },
    /** Fire-and-forget hourly purge; failures are retried on a later trigger. */
    maybePurge(): void {
      if (pending || now() - checkedAt < purgeIntervalMs / 4) return;
      checkedAt = now();
      pending = (async () => {
        const last = await setting(settingKeys.lastPurgedAt);
        if (last === null || now() - Date.parse(last) >= purgeIntervalMs) await purge();
      })().catch(() => {}).finally(() => { pending = null; });
    },
  });
}
export type AnalyticsRetention = ReturnType<typeof createAnalyticsRetention>;
