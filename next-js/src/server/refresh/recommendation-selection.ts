import "server-only";

import { marketSelections, validateMarketSnapshot, type MarketFamily, type MarketSource } from "../../domain/markets.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { recommendationPolicy, type CandidateEligibility, type RecommendationDecision, type RecommendationPick,
  type RecommendationPolicy, type RecommendationQuote } from "../../domain/recommendation.ts";
import type { EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { ResolvedForecastCandidate } from "../fallback/fallback-contract.ts";

export type RecommendationEvidenceAssessment = Readonly<{
  eligible: boolean; reasons: readonly string[];
}>;
export type RecommendationEvidenceAssessor = (snapshot: EvidenceSnapshot,
  candidate: Readonly<{ family: MarketFamily; selection: typeof marketSelections[MarketFamily][number] }>) => RecommendationEvidenceAssessment;

/** Prices only rank independently validated forecasts. Family argmax metadata is never modified. */
export function selectRecommendation(input: Readonly<{
  candidate: ResolvedForecastCandidate; baseline?: ResolvedForecastCandidate; snapshot: EvidenceSnapshot;
  quotes: readonly RecommendationQuote[]; decisionAt: number; policy?: RecommendationPolicy; evidenceSnapshotId?: string;
}>, assess: RecommendationEvidenceAssessor): Readonly<{ candidate: ResolvedForecastCandidate; decision: RecommendationDecision }> {
  const policy = input.policy ?? recommendationPolicy, context = input.snapshot.context;
  const decisions: CandidateEligibility[] = [];
  function pool(candidate: ResolvedForecastCandidate, source: MarketSource): RecommendationPick | null {
    const groups = Object.fromEntries(policy.marketOrder.flatMap((family) => {
      const item = candidate.markets[family];
      if (family === "double-chance" || !item.available || item.market.source !== source) return [];
      return [[family, { source, period: item.market.period, probabilities: item.market.probabilities,
        ...(family === "total-goals" && item.market.family === "total-goals" ? { line: item.market.line } : {}) }]];
    }));
    const validated = validateMarketSnapshot(groups);
    let best: RecommendationPick | null = null;
    for (const family of policy.marketOrder) {
      const item = candidate.markets[family], checked = validated.markets[family];
      if (!item.available || item.market.source !== source || !checked.available) continue;
      const line = family === "total-goals" ? policy.totalGoalsLine : null;
      for (const selection of marketSelections[family]) {
        const probability = (checked.market.probabilities as Readonly<Record<string, number>>)[selection]!;
        const reasons: string[] = [];
        const clocks = item.timestamps;
        if (evidenceFingerprint(candidate.context.context) !== evidenceFingerprint(context) ||
            candidate.context.evidenceHash !== input.snapshot.hash) reasons.push("wrong-forecast-identity");
        if (clocks.retrievedAt > input.decisionAt || input.decisionAt - clocks.retrievedAt > policy.forecastMaxAgeMs ||
            clocks.generatedAt !== null && clocks.generatedAt > clocks.retrievedAt ||
            clocks.providerUpdatedAt !== null && (clocks.providerUpdatedAt > clocks.retrievedAt || source === "api-football" &&
              clocks.providerUpdatedAt > context.cutoffAt)) reasons.push("stale-or-future-forecast");
        if (probability < policy.minimumProbability) reasons.push("below-minimum-probability");
        const evidence = assess(input.snapshot, { family, selection });
        if (!evidence.eligible) reasons.push(...evidence.reasons);
        const quotes = input.quotes.filter((quote) => quote.fixtureId === context.fixtureId && quote.fixtureVersion === String(context.fixtureVersion) &&
          quote.homeTeamId === context.home.teamId && quote.awayTeamId === context.away.teamId && quote.family === family &&
          quote.selection === selection && quote.period === policy.period && quote.line === line && quote.permitted === true &&
          quote.suspended === false && Number.isSafeInteger(quote.bookmakerId) && quote.bookmakerId > 0 &&
          /^[a-f0-9]{64}$/u.test(quote.snapshotId) && Number.isSafeInteger(quote.observedAt) && quote.observedAt <= context.cutoffAt &&
          quote.observedAt <= input.decisionAt && input.decisionAt - quote.observedAt <= policy.quoteMaxAgeMs &&
          (quote.providerUpdatedAt === null || Number.isSafeInteger(quote.providerUpdatedAt) && quote.providerUpdatedAt <= quote.observedAt &&
            input.decisionAt - quote.providerUpdatedAt <= policy.quoteMaxAgeMs) && parseDecimalOdds(quote.decimal) !== null)
          .sort((left, right) => {
            const a = parseDecimalOdds(left.decimal)!.scaled, b = parseDecimalOdds(right.decimal)!.scaled;
            return a === b ? left.bookmakerId - right.bookmakerId || left.snapshotId.localeCompare(right.snapshotId) : a > b ? -1 : 1;
          });
        if (quotes.length === 0) reasons.push("no-valid-permitted-quote");
        const eligible = reasons.length === 0;
        decisions.push({ source, family, selection, probability, eligible, reasons, evidence: { ...evidence } });
        if (!eligible) continue;
        const pick: RecommendationPick = { family, selection, period: policy.period, line, source, probability,
          forecastTimestamps: clocks, quote: quotes[0]! };
        const price = parseDecimalOdds(pick.quote.decimal)!.scaled;
        const previous = best === null ? null : parseDecimalOdds(best.quote.decimal)!.scaled;
        // Iteration order provides the final stable family/selection tie-break.
        if (best === null || price > previous! || price === previous && probability > best.probability) best = pick;
      }
    }
    return best;
  }
  const ai = pool(input.candidate, "ai");
  const baselineCandidate = input.baseline ?? input.candidate;
  const baseline = pool(baselineCandidate, "api-football");
  const selected = ai ?? baseline;
  const fallbackReason = ai !== null ? null : input.candidate.audit.aiReason ?? "ai-no-qualified-recommendation";
  const support = selected && decisions.find((entry) => entry.eligible && entry.source === selected.source &&
    entry.family === selected.family && entry.selection === selected.selection)?.evidence;
  const cohorts = Array.isArray(support?.cohorts) ? support.cohorts.filter((cohort): cohort is { sampleSize: number } =>
    cohort !== null && typeof cohort === "object" && typeof cohort.sampleSize === "number") : [];
  const historyExplanation = cohorts.length === 2 ? ` Historical cohorts contain ${cohorts[0]!.sampleSize} and ${cohorts[1]!.sampleSize} completed matches.` : "";
  const supportExplanation = typeof support?.historicalSupport === "number"
    ? ` Smoothed historical event support is ${support.historicalSupport.toFixed(3)}; this is an evidence eligibility measure.` : "";
  const decision: RecommendationDecision = freezeEvidence({ version: 1, policyVersion: policy.version,
    fixtureId: context.fixtureId, fixtureVersion: String(context.fixtureVersion), homeTeamId: context.home.teamId, awayTeamId: context.away.teamId,
    analysisAt: context.analysisAt, evidenceSnapshotId: input.evidenceSnapshotId ?? input.snapshot.id, evidenceHash: input.snapshot.hash,
    status: selected === null ? "no-qualified-recommendation" : "selected", selected, decisions, fallbackReason,
    explanation: selected === null ? "No selection met the minimum probability, football evidence and permitted fresh quote requirements."
      : `${selected.source === "ai" ? "AI" : "API-Football baseline"} ${selected.family} ${selected.selection}: estimated winning probability ${selected.probability}; highest eligible decimal odds ${selected.quote.decimal}.${historyExplanation}${supportExplanation} Historical evidence passed the versioned eligibility rules. Availability and news may be incomplete; no outcome is guaranteed.` });
  const candidate = ai !== null ? input.candidate : baselineCandidate;
  return freezeEvidence({ candidate: { ...candidate, audit: { ...candidate.audit, recommendation: decision } }, decision });
}
