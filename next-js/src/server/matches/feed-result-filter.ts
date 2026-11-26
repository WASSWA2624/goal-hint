import "server-only";

import { isPlayedFinalStatus, playedFinalFixtureStatuses, type SettlementStatus } from "../../domain/market-settlement.ts";
import type { PredictionResult } from "../../domain/performance-summary.ts";
import type { GoalSettlement } from "../../domain/score-distribution-markets.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { readNovemberReplayProjectionPicks, readNovemberReplayProjections } from "../intelligence/november-replay-store.ts";
import { readFeaturedSettlements, type FeaturedSettlementPick } from "./featured-settlement.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readFeedPerformance, restrictFeedResultSql, type FeedResultOverrides } from "./feed-performance.ts";
import type { feedSql } from "./feed-read.ts";
import { readFrozenLocalFeaturedPicks } from "./frozen-featured-picks.ts";

export { adjustPerformanceAvailability } from "./feed-performance.ts";

type Result = PredictionResult | "unavailable";
type OutcomeRow = { id: string; kickoff: Date; cycleState: string | null; fixtureStatus: SettlementStatus; legacyAvailable: unknown;
  hasLocal: unknown; hasFrozen: unknown; hasReplay: unknown; occurrenceVoid: unknown;
  marketKey: string | null; selection: string | null; publishedRevisionId: string | null };

export function displayedFeedResult(settlement: GoalSettlement | undefined, canceled: boolean): Result {
  switch (settlement?.status) {
    case "correct":
    case "half-win": return "won";
    case "incorrect":
    case "half-loss": return "lost";
    case "push": return "void";
    case "void": return canceled ? "cancelled" : "void";
    case "pending": return "pending";
    default: return "unavailable";
  }
}

function initialFeedOutcome(cycleState: string | null, status: string): PredictionResult {
  return cycleState === "void" ? status === "canceled" ? "cancelled" : "void" : "pending";
}

/** Match the default replay/frozen decision or the explicitly projected search pick before pagination. */
export async function readFeedResultOverrides(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>, options: Readonly<{
  publishedForecasts: boolean; useDefaultFeatured: boolean; includeSettlements?: boolean;
}>): Promise<FeedResultOverrides> {
  const overrides = new Map<string, { baseline: Result; result: Result; hasPrediction: boolean }>();
  const defaults = options.publishedForecasts && options.useDefaultFeatured;
  if (!defaults && (!sql.projectPick || options.useDefaultFeatured)) return overrides;
  const local = Prisma.sql`EXISTS (SELECT 1 FROM MarketPrediction localMarket
    WHERE localMarket.setId=rp.id AND localMarket.available=TRUE AND localMarket.source='local-engine')`;
  const sidecar = Prisma.sql`EXISTS (SELECT 1 FROM PredictionCycleOperation closeOp WHERE closeOp.cycleId=c.id
    AND closeOp.fixtureId=f.id AND closeOp.kind='close' AND closeOp.revisionId=rp.id AND closeOp.featuredDecisionJson IS NOT NULL)`;
  const replayPointer = Prisma.sql`EXISTS (SELECT 1 FROM NovemberReplayProjection pointer WHERE pointer.fixtureId=f.id
    AND pointer.revisionId IS NOT NULL AND pointer.kickoffAt=f.kickoff)`;
  const occurrenceVoid = Prisma.sql`(c.state='void' AND f.status IN ('canceled','abandoned','awarded')
    AND c.voidReason=CONCAT('fixture-', f.status))`;
  const eligible = defaults ? Prisma.sql`((f.status IN ('live',${Prisma.join(playedFinalFixtureStatuses)}) AND
      (${local} OR ${sidecar} OR ${replayPointer}))
    OR (${sidecar} AND (f.status='scheduled' AND c.state='closed' OR ${occurrenceVoid})))` : sql.displayUsesProjection;
  let after: Pick<OutcomeRow, "id" | "kickoff"> | null = null;
  for (;;) {
    const rows: OutcomeRow[] = await tx.$queryRaw(Prisma.sql`SELECT STRAIGHT_JOIN f.id,f.kickoff,c.state AS cycleState,f.status AS fixtureStatus,
      rp.id AS publishedRevisionId,IF(${sql.pickAvailable},TRUE,FALSE) AS legacyAvailable,
      ${defaults ? local : Prisma.sql`FALSE`} AS hasLocal, ${defaults ? sidecar : Prisma.sql`FALSE`} AS hasFrozen,
      ${defaults ? replayPointer : Prisma.sql`FALSE`} AS hasReplay,
      ${defaults ? occurrenceVoid : Prisma.sql`FALSE`} AS occurrenceVoid,
      ${defaults ? Prisma.sql`NULL AS marketKey,NULL AS selection` : Prisma.sql`feedPick.marketKey,feedPick.selection`}
      ${sql.countJoins} ${sql.searchJoin} WHERE ${sql.where} AND f.kickoff IS NOT NULL AND ${eligible}
      ${after ? Prisma.sql`AND f.kickoff>=${after.kickoff} AND (f.kickoff>${after.kickoff} OR f.id>${after.id})` : Prisma.empty}
      ORDER BY f.kickoff,f.id LIMIT 500`);
    if (!rows.length) break;
    const played = (status: SettlementStatus) => status === "live" || isPlayedFinalStatus(status);
    const replayIds = defaults ? rows.filter(({ hasReplay, fixtureStatus, publishedRevisionId, cycleState }) =>
      Boolean(hasReplay) && played(fixtureStatus) && (!publishedRevisionId || cycleState === "closed")).map(({ id }) => id) : [];
    // List membership needs the sealed replay choice. Page hydration still validates the display markets.
    const replay = options.includeSettlements === false ? await readNovemberReplayProjectionPicks(tx, replayIds)
      : await readNovemberReplayProjections(tx, replayIds);
    const frozen = defaults ? await readFrozenLocalFeaturedPicks(tx, rows.filter(
      ({ id, fixtureStatus, cycleState, publishedRevisionId, hasFrozen, occurrenceVoid }) =>
        !replay.has(id) && Boolean(hasFrozen) && publishedRevisionId && (Boolean(occurrenceVoid) ||
        cycleState === "closed" && (fixtureStatus === "scheduled" || played(fixtureStatus)))).map(({ id }) => id)) : null;
    const picks = new Map<string, FeaturedSettlementPick>();
    const affected: OutcomeRow[] = [];
    for (const row of rows) {
      if (!(row.kickoff instanceof Date) || overrides.has(row.id)) throw new MatchFeedError("unavailable");
      const projected = replay.get(row.id), frozenPick = frozen?.get(row.id);
      const shown = defaults ? projected?.selected ?? (frozenPick && frozenPick.status !== "abstained" ? frozenPick : null)
        : row.marketKey !== null && row.selection !== null ? { marketKey: row.marketKey, selection: row.selection } : null;
      if (defaults && !projected && !frozenPick && !(row.hasLocal && played(row.fixtureStatus))) continue;
      affected.push(row);
      if (shown) picks.set(row.id, { key: shown.marketKey, selection: shown.selection });
    }
    const settlements = options.includeSettlements === false ? null : await readFeaturedSettlements(tx, picks);
    for (const row of affected) {
      const hasPrediction = picks.has(row.id);
      const initial = initialFeedOutcome(row.cycleState, row.fixtureStatus);
      const result = settlements ? displayedFeedResult(settlements.get(row.id), row.fixtureStatus === "canceled")
        : hasPrediction ? initial : "unavailable";
      overrides.set(row.id, { baseline: row.legacyAvailable ? initial : "unavailable", result, hasPrediction });
    }
    if (rows.length < 500) break;
    after = rows.at(-1)!;
  }
  return overrides;
}

export function resultOverridesFor(overrides: FeedResultOverrides, result: PredictionResult | null | undefined): FeedResultOverrides {
  return result ? new Map([...overrides].filter(([, outcome]) => outcome.result === result)) : overrides;
}

/** Resolve membership from the same selected-pick audit as the summary, before count and pagination.
 * Open or corrected settlements stay pending. Scores/status alone never manufacture a win or loss. */
export async function filterFeedResult(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>, result: PredictionResult,
  audit = readFeedPerformance, overrides: FeedResultOverrides = new Map()) {
  const legacy = restrictFeedResultSql(sql, [...overrides.keys()], false);
  const outcomes = new Map<string, PredictionResult>();
  let after: { id: string; kickoff: Date } | null = null;
  for (;;) {
    const rows: { id: string; kickoff: Date; cycleState: string; fixtureStatus: string }[] = await tx.$queryRaw(Prisma.sql`
      SELECT STRAIGHT_JOIN f.id,f.kickoff,c.state AS cycleState,f.status AS fixtureStatus
      ${legacy.countJoins} ${legacy.searchJoin} WHERE ${legacy.where} AND ${legacy.pickAvailable}
      ${after ? Prisma.sql`AND (f.kickoff>${after.kickoff} OR (f.kickoff=${after.kickoff} AND f.id>${after.id}))` : Prisma.empty}
      ORDER BY f.kickoff,f.id LIMIT 500`);
    for (const row of rows) {
      if (!(row.kickoff instanceof Date) || outcomes.has(row.id)) throw new MatchFeedError("unavailable");
      outcomes.set(row.id, initialFeedOutcome(row.cycleState, row.fixtureStatus));
    }
    if (rows.length < 500) break;
    after = rows.at(-1)!;
  }
  const counts = { total: outcomes.size, available: outcomes.size, void: 0, cancelled: 0 };
  for (const outcome of outcomes.values()) {
    if (outcome === "void" || outcome === "cancelled") counts[outcome]++;
  }
  await audit(tx, legacy, counts, undefined, (id, outcome) => {
    if (!outcomes.has(id)) throw new MatchFeedError("unavailable");
    outcomes.set(id, outcome);
  });
  const ids = [
    ...[...outcomes].flatMap(([id, outcome]) => outcome === result ? [id] : []),
    ...[...overrides].flatMap(([id, outcome]) => outcome.result === result ? [id] : []),
  ];
  return restrictFeedResultSql(sql, ids, true);
}
