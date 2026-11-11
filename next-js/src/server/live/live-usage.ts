import "server-only";

import { operatingRules } from "../config/runtime-policy.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { essentialReserveFor, quotaEndpointPattern, quotaPriorities } from "../football/quota-contract.ts";
import { quotaPeriodStateSchema } from "../football/quota-mysql-store.ts";
import { Prisma } from "../generated/prisma/client.ts";

const DAY = 86_400_000, HOUR = 3_600_000;
const iso = (time: number) => new Date(time).toISOString();
type DayPeriod = Readonly<{ accountId: string; periodId: string; stateJson: unknown }>;
type Totals = { launches: number; retries: number; rateLimited: number; uncertain: number; providerErrors: number };
type AttemptGroup = Pick<DayPeriod, "accountId" | "periodId"> & Readonly<{
  endpoint: string | null;
  workload: string | null;
  launches: bigint;
  retries: bigint;
  rateLimited: bigint;
  uncertain: bigint;
  providerErrors: bigint;
  latestSuccess: number | bigint | null;
}>;
type Breakdown = Totals & { endpoint: string; workload: string };
const empty = (): Totals => ({ launches: 0, retries: 0, rateLimited: 0, uncertain: 0, providerErrors: 0 });
const counterKeys = Object.keys(empty()) as (keyof Totals)[];

function decodePeriod(row: DayPeriod) {
  const value: unknown = typeof row.stateJson === "string" ? JSON.parse(row.stateJson) : row.stateJson;
  const state = quotaPeriodStateSchema.parse(value);
  if (state.id !== row.periodId) throw new Error("A quota period identifier does not match its stored state.");
  return { accountId: row.accountId, ...state };
}

function countsByDay(rows: readonly AttemptGroup[], startByPeriod: ReadonlyMap<string, number>) {
  const days = new Map<number, Map<string, Breakdown>>();
  for (const row of rows) {
    const start = startByPeriod.get(`${row.accountId}:${row.periodId}`);
    if (start === undefined) continue;
    const endpoint = row.endpoint && row.endpoint.length <= 64 && quotaEndpointPattern.test(row.endpoint) ? row.endpoint : "unattributed";
    const workload = row.workload && Object.hasOwn(quotaPriorities, row.workload) ? row.workload : "unattributed";
    const groups = days.get(start) ?? new Map<string, Breakdown>();
    const key = `${endpoint}:${workload}`, group = groups.get(key) ?? { endpoint, workload, ...empty() };
    for (const field of counterKeys) group[field] += Number(row[field]);
    groups.set(key, group);
    days.set(start, groups);
  }
  return days;
}

/** Reads the local quota ledger and freshness projections. All activity is DB-only. */
export async function readLocalFootballUsage(database: DatabaseRuntime, days: number) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 14) throw new Error("Choose 1–14 provider days.");
  return database.transaction(async (tx) => {
    const clock = (await tx.$queryRaw<{ observedAt: Date }[]>`SELECT UTC_TIMESTAMP(3) AS observedAt`)[0];
    if (!clock) throw new Error("MySQL did not report the current provider day.");
    const { observedAt } = clock;
    const now = observedAt.getTime();
    const today = Math.floor(now / DAY) * DAY, first = today - (days - 1) * DAY;
    const periods = (await tx.$queryRaw<DayPeriod[]>`
      SELECT accountId, id AS periodId, stateJson FROM ApiQuotaPeriod
      WHERE JSON_EXTRACT(stateJson, '$.startsAt') >= ${first}
        AND JSON_EXTRACT(stateJson, '$.startsAt') < ${today + DAY}
      LIMIT 113
    `).map(decodePeriod);
    if (periods.length > 112) throw new Error("The quota history exceeds the supported local scope.");
    const attempts = periods.length === 0 ? [] : await tx.$queryRaw<AttemptGroup[]>(Prisma.sql`
      SELECT accountId, periodId,
        JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.endpoint')) AS endpoint,
        JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.priority')) AS workload,
        COUNT(*) AS launches,
        COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.retry')) = 'true'), 0) AS retries,
        COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.responseKind')) = 'rate-limited'), 0) AS rateLimited,
        COALESCE(SUM(state IN ('uncertain', 'attempted')), 0) AS uncertain,
        COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.responseKind')) = 'provider-error'), 0) AS providerErrors,
        MAX(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.responseKind')) = 'success'
          THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.launchedAt')) AS UNSIGNED) END) AS latestSuccess
      FROM ApiQuotaAttempt
      WHERE (accountId, periodId) IN (${Prisma.join(periods.map((period) => Prisma.sql`(${period.accountId}, ${period.id})`))})
        AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.launchedAt')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE')
      GROUP BY accountId, periodId, endpoint, workload
    `);
    const byDay = countsByDay(attempts, new Map(periods.map((period) => [`${period.accountId}:${period.id}`, period.startsAt])));
    const latestInPlay = attempts.reduce((latest, attempt) => attempt.endpoint === "/odds/live"
      ? Math.max(latest, Number(attempt.latestSuccess ?? 0)) : latest, 0);
    const current = (await tx.$queryRaw<{
      latestResult: Date | null; latestMatchDetails: Date | null; latestPreMatchOdds: Date | null; resultBacklog: bigint; activeFixtures: bigint;
    }[]>`SELECT
      (SELECT MAX(receivedAt) FROM ResultSyncBatch WHERE completedAt IS NOT NULL) AS latestResult,
      (SELECT MAX(receivedAt) FROM LiveMatchSnapshot WHERE bodyJson IS NOT NULL) AS latestMatchDetails,
      (SELECT MAX(receivedAt) FROM OddsImportBatch WHERE kind = 'prices' AND status IN ('complete', 'partial')) AS latestPreMatchOdds,
      (SELECT COUNT(*) FROM ResultSyncBatch WHERE completedAt IS NULL) AS resultBacklog,
      (SELECT COUNT(*) FROM FootballFixture WHERE status = 'live' AND kickoff >= ${new Date(now - 12 * HOUR)}) AS activeFixtures
    `)[0];
    if (!current) throw new Error("MySQL did not report football data freshness.");
    const { latestResult, latestMatchDetails, latestPreMatchOdds, resultBacklog, activeFixtures } = current;

    return {
      checkedAt: observedAt.toISOString(),
      reportingTimezone: "Africa/Kampala",
      freshness: { latestResult: latestResult?.toISOString() ?? null, latestMatchDetails: latestMatchDetails?.toISOString() ?? null,
        latestPreMatchOdds: latestPreMatchOdds?.toISOString() ?? null, latestInPlayPoll: latestInPlay === 0 ? null : iso(latestInPlay),
        resultBacklog: Number(resultBacklog), activeFixtures: Number(activeFixtures) },
      days: Array.from({ length: days }, (_, index) => {
        const start = today - index * DAY;
        const available = periods.filter((period) => period.kind === "confirmed" && period.startsAt === start && period.endsAt === start + DAY);
        const observations = available.flatMap((period) => period.providerUsage ? [{ period, usage: period.providerUsage }] : []);
        observations.sort((left, right) => right.usage.observedAt - left.usage.observedAt);
        const mostRecent = observations[0];
        const fallback = available.length === 1 ? available[0] : undefined;
        const period = mostRecent?.period ?? fallback;
        const breakdown = [...(byDay.get(start)?.values() ?? [])]
          .sort((left, right) => right.launches - left.launches || left.endpoint.localeCompare(right.endpoint) || left.workload.localeCompare(right.workload));
        const totals = empty();
        for (const group of breakdown) for (const field of counterKeys) totals[field] += group[field];
        const limit = period?.dayLimit ?? operatingRules.football.requestsPerProviderDay;
        return {
          startsAt: iso(start), resetsAt: iso(start + DAY),
          provider: mostRecent ? { observedAt: iso(mostRecent.usage.observedAt), limit: mostRecent.usage.limit,
            used: mostRecent.usage.limit - mostRecent.usage.remaining, remaining: mostRecent.usage.remaining } : null,
          local: { ...totals, breakdown, limit, essentialReserve: essentialReserveFor(limit), remaining: period?.dayRemaining ?? null },
        };
      }),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
