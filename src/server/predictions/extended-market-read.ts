import "server-only";

import { publicExtendedMarketSchema, type PublicExtendedMarket, type PublicExtendedMarketSnapshot } from "../../domain/extended-markets.ts";
import { predictionRuleLabel } from "../../domain/prediction-label.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { historyFail, type CycleDisplay } from "./history-contract.ts";
import { historyId } from "./history-input.ts";
import { storedCycleDisplay } from "./history-read.ts";
import { readGoalMarketExtension, readGoalMarketSettlement, type StoredGoalMarketExtension, type GoalMarketSettlementRevision } from "./goal-market-store.ts";
import { readImpliedMarketExtension } from "./implied-market-store.ts";
import type { StoredImpliedMarketExtension } from "./implied-market-contract.ts";
import { readImpliedMarketSettlement, type ImpliedMarketSettlementRevision } from "../settlement/implied-market-settlement.ts";

type Tx = Prisma.TransactionClient;
const pending = Object.freeze({ status: "pending" as const, reason: "awaiting-final-result", correctedAt: null });

/** Projection of a sealed snapshot. Raw score mass, provider catalog and bookmaker data stay private. */
export function publicGoalMarketExtension(extension: StoredGoalMarketExtension,
  settlements: ReadonlyMap<string, GoalMarketSettlementRevision> = new Map()): readonly PublicExtendedMarket[] {
  return freezeEvidence(extension.markets.flatMap(({ definition, derivation }) => {
    if (!derivation.available) return [];
    const market = derivation.market, selected = market.selections.find(({ key }) => key === market.selection)!;
    const recorded = settlements.get(definition.key);
    if (recorded && (recorded.fixtureId !== extension.fixtureId || recorded.cycleId !== extension.cycleId ||
        recorded.predictionRevisionId !== extension.revisionId || recorded.selection !== selected.key ||
        recorded.marketKey !== definition.key || recorded.ruleVersion !== market.ruleVersion ||
        recorded.selectedProbability !== market.selectedProbability || recorded.source !== market.source)) return historyFail("invalid-state");
    return [publicExtendedMarketSchema.parse({ key: definition.key, label: definition.label, code: definition.code, period: definition.period,
      ruleVersion: market.ruleVersion, source: market.source, sourceLabel: "AI score distribution",
      probabilityBasis: definition.group === "payout" ? "model-positive-payout" : "model-event",
      selection: selected.key, selectionLabel: predictionRuleLabel(selected.rule), selectedProbability: selected.winProbability,
      selections: market.selections.map(({ key, rule, winProbability, outcomes }) => ({ key, label: predictionRuleLabel(rule), probability: winProbability,
        settlementProbabilities: outcomes })),
      result: recorded ? { status: recorded.status, reason: recorded.reason, correctedAt: recorded.correctedAt } : pending })];
  }));
}

/** Publication quotes are not current odds. This envelope intentionally has no mutable price field. */
export function publicImpliedMarkets(extension: StoredImpliedMarketExtension,
  settlements: ReadonlyMap<string, ImpliedMarketSettlementRevision> = new Map()): readonly PublicExtendedMarket[] {
  return freezeEvidence(extension.markets.flatMap(({ definition, derivation }) => {
    if (!derivation.available) return [];
    const market = derivation.market, selected = market.selections.find(({ key }) => key === market.selection)!;
    const labels = new Map(definition.selections.map(({ key, rule }) => [key, predictionRuleLabel(rule)]));
    const label = (key: string) => labels.get(key) ?? historyFail("invalid-state");
    const recorded = settlements.get(definition.key);
    if (recorded && (recorded.fixtureId !== extension.fixtureId || recorded.cycleId !== extension.cycleId ||
        recorded.predictionRevisionId !== extension.revisionId || recorded.selection !== selected.key ||
        recorded.marketKey !== definition.key || recorded.ruleVersion !== market.ruleVersion || recorded.source !== market.source ||
        recorded.probabilityBasis !== market.probabilityBasis || recorded.selectedProbability !== market.selectedProbability)) return historyFail("invalid-state");
    return [publicExtendedMarketSchema.parse({ key: definition.key, label: definition.label, code: definition.code, period: definition.period,
      ruleVersion: market.ruleVersion, source: market.source, sourceLabel: "Market-implied", probabilityBasis: market.probabilityBasis,
      selection: selected.key, selectionLabel: label(selected.key), selectedProbability: Number(selected.normalizedProbability),
      selections: market.selections.map(({ key, normalizedProbability }) => ({ key, label: label(key), probability: Number(normalizedProbability) })),
      result: recorded ? { status: recorded.status, reason: recorded.reason, correctedAt: recorded.correctedAt } : pending })];
  }));
}

/** Disabled until migrated and bound by the runtime. Absence causes no table query. */
export async function readExtendedMarketSnapshot(tx: Tx, display: CycleDisplay,
  options: Readonly<{ enabled?: boolean }> = {}): Promise<PublicExtendedMarketSnapshot | null> {
  if (!options.enabled || !display.revision) return null;
  const { cycle, revision, mode } = display;
  if (revision.cycleId !== cycle.id || revision.fixtureId !== cycle.fixtureId ||
      (cycle.state === "open" ? cycle.currentSetId : cycle.lockedSetId) !== revision.id) return historyFail("invalid-state");
  const [goal, implied] = await Promise.all([readGoalMarketExtension(tx, revision.id), readImpliedMarketExtension(tx, revision.id)]);
  for (const extension of [goal, implied]) if (extension && (extension.fixtureId !== cycle.fixtureId || extension.cycleId !== cycle.id ||
      extension.revisionId !== revision.id || extension.recordedAt < revision.publishedAt)) return historyFail("invalid-state");
  if (!goal && !implied) return null;
  const recorded = new Map<string, GoalMarketSettlementRevision>();
  const recordedImplied = new Map<string, ImpliedMarketSettlementRevision>();
  if (goal && mode !== "current") {
    const pointers = await tx.$queryRaw<{ revisionId: string }[]>`SELECT revisionId FROM ExtendedMarketSettlement WHERE cycleId = ${cycle.id} AND marketKey LIKE 'goal:%'`;
    for (const { revisionId } of pointers) { const settlement = await readGoalMarketSettlement(tx, revisionId); recorded.set(settlement.marketKey, settlement); }
  }
  if (implied && mode !== "current") {
    const pointers = await tx.$queryRaw<{ revisionId: string }[]>`SELECT revisionId FROM ExtendedMarketSettlement WHERE cycleId = ${cycle.id} AND marketKey LIKE 'implied:%'`;
    for (const { revisionId } of pointers) { const settlement = await readImpliedMarketSettlement(tx, revisionId); recordedImplied.set(settlement.marketKey, settlement); }
  }
  const markets = [...(goal ? publicGoalMarketExtension(goal, recorded) : []), ...(implied ? publicImpliedMarkets(implied, recordedImplied) : [])];
  if (new Set(markets.map(({ key }) => key)).size !== markets.length) return historyFail("invalid-state");
  return freezeEvidence({ version: 1 as const, fixtureId: cycle.fixtureId, cycleId: cycle.id, revisionId: revision.id,
    publishedAt: revision.publishedAt, mode, markets });
}

/** Called inside an existing consistent feed/detail transaction; performs no provider or predictor work. */
export async function readCurrentExtendedMarkets(tx: Tx, fixtureId: string, options: Readonly<{ enabled?: boolean }> = {}) {
  if (!options.enabled) return null;
  historyId.parse(fixtureId);
  const fixture = await tx.footballFixture.findUnique({ where: { id: fixtureId }, select: { activeCycleId: true } });
  const display = fixture?.activeCycleId ? await storedCycleDisplay(tx, fixture.activeCycleId) : null;
  return display ? readExtendedMarketSnapshot(tx, display, options) : null;
}

/** Client cache/version identity includes source-qualified markets without changing legacy DTO bytes. */
export const extendedMarketSnapshotFingerprint = (snapshot: PublicExtendedMarketSnapshot) => evidenceFingerprint(snapshot);
