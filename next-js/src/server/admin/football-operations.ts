import "server-only";

import { z } from "zod";
import type { UtcInstant } from "../../domain/calendar.ts";
import type { FootballWorkerHealth } from "../../domain/football-coverage.ts";
import { reconcileOddsCatalog } from "../../domain/market-registry.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { quotaAccountStateSchema, quotaPeriodStateSchema } from "../football/quota-mysql-store.ts";
import { essentialReserveFor } from "../football/quota-contract.ts";
import { storedPreMatchCatalogCoverage } from "../odds/bookmaker-odds-read.ts";
import { historyJson } from "../predictions/history-read.ts";

type MappingResult = Readonly<{ checkedAt: number | null; mapped: number; unmapped: number; unsupported: number }>;
const observedCatalog = z.object({ namespace: z.literal("in-play"), checkedAt: z.number().int().nonnegative(),
  entries: z.array(z.object({ id: z.number().int().positive(), name: z.string().max(256).nullable() })).max(2000) });
const previousCatalog = z.record(z.string().regex(/^[1-9]\d{0,9}$/u), z.string().max(256));

function mappingTotals(entries: readonly Readonly<{ status: "mapped" | "unmapped" | "unsupported" }>[], checkedAt: number | null): MappingResult {
  const counts = { mapped: 0, unmapped: 0, unsupported: 0 };
  for (const { status } of entries) counts[status]++;
  return { checkedAt, ...counts };
}

/** Private aggregate mapping data, using the separate provider namespaces and their most recent stored catalog. */
export async function readOddsMappingCoverage(database: DatabaseRuntime, now: UtcInstant) {
  const [prematch, inPlay] = await Promise.all([
    database.query(async (tx) => {
      const catalog = await storedPreMatchCatalogCoverage(tx, now);
      return catalog && mappingTotals(catalog.entries, catalog.observedAt);
    }).catch(() => null),
    database.query(async (tx) => {
      const [row] = await tx.$queryRaw<{ catalogJson: unknown }[]>`SELECT catalogJson FROM InPlayOddsPollState WHERE provider='api-football'`;
      if (!row) return null;
      const body = historyJson(row.catalogJson), catalog = observedCatalog.safeParse(body);
      if (catalog.success) return catalog.data.checkedAt <= now
        ? mappingTotals(reconcileOddsCatalog("in-play", catalog.data.entries), catalog.data.checkedAt) : null;
      const older = previousCatalog.safeParse(body);
      const entries = older.success ? Object.entries(older.data).map(([id, name]) => ({ id: Number(id), name })) : [];
      return entries.length ? mappingTotals(reconcileOddsCatalog("in-play", entries), null) : null;
    }).catch(() => null),
  ]);
  return { "pre-match": prematch, "in-play": inPlay };
}

type WorkerQueueRow = Readonly<{ type: string; ready: bigint; active: bigint; future: bigint; stalled: bigint;
  oldestReady: Date | null; nextRunAt: Date | null; lastSuccessAt: Date | null; lastErrorAt: Date | null }>;

/** A private rolling work census. Process heartbeats are timestamped runner events; a durable active lease establishes poller ownership. */
export async function readFootballWorkerHealth(database: DatabaseRuntime, now: UtcInstant): Promise<FootballWorkerHealth | null> {
  const at = new Date(now), recent = new Date(now - 24 * 3_600_000);
  return database.transaction(async (tx) => {
    const rows = await tx.$queryRaw<WorkerQueueRow[]>`SELECT type,
      COUNT(CASE WHEN state='pending' AND availableAt<=${at} AND expiresAt>${at} THEN 1 END) AS ready,
      COUNT(CASE WHEN state='running' AND leaseExpiresAt>${at} AND attemptDeadlineAt>${at} AND expiresAt>${at} THEN 1 END) AS active,
      COUNT(CASE WHEN state='pending' AND availableAt>${at} THEN 1 END) AS future,
      COUNT(CASE WHEN state='running' AND (leaseExpiresAt<=${at} OR attemptDeadlineAt<=${at}) THEN 1 END) AS stalled,
      MIN(CASE WHEN state='pending' AND availableAt<=${at} AND expiresAt>${at} THEN availableAt END) AS oldestReady,
      MIN(CASE WHEN state='pending' AND availableAt>${at} THEN availableAt END) AS nextRunAt,
      MAX(CASE WHEN state='succeeded' AND finishedAt<=${at} THEN finishedAt END) AS lastSuccessAt,
      MAX(CASE WHEN state='failed' AND finishedAt<=${at} THEN finishedAt END) AS lastErrorAt
      FROM DurableJob WHERE (type LIKE 'football.%' OR type LIKE 'prediction.%' OR type LIKE 'daily.%'
        OR type LIKE 'hourly.%' OR type LIKE 'odds.%' OR type='teams.codes')
      AND (state IN ('pending','running') OR finishedAt>=${recent}) GROUP BY type LIMIT 64`;
    const lanes = rows.map(({ type, ready, active, future, stalled, oldestReady, nextRunAt, lastSuccessAt, lastErrorAt }) => ({
      type, ready: Number(ready), active: Number(active), future: Number(future), stalled: Number(stalled),
      queueLagMs: oldestReady === null ? 0 : Math.max(0, now - oldestReady.getTime()), nextRunAt: nextRunAt?.getTime() ?? null,
      lastSuccessAt: lastSuccessAt?.getTime() ?? null, lastErrorAt: lastErrorAt?.getTime() ?? null,
    })).sort((a, b) => a.type.localeCompare(b.type));
    const leases = await tx.resultPollerLease.findMany({ where: { ownerId: { not: null }, leaseUntil: { gt: at } }, take: 2,
      select: { accountId: true, leaseUntil: true, nextLiveAt: true, nextDateAt: true, liveFailures: true, dateFailures: true,
        liveError: true, dateError: true } }).catch(() => null);
    const details = await tx.liveMatchPollerLease.findMany({ where: { ownerId: { not: null }, leaseUntil: { gt: at } }, take: 2,
      select: { leaseUntil: true } }).catch(() => null);
    const active = leases?.length === 1 ? leases[0]! : null;
    const poller = active ? { leaseUntil: active.leaseUntil.getTime(), nextLiveAt: active.nextLiveAt.getTime(), nextDateAt: active.nextDateAt.getTime(),
      liveFailures: active.liveFailures, dateFailures: active.dateFailures, liveError: active.liveError, dateError: active.dateError } : null;
    let quota = null, lastCompletedResultAt: number | null = null;
    if (active) {
      const last = await tx.resultSyncBatch.findFirst({ where: { accountId: active.accountId, completedAt: { lte: at } },
        orderBy: { completedAt: "desc" }, select: { completedAt: true } }).catch(() => null);
      lastCompletedResultAt = last?.completedAt?.getTime() ?? null;
      const stored = await tx.apiQuotaAccount.findUnique({ where: { id: active.accountId }, select: { stateJson: true } }).catch(() => null);
      const account = quotaAccountStateSchema.safeParse(stored?.stateJson);
      if (account.success) {
        const storedPeriod = await tx.apiQuotaPeriod.findUnique({
          where: { accountId_id: { accountId: active.accountId, id: account.data.activePeriodId } }, select: { stateJson: true },
        }).catch(() => null);
        const period = quotaPeriodStateSchema.safeParse(storedPeriod?.stateJson);
        if (period.success && period.data.id === account.data.activePeriodId && period.data.startsAt <= now) {
          const state = period.data, remaining = Math.max(0, Math.min(state.dayRemaining, state.dayLimit - state.used));
          quota = { periodStartsAt: state.startsAt, resetAt: state.endsAt, used: state.used, remaining, dailyLimit: state.dayLimit,
            providerDailyLimit: state.providerDailyLimit, providerUsage: state.providerUsage ?? null, minuteLimit: state.minuteLimit,
            reserve: essentialReserveFor(state.dayLimit), resetPending: now >= state.endsAt || account.data.candidatePeriodId !== null };
        }
      }
    }
    return { at: now, workerWindowHours: 24, lanes, quota, resultPoller: poller, lastCompletedResultAt,
      detailsLeaseUntil: details?.length === 1 ? details[0]!.leaseUntil.getTime() : null };
  }, { isolationLevel: "RepeatableRead", timeout: 10_000 }).catch(() => null);
}
