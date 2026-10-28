import "server-only";

import { z } from "zod";
import type { feedPerformanceSchema } from "../../domain/match-feed.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { MARKET_RULE_VERSION, isMarketFamily, isMarketSelection, type MarketFamily, type MarketSelection } from "../../domain/markets.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical } from "../results/result-read.ts";
import { settlementContextFor, settlementInputFor, settlementRevisionFromRow, type SettlementFixture } from "../settlement/settlement-read.ts";
import type { feedSql } from "./feed-read.ts";
import { MatchFeedError } from "./feed-error.ts";
import { selectionOccurred } from "../../domain/market-settlement.ts";
import { readPublicCacheGenerations } from "../cache/mysql-public-cache.ts";

type Summary = z.infer<typeof feedPerformanceSchema>;
const batchSize = 500, batchCacheLifetimeMs = 6 * 60 * 60 * 1000;
const batchDeltaSchema = z.strictObject({ won: z.number().int().min(0).max(batchSize), lost: z.number().int().min(0).max(batchSize),
  void: z.number().int().min(0).max(batchSize) }).refine(value => value.won + value.lost + value.void <= batchSize);
type BatchDelta = z.infer<typeof batchDeltaSchema>;
type SummaryCacheContext = Readonly<{ key: string; nowMs: number }>;

/** Equivalent URL/date/zone spellings share statistics only when the resolved
 * SQL cohort, filters and pick-ranking rules are exactly the same. */
export function feedPerformanceCacheKey(sql: ReturnType<typeof feedSql>, locale: string, providerOdds: boolean): string {
  const statement = (value: Prisma.Sql) => ({ text: value.sql, values: value.values.map(item => item instanceof Date ? item.getTime() : item) });
  return evidenceFingerprint({ contract: "feed-performance-query-v2", locale, providerOdds, ruleVersion: MARKET_RULE_VERSION,
    joins: statement(sql.joins), where: statement(sql.where) });
}
type Sample = HistoryRow & Readonly<{
  fixtureKickoff: Date;
  fixtureStatus: SettlementFixture["status"]; fixtureRegulationHome: number | null; fixtureRegulationAway: number | null;
  fixtureRegulationVerifiedAt: Date | null; fixtureRegulationEvidenceRef: string | null;
  currentLockedSetId: string; currentVoidReason: string | null; currentResultId: string | null; issue: string | null;
  currentFamily: MarketFamily; currentSelection: MarketSelection; currentSource: "ai" | "api-football"; currentProbability: number;
  storedSelection: MarketSelection; storedProbability: number;
  marketPayload: unknown; marketValidIntegrity: unknown;
}>;

/** Counts the entire filtered cohort. Only closed predictions with recorded settlements need audit reads;
 * open picks are pending, missing picks unavailable, and void cycles stay distinct from losses.
 * Keyset batches bound memory without limiting the reporting period or using the visible page. */
export async function readFeedPerformance(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>,
  counts: Readonly<{ total: number; available: number; void: number }>, cache?: SummaryCacheContext): Promise<Summary> {
  const summary: Summary = { total: counts.total, won: 0, lost: 0, pending: counts.available - counts.void,
    void: counts.void, unavailable: counts.total - counts.available };
  if (summary.pending === 0) return summary;
  let after: { kickoff: Date; fixtureId: string } | null = null;
  for (;;) {
    // Bound the candidate fixture page before ranking its market choices. A
    // filtered-out batch still advances this cursor; it never ends the audit.
    const candidates: { id: string; kickoff: Date }[] = await tx.$queryRaw(Prisma.sql`
      SELECT STRAIGHT_JOIN f.id,f.kickoff ${sql.cohortJoins} ${sql.searchJoin}
      WHERE ${sql.cohortWhere} AND c.state='closed' ${after === null ? Prisma.empty : Prisma.sql`
        AND (f.kickoff>${after.kickoff} OR (f.kickoff=${after.kickoff} AND f.id>${after.fixtureId}))`}
      ORDER BY f.kickoff,f.id LIMIT ${batchSize}`);
    if (!candidates.length) break;
    const last = candidates.at(-1)!;
    if (!(last.kickoff instanceof Date)) throw new MatchFeedError("unavailable");
    after = { kickoff: last.kickoff, fixtureId: last.id };
    const ids = candidates.map((fixture) => fixture.id);
    const key = cache ? evidenceFingerprint({ contract: "feed-performance-batch-v1", query: cache.key, ids }) : null;
    const tags = ["global:catalog", ...new Set(candidates.map(fixture => `date:${getReportingDate(utcInstantFromEpochMilliseconds(fixture.kickoff.getTime()))}`))];
    let generations: Readonly<Record<string, string>> | null = null;
    if (key && cache) {
      try {
        // This is the same repeatable-read snapshot as the fixture/settlement
        // audit, never a nested pool transaction or process-local authority.
        generations = await readPublicCacheGenerations(tx, tags);
        const entry = await tx.publicResponseCache.findUnique({ where: { key } });
        const parsed = batchDeltaSchema.safeParse(entry?.body);
        if (entry && parsed.success && entry.createdAt.getTime() <= cache.nowMs && entry.expiresAt.getTime() > cache.nowMs
          && entry.expiresAt.getTime() - entry.createdAt.getTime() <= batchCacheLifetimeMs
          && evidenceFingerprint(entry.generations) === evidenceFingerprint(generations)
          && parsed.data.won + parsed.data.lost + parsed.data.void <= candidates.length
          && parsed.data.won + parsed.data.lost + parsed.data.void <= summary.pending) {
          applyDelta(summary, parsed.data);
          if (candidates.length < batchSize) break;
          continue;
        }
      } catch { generations = null; }
    }
    const delta: BatchDelta = { won: 0, lost: 0, void: 0 };
    const rows: Sample[] = await tx.$queryRaw<Sample[]>(Prisma.sql`SELECT STRAIGHT_JOIN r.*,f.kickoff AS fixtureKickoff,
      f.status AS fixtureStatus, f.regulationHome AS fixtureRegulationHome, f.regulationAway AS fixtureRegulationAway,
      f.regulationVerifiedAt AS fixtureRegulationVerifiedAt, f.regulationEvidenceRef AS fixtureRegulationEvidenceRef,
      c.lockedSetId AS currentLockedSetId, c.voidReason AS currentVoidReason, rs.resultId AS currentResultId, ls.issue,
      m.family AS currentFamily, ${sql.pickSelection} AS currentSelection, m.source AS currentSource, ${sql.pickProbability} AS currentProbability,
      m.selection AS storedSelection,m.selectedProbability AS storedProbability,
      m.payloadJson AS marketPayload, m.integrity=SHA2(CAST(m.payloadJson AS CHAR),256) AS marketValidIntegrity,
      r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity
      ${sql.joinsForFixtures(ids)} ${sql.searchJoin}
      JOIN MarketSettlement p ON p.fixtureId=f.id AND p.cycleId=c.id AND p.family=m.family
      JOIN MarketSettlementRevision r ON r.id=p.revisionId AND r.fixtureId=p.fixtureId AND r.cycleId=p.cycleId AND r.family=p.family
      LEFT JOIN FixtureResultState rs ON rs.fixtureId=f.id LEFT JOIN FixtureLifecycleState ls ON ls.fixtureId=f.id
      WHERE ${sql.where} AND f.id IN (${Prisma.join(ids)}) AND m.available=TRUE AND c.state='closed'
      ORDER BY f.kickoff,f.id`);
    const resultIds = [...new Set(rows.flatMap((row) => row.currentResultId ? [row.currentResultId] : []))];
    const resultRows = resultIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,
      r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity FROM FixtureResult r WHERE r.id IN (${Prisma.join(resultIds)})`) : [];
    const results = new Map(resultRows.map((row) => [String(row.id), fixtureResultFromRow(row)]));
    if (results.size !== resultIds.length) throw new MatchFeedError("unavailable");
    for (const row of rows) {
      const previous = settlementRevisionFromRow(row);
      assertHistorySeal(row.marketValidIntegrity);
      const payload = historyJson(row.marketPayload) as { available?: boolean; market?: Record<string, unknown> } | null;
      if (!isMarketFamily(row.currentFamily) || !isMarketSelection(row.currentFamily, row.currentSelection) ||
        !payload?.available || payload.market?.selection !== row.storedSelection || payload.market?.source !== row.currentSource ||
        payload.market?.selectedProbability !== row.storedProbability || payload.market?.family !== row.currentFamily ||
        (payload.market?.probabilities as Record<string, unknown> | undefined)?.[row.currentSelection] !== row.currentProbability ||
        previous.family !== row.currentFamily || previous.lockedSetId !== null && previous.lockedSetId !== row.currentLockedSetId) throw new MatchFeedError("unavailable");
      const fixture = { status: row.fixtureStatus, regulationHome: row.fixtureRegulationHome, regulationAway: row.fixtureRegulationAway,
        regulationVerifiedAt: row.fixtureRegulationVerifiedAt, regulationEvidenceRef: row.fixtureRegulationEvidenceRef };
      const cycle = { id: previous.cycleId, lockedSetId: row.currentLockedSetId, state: "closed" as const, voidReason: row.currentVoidReason };
      const result = row.currentResultId ? results.get(row.currentResultId)! : null;
      if (result && result.fixtureId !== previous.fixtureId) throw new MatchFeedError("unavailable");
      const market = { selection: row.storedSelection, source: row.currentSource, selectedProbability: row.storedProbability };
      const context = settlementContextFor(fixture, result, row.issue, cycle);
      const input = settlementInputFor(previous.fixtureId, cycle, row.currentFamily, market, result,
        fixtureResultMatchesCanonical(fixture, result, row.issue), context, previous);
      // A result/cycle correction makes the previous settlement pending until the worker records it.
      if (previous.inputHash !== evidenceFingerprint(input)) continue;
      const selectedStatus = row.currentSelection !== row.storedSelection && ["correct", "incorrect"].includes(previous.status)
        && result?.regulation.verified && result.regulation.home !== null && result.regulation.away !== null
        ? selectionOccurred(row.currentSelection, result.regulation.home, result.regulation.away) ? "correct" : "incorrect" : previous.status;
      const status = selectedStatus === "correct" ? "won" : selectedStatus === "incorrect" ? "lost" : selectedStatus;
      if (status === "won" || status === "lost" || status === "void") delta[status]++;
    }
    applyDelta(summary, delta);
    if (key && cache && generations) {
      // Generation stamps invalidate even a late fill if a source write commits
      // while this snapshot is auditing. Only audited counts are cached; source
      // clocks, current prices and viewer projections keep their ordinary policy.
      try {
        const data = { generations: { ...generations }, body: delta, createdAt: new Date(cache.nowMs),
          expiresAt: new Date(cache.nowMs + batchCacheLifetimeMs) };
        await tx.publicResponseCache.upsert({ where: { key }, create: { key, ...data }, update: data });
      } catch { /* A disposable aggregate cache cannot fail an authoritative audit. */ }
    }
    if (candidates.length < batchSize) break;
  }
  return summary;
}

function applyDelta(summary: Summary, delta: BatchDelta): void {
  const completed = delta.won + delta.lost + delta.void;
  if (completed > summary.pending) throw new MatchFeedError("unavailable");
  summary.pending -= completed;
  summary.won += delta.won; summary.lost += delta.lost; summary.void += delta.void;
}
