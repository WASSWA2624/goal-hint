import "server-only";

import { z } from "zod";
import { getReportingDayBounds, parseReportingDate, type ReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { catalogScopeKey } from "../football/catalog-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { displayedSet, publicFixtureScope } from "../matches/feed-read.ts";
import { preMatchOddsFreshMs } from "../odds/odds-contract.ts";
import { minimumFixturePrice } from "../odds/odds-read.ts";
import { historyJson } from "../predictions/history-read.ts";

const maximumCoveragePage = 500;
const exclusion = z.enum(["missing-kickoff", "kickoff-outside-reporting-date", "outside-public-competition-scope"]);
const absentForecast = z.enum(["no-cycle", "no-current-revision", "no-locked-revision", "no-retained-revision", "no-supported-market"]);
const coverageCursor = z.uuid();
export type FixtureCoverageTotals = Readonly<{
  stored: number; publicScope: number; published: number; forecastPublished: number; predictionReady: number;
  marketPredictions: number; priced: number; awaitingData: number; excluded: number; observedOdds: number; observedWithoutFreshPrice: number;
}>;
type CoverageTx = Pick<Prisma.TransactionClient, "$queryRaw">;
const receiptIdentities = z.array(coverageCursor).max(10_000);
const missingIdentities = z.array(z.number().int().positive().safe()).max(10_000);

export async function readFixtureDiscoveryReceipt(tx: Pick<Prisma.TransactionClient, "footballImport">, date: ReportingDate, now: UtcInstant) {
  const at = new Date(now);
  const receipt = await tx.footballImport.findFirst({ where: { kind: "fixtures", provider: "api-football",
    scopeKey: catalogScopeKey({ kind: "fixtures", query: { date } }), observedAt: { lte: at }, recordedAt: { lte: at } },
  orderBy: [{ observedAt: "desc" }, { sequence: "desc" }], select: { id: true, status: true, observedAt: true,
    receivedCount: true, importedCount: true, rejectedCount: true, fixtureIds: true, missingIds: true } });
  return receipt && { ...receipt, fixtureIds: receiptIdentities.parse(historyJson(receipt.fixtureIds)),
    missingIds: missingIdentities.parse(historyJson(receipt.missingIds)) };
}

function classifyDay(date: ReportingDate, now: UtcInstant, ids: readonly number[], observedFixtureIds: readonly string[]) {
  const { startInclusive, endExclusive } = getReportingDayBounds(date);
  const start = new Date(startInclusive), end = new Date(endExclusive), at = new Date(now);
  const filed = new Date(`${date}T00:00:00Z`);
  const inDay = Prisma.sql`f.kickoff>=${start} AND f.kickoff<${end}`;
  const publicScope = ids.length ? publicFixtureScope(ids, false) : Prisma.sql`FALSE`;
  const observedInReceipt = observedFixtureIds.length ? Prisma.sql`UNION DISTINCT SELECT id FROM FootballFixture
      WHERE provider='api-football' AND id IN (${Prisma.join(observedFixtureIds)})` : Prisma.empty;
  // Both date indexes are usable independently. This also keeps malformed/rescheduled filed rows available for an exclusion reason.
  return Prisma.sql`WITH cohort AS (
      SELECT id FROM FootballFixture WHERE provider='api-football' AND eatDate=${filed}
      UNION DISTINCT SELECT id FROM FootballFixture WHERE provider='api-football' AND kickoff>=${start} AND kickoff<${end}
      ${observedInReceipt}
    ), matched AS (
      SELECT f.id AS fixtureId, f.externalId, f.kickoff, f.status, f.providerStatus, f.retrievedAt, c.id AS cycleId, c.state AS cycleState,
        rs.nextCheckAt, rs.delayReason, ${displayedSet} AS revisionId,
        CASE WHEN f.kickoff IS NULL THEN 'missing-kickoff' WHEN NOT (${inDay}) THEN 'kickoff-outside-reporting-date'
          WHEN NOT COALESCE((${publicScope}),FALSE) THEN 'outside-public-competition-scope' END AS exclusionReason,
        (f.kickoff<=${at} AND f.status IN ('scheduled','unknown')) AS awaiting,
        o.fixtureId IS NOT NULL AND o.lastRetrievedAt<=${at} AS observedOdds,
        COALESCE(o.withdrawnAt IS NULL AND o.lastRetrievedAt<f.kickoff AND o.lastRetrievedAt<=${at} AND
          (o.lastProviderUpdatedAt IS NULL OR o.lastProviderUpdatedAt<=o.lastRetrievedAt) AND
          ((f.status='scheduled' AND f.kickoff>${at}) OR (f.status IN ('live','finished-regulation','finished-extra-time','finished-penalties','abandoned') AND f.kickoff<=${at})) AND
          EXISTS (SELECT 1 FROM FixtureOddsPrice p WHERE p.fixtureId=f.id AND p.stale=FALSE AND p.basis='bookmaker'
            AND p.priceDecimal>=${minimumFixturePrice} AND p.retrievedAt<=o.lastRetrievedAt
            AND LEAST(o.lastRetrievedAt, COALESCE(o.lastProviderUpdatedAt,p.providerUpdatedAt,o.lastRetrievedAt))>=
              DATE_SUB(LEAST(f.kickoff,${at}), INTERVAL ${preMatchOddsFreshMs * 1000} MICROSECOND)),FALSE) AS priced
      FROM cohort JOIN FootballFixture f ON f.id=cohort.id
      JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
      LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
      LEFT JOIN FixtureResultState rs ON rs.fixtureId=f.id
      LEFT JOIN FixtureOddsState o ON o.fixtureId=f.id
    ), classified AS (
      SELECT matched.*, CASE WHEN cycleId IS NULL THEN 'no-cycle'
        WHEN cycleState='open' AND revisionId IS NULL THEN 'no-current-revision'
        WHEN cycleState='closed' AND revisionId IS NULL THEN 'no-locked-revision'
        WHEN cycleState='void' AND revisionId IS NULL THEN 'no-retained-revision'
        WHEN NOT EXISTS (SELECT 1 FROM MarketPrediction mp WHERE mp.setId=matched.revisionId AND mp.available=TRUE)
          THEN 'no-supported-market' END AS forecastReason,
        ((SELECT COUNT(*) FROM MarketPrediction mp WHERE mp.setId=matched.revisionId AND mp.available=TRUE) +
          (SELECT COUNT(*) FROM ExtendedMarketPublishedPick ep WHERE ep.revisionId=matched.revisionId
            AND ep.source IN ('ai-score-distribution','local-poisson'))) AS marketPredictions
      FROM matched
    )`;
}

/** Stored is the union of canonical filings, kickoffs and the latest date receipt's known fixture IDs. Published is the normal Matches cohort.
 * Forecast-ready requires an available market on the displayed revision. Priced and overdue are independent fixture counts. */
export async function readFixtureCoverageTotals(tx: CoverageTx, date: ReportingDate, now: UtcInstant, ids: readonly number[],
  observedFixtureIds: readonly string[]): Promise<FixtureCoverageTotals> {
  const [row] = await tx.$queryRaw<(Record<Exclude<keyof FixtureCoverageTotals, "stored" | "published">, bigint> & { storedCount: bigint })[]>(Prisma.sql`${classifyDay(date, now, ids, observedFixtureIds)}
    SELECT COUNT(*) AS storedCount, COUNT(CASE WHEN exclusionReason IS NULL THEN 1 END) AS publicScope,
      COUNT(CASE WHEN exclusionReason IS NULL AND revisionId IS NOT NULL THEN 1 END) AS forecastPublished,
      COUNT(CASE WHEN exclusionReason IS NULL AND forecastReason IS NULL THEN 1 END) AS predictionReady,
      CAST(COALESCE(SUM(CASE WHEN exclusionReason IS NULL THEN marketPredictions ELSE 0 END),0) AS UNSIGNED) AS marketPredictions,
      COUNT(CASE WHEN exclusionReason IS NULL AND priced THEN 1 END) AS priced,
      COUNT(CASE WHEN exclusionReason IS NULL AND awaiting THEN 1 END) AS awaitingData,
      COUNT(CASE WHEN exclusionReason IS NOT NULL THEN 1 END) AS excluded,
      COUNT(CASE WHEN exclusionReason IS NULL AND observedOdds THEN 1 END) AS observedOdds,
      COUNT(CASE WHEN exclusionReason IS NULL AND observedOdds AND NOT priced THEN 1 END) AS observedWithoutFreshPrice
    FROM classified`);
  if (!row) throw new Error("Fixture coverage is unavailable.");
  const value = { stored: Number(row.storedCount), publicScope: Number(row.publicScope), published: Number(row.publicScope),
    forecastPublished: Number(row.forecastPublished), predictionReady: Number(row.predictionReady), marketPredictions: Number(row.marketPredictions),
    priced: Number(row.priced),
    awaitingData: Number(row.awaitingData), excluded: Number(row.excluded), observedOdds: Number(row.observedOdds),
    observedWithoutFreshPrice: Number(row.observedWithoutFreshPrice) };
  if (Object.values(value).some((count) => !Number.isSafeInteger(count) || count < 0) || value.stored !== value.publicScope + value.excluded ||
    value.publicScope < Math.max(value.forecastPublished, value.priced, value.awaitingData, value.observedOdds) ||
    value.forecastPublished < value.predictionReady || value.marketPredictions < value.predictionReady ||
    value.observedOdds !== value.priced + value.observedWithoutFreshPrice)
    throw new Error("Fixture coverage totals do not reconcile.");
  return value;
}

export type FixtureCoverageGap = Readonly<{
  fixtureId: string; externalId: string; kickoffAt: number | null; providerStatus: string | null; status: string;
  retrievedAt: number; nextCheckAt: number | null; delayReason: string | null;
  exclusionReason: z.infer<typeof exclusion> | null; forecastReason: z.infer<typeof absentForecast> | null;
}>;
type GapRow = Omit<FixtureCoverageGap, "kickoffAt" | "retrievedAt" | "nextCheckAt" | "exclusionReason" | "forecastReason"> &
  Readonly<{ kickoff: Date | null; retrievedAt: Date; nextCheckAt: Date | null; exclusionReason: unknown; forecastReason: unknown }>;

/** Private bounded keyset read. Each known excluded ID has one visibility reason. Forecast gaps remain independent of visibility. */
export async function readFixtureCoverageGaps(database: DatabaseRuntime, now: UtcInstant, ids: readonly number[], input: Readonly<{
  date: string; kind?: "visibility" | "forecast"; after?: string; limit?: number;
}>) {
  const date = parseReportingDate(input.date), limit = input.limit ?? 200;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumCoveragePage) throw new RangeError("Invalid coverage page size.");
  const after = input.after === undefined ? Prisma.empty : Prisma.sql`AND fixtureId>${coverageCursor.parse(input.after)}`;
  const missing = input.kind === "forecast" ? Prisma.sql`exclusionReason IS NULL AND forecastReason IS NOT NULL` : Prisma.sql`exclusionReason IS NOT NULL`;
  const rows = await database.transaction(async (tx) => {
    const receipt = await readFixtureDiscoveryReceipt(tx, date, now);
    return tx.$queryRaw<GapRow[]>(Prisma.sql`${classifyDay(date, now, ids, receipt?.fixtureIds ?? [])}
    SELECT fixtureId,CAST(externalId AS CHAR) AS externalId,kickoff,status,providerStatus,retrievedAt,nextCheckAt,delayReason,
      exclusionReason,forecastReason FROM classified WHERE ${missing} ${after} ORDER BY fixtureId ASC LIMIT ${limit + 1}`);
  }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
  const items = rows.slice(0, limit).map(({ kickoff, retrievedAt, nextCheckAt, exclusionReason, forecastReason, ...row }): FixtureCoverageGap => ({
    ...row, kickoffAt: kickoff?.getTime() ?? null, retrievedAt: retrievedAt.getTime(), nextCheckAt: nextCheckAt?.getTime() ?? null,
    exclusionReason: exclusion.nullable().parse(exclusionReason), forecastReason: absentForecast.nullable().parse(forecastReason),
  }));
  return { date, observedAt: now, items, nextAfter: rows.length > limit ? items.at(-1)!.fixtureId : null };
}

/** A missing provider ID reported by the exact date receipt is separate from exclusion of a normalized fixture. */
export async function readFixtureDiscoveryGaps(database: DatabaseRuntime, now: UtcInstant, input: Readonly<{
  date: string; after?: number; limit?: number;
}>) {
  const date = parseReportingDate(input.date), limit = input.limit ?? 200, after = input.after ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumCoveragePage || !Number.isSafeInteger(after) || after < 0)
    throw new RangeError("Invalid discovery coverage cursor.");
  const receipt = await database.query((tx) => readFixtureDiscoveryReceipt(tx, date, now));
  if (receipt === null) return null;
  const missing = [...new Set(receipt.missingIds)].filter((id) => id > after).sort((a, b) => a - b);
  const items = missing.slice(0, limit).map((externalId) => ({ externalId, reason: "provider-reported-missing" as const }));
  return { date, receiptId: receipt.id, observedAt: receipt.observedAt.getTime(), rejectedCount: receipt.rejectedCount,
    items, nextAfter: missing.length > limit ? items.at(-1)!.externalId : null };
}
