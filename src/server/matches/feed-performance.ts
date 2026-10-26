import "server-only";

import type { z } from "zod";
import type { feedPerformanceSchema } from "../../domain/match-feed.ts";
import { isMarketFamily, isMarketSelection, type MarketFamily, type MarketSelection } from "../../domain/markets.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { assertHistorySeal, historyJson, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical } from "../results/result-read.ts";
import { settlementContextFor, settlementInputFor, settlementRevisionFromRow, type SettlementFixture } from "../settlement/settlement-read.ts";
import type { feedSql } from "./feed-read.ts";
import { MatchFeedError } from "./feed-error.ts";

type Summary = z.infer<typeof feedPerformanceSchema>;
type Sample = HistoryRow & Readonly<{
  fixtureStatus: SettlementFixture["status"]; fixtureRegulationHome: number | null; fixtureRegulationAway: number | null;
  fixtureRegulationVerifiedAt: Date | null; fixtureRegulationEvidenceRef: string | null;
  currentLockedSetId: string; currentVoidReason: string | null; currentResultId: string | null; issue: string | null;
  currentFamily: MarketFamily; currentSelection: MarketSelection; currentSource: "ai" | "api-football"; currentProbability: number;
  marketPayload: unknown; marketValidIntegrity: unknown;
}>;

/** Counts the entire filtered cohort. Only closed predictions with recorded settlements need audit reads;
 * open picks are pending, missing picks unavailable, and void cycles stay distinct from losses.
 * Keyset batches bound memory without limiting the reporting period or using the visible page. */
export async function readFeedPerformance(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>,
  counts: Readonly<{ total: number; available: number; void: number }>): Promise<Summary> {
  const summary: Summary = { total: counts.total, won: 0, lost: 0, pending: counts.available - counts.void,
    void: counts.void, unavailable: counts.total - counts.available };
  if (summary.pending === 0) return summary;
  const batchSize = 500;
  let after: string | null = null;
  for (;;) {
    const rows: Sample[] = await tx.$queryRaw<Sample[]>(Prisma.sql`SELECT r.*,
      f.status AS fixtureStatus, f.regulationHome AS fixtureRegulationHome, f.regulationAway AS fixtureRegulationAway,
      f.regulationVerifiedAt AS fixtureRegulationVerifiedAt, f.regulationEvidenceRef AS fixtureRegulationEvidenceRef,
      c.lockedSetId AS currentLockedSetId, c.voidReason AS currentVoidReason, rs.resultId AS currentResultId, ls.issue,
      m.family AS currentFamily, m.selection AS currentSelection, m.source AS currentSource, m.selectedProbability AS currentProbability,
      m.payloadJson AS marketPayload, m.integrity=SHA2(CAST(m.payloadJson AS CHAR),256) AS marketValidIntegrity,
      r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity
      ${sql.joins} ${sql.searchJoin}
      JOIN MarketSettlement p ON p.fixtureId=f.id AND p.cycleId=c.id AND p.family=m.family
      JOIN MarketSettlementRevision r ON r.id=p.revisionId AND r.fixtureId=p.fixtureId AND r.cycleId=p.cycleId AND r.family=p.family
      LEFT JOIN FixtureResultState rs ON rs.fixtureId=f.id LEFT JOIN FixtureLifecycleState ls ON ls.fixtureId=f.id
      WHERE ${sql.where} AND m.available=TRUE AND c.state='closed' ${after === null ? Prisma.empty : Prisma.sql`AND f.id>${after}`}
      ORDER BY f.id LIMIT ${batchSize}`);
    if (rows.length === 0) break;
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
        !payload?.available || payload.market?.selection !== row.currentSelection || payload.market?.source !== row.currentSource ||
        payload.market?.selectedProbability !== row.currentProbability || payload.market?.family !== row.currentFamily ||
        previous.family !== row.currentFamily || previous.lockedSetId !== null && previous.lockedSetId !== row.currentLockedSetId) throw new MatchFeedError("unavailable");
      const fixture = { status: row.fixtureStatus, regulationHome: row.fixtureRegulationHome, regulationAway: row.fixtureRegulationAway,
        regulationVerifiedAt: row.fixtureRegulationVerifiedAt, regulationEvidenceRef: row.fixtureRegulationEvidenceRef };
      const cycle = { id: previous.cycleId, lockedSetId: row.currentLockedSetId, state: "closed" as const, voidReason: row.currentVoidReason };
      const result = row.currentResultId ? results.get(row.currentResultId)! : null;
      if (result && result.fixtureId !== previous.fixtureId) throw new MatchFeedError("unavailable");
      const market = { selection: row.currentSelection, source: row.currentSource, selectedProbability: row.currentProbability };
      const context = settlementContextFor(fixture, result, row.issue, cycle);
      const input = settlementInputFor(previous.fixtureId, cycle, row.currentFamily, market, result,
        fixtureResultMatchesCanonical(fixture, result, row.issue), context, previous);
      // A result/cycle correction makes the previous settlement pending until the worker records it.
      if (previous.inputHash !== evidenceFingerprint(input)) continue;
      const status = previous.status === "correct" ? "won" : previous.status === "incorrect" ? "lost" : previous.status;
      if (status === "won" || status === "lost" || status === "void") { summary.pending--; summary[status]++; }
    }
    after = String(rows.at(-1)!.fixtureId);
    if (rows.length < batchSize) break;
  }
  return summary;
}
