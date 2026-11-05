import "server-only";

import { MARKET_RULE_VERSION, marketSelections, type AcceptedMarket, type MarketFamily } from "../../domain/markets.ts";
import { settleMarketSelection, type CycleEligibility, type SettlementContext } from "../../domain/market-settlement.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma, type FootballFixture } from "../generated/prisma/client.ts";
import { historyFail, type StoredCycle, type StoredRevision } from "../predictions/history-contract.ts";
import { assertHistorySeal, historyJson, historyTime, storedCycles, storedRevisions, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultMatchesCanonical, resultStatus, storedFixtureResult, type StoredFixtureResult } from "../results/result-read.ts";
import { settlementRevisionSchema, type SettlementRevision } from "./settlement-contract.ts";

type Tx = Prisma.TransactionClient;
const families = Object.keys(marketSelections) as MarketFamily[];
export async function storedSettlementRevision(tx: Tx, id: string): Promise<SettlementRevision> {
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity FROM MarketSettlementRevision WHERE id = ${id}`;
  if (!row || row.id !== id) return historyFail("invalid-state");
  return settlementRevisionFromRow(row);
}
export function settlementRevisionFromRow(row: HistoryRow): SettlementRevision {
  assertHistorySeal(row.validIntegrity);
  const parsed = settlementRevisionSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const v = parsed.data;
  if (v.id !== row.id || v.fixtureId !== row.fixtureId || v.cycleId !== row.cycleId || v.family !== row.family || v.batchId !== row.batchId ||
    v.previousId !== row.previousId || v.resultId !== row.resultId || v.lockedSetId !== row.lockedSetId || v.inputHash !== row.inputHash || v.at !== historyTime(row.at)) return historyFail("invalid-state");
  const { fixtureId, cycleId, family, ruleVersion, lockedSetId, selection, source, selectedProbability,
    resultId, resultUsable, status, reason, cycleState, voidReason } = v;
  if (evidenceFingerprint({ fixtureId, cycleId, family, ruleVersion, lockedSetId, selection, source, selectedProbability,
    resultId, resultUsable, status, reason, cycleState, voidReason }) !== v.inputHash) return historyFail("invalid-state");
  return freezeEvidence(v);
}

export async function storedSettlementProjection(tx: Tx, fixtureId: string, cycleId?: string) {
  const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } });
  const cursor = await tx.fixtureLifecycleState.findUnique({ where: { fixtureId } });
  const resultState = await tx.fixtureResultState.findUnique({ where: { fixtureId } });
  const result = resultState?.resultId ? await storedFixtureResult(tx, fixtureId, resultState.resultId) : null;
  const rows = await tx.predictionCycle.findMany({ where: { fixtureId, ...(cycleId ? { id: cycleId } : {}) }, orderBy: { ordinal: "asc" }, select: { id: true } });
  const cycles = [];
  // Hydrate a bounded group within the caller's snapshot. A settled cycle has
  // four immutable market revisions; reading each separately adds four serial
  // round trips to every card/detail projection and every historical cycle.
  for (let offset = 0; offset < rows.length; offset += 100) {
    const ids = rows.slice(offset, offset + 100).map((row) => row.id);
    const stored = await storedCycles(tx, ids);
    const locks = await storedRevisions(tx, [...stored.values()].flatMap((cycle) => cycle.lockedSetId ? [cycle.lockedSetId] : []));
    const pointers = await tx.marketSettlement.findMany({ where: { cycleId: { in: ids } } });
    const revisions = new Map<string, SettlementRevision>();
    const revisionIds = [...new Set(pointers.map((pointer) => pointer.revisionId))];
    for (let start = 0; start < revisionIds.length; start += 100) {
      const requested = new Set(revisionIds.slice(start, start + 100));
      const records = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
        integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM MarketSettlementRevision WHERE id IN (${Prisma.join([...requested])})`);
      for (const record of records) {
        const revision = settlementRevisionFromRow(record);
        if (!requested.has(revision.id) || revisions.has(revision.id)) return historyFail("invalid-state");
        revisions.set(revision.id, revision);
      }
    }
    const byCycle = new Map<string, Map<MarketFamily, SettlementRevision>>();
    for (const pointer of pointers) {
      const revision = revisions.get(pointer.revisionId);
      if (!stored.has(pointer.cycleId) || !revision) return historyFail("invalid-state");
      const previous = byCycle.get(pointer.cycleId) ?? new Map<MarketFamily, SettlementRevision>();
      previous.set(pointer.family as MarketFamily, revision); byCycle.set(pointer.cycleId, previous);
    }
    for (const id of ids) {
      const cycle = stored.get(id);
      if (!cycle) return historyFail("invalid-state");
      const lock = cycle.lockedSetId ? locks.get(cycle.lockedSetId) ?? null : null;
      cycles.push(projectSettlementCycle(fixture, result, cursor?.issue ?? null, cycle, lock, byCycle.get(id) ?? new Map()));
    }
  }
  return { fixture, result, cycles };
}

export type SettlementProjectionReader = (fixtureId: string, cycleId?: string) => ReturnType<typeof storedSettlementProjection>;

/** Share verified projections only inside one read-only transaction. Create a
 * fresh reader for each snapshot; a writer must read again after mutations. */
export function createSettlementProjectionReader(tx: Tx): SettlementProjectionReader {
  const pending = new Map<string, ReturnType<typeof storedSettlementProjection>>();
  return (fixtureId, cycleId) => {
    const key = JSON.stringify([fixtureId, cycleId ?? null]);
    let projection = pending.get(key);
    if (!projection) {
      projection = storedSettlementProjection(tx, fixtureId, cycleId).then((value) => {
        if (value.fixture.id !== fixtureId || value.cycles.some(({ cycle }) => cycle.fixtureId !== fixtureId ||
          cycleId !== undefined && cycle.id !== cycleId)) return historyFail("invalid-state");
        return value;
      }).catch((error: unknown) => {
        pending.delete(key);
        throw error;
      });
      pending.set(key, projection);
    }
    return projection;
  };
}

/** Shared void-reason eligibility for the four-family, goal-market and market-implied settlement paths. */
export function cycleEligibilityFor(cycle: Pick<StoredCycle, "state" | "voidReason">): CycleEligibility {
  return cycle.state !== "void" ? { eligible: true } : { eligible: false,
    reason: cycle.voidReason === "formal-postponement" ? "postponed-cycle"
      : cycle.voidReason === "locked-cutoff-invalidated" ? "cutoff-invalidated" : "ineligible-cycle" };
}

/** The one settlement context every market of a cycle is graded against: an open lifecycle issue leaves a live cycle
 * unknown, and only a verified regulation score that matches the canonical fixture can settle. */
export type SettlementFixture = Pick<FootballFixture, "status" | "regulationHome" | "regulationAway" | "regulationVerifiedAt" | "regulationEvidenceRef">;
export function settlementContextFor(fixture: SettlementFixture, result: StoredFixtureResult | null, issue: string | null,
  cycle: Pick<StoredCycle, "state" | "voidReason">): SettlementContext {
  const status = resultStatus.parse(fixture.status), resultUsable = fixtureResultMatchesCanonical(fixture, result, issue);
  return { status: issue && cycle.state !== "void" ? "unknown" : status, cycleEligibility: cycleEligibilityFor(cycle),
    regulationScore: resultUsable && result?.regulation.verified ? { verified: true,
      period: "regulation-including-stoppage-time", home: result.regulation.home!, away: result.regulation.away! } : null };
}

/** The audited input identity shared by complete cycle reads and the feed's compact cohort summary. */
export function settlementInputFor(fixtureId: string, cycle: Pick<StoredCycle, "id" | "lockedSetId" | "state" | "voidReason">,
  family: MarketFamily, market: Pick<AcceptedMarket, "selection" | "source" | "selectedProbability"> | null,
  result: StoredFixtureResult | null, resultUsable: boolean, context: SettlementContext,
  previous: SettlementRevision | null, missingReason: string | null = null) {
  const outcome = settleMarketSelection(family, market?.selection ?? null, context);
  const historicalVoid = previous?.cycleState === "void" && cycle.state === "void";
  return { fixtureId, cycleId: cycle.id, family, ruleVersion: MARKET_RULE_VERSION, lockedSetId: cycle.lockedSetId,
    selection: market?.selection ?? null, source: market?.source ?? null, selectedProbability: market?.selectedProbability ?? null,
    resultId: historicalVoid ? previous.resultId : market ? result?.id ?? null : null,
    resultUsable: historicalVoid ? previous.resultUsable : market ? resultUsable : false,
    status: outcome.status, reason: missingReason ?? outcome.reason, cycleState: cycle.state, voidReason: cycle.voidReason } as const;
}

/** Shared audit projection for individual reads and bounded reporting batches. */
export function projectSettlementCycle(fixture: FootballFixture, result: StoredFixtureResult | null, issue: string | null,
  cycle: StoredCycle, lock: StoredRevision | null, recorded: ReadonlyMap<MarketFamily, SettlementRevision>) {
  const fixtureId = fixture.id, context = settlementContextFor(fixture, result, issue, cycle);
  const resultUsable = fixtureResultMatchesCanonical(fixture, result, issue);
  if (cycle.fixtureId !== fixtureId || cycle.lockedSetId !== (lock?.id ?? null) ||
    lock && (lock.cycleId !== cycle.id || lock.fixtureId !== fixtureId)) return historyFail("invalid-state");
  const markets = [];
  for (const family of families) {
    const item = lock?.candidate.markets[family];
    const market = item?.available ? item.market : null;
    const previous = recorded.get(family) ?? null;
    const missingReason = !lock ? cycle.state === "open" ? "awaiting-locked-selection" : "no-locked-selection"
      : item && !item.available ? item.reason : null;
    const base = settlementInputFor(fixtureId, cycle, family, market, result, resultUsable, context, previous, missingReason);
    if (previous && (previous.fixtureId !== fixtureId || previous.cycleId !== cycle.id || previous.family !== family ||
      previous.lockedSetId !== null && previous.lockedSetId !== cycle.lockedSetId)) return historyFail("invalid-state");
    markets.push({ base, inputHash: evidenceFingerprint(base), previous });
  }
  return { cycle, markets };
}
