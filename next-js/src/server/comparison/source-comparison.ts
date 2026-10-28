import "server-only";

import { marketSelections, type AcceptedMarket, type MarketFamily, type MarketSource } from "../../domain/markets.ts";
import { settleMarketSelection, type SettlementContext } from "../../domain/market-settlement.ts";
import { performanceRules } from "../../domain/performance.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { EvaluationMetrics, HorizonBand, QualityGate } from "../evaluation/evaluation-contract.ts";
import { evaluateQualityGate } from "../evaluation/evaluation-gates.ts";
import { createMarketMetricsAccumulator, wilson } from "../evaluation/evaluation-metrics.ts";
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
const differences = (ai: EvaluationMetrics, provider: EvaluationMetrics) => ({
  brierDifference: ai.brier === null || provider.brier === null ? null : ai.brier - provider.brier,
  logLossDifference: ai.logLoss === null || provider.logLoss === null ? null : ai.logLoss - provider.logLoss });

/** Pure, private diagnostic comparison of the AI and API-Football forecasts captured in the same refreshes. A pair is
 * matched only when both receipts have the family available and its selection settles correct or incorrect on the
 * cycle's one settlement context. Nothing is filled: absent receipts count as not captured, and families the provider
 * never supplies are reported as unavailable rather than scored. */
export function createSourceComparisonAccumulator(options: SourceComparisonOptions) {
  const horizons: readonly (HorizonBand | null)[] = options.horizons ?? [null];
  const orders = { "provider-first": 0, "ai-first": 0, none: 0 };
  let fixtureCount = 0;
  const recent: {
    fixtureId: string; matchLabel: string; href: string; kickoffAt: number; sourceOrder: ForecastSourceOrder;
    published: MarketSource | null; ai: { selection: string; probability: number; outcome: ReturnType<typeof settleMarketSelection>["status"] };
    "api-football": { selection: string; probability: number; outcome: ReturnType<typeof settleMarketSelection>["status"] };
  }[] = [];
  function scores(family: MarketFamily) {
    const ai = createMarketMetricsAccumulator(family, options.bands, options.confidenceZ);
    const provider = createMarketMetricsAccumulator(family, options.bands, options.confidenceZ);
    let count = 0;
    return { add(aiMarket: AcceptedMarket, providerMarket: AcceptedMarket, result: SettlementContext) {
      count++; ai.add([{ market: aiMarket, result }]); provider.add([{ market: providerMarket, result }]);
    }, snapshot() {
      const a = ai.snapshot(), p = provider.snapshot();
      const interval = (value: EvaluationMetrics) => value.count === 0 ? null : wilson(value.correct, value.count, options.confidenceZ);
      return { count, ai: a, "api-football": p, ...differences(a, p), hitRateIntervals: { ai: interval(a), "api-football": interval(p) } };
    } };
  }
  const cells = options.families.flatMap((family) => horizons.map((horizon) => {
    const coverage = { locked: 0, void: 0, notCaptured: 0, captured: 0, aiAvailable: 0, providerAvailable: 0,
      both: 0, aiOnly: 0, providerOnly: 0, neither: 0, pending: 0, settled: 0 };
    const matchedScores = scores(family), disagreementScores = scores(family), conflictingScores = scores(family), limitedScores = scores(family);
    const keys: string[] = [];
    let aiCorrect = 0, providerCorrect = 0;
    function add(record: SourceComparisonRecord, receipts: ReadonlyMap<string, SourceReceiptRead>) {
      if (record.state === "void") { coverage.void++; return; }
      if (record.state !== "closed" || !record.locked) return;
      const horizonMs = record.kickoffAt - record.locked.forecastAt;
      if (horizon && (horizonMs < horizon.minimumMs || horizonMs >= horizon.maximumMs)) return;
      coverage.locked++;
      const receipt = record.locked.sourceOrder === null ? "not-captured" : receipts.get(record.locked.jobId) ?? "not-captured";
      if (receipt === "not-captured") { coverage.notCaptured++; return; }
      coverage.captured++;
      const ai = receipt.ai.markets.markets[family], provider = receipt["api-football"].markets.markets[family];
      if (ai.available) coverage.aiAvailable++;
      if (provider.available) coverage.providerAvailable++;
      if (!ai.available || !provider.available) { coverage[ai.available ? "aiOnly" : provider.available ? "providerOnly" : "neither"]++; return; }
      coverage.both++;
      // Both selections are graded on the same context, so either both settle or neither does.
      const a = settleMarketSelection(family, ai.market.selection, record.settlement).status;
      const p = settleMarketSelection(family, provider.market.selection, record.settlement).status;
      if (!["correct", "incorrect"].includes(a) || !["correct", "incorrect"].includes(p)) { coverage.pending++; return; }
      coverage.settled++;
      keys.push(`${record.fixtureId}:${record.cycleId}:${record.locked.jobId}`);
      matchedScores.add(ai.market, provider.market, record.settlement);
      if (ai.market.selection !== provider.market.selection) {
        disagreementScores.add(ai.market, provider.market, record.settlement);
        if (a === "correct") aiCorrect++;
        if (p === "correct") providerCorrect++;
      }
      if (receipt.ai.evidence?.conflicting === true) conflictingScores.add(ai.market, provider.market, record.settlement);
      if (receipt.ai.evidence?.limitedNews === true) limitedScores.add(ai.market, provider.market, record.settlement);
    }
    function finish() {
      const counterpart = family === "match-result" || family === "double-chance";
      const matched = { ...matchedScores.snapshot(), fixtureKeysHash: evidenceFingerprint([...keys].sort()) };
      const gates = (options.gates ?? []).filter((gate) => gate.system === "ai" && gate.baseline === "api-football" && gate.family === family &&
        (horizon === null || gate.horizonId === horizon.id)).map((gate) => ({ id: gate.id, purpose: gate.purpose,
        ...evaluateQualityGate(gate, matched.ai, { total: coverage.locked + coverage.void, void: coverage.void, available: coverage.both }, matched) }));
      return { family, horizonId: horizon?.id ?? null, derivedFrom: family === "double-chance" ? "match-result" as const : null,
        state: !counterpart ? "unavailable" as const : matched.count === 0 ? "unavailable" as const : "available" as const,
        reason: !counterpart ? "no-provider-counterpart" : matched.count === 0 ? "no-matched-settled-pairs" : null,
        coverage: { ...coverage }, matched, disagreements: { ...disagreementScores.snapshot(), aiCorrect, providerCorrect },
        segments: { conflictingEvidence: conflictingScores.snapshot(), limitedNews: limitedScores.snapshot() }, gates };
    }
    return { add, finish };
  }));
  function add(records: readonly SourceComparisonRecord[], receipts: ReadonlyMap<string, SourceReceiptRead>) {
    if (fixtureCount + records.length > performanceRules.maximumCohortFixtures) throw new RangeError("Source comparison exceeds the bounded fixture cohort.");
    fixtureCount += records.length;
    for (const record of records) {
      if (record.state === "closed" && record.locked) orders[record.locked.sourceOrder ?? "none"]++;
      for (const cell of cells) cell.add(record, receipts);
      if (record.state !== "closed" || !record.locked || record.locked.sourceOrder === null) continue;
      const receipt = receipts.get(record.locked.jobId);
      if (!receipt || receipt === "not-captured") continue;
      const ai = receipt.ai.markets.markets["match-result"], provider = receipt["api-football"].markets.markets["match-result"];
      if (!ai.available || !provider.available) continue;
      const side = (market: AcceptedMarket) => ({ selection: market.selection, probability: market.selectedProbability,
        outcome: settleMarketSelection("match-result", market.selection, record.settlement).status });
      recent.push({ fixtureId: record.fixtureId, matchLabel: record.matchLabel, href: record.href, kickoffAt: record.kickoffAt,
        sourceOrder: record.locked.sourceOrder, published: record.locked.published["match-result"] ?? null,
        ai: side(ai.market), "api-football": side(provider.market) });
      recent.sort((left, right) => right.kickoffAt - left.kickoffAt || (left.fixtureId < right.fixtureId ? -1 : 1));
      if (recent.length > 20) recent.length = 20;
    }
  }
  return Object.freeze({ add, finish: () => freezeEvidence({ orders: { ...orders }, comparisons: cells.map((cell) => cell.finish()), recent: [...recent] }) });
}

/** Compatibility entry point; batches use the same numeric accumulator without retaining candidate or receipt bodies. */
export function compareSources(records: readonly SourceComparisonRecord[], receipts: ReadonlyMap<string, SourceReceiptRead>,
  options: SourceComparisonOptions) {
  const accumulator = createSourceComparisonAccumulator(options);
  accumulator.add(records, receipts);
  return accumulator.finish();
}
export type SourceComparison = ReturnType<typeof compareSources>;
export const sourceComparisonFamilies = Object.freeze(Object.keys(marketSelections) as MarketFamily[]);
