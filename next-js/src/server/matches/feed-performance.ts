import "server-only";

import { z } from "zod";
import type { PredictionResult } from "../../domain/performance-summary.ts";
import type { feedPerformanceSchema } from "../../domain/match-feed.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { MARKET_RULE_VERSION, isMarketFamily, isMarketSelection, type MarketFamily, type MarketSelection, type MarketSource } from "../../domain/markets.ts";
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
type PerformanceCounts = Readonly<{ total: number; available: number; void: number; cancelled?: number }>;
type Result = PredictionResult | "unavailable";
export type FeedResultOverrides = ReadonlyMap<string, Readonly<{ baseline: Result; result: Result; hasPrediction: boolean }>>;
const batchSize = 500, batchCacheLifetimeMs = 6 * 60 * 60 * 1000;
const batchDeltaSchema = z.strictObject({ won: z.number().int().min(0).max(batchSize), lost: z.number().int().min(0).max(batchSize),
  void: z.number().int().min(0).max(batchSize), cancelled: z.number().int().min(0).max(batchSize).default(0) })
  .refine(value => value.won + value.lost + value.void + value.cancelled <= batchSize);
type BatchDelta = z.infer<typeof batchDeltaSchema>;
type SummaryCacheContext = Readonly<{ key: string; nowMs: number }>;

/** Equivalent URL/date/zone spellings share statistics only when the resolved
 * SQL cohort, filters and pick-ranking rules are exactly the same. */
export function feedPerformanceCacheKey(sql: ReturnType<typeof feedSql>, locale: string, providerOdds: boolean): string {
  const statement = (value: Prisma.Sql) => ({ text: value.sql, values: value.values.map(item => item instanceof Date ? item.getTime() : item) });
  return evidenceFingerprint({ contract: "feed-performance-query-v4", locale, providerOdds, ruleVersion: MARKET_RULE_VERSION,
    joins: statement(sql.joins), where: statement(sql.where) });
}
type Sample = HistoryRow & Readonly<{
  fixtureKickoff: Date;
  fixtureStatus: SettlementFixture["status"]; fixtureRegulationHome: number | null; fixtureRegulationAway: number | null;
  fixtureRegulationVerifiedAt: Date | null; fixtureRegulationEvidenceRef: string | null;
  currentLockedSetId: string; currentVoidReason: string | null; currentResultId: string | null; issue: string | null;
  currentFamily: MarketFamily; currentSelection: MarketSelection; currentSource: MarketSource; currentProbability: number;
  storedSelection: MarketSelection; storedProbability: number;
  marketPayload: unknown; marketValidIntegrity: unknown;
}>;

function feedFixtureMembership(ids: readonly string[], include: boolean) {
  return ids.length ? Prisma.sql`f.id ${include ? Prisma.empty : Prisma.sql`NOT`} IN (
    SELECT matched.id FROM JSON_TABLE(${JSON.stringify(ids)}, '$[*]' COLUMNS (id VARCHAR(128) PATH '$')) AS matched)` : Prisma.sql`FALSE`;
}

export function restrictFeedResultSql(sql: ReturnType<typeof feedSql>, ids: readonly string[], include: boolean) {
  if (ids.length === 0 && !include) return sql;
  const membership = feedFixtureMembership(ids, include);
  return { ...sql, where: Prisma.sql`${sql.where} AND ${membership}`, cohortWhere: Prisma.sql`${sql.cohortWhere} AND ${membership}` };
}

/** A replay can supply a published pick without a core forecast. A frozen decision can also abstain. */
export function restrictFeedPredictionSql(sql: ReturnType<typeof feedSql>, overrides: FeedResultOverrides) {
  const added = [], excluded = [];
  for (const [id, { baseline, hasPrediction }] of overrides) {
    if (!hasPrediction) excluded.push(id);
    else if (baseline === "unavailable") added.push(id);
  }
  const available = added.length ? Prisma.sql`(${sql.displayAvailable} OR ${feedFixtureMembership(added, true)})` : sql.displayAvailable;
  return restrictFeedResultSql({ ...sql, where: Prisma.sql`${sql.where} AND ${available}`,
    pageJoins: sql.pageJoins === sql.cohortJoins ? sql.countJoins : sql.pageJoins }, excluded, false);
}

export function adjustPerformanceAvailability(available: number, overrides: FeedResultOverrides) {
  for (const { baseline, result } of overrides.values())
    available += Number(result !== "unavailable") - Number(baseline !== "unavailable");
  return available;
}

/** Counts the entire filtered cohort. Only closed predictions with recorded settlements need audit reads;
 * open picks are pending, missing picks unavailable, and void cycles stay distinct from losses.
 * Keyset batches bound memory without limiting the reporting period or using the visible page. */
export async function readFeedPerformance(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>,
  counts: PerformanceCounts, cache?: SummaryCacheContext, onSettled?: (fixtureId: string, result: PredictionResult) => void,
  overrides?: FeedResultOverrides): Promise<Summary> {
  if (!overrides?.size) return readArchivedFeedPerformance(tx, sql, counts, cache, onSettled);
  let available = counts.available, voided = counts.void, cancelled = counts.cancelled;
  for (const { baseline } of overrides.values()) {
    if (baseline !== "unavailable") available--;
    if (baseline === "void" || baseline === "cancelled" && cancelled === undefined) voided--;
    else if (baseline === "cancelled" && cancelled !== undefined) cancelled--;
  }
  const ids = [...overrides.keys()].sort(), total = counts.total - ids.length;
  if (available < 0 || available > total || voided < 0 || (cancelled ?? 0) < 0 || voided + (cancelled ?? 0) > available)
    throw new MatchFeedError("unavailable");
  const remaining = { total, available, void: voided, ...(cancelled !== undefined && { cancelled }) };
  const summary = await readArchivedFeedPerformance(tx, restrictFeedResultSql(sql, ids, false), remaining,
    cache ? { ...cache, key: evidenceFingerprint({ query: cache.key, excludedFixtures: ids }) } : undefined, onSettled);
  summary.total += ids.length;
  for (const [id, { result }] of overrides) {
    if (result !== "unavailable" && result !== "pending") onSettled?.(id, result);
    if (result === "cancelled") {
      if (summary.cancelled === undefined) summary.void++;
      else summary.cancelled++;
    } else summary[result]++;
  }
  return summary;
}

async function readArchivedFeedPerformance(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>,
  counts: PerformanceCounts, cache?: SummaryCacheContext, onSettled?: (fixtureId: string, result: PredictionResult) => void): Promise<Summary> {
  const summary: Summary = { total: counts.total, won: 0, lost: 0, pending: counts.available - counts.void - (counts.cancelled ?? 0),
    ...(counts.cancelled === undefined ? {} : { cancelled: counts.cancelled }),
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
    const key = cache && !onSettled ? evidenceFingerprint({ contract: "feed-performance-batch-v3", splitCancelled: counts.cancelled !== undefined, query: cache.key, ids }) : null;
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
          && parsed.data.won + parsed.data.lost + parsed.data.void + parsed.data.cancelled <= candidates.length
          && parsed.data.won + parsed.data.lost + parsed.data.void + parsed.data.cancelled <= summary.pending) {
          applyDelta(summary, parsed.data);
          if (candidates.length < batchSize) break;
          continue;
        }
      } catch { generations = null; }
    }
    const delta: BatchDelta = { won: 0, lost: 0, void: 0, cancelled: 0 };
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
      WHERE ${sql.where} AND f.id IN (${Prisma.join(ids)}) AND ${sql.pickAvailable} AND c.state='closed'
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
      if (status === "won" || status === "lost" || status === "void") onSettled?.(String(row.fixtureId),
        status === "void" && row.fixtureStatus === "canceled" ? "cancelled" : status);
      if (status === "void" && row.fixtureStatus === "canceled" && counts.cancelled !== undefined) delta.cancelled++;
      else if (status === "won" || status === "lost" || status === "void") delta[status]++;
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
  const completed = delta.won + delta.lost + delta.void + delta.cancelled;
  if (delta.cancelled && summary.cancelled === undefined) throw new MatchFeedError("unavailable");
  if (completed > summary.pending) throw new MatchFeedError("unavailable");
  summary.pending -= completed;
  summary.won += delta.won; summary.lost += delta.lost; summary.void += delta.void;
  if (summary.cancelled !== undefined) summary.cancelled += delta.cancelled;
}
