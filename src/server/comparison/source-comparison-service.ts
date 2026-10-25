import "server-only";

import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import type { ForecastSourcesReport } from "../../domain/forecast-sources.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import type { MarketFamily, MarketSource } from "../../domain/markets.ts";
import { matchHref } from "../../domain/navigation.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parsePerformanceQuery } from "../performance/performance-query.ts";
import { readPerformanceSnapshot, type PerformanceSnapshot } from "../performance/performance-read.ts";
import { settlementContextFor } from "../settlement/settlement-read.ts";
import { compareSources, sourceComparisonFamilies, type SourceComparisonRecord } from "./source-comparison.ts";
import { readSourceReceipts } from "./source-receipts-read.ts";

/** Fixed diagnostic reliability deciles and a 95% interval; the owner page applies no sample gate. */
const DIAGNOSTIC_BANDS = Object.freeze([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
const DIAGNOSTIC_Z = 1.96;

function comparisonRecord(record: PerformanceSnapshot["records"][number]): SourceComparisonRecord[] {
  const { fixture, cycle, revision, result } = record;
  if (!cycle) return [];
  const home = fixture.homeTeam.name, away = fixture.awayTeam.name;
  const published: Partial<Record<MarketFamily, MarketSource>> = {};
  if (revision) for (const family of sourceComparisonFamilies) {
    const item = revision.candidate.markets[family];
    if (item.available) published[family] = item.market.source;
  }
  return [{ fixtureId: fixture.id, cycleId: cycle.id, state: cycle.state, kickoffAt: cycle.kickoffAt,
    locked: cycle.state === "closed" && revision ? { jobId: revision.jobId, forecastAt: revision.generationCompletedAt,
      sourceOrder: revision.candidate.audit.sourceOrder ?? null, published } : null,
    settlement: settlementContextFor(fixture, result, fixture.lifecycleState?.issue ?? null, cycle),
    matchLabel: `${home ?? "Home"} v ${away ?? "Away"}`, href: matchHref(fixture.id, canonicalMatchSlug(home, away)) }];
}

/** Owner-only matched comparison of the AI and API-Football forecasts sealed in the same refreshes, over the public
 * performance cohort (applicable cycle, locked selection, scheduled kickoff in the reporting range). Diagnostic only:
 * it reads stored records in one repeatable-read transaction, calls no provider and approves nothing. */
export function createSourceComparisonService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[]; clock?: Clock }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  return Object.freeze({ async read(parameters = new URLSearchParams()): Promise<ForecastSourcesReport> {
    const asOf = clock.now(), query = parsePerformanceQuery(parameters, getReportingDate(asOf));
    const configured = z.array(z.number().int().positive().max(2_147_483_647)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
    if (!configured.success || new Set(configured.data).size !== configured.data.length) throw new MatchFeedError("unavailable");
    const families = query.market === "all" ? sourceComparisonFamilies : [query.market];
    try {
      return await options.database.transaction(async (tx) => {
        const snapshot = await readPerformanceSnapshot(tx, query, configured.data);
        const receipts = await readSourceReceipts(tx, snapshot.records.flatMap((record) =>
          record.cycle?.state === "closed" && record.revision ? [record.revision] : []));
        const comparison = compareSources(snapshot.records.flatMap(comparisonRecord), receipts,
          { families, horizons: null, bands: DIAGNOSTIC_BANDS, confidenceZ: DIAGNOSTIC_Z });
        return freezeEvidence({ asOf, from: query.range.startDate, to: query.range.endDate, market: query.market,
          fixtureCount: snapshot.records.length, confidenceZ: DIAGNOSTIC_Z, ...comparison });
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
    } catch { throw new MatchFeedError("unavailable"); }
  } });
}
