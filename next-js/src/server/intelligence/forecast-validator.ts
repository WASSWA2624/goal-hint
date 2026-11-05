import "server-only";

import { checkMarketConsistency, marketSelections, type SourceGroup } from "../../domain/markets.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { isIssuedLocalGoalForecast } from "./local-goals-model.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import type { ContextualAssessment, EnsembleArtifact, IntelligenceFixture,
  LocalGoalForecast, OutOfSampleForecast, ProviderIntelligenceForecast, ValidatedIntelligenceForecast } from "./intelligence-contract.ts";

const families = ["match-result", "total-goals", "both-teams-to-score"] as const;
const instant = (value: number) => Number.isSafeInteger(value) && value >= 0;
export function assertDistribution(family: SourceGroup, value: Readonly<Record<string, number>>): void {
  if (!value || typeof value !== "object" || Object.keys(value).length !== marketSelections[family].length ||
    marketSelections[family].some((key) => !Number.isFinite(value[key]) || value[key]! <= 0 || value[key]! >= 1) ||
    Math.abs(Object.values(value).reduce((sum, probability) => sum + probability, 0) - 1) > 1e-9)
    throw new Error("Invalid intelligence distribution.");
}
function mix(local: Readonly<Record<string, number>>, provider: Readonly<Record<string, number>>, weight: number, temperature = 1) {
  const entries = Object.keys(local).map((key) => [key, (weight * local[key]! + (1 - weight) * provider[key]!) ** (1 / temperature)] as const);
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
  return Object.fromEntries(entries.map(([key, probability]) => [key, probability / total]));
}
function brier(probabilities: Readonly<Record<string, number>>, outcome: string) {
  return Object.entries(probabilities).reduce((sum, [key, probability]) => sum + (probability - Number(key === outcome)) ** 2, 0);
}
function bestWeight(rows: readonly OutOfSampleForecast[], prior: number, shrinkage: number) {
  let best = prior, minimum = Infinity;
  for (let i = 0; i <= 100; i++) {
    const weight = i / 100;
    const loss = rows.reduce((sum, row) => sum + brier(mix(row.local, row.provider, weight), row.outcome), 0) + shrinkage * (weight - prior) ** 2;
    if (loss < minimum - 1e-12 || Math.abs(loss - minimum) <= 1e-12 && Math.abs(weight - prior) < Math.abs(best - prior)) { minimum = loss; best = weight; }
  }
  return best;
}
/** Separate chronological training/calibration/holdout partitions. Learning is
 * joint in provider/local probabilities, so agreement is never extra evidence.
 * League parameters shrink to a regularized global fit. An estimated artifact
 * remains provisional; prospective approval is intentionally outside this API. */
export function learnEnsembleArtifact(input: Readonly<{
  rows: readonly OutOfSampleForecast[]; learnedAt: number; competitionId: string;
  localModelVersion: string; providerModelVersion: string; minimumSamples?: number;
  cohort?: "men" | "women" | "unspecified";
  verifyRow(row: OutOfSampleForecast): boolean;
}>): EnsembleArtifact {
  const minimum = input.minimumSamples ?? 120, cohort = input.cohort ?? "unspecified";
  if (!instant(input.learnedAt) || !Number.isInteger(minimum) || minimum < 30 || !Array.isArray(input.rows) || input.rows.length > 100_000 ||
    !input.competitionId || !input.localModelVersion || !input.providerModelVersion || !["men", "women", "unspecified"].includes(cohort))
    throw new Error("Invalid ensemble learning input.");
  const seen = new Set<string>();
  const rows: OutOfSampleForecast[] = input.rows.filter((row) => row.resultAvailableAt < input.learnedAt && row.localModelVersion === input.localModelVersion &&
    row.providerModelVersion === input.providerModelVersion && (row.cohort ?? "unspecified") === cohort);
  const fixtureContexts = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.fixtureId}:${row.family}`;
    if (!families.includes(row.family) || ![row.kickoffAt, row.forecastAt, row.trainingEndsAt, row.resultAvailableAt].every(instant) ||
      row.forecastAt >= row.kickoffAt - 300_000 || row.trainingEndsAt > row.forecastAt || row.resultAvailableAt < row.kickoffAt ||
      !row.fixtureId || !row.competitionId || !row.evidenceRef || !marketSelections[row.family].some((key) => key === row.outcome) ||
      seen.has(key) || !provenTrue(() => input.verifyRow(row))) throw new Error("Unverified or leaking ensemble evidence.");
    assertDistribution(row.family, row.local); assertDistribution(row.family, row.provider); seen.add(key);
    const identity = evidenceFingerprint({ competitionId: row.competitionId, kickoffAt: row.kickoffAt, forecastAt: row.forecastAt,
      trainingEndsAt: row.trainingEndsAt, resultAvailableAt: row.resultAvailableAt });
    if (fixtureContexts.has(row.fixtureId) && fixtureContexts.get(row.fixtureId) !== identity) throw new Error("Conflicting out-of-sample fixture identity.");
    fixtureContexts.set(row.fixtureId, identity);
  }
  rows.sort((a, b) => a.forecastAt - b.forecastAt || (a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0));
  const fixtureTimes = [...new Set(rows.map((row) => row.forecastAt))];
  const calibrationStart = fixtureTimes[Math.floor(fixtureTimes.length * 0.6)] ?? input.learnedAt;
  const holdoutStart = fixtureTimes[Math.floor(fixtureTimes.length * 0.8)] ?? input.learnedAt;
  const learnFamily = (family: SourceGroup): EnsembleArtifact["families"][SourceGroup] => {
    const selected = rows.filter((row) => row.family === family);
    // Group timestamps at boundaries: a result used to learn must have been
    // available before the next partition's first forecast, not merely its kickoff.
    const training = selected.filter((row) => row.forecastAt < calibrationStart && row.resultAvailableAt < calibrationStart);
    const calibration = selected.filter((row) => row.forecastAt >= calibrationStart && row.forecastAt < holdoutStart && row.resultAvailableAt < holdoutStart);
    const holdout = selected.filter((row) => row.forecastAt >= holdoutStart);
    const leagueTraining = training.filter((row) => row.competitionId === input.competitionId);
    const enough = selected.length >= minimum && training.length >= Math.floor(minimum * 0.5) &&
      calibration.length >= Math.floor(minimum * 0.15) && holdout.length >= Math.floor(minimum * 0.15);
    const globalWeight = enough ? bestWeight(training, 0.5, 20) : 0.5;
    const localWeight = enough ? bestWeight(leagueTraining, globalWeight, 40) : 0.5;
    let temperature = 1, minimumLoss = Infinity;
    if (enough) for (let i = 5; i <= 20; i++) {
      const candidate = i / 10;
      const loss = calibration.reduce((sum, row) => sum - Math.log(mix(row.local, row.provider, localWeight, candidate)[row.outcome]!), 0) +
        10 * Math.log(candidate) ** 2;
      if (loss < minimumLoss) { minimumLoss = loss; temperature = candidate; }
    }
    return { samples: selected.length, leagueSamples: selected.filter((row) => row.competitionId === input.competitionId).length,
      localWeight, temperature, trainingSamples: training.length, calibrationSamples: calibration.length, holdoutSamples: holdout.length,
      status: enough ? "estimated" as const : "insufficient" as const, evidenceRefs: selected.map((row) => row.evidenceRef) };
  };
  const learned = { "match-result": learnFamily("match-result"), "total-goals": learnFamily("total-goals"),
    "both-teams-to-score": learnFamily("both-teams-to-score") };
  const body = { version: "pit-ensemble-v1" as const, learnedAt: input.learnedAt, competitionId: input.competitionId,
    localModelVersion: input.localModelVersion, providerModelVersion: input.providerModelVersion, minimumSamples: minimum, cohort, families: learned };
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}

export type IntelligenceValidationInput = Readonly<{
  fixture: IntelligenceFixture; local: LocalGoalForecast; provider?: ProviderIntelligenceForecast | null;
  context?: ContextualAssessment | null; ensemble?: EnsembleArtifact | null;
  fixtureStatus?: "scheduled" | "postponed" | "cancelled"; maxAgeMs?: number; disagreementThreshold?: number;
  quote?: Readonly<{ family: SourceGroup; selection: string; decimalOdds: number; observedAt: number }>;
  /** Required for rehydrated local artifacts; a hash alone proves no provenance. */
  verifyLocal?(forecast: LocalGoalForecast): boolean;
  verifyProvider?(forecast: ProviderIntelligenceForecast): boolean;
  verifyContext?(assessment: ContextualAssessment): boolean;
  verifyEnsemble?(artifact: EnsembleArtifact): boolean;
}>;

/** A shadow validator has no publication authority. Evidence quality, probability,
 * model uncertainty and odds value stay separate, and AI contributes facts/vetoes
 * only. It cannot supply or boost a numerical winning probability. */
export function validateIntelligenceForecast(input: IntelligenceValidationInput): ValidatedIntelligenceForecast {
  const { fixture, local } = input, provider = input.provider ?? null, context = input.context ?? null, ensemble = input.ensemble ?? null;
  const maxAgeMs = input.maxAgeMs ?? 6 * 3_600_000, threshold = input.disagreementThreshold ?? 0.15;
  if (!instant(fixture.forecastAt) || !instant(fixture.kickoffAt) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 ||
    !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) throw new Error("Invalid validator policy.");
  const reasons: string[] = [], warnings = ["shadow-only", "prospective-qualification-required"];
  if (input.fixtureStatus && input.fixtureStatus !== "scheduled") reasons.push(`fixture-${input.fixtureStatus}`);
  if (fixture.forecastAt >= fixture.kickoffAt - 300_000) reasons.push("forecast-locked");
  if (local.fixtureId !== fixture.fixtureId || local.forecastAt > fixture.forecastAt || fixture.forecastAt - local.forecastAt > maxAgeMs ||
    local.cutoffAt > fixture.forecastAt || local.status !== "estimated" || !local.probabilities) reasons.push("local-unavailable-or-stale");
  const { hash: localHash, ...localBody } = local;
  if (evidenceFingerprint(localBody) !== localHash || !local.fixture || local.fixture.fixtureId !== fixture.fixtureId ||
    local.fixture.competitionId !== fixture.competitionId || local.fixture.homeTeamId !== fixture.homeTeamId ||
    local.fixture.awayTeamId !== fixture.awayTeamId || local.fixture.kickoffAt !== fixture.kickoffAt ||
    (local.fixture.cohort ?? "unspecified") !== (fixture.cohort ?? "unspecified")) reasons.push("local-integrity-failed");
  if (!isIssuedLocalGoalForecast(local) && !provenTrue(() => input.verifyLocal?.(local))) reasons.push("local-provenance-unverified");
  let probabilities = local.probabilities, providerSupported = false;
  if (provider) {
    if (provider.source !== "api-football" || provider.fixtureId !== fixture.fixtureId || !instant(provider.observedAt) ||
      provider.observedAt > fixture.forecastAt || fixture.forecastAt - provider.observedAt > maxAgeMs || !provider.evidenceRef ||
      !provenTrue(() => input.verifyProvider?.(provider))) reasons.push("provider-unverified-or-stale");
    for (const family of families) if (provider.probabilities[family]) {
      try {
        assertDistribution(family, provider.probabilities[family]);
        providerSupported = true;
        if (probabilities && marketSelections[family].some((key) => Math.abs(
          (probabilities![family] as Readonly<Record<string, number>>)[key]! - (provider.probabilities[family] as Readonly<Record<string, number>>)[key]!) >= threshold))
          reasons.push(`material-disagreement:${family}`);
      } catch { reasons.push(`provider-invalid:${family}`); }
    }
    if (!providerSupported) warnings.push("provider-markets-unavailable");
  } else warnings.push("provider-unavailable");
  if (context) {
    if (context.source !== "ai-context" || !context.modelVersion || context.modelVersion.length > 128 ||
      context.fixtureId !== fixture.fixtureId || !/^[a-f0-9]{64}$/u.test(context.evidenceHash) ||
      !instant(context.assessedAt) || context.assessedAt > fixture.forecastAt || fixture.forecastAt - context.assessedAt > maxAgeMs ||
      !provenTrue(() => input.verifyContext?.(context))) reasons.push("context-unverified-or-stale");
    for (const fact of context.facts) {
      if (!fact.id || fact.id.length > 512 || !fact.explanation || fact.explanation.length > 4096 ||
        ![fact.sourceIds, fact.claimIds].every((ids) => Array.isArray(ids) && ids.length > 0 && ids.length <= 10_000 &&
          new Set(ids).size === ids.length && ids.every((id) => typeof id === "string" && /^[a-f0-9]{64}$/u.test(id))) ||
        fact.evidenceRef !== null && (typeof fact.evidenceRef !== "string" || fact.evidenceRef.length > 512) ||
        !["verified", "credible-report", "rumour", "unknown"].includes(fact.status) ||
        !["critical", "significant", "minor"].includes(fact.impact) || ![fact.observedAt, fact.availableAt].every(instant) ||
        fact.observedAt > context.assessedAt || fact.availableAt > context.assessedAt ||
        ["verified", "credible-report"].includes(fact.status) && !fact.evidenceRef) reasons.push("context-invalid-evidence");
      if (["verified", "credible-report"].includes(fact.status) && ["critical", "significant"].includes(fact.impact)) reasons.push(`context-review:${fact.id}`);
      if (["unknown", "rumour"].includes(fact.status)) warnings.push(`unverified-context:${fact.id}`);
    }
  } else warnings.push("context-unavailable");
  if (ensemble) {
    const { hash, ...body } = ensemble;
    if (ensemble.learnedAt >= fixture.forecastAt || ensemble.competitionId !== fixture.competitionId ||
      ensemble.cohort !== (fixture.cohort ?? "unspecified") ||
      ensemble.localModelVersion !== local.modelVersion || ensemble.providerModelVersion !== provider?.modelVersion ||
      evidenceFingerprint(body) !== hash || !provenTrue(() => input.verifyEnsemble?.(ensemble))) reasons.push("ensemble-unverified-or-leaking");
    else if (probabilities && provider && reasons.length === 0) {
      const primary = { "match-result": probabilities["match-result"], "total-goals": probabilities["total-goals"],
        "both-teams-to-score": probabilities["both-teams-to-score"] };
      for (const family of families) {
        const learned = ensemble.families[family], supplied = provider.probabilities[family];
        if (learned.status === "estimated" && supplied) {
          if (!Number.isFinite(learned.localWeight) || learned.localWeight < 0 || learned.localWeight > 1 ||
            !Number.isFinite(learned.temperature) || learned.temperature <= 0) { reasons.push("ensemble-invalid-parameters"); continue; }
          Object.assign(primary, { [family]: mix(primary[family], supplied, learned.localWeight, learned.temperature) });
        } else warnings.push(`ensemble-insufficient:${family}`);
      }
      const result = primary["match-result"];
      probabilities = { ...primary, "double-chance": { "home-or-draw": result["home-win"] + result.draw,
        "away-or-draw": result["away-win"] + result.draw, "home-or-away": result["home-win"] + result["away-win"] } };
    }
  } else warnings.push("ensemble-unavailable");
  if (probabilities) {
    try {
      for (const family of families) assertDistribution(family, probabilities[family]);
      if (checkMarketConsistency(probabilities["match-result"], probabilities["total-goals"], probabilities["both-teams-to-score"]).length)
        reasons.push("incoherent-ensemble-markets");
    } catch { reasons.push("invalid-local-markets"); }
  }
  let oddsValue: ValidatedIntelligenceForecast["oddsValue"] = null;
  if (input.quote && probabilities && reasons.length === 0) {
    const quote = input.quote, probability = families.includes(quote.family) ? (probabilities[quote.family] as Readonly<Record<string, number>>)[quote.selection] : undefined;
    if (probability !== undefined && Number.isFinite(quote.decimalOdds) && quote.decimalOdds > 1 && instant(quote.observedAt) &&
      quote.observedAt <= fixture.forecastAt && fixture.forecastAt - quote.observedAt <= maxAgeMs)
      oddsValue = { probability, impliedProbability: 1 / quote.decimalOdds, expectedUnitReturn: probability * quote.decimalOdds - 1 };
    else warnings.push("quote-unavailable-or-stale");
  }
  const body: Omit<ValidatedIntelligenceForecast, "hash"> = { version: "shadow-validator-v1", fixtureId: fixture.fixtureId,
    forecastAt: fixture.forecastAt, mode: "shadow", publish: false, decision: reasons.length ? "withhold" : "eligible-shadow",
    probabilities: reasons.length ? null : probabilities, calibratedProbability: null,
    evidenceReliability: providerSupported && !reasons.length ? "supported" : "limited", modelUncertainty: local.diagnostics.uncertainty,
    oddsValue, components: { local, provider, context }, ensemble, reasons: [...new Set([...reasons, ...warnings])] };
  return freezeEvidence({ ...body, hash: evidenceFingerprint(body) });
}
