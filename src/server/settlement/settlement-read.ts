import "server-only";

import { MARKET_RULE_VERSION, marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { settleMarketSelection, type CycleEligibility } from "../../domain/market-settlement.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { FootballFixture, Prisma } from "../generated/prisma/client.ts";
import { historyFail, type StoredCycle, type StoredRevision } from "../predictions/history-contract.ts";
import { assertHistorySeal, historyJson, historyTime, storedCycle, storedRevision, type HistoryRow } from "../predictions/history-read.ts";
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
  for (const row of rows) {
    const cycle = (await storedCycle(tx, row.id))!;
    const lock = cycle.lockedSetId ? await storedRevision(tx, cycle.lockedSetId) : null;
    const previous = new Map<MarketFamily, SettlementRevision>();
    const pointers = await tx.marketSettlement.findMany({ where: { cycleId: cycle.id } });
    for (const pointer of pointers) previous.set(pointer.family as MarketFamily, await storedSettlementRevision(tx, pointer.revisionId));
    cycles.push(projectSettlementCycle(fixture, result, cursor?.issue ?? null, cycle, lock, previous));
  }
  return { fixture, result, cycles };
}

/** Shared audit projection for individual reads and bounded reporting batches. */
export function projectSettlementCycle(fixture: FootballFixture, result: StoredFixtureResult | null, issue: string | null,
  cycle: StoredCycle, lock: StoredRevision | null, recorded: ReadonlyMap<MarketFamily, SettlementRevision>) {
  const fixtureId = fixture.id, status = resultStatus.parse(fixture.status);
  const resultUsable = fixtureResultMatchesCanonical(fixture, result, issue);
  if (cycle.fixtureId !== fixtureId || cycle.lockedSetId !== (lock?.id ?? null) ||
    lock && (lock.cycleId !== cycle.id || lock.fixtureId !== fixtureId)) return historyFail("invalid-state");
  const eligibility: CycleEligibility = cycle.state !== "void" ? { eligible: true } : { eligible: false,
    reason: cycle.voidReason === "formal-postponement" ? "postponed-cycle"
      : cycle.voidReason === "locked-cutoff-invalidated" ? "cutoff-invalidated" : "ineligible-cycle" };
  const markets = [];
  for (const family of families) {
    const item = lock?.candidate.markets[family];
    const market = item?.available ? item.market : null;
    const outcome = settleMarketSelection(family, market?.selection ?? null, {
      status: issue && cycle.state !== "void" ? "unknown" : status, cycleEligibility: eligibility,
      regulationScore: resultUsable && result?.regulation.verified ? { verified: true,
        period: "regulation-including-stoppage-time", home: result.regulation.home!, away: result.regulation.away! } : null,
    });
    const previous = recorded.get(family) ?? null;
    const historicalVoid = previous?.cycleState === "void" && cycle.state === "void";
    const base = { fixtureId, cycleId: cycle.id, family, ruleVersion: MARKET_RULE_VERSION, lockedSetId: cycle.lockedSetId,
      selection: market?.selection ?? null, source: market?.source ?? null, selectedProbability: market?.selectedProbability ?? null,
      resultId: historicalVoid ? previous.resultId : market ? result?.id ?? null : null,
      resultUsable: historicalVoid ? previous.resultUsable : market ? resultUsable : false,
      status: outcome.status, reason: !lock ? cycle.state === "open" ? "awaiting-locked-selection" : "no-locked-selection"
        : item && !item.available ? item.reason : outcome.reason,
      cycleState: cycle.state, voidReason: cycle.voidReason } as const;
    if (previous && (previous.fixtureId !== fixtureId || previous.cycleId !== cycle.id || previous.family !== family ||
      previous.lockedSetId !== null && previous.lockedSetId !== cycle.lockedSetId)) return historyFail("invalid-state");
    markets.push({ base, inputHash: evidenceFingerprint(base), previous });
  }
  return { cycle, markets };
}
