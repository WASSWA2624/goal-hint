import "server-only";

import { feedMarketPickIdentity } from "../../domain/feed-market-picks.ts";
import { isMarketFamily } from "../../domain/markets.ts";
import { settleGoalSelection, type GoalSettlement } from "../../domain/score-distribution-markets.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { StoredCycle } from "../predictions/history-contract.ts";
import type { HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical, type StoredFixtureResult } from "../results/result-read.ts";
import { settlementContextFor, type SettlementFixture } from "../settlement/settlement-read.ts";

export type FeaturedSettlementPick = Readonly<{ key: string; selection: string }>;
type FixtureFacts = SettlementFixture & Readonly<{ fixtureId: string; kickoff: Date | null;
  issue: string | null; resultId: string | null; cycleState: StoredCycle["state"] | null; voidReason: StoredCycle["voidReason"] }>;

/** Resolve the same canonical market and outcome the view chose, including period, team scope and payout terms. */
export function settleFeaturedPick(pick: FeaturedSettlementPick, fixture: FixtureFacts, result: StoredFixtureResult | null): GoalSettlement {
  const identity = feedMarketPickIdentity(isMarketFamily(pick.key) ? `${pick.key}:${pick.selection}` : `${pick.key}~${pick.selection}`);
  const verified = result !== null && result.fixtureId === fixture.fixtureId && fixture.kickoff !== null &&
    result.observedAt > fixture.kickoff.getTime() && fixtureResultMatchesCanonical(fixture, result, fixture.issue) ? result : null;
  const context = settlementContextFor(fixture, verified, fixture.issue,
    { state: fixture.cycleState ?? "closed", voidReason: fixture.voidReason });
  const half = verified?.halfTime;
  return settleGoalSelection(identity?.definition, identity?.selection ?? pick.selection,
    { ...context, halfTimeScore: half ? { verified: half.verified, period: half.period, home: half.home, away: half.away } : null });
}

/** Read the canonical result pointers once per bounded batch. Archived proposal or settlement rows are not modified. */
export async function readFeaturedSettlements(tx: Prisma.TransactionClient,
  picks: ReadonlyMap<string, FeaturedSettlementPick>): Promise<ReadonlyMap<string, GoalSettlement>> {
  if (!picks.size) return new Map();
  const facts = await tx.$queryRaw<FixtureFacts[]>(Prisma.sql`SELECT f.id AS fixtureId,f.kickoff,f.status,
    f.regulationHome,f.regulationAway,f.regulationVerifiedAt,f.regulationEvidenceRef,
    c.state AS cycleState,c.voidReason,life.issue,resultState.resultId
    FROM FootballFixture f LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
    LEFT JOIN FixtureLifecycleState life ON life.fixtureId=f.id LEFT JOIN FixtureResultState resultState ON resultState.fixtureId=f.id
    WHERE f.id IN (${Prisma.join([...picks.keys()])})`);
  const ids = [...new Set(facts.flatMap(({ resultId }) => resultId ? [resultId] : []))];
  const rows = ids.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,SHA2(CAST(body AS CHAR),256)=integrity AS validIntegrity
    FROM FixtureResult r WHERE r.id IN (${Prisma.join(ids)})`) : [];
  const results = new Map(rows.map((row) => [String(row.id), fixtureResultFromRow(row)]));
  return new Map(facts.map((fixture) => [fixture.fixtureId, settleFeaturedPick(picks.get(fixture.fixtureId)!, fixture,
    fixture.resultId ? results.get(fixture.resultId) ?? null : null)]));
}
