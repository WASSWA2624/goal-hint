import "server-only";

import type { SlipsBrowseResult, SlipPreviewView } from "../../domain/best-slips.ts";
import { bestSlipsQueryRules, resolveBestSlipsDates, type BestSlipsQuery } from "../../domain/best-slips-query.ts";
import { yesterday } from "../../domain/browse-period.ts";
import { getReportingDayBounds, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { completedSlipFixtureIds, savedSlipCompleted, savedSlipOutcome, savedSlipSnapshotSchema, savedSlipStatus } from "../../domain/saved-slips.ts";
import { slipMatchStatesFromResults } from "../../domain/slip-match-state.ts";
import { slipStatusCategory } from "../../domain/slip-status.ts";
import { slipBuilderRules, type BuiltSlip } from "../../domain/slip-builder.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { readSlipForecastResults, slipForecastReadRules } from "./slip-forecast.ts";

/** Account-scoped saved history. Original forecasts determine outcomes, never the current pick or score alone. */
export function createPersonalSlipHistory(database: DatabaseRuntime, { resolveResults = readSlipForecastResults, now = Date.now } = {}) {
  return async (accountId: string, query: BestSlipsQuery, today: ReportingDate): Promise<SlipsBrowseResult> => {
    const dates = resolveBestSlipsDates(query, today), previousDay = yesterday(today), asOf = now();
    // Include yesterday for the independent summary, even when the list's selected range excludes it.
    const from = dates.from && query.summary ? dates.from < previousDay ? dates.from : previousDay : dates.from;
    const to = dates.to && query.summary ? dates.to > previousDay ? dates.to : previousDay : dates.to;
    const start = from ? new Date(getReportingDayBounds(from).startInclusive) : null;
    const end = to ? new Date(getReportingDayBounds(to).endExclusive) : null;
    return database.transaction(async (tx) => {
      const statistics = { total: 0, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0 };
      const yesterdayStatistics = { ...statistics }, slips: SlipPreviewView[] = [], membership: string[] = [];
      type Row = { id: string; createdAt: Date; snapshotJson: unknown };
      let cursor: Pick<Row, "id" | "createdAt"> | null = null, total = 0;
      const batchSize = Math.min(50, Math.floor(slipForecastReadRules.maximumSelections / slipBuilderRules.maximumSelections));
      for (;;) {
        const after: Prisma.Sql = cursor ? Prisma.sql`AND (s.createdAt<${cursor.createdAt} OR (s.createdAt=${cursor.createdAt} AND s.id<${cursor.id}))` : Prisma.empty;
        const rows: Row[] = await tx.$queryRaw<Row[]>(Prisma.sql`
          SELECT s.id,s.createdAt,s.snapshotJson FROM SavedSlip s
          WHERE s.accountId=${accountId} AND s.createdAt<=${new Date(asOf)}
            ${start ? Prisma.sql`AND s.createdAt>=${start}` : Prisma.empty}
            ${end ? Prisma.sql`AND s.createdAt<${end}` : Prisma.empty} ${after}
          ORDER BY s.createdAt DESC,s.id DESC LIMIT ${batchSize}`);
        const parsed = rows.map((row) => ({ ...row, slip: savedSlipSnapshotSchema.parse(row.snapshotJson) as BuiltSlip }));
        const results = await resolveResults(tx, parsed.flatMap((row) => row.slip.selections), asOf);
        for (const row of parsed) {
          const publicationDay = getReportingDate(utcInstantFromEpochMilliseconds(+row.createdAt));
          const outcome = savedSlipOutcome(row.slip, results), status = savedSlipStatus(row.slip, results, outcome), category = slipStatusCategory(status);
          if (publicationDay === previousDay) { yesterdayStatistics.total++; yesterdayStatistics[category]++; }
          if (dates.from && publicationDay < dates.from || dates.to && publicationDay > dates.to) continue;
          statistics.total++; statistics[category]++;
          if (query.status !== "all" && query.status !== category) continue;
          membership.push(row.id);
          const position = total++;
          if (position < (query.page - 1) * bestSlipsQueryRules.pageSize || position >= query.page * bestSlipsQueryRules.pageSize) continue;
          slips.push({ id: row.id, rank: position + 1, publicationDay, publishedAt: +row.createdAt, slip: row.slip,
            totalOdds: row.slip.totalOdds, averageProbability: row.slip.averageProbability, matchCount: row.slip.selections.length,
            outcome, status, completed: savedSlipCompleted(row.slip, results), completedFixtureIds: completedSlipFixtureIds(row.slip, results),
            matchStates: slipMatchStatesFromResults(row.slip.selections, results) });
        }
        if (rows.length < batchSize) break;
        cursor = rows.at(-1)!;
      }
      return { day: today, state: "generated", slips, searchLimited: false, partialCoverage: false, statistics,
        summary: { from: query.summary ? previousDay : dates.from, to: query.summary ? previousDay : dates.to,
          statistics: query.summary ? yesterdayStatistics : statistics },
        browse: { query, total, pageSize: bestSlipsQueryRules.pageSize, version: evidenceFingerprint(membership),
          hasMore: query.page * bestSlipsQueryRules.pageSize < total, nextCursor: null, ...dates } };
    }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
  };
}
