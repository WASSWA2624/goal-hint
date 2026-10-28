import "server-only";

import { z } from "zod";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { forecastSourcesReportSchema, type ForecastSourcesReport } from "../../domain/forecast-sources.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import type { MarketFamily, MarketSource } from "../../domain/markets.ts";
import { matchHref } from "../../domain/navigation.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parsePerformanceQuery } from "../performance/performance-query.ts";
import { readPerformanceBatches, type PerformanceSnapshot } from "../performance/performance-read.ts";
import { settlementContextFor } from "../settlement/settlement-read.ts";
import { createSourceComparisonAccumulator, sourceComparisonFamilies, type SourceComparisonRecord } from "./source-comparison.ts";
import { readSourceReceipts } from "./source-receipts-read.ts";
import { publicCacheDescriptor, type PublicResponseCache } from "../cache/public-cache.ts";
import { createMysqlPublicResponseCache } from "../cache/mysql-public-cache.ts";
import { prepareDemoRange } from "../demo/read-seed.ts";
import { demoAnalyticsCacheDescriptor } from "../demo/analytics-cache.ts";

/** Fixed diagnostic reliability deciles and a 95% interval; the owner page applies no sample gate. */
const DIAGNOSTIC_BANDS = Object.freeze([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
const DIAGNOSTIC_Z = 1.96;

function parseReport(value: unknown): ForecastSourcesReport {
  const { diagnostic, ...report } = forecastSourcesReportSchema.parse(value);
  return diagnostic ? { ...report, diagnostic } : report;
}

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
export function createSourceComparisonService(options: Readonly<{ database: DatabaseRuntime; competitionIds: readonly number[];
  clock?: Clock; cache?: PublicResponseCache }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  return Object.freeze({ async read(parameters = new URLSearchParams()): Promise<ForecastSourcesReport> {
    const asOf = clock.now(), query = parsePerformanceQuery(parameters, getReportingDate(asOf));
    const configured = z.array(z.number().int().positive().max(2_147_483_647)).min(1).max(maximumCompetitionScope).safeParse(options.competitionIds);
    if (!configured.success || new Set(configured.data).size !== configured.data.length) throw new MatchFeedError("unavailable");
    const families = query.market === "all" ? sourceComparisonFamilies : [query.market];
    const demo = isDevelopmentDemo(), cache = options.cache ?? (demo ? createMysqlPublicResponseCache(options.database) : null);
    try {
      const replay = demo ? await import("../demo/source-receipts.ts") : null;
      const read = () => options.database.transaction(async (tx) => {
        const accumulator = createSourceComparisonAccumulator({ families, horizons: null, bands: DIAGNOSTIC_BANDS, confidenceZ: DIAGNOSTIC_Z });
        const originalOrders = { "provider-first": 0, "ai-first": 0, none: 0 };
        let fixtureCount = 0, replayedFixtures = 0;
        for await (const batch of readPerformanceBatches(tx, query, configured.data)) {
          fixtureCount += batch.records.length;
          const revisions = batch.records.flatMap((record) => record.cycle?.state === "closed" && record.revision ? [record.revision] : []);
          const receipts = new Map(await readSourceReceipts(tx, revisions));
          const diagnostic = replay ? await replay.readDemoSourcePairs(tx, revisions) : null;
          const records = batch.records.flatMap(comparisonRecord).map((record) => {
            if (record.state !== "closed" || !record.locked) return record;
            originalOrders[record.locked.sourceOrder ?? "none"]++;
            // A separately sealed synthetic replay can score legacy demo sources.
            // Original forecasts and their recorded source-order totals stay unchanged.
            const pair = record.locked.sourceOrder === null ? diagnostic?.get(record.locked.jobId) : null;
            if (!pair) return record;
            replayedFixtures++; receipts.set(record.locked.jobId, pair);
            return { ...record, locked: { ...record.locked, sourceOrder: pair.order } };
          });
          accumulator.add(records, receipts);
        }
        return freezeEvidence(parseReport({ asOf, from: query.range.startDate, to: query.range.endDate, market: query.market,
          fixtureCount, confidenceZ: DIAGNOSTIC_Z, ...accumulator.finish(), orders: originalOrders,
          ...(replayedFixtures && replay ? { diagnostic: { kind: "synthetic-comparison-replay", label: replay.DEMO_SOURCE_PAIR_NOTICE, replayedFixtures } } : {}) }));
      }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: demo ? 240_000 : 30_000 });
      const prepare = async () => {
        if (!replay) return;
        await prepareDemoRange(options.database, query.range, asOf);
        // Cold historical ranges need their sealed comparison sidecars as well as
        // forecasts. Prepare them before the inner cache probe captures its stamp.
        const today = getReportingDate(asOf);
        await replay.ensureDemoSourcePairs(options.database,
          Array.from({ length: query.range.dayCount }, (_, index) => addReportingDays(query.range.startDate, index))
            .filter((date) => date <= today), asOf);
      };
      if (!cache) { await prepare(); return await read(); }
      const descriptor = publicCacheDescriptor({ kind: "performance", locale: "en", now: asOf, query: { contract: "owner-source-comparison-v2", ...query },
        range: query.range, scope: { competitionIds: [...configured.data].sort((a, b) => a - b), replay: demo },
        parse: parseReport });
      const scoped = demo ? demoAnalyticsCacheDescriptor({ ...descriptor, tags: [...descriptor.tags, "demo:source-comparison"] }, asOf) : descriptor;
      return await cache.read(scoped, async () => {
        await prepare();
        return demo ? cache.read(scoped, read) : read();
      });
    } catch { throw new MatchFeedError("unavailable"); }
  } });
}
