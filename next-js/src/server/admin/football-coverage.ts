import "server-only";

import { getReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import { historyImportCoverage, historyImportPhases, historyImportStatus, type FootballCoverage } from "../../domain/football-coverage.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { oddsPricePageScopeKey } from "../odds/odds-input.ts";
import { historyJson } from "../predictions/history-read.ts";
import { readFixtureCoverageTotals, readFixtureDiscoveryReceipt } from "./fixture-coverage.ts";
import { readFootballWorkerHealth, readOddsMappingCoverage } from "./football-operations.ts";

const since = (at: number, hours: number) => new Date(at - hours * 3_600_000);

/** The same fixture scope and displayed revisions that the public feed reads. No provider calls. */
export async function readFootballCoverage(database: DatabaseRuntime, now: UtcInstant, ids: readonly number[]): Promise<FootballCoverage> {
  const date = getReportingDate(now);
  const day = new Date(`${date}T00:00:00.000Z`);
  const at = new Date(now);
  const [archive, fixtureReport, odds, sections, marketMapping, workers] = await Promise.all([
    database.query((client) => client.footballHistoryImportStatus.findMany()).catch(() => null),
    database.transaction(async (tx) => {
      const receipt = await readFixtureDiscoveryReceipt(tx, date, now);
      const counts = await readFixtureCoverageTotals(tx, date, now, ids, receipt?.fixtureIds ?? []);
      const attempt = await tx.dailyRunImport.findFirst({ where: { eatDate: day, finishedAt: { lte: at } },
        orderBy: [{ run: { eatDate: "desc" } }, { run: { slotHour: "desc" } }, { attempt: "desc" }], select: { failure: true } });
      return { counts, receipt, attempt };
    }, { isolationLevel: "RepeatableRead", timeout: 10_000 }).catch(() => null),
    database.query((client) => client.oddsImportBatch.groupBy({ by: ["kind", "status"], _count: { _all: true },
      where: { receivedAt: { gte: since(now, 24), lte: at }, NOT: { scopeKey: { startsWith: oddsPricePageScopeKey("") } } } })).catch(() => null),
    database.query((client) => client.footballProviderCoverage.groupBy({ by: ["resource", "status"], _count: { _all: true },
      _max: { updatedAt: true }, where: { updatedAt: { gte: since(now, 24), lte: at } } })).catch(() => null),
    readOddsMappingCoverage(database, now),
    readFootballWorkerHealth(database, now),
  ]);
  const receipt = fixtureReport?.receipt;
  const { counts, attempt } = fixtureReport ?? {};
  return {
    archive: historyImportPhases.map((phase) => {
      const row = archive?.find((item) => item.phase === phase);
      const parsedStatus = historyImportStatus.safeParse(row?.status);
      const interrupted = parsedStatus.data === "running" && row && now - row.updatedAt.getTime() > 5 * 60_000;
      const status: FootballCoverage["archive"][number]["status"] = interrupted ? "retrying" :
        parsedStatus.data ?? (archive ? "unreported" : "unavailable");
      return { phase, status, checkpointAt: row?.updatedAt.getTime() ?? null,
        coverage: row ? historyImportCoverage.safeParse(historyJson(row.coverage)).data ?? null : null };
    }),
    fixtures: { date, receipt: receipt ? { status: receipt.status, receivedCount: receipt.receivedCount,
      importedCount: receipt.importedCount, rejectedCount: receipt.rejectedCount } : null, attemptFailed: Boolean(attempt?.failure),
      discovered: receipt && receipt.status !== "failed" ? receipt.receivedCount : null,
      discoveryComplete: receipt?.status === "complete", discoveryObservedAt: receipt?.observedAt.getTime() ?? null,
      reportedMissingIds: receipt ? new Set(receipt.missingIds).size : null,
      stored: counts?.stored ?? null, publicScope: counts?.publicScope ?? null, published: counts?.published ?? null,
      forecastPublished: counts?.forecastPublished ?? null, predictionReady: counts?.predictionReady ?? null,
      marketPredictions: counts?.marketPredictions ?? null,
      priced: counts?.priced ?? null, awaitingData: counts?.awaitingData ?? null, excluded: counts?.excluded ?? null,
      observedOdds: counts?.observedOdds ?? null, observedWithoutFreshPrice: counts?.observedWithoutFreshPrice ?? null },
    odds: odds?.map(({ kind, status, _count }) => ({ kind, status, batches: _count._all })) ?? null,
    sections: sections?.map(({ resource, status, _count, _max }) => ({ resource, status, count: _count._all,
      lastCheckpointAt: _max.updatedAt?.getTime() ?? null })) ?? null,
    marketMapping, workers,
  };
}
