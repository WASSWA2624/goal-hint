import "server-only";

import { isBeforePublicationCutoff, utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { checkMarketConsistency, validateMarketSnapshot, type AcceptedMarket, type ConsistencyConstraint, type MarketAvailability,
  type MarketSnapshot, type SourceGroup } from "../../domain/markets.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import { isPredictorForecastCurrent } from "../predictor/predictor-output.ts";
import { synchronous, provenTrue as verified } from "../shared/authority-proof.ts";
import type { FallbackContext, FallbackReason, FallbackResolutionAuthority, FallbackResolutionResult, ForecastExplanation,
  ForecastProvenance, ForecastSourceOrder, ProviderFallbackCandidate, ProviderFallbackResult, ResolvedForecastCandidate,
  ResolvedForecastMarket } from "./fallback-contract.ts";
import { parseFallbackAiResult, parseFallbackContext, parseProviderFallbackResult } from "./fallback-input.ts";

const groups = ["match-result", "total-goals", "both-teams-to-score"] as const;
const families = ["match-result", "double-chance", "total-goals", "both-teams-to-score"] as const;
function sourceCandidate(availability: MarketAvailability): unknown {
  if (!availability.available) return undefined;
  const market = availability.market;
  return { source: market.source, period: market.period, probabilities: market.probabilities,
    ...(market.family === "total-goals" ? { line: market.line } : {}) };
}
/** Freshness uses the pinned policy and original clocks, after independent ownership proof. */
export function isFallbackAiCurrent(ai: PredictorResult, now: UtcInstant): boolean {
  return ai.status === "denied" || isPredictorForecastCurrent(ai.output, now);
}
function aiGroups(ai: PredictorResult, now?: UtcInstant) {
  return validateMarketSnapshot(ai.status === "candidate" && (now === undefined || isFallbackAiCurrent(ai, now)) ? Object.fromEntries(groups.flatMap((family) => {
    const candidate = sourceCandidate(ai.output.markets.markets[family]); return candidate === undefined ? [] : [[family, candidate]];
  })) : {});
}
/** Use only after authenticating the owning AI result. No provider support is inferred. */
export function fallbackRequestedGroups(ai: PredictorResult, now?: UtcInstant): readonly SourceGroup[] {
  const snapshot = aiGroups(parseFallbackAiResult(ai), now);
  return Object.freeze(groups.filter((family) => !snapshot.markets[family].available));
}
function fallbackReason(ai: PredictorResult, family: SourceGroup, now: UtcInstant): FallbackReason {
  if (ai.status === "candidate" && !isFallbackAiCurrent(ai, now)) return Object.freeze({ reason: "ai-invalid-group", detail: "invalid-timing" });
  if (ai.status === "denied") return Object.freeze({ reason: ai.reason === "timeout" || ai.reason === "time-limit" ? "ai-timeout"
    : ai.reason === "insufficient-evidence" ? "ai-insufficient-evidence"
      : ["budget-exhausted", "job-budget-exhausted", "token-limit", "request-limit", "billed-unit-limit"].includes(ai.reason)
        ? "ai-budget-exhausted" : "ai-failure", detail: ai.reason });
  const original = ai.output.markets.markets[family];
  const reason = original.available ? "cross-market-conflict" : original.reason;
  return Object.freeze({ reason: reason === "missing-group" ? "ai-missing-group" : "ai-invalid-group", detail: reason });
}
/** Under provider-first the provider is the reviewed baseline, whatever the AI returned; the detail records the AI state. */
function providerFirstReason(ai: PredictorResult, now: UtcInstant): FallbackReason {
  return Object.freeze({ reason: "provider-first", detail: ai.status === "candidate" ? isFallbackAiCurrent(ai, now) ? "ai-shadow" : "invalid-timing" : ai.reason });
}
/** Feasible-marginal conflicts between a provider match result and both AI binary groups. Under provider-first the
 * provider baseline is kept and both AI groups are dropped; nothing is filled. */
function providerFirstConflict(chosen: Readonly<Partial<Record<SourceGroup, MarketAvailability>>>): readonly ConsistencyConstraint[] {
  const result = chosen["match-result"], totals = chosen["total-goals"], btts = chosen["both-teams-to-score"];
  if (!result?.available || !totals?.available || !btts?.available || result.market.family !== "match-result" ||
    totals.market.family !== "total-goals" || btts.market.family !== "both-teams-to-score" || result.market.source !== "api-football" ||
    totals.market.source !== "ai" || btts.market.source !== "ai") return [];
  return checkMarketConsistency(result.market.probabilities, totals.market.probabilities, btts.market.probabilities);
}
function aiProvenance(ai: Extract<PredictorResult, { status: "candidate" }>): ForecastProvenance {
  return freezeEvidence({ kind: "ai", pin: ai.pin, modelVersionId: ai.output.modelVersionId, evidenceHash: ai.output.evidenceHash,
    transportEvidenceRef: ai.output.timestamps.evidenceRef, calibration: ai.output.calibration, evaluation: ai.output.evaluation,
    provisional: ai.output.provisional, sources: ai.output.sources, evidence: ai.output.evidence, outputTiming: ai.output.outputTiming });
}
function explanation(text: string, sourceUrls: readonly string[] = []): ForecastExplanation {
  return freezeEvidence({ text, sourceUrls: [...new Set(sourceUrls)] });
}
function explanations(markets: ResolvedForecastCandidate["markets"], ai: PredictorResult,
  order?: ForecastSourceOrder): Pick<ResolvedForecastCandidate, "reasons" | "uncertainty"> {
  const available = Object.values(markets).filter((value): value is Extract<ResolvedForecastMarket, { available: true }> => value.available);
  const aiUsed = available.some((value) => value.market.source === "ai"), providerUsed = available.some((value) => value.market.source === "api-football");
  const providerUrls = available.flatMap((value) => value.provenance.kind !== "api-football" || value.provenance.source.sourceUrl === null
    ? [] : [value.provenance.source.sourceUrl]);
  const reasons: ForecastExplanation[] = [];
  if (aiUsed && ai.status === "candidate") {
    for (const item of ai.output.reasons) reasons.push(explanation(item.text, ai.output.sources.flatMap((source) =>
      source.sourceUrl === null || !item.references.some((reference) => reference.sourceId === source.sourceId) ? [] : [source.sourceUrl])));
  }
  if (providerUsed) {
    const basis = explanation(order === "provider-first" ? "API-Football supplies the validated statistical forecast for the match result."
      : "API-Football fallback supplies a validated statistical forecast for the available provider group.", providerUrls);
    if (reasons.length === 4) reasons[3] = basis; else reasons.push(basis);
  }
  if (!aiUsed && markets["match-result"].available) reasons.push(explanation("Double chance is derived from the same selected home, draw and away probability group."));
  if (available.length === 0) reasons.push(explanation("No complete validated probability group is available for this refresh."),
    explanation("Publication logic must retain an eligible previous forecast or mark this fixture unavailable."));
  else if (reasons.length < 2) reasons.push(explanation("Available selections use complete regulation-time probability groups."));
  // AI reasons may discuss the outcome while the published match result is the provider's; say so first so it is never trimmed.
  const uncertainties: string[] = order === "provider-first" && aiUsed && providerUsed
    ? ["The match result comes from API-Football; AI notes cover the goal markets."] : [];
  if (aiUsed && ai.status === "candidate") uncertainties.push(ai.output.uncertainty.text);
  if (available.length < families.length) uncertainties.push("One or more market families are unavailable.");
  if (available.some((value) => value.flags.length > 0)) uncertainties.push("Some source generation or update times are unknown.");
  if (aiUsed && ai.status === "candidate" && ai.output.evidence.coverage.limitedNews) uncertainties.push("News coverage is limited.");
  if (uncertainties.length === 0) uncertainties.push("These probabilities are estimates; no outcome is guaranteed.");
  const uncertaintySources = aiUsed && ai.status === "candidate" ? ai.output.sources.flatMap((source) => source.sourceUrl === null ||
    !ai.output.uncertainty.references.some((reference) => reference.sourceId === source.sourceId) ? [] : [source.sourceUrl]) : [];
  const boundedUncertainties = uncertainties.reduce<string[]>((accepted, item) => [...accepted, item].join(" ").length <= 4096 ? [...accepted, item] : accepted, []);
  return freezeEvidence({ reasons, uncertainty: explanation(boundedUncertainties.join(" "), uncertaintySources) });
}
/** Compose one refresh from complete groups. This never reads old markets,
 * mutates revisions, publishes, averages sources or fills missing probabilities. */
export function resolveFallbackCandidate(value: Readonly<{
  expected: FallbackContext; ai: PredictorResult; provider: ProviderFallbackResult | null; now: UtcInstant;
  /** Absent keeps the original AI-first resolution and an audit without a source order. */
  order?: ForecastSourceOrder;
}>, authority: FallbackResolutionAuthority): FallbackResolutionResult {
  const denied = (reason: "invalid-request" | "not-authorized" | "ineligible-refresh"): FallbackResolutionResult => Object.freeze({ status: "denied", reason });
  let expected: FallbackContext, ai: PredictorResult, provider: ProviderFallbackResult | null, now: UtcInstant;
  const order = value?.order;
  try {
    if (value === null || typeof value !== "object" || Object.keys(value).some((key) => !["expected", "ai", "provider", "now", "order"].includes(key)) ||
      order !== undefined && order !== "provider-first" && order !== "ai-first") throw new Error();
    expected = parseFallbackContext(value.expected); ai = parseFallbackAiResult(value.ai);
    provider = value.provider === null ? null : parseProviderFallbackResult(value.provider); now = utcInstantFromEpochMilliseconds(value.now);
    if (ai.status === "candidate" && (expected.pin === null || ai.pin.id !== expected.pin.id || ai.pin.jobId !== expected.jobId ||
      ai.output.modelVersionId !== expected.pin.modelVersionId || ai.output.evidenceHash !== expected.evidenceHash ||
      evidenceFingerprint(ai.output.context) !== evidenceFingerprint(expected.context))) throw new Error();
  } catch { return denied("invalid-request"); }
  function current(): boolean {
    try { return synchronous(authority.authorize(expected)) === undefined && verified(() => authority.verifyContext(expected)) &&
      verified(() => authority.verifyAi(ai, expected, now)); } catch { return false; }
  }
  if (!current()) return denied("not-authorized");
  if (now < expected.context.analysisAt || !isBeforePublicationCutoff(now, expected.context.kickoffAt)) return denied("ineligible-refresh");
  let supplied: ProviderFallbackCandidate | null = null;
  if (provider?.status === "candidate") {
    if (provider.candidate.provenance.jobId !== expected.jobId ||
      evidenceFingerprint(provider.candidate.context) !== evidenceFingerprint(expected.context)) {
      provider = Object.freeze({ status: "denied", reason: "wrong-identity", requestsDispatched: provider.requestsDispatched,
        requestCountUnknown: provider.requestCountUnknown });
    } else if (!verified(() => authority.verifyProvider((provider as Extract<ProviderFallbackResult, { status: "candidate" }>).candidate, expected, now))) {
      provider = Object.freeze({ status: "denied", reason: "not-authorized", requestsDispatched: provider.requestsDispatched,
        requestCountUnknown: provider.requestCountUnknown });
    } else supplied = provider.candidate;
  }
  const validAi = aiGroups(ai, now);
  const primaryProvenance = ai.status === "candidate" ? aiProvenance(ai) : null;
  const providerFirst = order === "provider-first";
  function compose(): ResolvedForecastCandidate {
    const chosen: Partial<Record<SourceGroup, MarketAvailability>> = {};
    for (const family of groups) {
      const aiMarket = validAi.markets[family], providerMarket = supplied?.markets.markets[family];
      if (providerFirst && providerMarket?.available) chosen[family] = providerMarket;
      else if (aiMarket.available) chosen[family] = aiMarket;
      else if (providerMarket?.available) chosen[family] = providerMarket;
    }
    const constraints = providerFirst ? providerFirstConflict(chosen) : [];
    if (constraints.length > 0) { delete chosen["total-goals"]; delete chosen["both-teams-to-score"]; }
    let selected: MarketSnapshot = validateMarketSnapshot(Object.fromEntries(Object.entries(chosen).map(([family, market]) => [family, sourceCandidate(market)])));
    if (constraints.length > 0) {
      const binary = ["total-goals", "both-teams-to-score"] as const;
      selected = freezeEvidence({ ...selected,
        markets: { ...selected.markets, ...Object.fromEntries(binary.map((family) => [family, { available: false, reason: "cross-market-conflict" }])) },
        issues: [...selected.issues.filter((issue) => !binary.some((family) => family === issue.family)),
          ...binary.map((family) => ({ family, reason: "cross-market-conflict" as const, relatedGroups: groups, constraints }))] });
    }
    const markets = {} as Record<typeof families[number], ResolvedForecastMarket>;
    const fallbackProvenance: ForecastProvenance | null = supplied === null ? null : freezeEvidence({ kind: "api-football", source: supplied.provenance,
      policyVersion: supplied.policyVersion, policyEvidenceRef: supplied.policyEvidenceRef });
    for (const family of families) {
      const availability = selected.markets[family], group = family === "double-chance" ? "match-result" : family;
      if (!availability.available) {
        const unavailable = supplied?.markets.markets[family];
        const originalAi = ai.status === "candidate" ? ai.output.markets.markets[family] : null;
        const reason = availability.reason !== "missing-group" ? availability.reason : unavailable && !unavailable.available ? unavailable.reason
          : provider?.status === "denied" ? provider.reason : ai.status === "candidate" && !isFallbackAiCurrent(ai, now) ? "invalid-timing"
            : originalAi && !originalAi.available ? originalAi.reason : "missing-group";
        markets[family] = Object.freeze({ available: false, reason }); continue;
      }
      const market: AcceptedMarket = availability.market;
      if (market.source === "ai" && ai.status === "candidate" && primaryProvenance !== null) {
        markets[family] = freezeEvidence({ available: true, market, fallback: null, timestamps: {
          generatedAt: ai.output.timestamps.generatedAt, retrievedAt: ai.output.timestamps.retrievedAt, providerUpdatedAt: ai.output.timestamps.providerUpdatedAt },
        provenance: primaryProvenance, flags: ai.output.flags });
      } else if (market.source === "api-football" && supplied !== null && fallbackProvenance !== null) {
        markets[family] = freezeEvidence({ available: true, market, fallback: providerFirst ? providerFirstReason(ai, now) : fallbackReason(ai, group, now),
          timestamps: supplied.timestamps, provenance: fallbackProvenance, flags: supplied.flags });
      } else throw new Error("A selected forecast group has no authenticated source.");
    }
    return freezeEvidence({ context: expected, markets, issues: selected.issues, ...explanations(markets, ai, order),
      audit: { aiStatus: ai.status, aiReason: ai.status === "denied" ? ai.reason : isFallbackAiCurrent(ai, now) ? null : "invalid-timing",
        providerStatus: provider?.status ?? "not-requested", providerReason: provider?.status === "denied" ? provider.reason : null,
        ...(order === undefined ? {} : { sourceOrder: order }) } });
  }
  let candidate: ResolvedForecastCandidate;
  try { candidate = compose(); } catch { return denied("invalid-request"); }
  if (!current()) return denied("not-authorized");
  if (supplied !== null && !verified(() => authority.verifyProvider(supplied!, expected, now))) {
    provider = Object.freeze({ status: "denied", reason: "not-authorized", requestsDispatched: provider!.requestsDispatched,
      requestCountUnknown: provider!.requestCountUnknown });
    supplied = null;
    // One source-specific retry of pure composition preserves independent AI.
    try { candidate = compose(); } catch { return denied("invalid-request"); }
    if (!current()) return denied("not-authorized");
  }
  return groups.some((family) => candidate.markets[family].available) ? freezeEvidence({ status: "candidate", candidate })
    : freezeEvidence({ status: "retain-previous-or-unavailable", candidate });
}
