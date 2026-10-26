import "server-only";

import { marketSelections, type AcceptedMarket, type MarketFamily, type MarketSource } from "../../domain/markets.ts";
import { settleMarketSelection, type SettlementContext } from "../../domain/market-settlement.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { EvaluationMetrics, HorizonBand, MetricObservation, QualityGate } from "../evaluation/evaluation-contract.ts";
import { evaluateQualityGate } from "../evaluation/evaluation-gates.ts";
import { evaluateMarketMetrics, wilson } from "../evaluation/evaluation-metrics.ts";
import type { ForecastSourceOrder } from "../fallback/fallback-contract.ts";
import type { SourceReceiptRead } from "./source-receipts-read.ts";

/** One applicable cycle, reduced to what the matched comparison needs. `forecastAt` is the fallback stage clock both
 * receipts share (the revision's generation completion), so horizons here are kickoff minus that clock. */
export type SourceComparisonRecord = Readonly<{
  fixtureId: string; cycleId: string; state: "open" | "closed" | "void"; kickoffAt: number;
  locked: Readonly<{ jobId: string; forecastAt: number; sourceOrder: ForecastSourceOrder | null;
    published: Readonly<Partial<Record<MarketFamily, MarketSource>>> }> | null;
  settlement: SettlementContext; matchLabel: string; href: string;
}>;
export type SourceComparisonOptions = Readonly<{
  families: readonly MarketFamily[]; horizons: readonly HorizonBand[] | null; bands: readonly number[]; confidenceZ: number;
  /** Only AI candidate or public-claim gates on the API-Football baseline apply. */
  gates?: readonly QualityGate[];
}>;
type Pair = Readonly<{ key: string; record: SourceComparisonRecord; ai: AcceptedMarket; provider: AcceptedMarket;
  conflicting: boolean; limitedNews: boolean }>;
const differences = (ai: EvaluationMetrics, provider: EvaluationMetrics) => ({
  brierDifference: ai.brier === null || provider.brier === null ? null : ai.brier - provider.brier,
  logLossDifference: ai.logLoss === null || provider.logLoss === null ? null : ai.logLoss - provider.logLoss });

/** Pure, private diagnostic comparison of the AI and API-Football forecasts captured in the same refreshes. A pair is
 * matched only when both receipts have the family available and its selection settles correct or incorrect on the
 * cycle's one settlement context. Nothing is filled: absent receipts count as not captured, and families the provider
 * never supplies are reported as unavailable rather than scored. */
export function compareSources(records: readonly SourceComparisonRecord[], receipts: ReadonlyMap<string, SourceReceiptRead>,
  options: SourceComparisonOptions) {
  const horizons: readonly (HorizonBand | null)[] = options.horizons ?? [null];
  const orders = { "provider-first": 0, "ai-first": 0, none: 0 };
  for (const record of records) if (record.state === "closed" && record.locked) orders[record.locked.sourceOrder ?? "none"]++;
  const metrics = (family: MarketFamily, markets: readonly AcceptedMarket[], contexts: readonly SettlementContext[]) =>
    evaluateMarketMetrics(family, markets.map((market, index): MetricObservation => ({ market, result: contexts[index]! })),
      options.bands, options.confidenceZ);
  const scored = (family: MarketFamily, pairs: readonly Pair[]) => {
    const contexts = pairs.map((pair) => pair.record.settlement);
    const ai = metrics(family, pairs.map((pair) => pair.ai), contexts), provider = metrics(family, pairs.map((pair) => pair.provider), contexts);
    const interval = (value: EvaluationMetrics) => value.count === 0 ? null : wilson(value.correct, value.count, options.confidenceZ);
    return { count: pairs.length, ai, "api-football": provider, ...differences(ai, provider),
      hitRateIntervals: { ai: interval(ai), "api-football": interval(provider) } };
  };
  const comparisons = options.families.flatMap((family) => horizons.map((horizon) => {
    const coverage = { locked: 0, void: 0, notCaptured: 0, captured: 0, aiAvailable: 0, providerAvailable: 0,
      both: 0, aiOnly: 0, providerOnly: 0, neither: 0, pending: 0, settled: 0 };
    const pairs: Pair[] = [];
    for (const record of records) {
      if (record.state === "void") { coverage.void++; continue; }
      if (record.state !== "closed" || !record.locked) continue;
      const horizonMs = record.kickoffAt - record.locked.forecastAt;
      if (horizon && (horizonMs < horizon.minimumMs || horizonMs >= horizon.maximumMs)) continue;
      coverage.locked++;
      const receipt = record.locked.sourceOrder === null ? "not-captured" : receipts.get(record.locked.jobId) ?? "not-captured";
      if (receipt === "not-captured") { coverage.notCaptured++; continue; }
      coverage.captured++;
      const ai = receipt.ai.markets.markets[family], provider = receipt["api-football"].markets.markets[family];
      if (ai.available) coverage.aiAvailable++;
      if (provider.available) coverage.providerAvailable++;
      if (!ai.available || !provider.available) { coverage[ai.available ? "aiOnly" : provider.available ? "providerOnly" : "neither"]++; continue; }
      coverage.both++;
      // Both selections are graded on the same context, so either both settle or neither does.
      const settled = [ai.market.selection, provider.market.selection].every((selection) =>
        ["correct", "incorrect"].includes(settleMarketSelection(family, selection, record.settlement).status));
      if (!settled) { coverage.pending++; continue; }
      coverage.settled++;
      pairs.push({ key: `${record.fixtureId}:${record.cycleId}:${record.locked.jobId}`, record, ai: ai.market, provider: provider.market,
        conflicting: receipt.ai.evidence?.conflicting === true, limitedNews: receipt.ai.evidence?.limitedNews === true });
    }
    const counterpart = family === "match-result" || family === "double-chance";
    const matched = { ...scored(family, pairs), fixtureKeysHash: evidenceFingerprint(pairs.map((pair) => pair.key).sort()) };
    const disagreements = pairs.filter((pair) => pair.ai.selection !== pair.provider.selection);
    const correct = (source: "ai" | "provider") => disagreements.filter((pair) => settleMarketSelection(family, pair[source].selection,
      pair.record.settlement).status === "correct").length;
    const gates = (options.gates ?? []).filter((gate) => gate.system === "ai" && gate.baseline === "api-football" && gate.family === family &&
      (horizon === null || gate.horizonId === horizon.id)).map((gate) => ({ id: gate.id, purpose: gate.purpose,
      ...evaluateQualityGate(gate, matched.ai, { total: coverage.locked + coverage.void, void: coverage.void, available: coverage.both }, matched) }));
    return { family, horizonId: horizon?.id ?? null, derivedFrom: family === "double-chance" ? "match-result" as const : null,
      state: !counterpart ? "unavailable" as const : pairs.length === 0 ? "unavailable" as const : "available" as const,
      reason: !counterpart ? "no-provider-counterpart" : pairs.length === 0 ? "no-matched-settled-pairs" : null,
      coverage, matched, disagreements: { ...scored(family, disagreements), aiCorrect: correct("ai"), providerCorrect: correct("provider") },
      segments: { conflictingEvidence: scored(family, pairs.filter((pair) => pair.conflicting)),
        limitedNews: scored(family, pairs.filter((pair) => pair.limitedNews)) }, gates };
  }));
  const recent = records.flatMap((record) => {
    if (record.state !== "closed" || !record.locked || record.locked.sourceOrder === null) return [];
    const receipt = receipts.get(record.locked.jobId);
    if (!receipt || receipt === "not-captured") return [];
    const ai = receipt.ai.markets.markets["match-result"], provider = receipt["api-football"].markets.markets["match-result"];
    if (!ai.available || !provider.available) return [];
    const side = (market: AcceptedMarket) => ({ selection: market.selection, probability: market.selectedProbability,
      outcome: settleMarketSelection("match-result", market.selection, record.settlement).status });
    return [{ fixtureId: record.fixtureId, matchLabel: record.matchLabel, href: record.href, kickoffAt: record.kickoffAt,
      sourceOrder: record.locked.sourceOrder, published: record.locked.published["match-result"] ?? null,
      ai: side(ai.market), "api-football": side(provider.market) }];
  }).sort((left, right) => right.kickoffAt - left.kickoffAt || (left.fixtureId < right.fixtureId ? -1 : 1)).slice(0, 20);
  return freezeEvidence({ orders, comparisons, recent });
}
export type SourceComparison = ReturnType<typeof compareSources>;
export const sourceComparisonFamilies = Object.freeze(Object.keys(marketSelections) as MarketFamily[]);
