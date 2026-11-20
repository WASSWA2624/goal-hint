import "server-only";

import { z } from "zod";
import { bookmakerGoalPrice, bookmakerMarketPrice, type PreMatchBookmakerOdds } from "../../domain/bookmaker-odds.ts";
import { isMarketFamily, marketSources } from "../../domain/markets.ts";
import { compareForecastPicks, forecastConfidence, forecastSourceConfidence, type ForecastConfidence } from "../../domain/recommendation.ts";
import { goalMarketDefinitionSchema } from "../../domain/score-distribution-markets.ts";
import type { EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { ResolvedForecastCandidate, ResolvedForecastMarket } from "../fallback/fallback-contract.ts";
import { canonicalLegacyForecastSelection, evaluateForecastMarkets, legacyForecastMarketKey, type ForecastMarketEvaluation } from "./forecast-market-evaluator.ts";
import type { StoredGoalMarketExtension } from "./goal-market-store.ts";
import { historyHash, historyId, historyInstant, historyVersion } from "./history-input.ts";

const VERSION = "prematch-forecast-decision-v1";
const LOCAL_FIRST_VERSION = "prematch-forecast-decision-v2";
const limits = Object.freeze({ markets: 512, selections: 128, sources: 128, bytes: 1_048_576 });
const token = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._:/@+-]*$/iu);
const reference = z.string().min(1).max(512).regex(/^[^\p{Cc}]+$/u);
const probability = z.number().min(0).max(1);
const grades = z.strictObject({ win: probability, loss: probability, push: probability, "half-win": probability, "half-loss": probability });
const selection = z.strictObject({ key: token, winProbability: probability, winProbabilityUpperBound: probability, outcomes: grades });
const pick = z.strictObject({ selection: token, winProbability: probability, winProbabilityUpperBound: probability });
const baseMarket = z.strictObject({ marketKey: token, family: token, period: token.nullable() });
const confidence = z.strictObject({ status: z.enum(["calibrated", "evaluated", "provisional", "provider-unqualified"]),
  calibrationVersion: reference.nullable(), evaluationVersion: reference.nullable(),
  sample: z.strictObject({ matches: z.number().int().nonnegative(), homeEffectiveMatches: z.number().nonnegative(),
    awayEffectiveMatches: z.number().nonnegative() }).nullable(),
  interval: z.strictObject({ lower: probability, upper: probability }).refine(({ lower, upper }) => lower <= upper).nullable() });
const provenance = z.strictObject({ engine: z.enum(marketSources), modelVersion: reference, policyVersion: reference.nullable(),
  sourceEvidenceRefs: z.array(reference).max(8), sourceIds: z.array(historyHash).max(limits.sources), evidenceHash: historyHash,
  numericalBasis: z.enum(["qualified-joint-score-distribution", "qualified-local-model"]).optional(),
  generatedAt: historyInstant.nullable(), retrievedAt: historyInstant, providerUpdatedAt: historyInstant.nullable() });
const estimatedBase = baseMarket.extend({ status: z.literal("estimated"), source: z.enum(marketSources), ruleVersion: token,
  group: z.enum(["partition", "overlapping", "payout"]), modelVersion: reference.optional(),
  definition: goalMarketDefinitionSchema.optional(), confidence, provenance,
});
const estimatedMarket = estimatedBase.extend({ selections: z.array(selection).min(1).max(limits.selections), recommendation: pick,
  unrepresentedProbability: probability });
// Text preserves the exact binary64 value across MySQL's native JSON round trip.
const probabilityText = z.string().refine((value) => String(Number(value)) === value && probability.safeParse(Number(value)).success);
const exactGrades = z.strictObject({ win: probabilityText, loss: probabilityText, push: probabilityText,
  "half-win": probabilityText, "half-loss": probabilityText });
const exactSelection = selection.extend({ winProbability: probabilityText, winProbabilityUpperBound: probabilityText, outcomes: exactGrades });
const exactPick = pick.extend({ winProbability: probabilityText, winProbabilityUpperBound: probabilityText });
const nonnegativeNumberText = z.string().refine((value) => String(Number(value)) === value && Number.isFinite(Number(value)) && Number(value) >= 0);
const exactConfidence = confidence.extend({ status: z.enum(["calibrated", "evaluated", "provisional", "provider-trusted"]),
  sample: z.strictObject({ matches: z.number().int().nonnegative(),
  homeEffectiveMatches: nonnegativeNumberText, awayEffectiveMatches: nonnegativeNumberText }).nullable(),
  interval: z.strictObject({ lower: probabilityText, upper: probabilityText })
    .refine(({ lower, upper }) => Number(lower) <= Number(upper)).nullable() });
const exactEstimatedMarket = estimatedBase.extend({ selections: z.array(exactSelection).min(1).max(limits.selections),
  recommendation: exactPick, unrepresentedProbability: probabilityText, confidence: exactConfidence });

function coherentEstimate(row: z.infer<typeof estimatedMarket> | z.infer<typeof exactEstimatedMarket>) {
  if (row.source !== row.provenance.engine || new Set(row.selections.map(({ key }) => key)).size !== row.selections.length) return false;
  if (row.definition && (row.definition.key !== row.marketKey || row.definition.period !== row.period ||
    row.definition.selections.length !== row.selections.length ||
    row.definition.selections.some(({ key }) => !row.selections.some((item) => item.key === key)))) return false;
  const best = row.selections.find(({ key }) => key === row.recommendation.selection);
  return best?.winProbability === row.recommendation.winProbability && best.winProbabilityUpperBound === row.recommendation.winProbabilityUpperBound &&
    row.selections.every((item) =>
      item.winProbability === item.outcomes.win && Number(item.winProbability) <= Number(row.recommendation.winProbability) &&
      Math.min(1, Number(item.winProbability) + Number(row.unrepresentedProbability)) === Number(item.winProbabilityUpperBound) &&
      Math.abs(Object.values(item.outcomes).reduce((sum, mass) => sum + Number(mass), Number(row.unrepresentedProbability)) - 1) <= 1e-6);
}
const unavailableGroup = z.strictObject({ family: token, period: token.nullable(), reason: token, detail: reference.optional(),
  marketKeys: z.array(token).min(1).max(limits.markets) });
const engines = z.strictObject({
  ai: z.strictObject({ status: token, reason: reference.nullable() }), local: token,
  provider: z.strictObject({ status: token, reason: reference.nullable() }),
});
const transition = z.strictObject({ selected: z.enum(marketSources).nullable(), ai: token, local: token, provider: token });
const transitions = z.strictObject({ "match-result": transition, "double-chance": transition,
  "total-goals": transition, "both-teams-to-score": transition });
const topPick = z.strictObject({ marketKey: token, selection: token, canonicalSelection: token, winProbability: probability, source: z.enum(marketSources),
  confidence: z.enum(forecastConfidence).optional() });
const exactTopPick = topPick.extend({ winProbability: probabilityText, confidence: z.enum(forecastConfidence) });
const bodyShape = {
  forecastType: z.literal("pre-match"), registryVersion: token, evaluationVersion: token,
  fixtureId: historyId, cycleId: historyId, scheduleVersion: historyVersion, kickoffAt: historyInstant,
  evidenceSnapshotId: historyHash, evidenceHash: historyHash, evidenceCutoffAt: historyInstant, generatedAt: historyInstant,
  publicationCutoffAt: historyInstant, explanationHash: historyHash, sourceIds: z.array(historyHash).max(limits.sources),
  candidateHash: historyHash, status: z.enum(["estimated", "abstained"]), engines, transitions: transitions.optional(),
  unavailable: z.array(unavailableGroup).max(limits.markets),
};
export const forecastDecisionSchema = z.discriminatedUnion("version", [
  z.strictObject({ ...bodyShape, version: z.literal(VERSION), topPick: topPick.nullable(),
    markets: z.array(estimatedMarket.refine(coherentEstimate)).max(limits.markets), hash: historyHash }),
  z.strictObject({ ...bodyShape, version: z.literal(LOCAL_FIRST_VERSION), topPick: exactTopPick.nullable(),
    markets: z.array(exactEstimatedMarket.refine(coherentEstimate)).max(limits.markets), goalExtensionHash: historyHash.nullable(), hash: historyHash }),
]).refine((value) => {
  const { hash, ...body } = value;
  const keys = [...body.markets.map(({ marketKey }) => marketKey), ...body.unavailable.flatMap(({ marketKeys }) => marketKeys)];
  const pick = body.topPick;
  const correctTop = body.version !== LOCAL_FIRST_VERSION || (pick === null ? body.markets.every((row) => row.recommendation.winProbability === "0")
    : body.markets.every((row) => Number(row.recommendation.winProbability) <= Number(pick.winProbability)));
  return body.evidenceCutoffAt <= body.generatedAt && body.generatedAt < body.publicationCutoffAt && body.publicationCutoffAt < body.kickoffAt &&
    keys.length > 0 && keys.length <= limits.markets && new Set(keys).size === keys.length &&
    (body.status === "estimated") === (body.markets.length > 0) && correctTop &&
    (pick === null || body.markets.some((row) => row.marketKey === pick.marketKey && row.source === pick.source &&
      (body.version === LOCAL_FIRST_VERSION ? pick.selection === pick.canonicalSelection
        : isMarketFamily(row.family) && canonicalLegacyForecastSelection(row.family, pick.selection) === pick.canonicalSelection) &&
      row.selections.some(({ key, winProbability }) => key === pick.canonicalSelection && winProbability === pick.winProbability))) &&
    body.markets.every((row) => row.provenance.evidenceHash === body.evidenceHash &&
      row.provenance.retrievedAt <= body.generatedAt && row.provenance.sourceIds.every((sourceId) => body.sourceIds.includes(sourceId))) &&
    Buffer.byteLength(evidenceSerialize(body), "utf8") <= limits.bytes && hash === evidenceFingerprint(body);
});
export type ForecastDecision = Readonly<z.infer<typeof forecastDecisionSchema>>;

type UnavailableMarket = Extract<ForecastMarketEvaluation, { status: "unavailable" }>;
function groupUnavailableMarkets(markets: readonly UnavailableMarket[]) {
  const grouped = new Map<string, Omit<UnavailableMarket, "marketKey" | "status"> & { marketKeys: string[] }>();
  for (const { marketKey, status, ...reason } of markets) {
    void status;
    const key = evidenceFingerprint(reason), known = grouped.get(key);
    if (known) known.marketKeys.push(marketKey);
    else grouped.set(key, { ...reason, marketKeys: [marketKey] });
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => ({ ...group, marketKeys: group.marketKeys.sort() }));
}

/** Private reads can recover every exact unavailable instance without repeating its reason in storage. */
export function unavailableForecastMarkets(decision: ForecastDecision) {
  return freezeEvidence(decision.unavailable.flatMap(({ marketKeys, ...group }) =>
    marketKeys.map((marketKey) => ({ ...group, marketKey, status: "unavailable" as const }))));
}

function marketProof(item: Extract<ResolvedForecastMarket, { available: true }>, evidenceHash: string, sourceIds: string[]) {
  const engine = item.provenance;
  const base = { engine: engine.kind, evidenceHash, ...item.timestamps };
  const support = { interval: null, sample: null, calibrationVersion: null, evaluationVersion: null } as const;
  switch (engine.kind) {
    case "ai":
      return { provenance: { ...base, modelVersion: engine.modelVersionId, policyVersion: null,
        sourceEvidenceRefs: [engine.transportEvidenceRef], sourceIds: engine.sources.map(({ sourceId }) => sourceId).sort(),
        ...(engine.numericalBasis ? { numericalBasis: engine.numericalBasis } : {}) },
      confidence: { ...support, status: (engine.provisional ? "provisional" : engine.calibration.kind === "evaluated" ? "calibrated" : "evaluated") as
        "provisional" | "calibrated" | "evaluated", calibrationVersion: engine.calibration.version, evaluationVersion: engine.evaluation.version } };
    case "local-engine":
      return { provenance: { ...base, modelVersion: engine.modelVersion, policyVersion: null, sourceEvidenceRefs: [engine.historyHash], sourceIds,
        ...(engine.numericalBasis ? { numericalBasis: engine.numericalBasis } : {}) },
        confidence: { ...support, status: "provisional" as const, sample: engine.sample } };
    case "api-football":
      return { provenance: { ...base, modelVersion: engine.source.contractVersion, policyVersion: engine.policyVersion,
        sourceEvidenceRefs: [engine.source.sourceEvidenceRef, engine.source.observationHash], sourceIds: [] },
      confidence: { ...support, status: "provider-unqualified" as const } };
  }
}

type ForecastDecisionInput = Readonly<{
  candidate: ResolvedForecastCandidate; snapshot: EvidenceSnapshot; evidenceSnapshotId: string;
  scheduleVersion: number; generationCompletedAt: number; publicationCutoffAt: number;
}>;

function decisionBody(input: ForecastDecisionInput, evaluated: ReturnType<typeof evaluateForecastMarkets>) {
  const { candidate, snapshot } = input;
  const { fixtureId, cycleId, kickoffAt, cutoffAt: evidenceCutoffAt } = candidate.context.context;
  const evidenceHash = candidate.context.evidenceHash;
  if (snapshot.hash !== evidenceHash || evidenceFingerprint(snapshot.context) !== evidenceFingerprint(candidate.context.context))
    throw new Error("Forecast evidence does not match its sealed candidate.");
  const sourceIds = snapshot.sources.map(({ id }) => id).sort();
  const { audit } = candidate;
  const body = { forecastType: "pre-match" as const, registryVersion: evaluated.registryVersion, evaluationVersion: evaluated.version,
    fixtureId, cycleId, scheduleVersion: input.scheduleVersion, kickoffAt, evidenceSnapshotId: input.evidenceSnapshotId, evidenceHash,
    evidenceCutoffAt, generatedAt: input.generationCompletedAt, publicationCutoffAt: input.publicationCutoffAt,
    explanationHash: evidenceFingerprint({ reasons: candidate.reasons, uncertainty: candidate.uncertainty }), sourceIds,
    candidateHash: evidenceFingerprint(candidate), engines: { ai: { status: audit.aiStatus, reason: audit.aiReason },
      local: audit.localStatus ?? "not-requested", provider: { status: audit.providerStatus, reason: audit.providerReason } },
    ...(audit.transitions ? { transitions: audit.transitions } : {}),
    unavailable: groupUnavailableMarkets(evaluated.markets.filter((row) => row.status === "unavailable")) };
  return { body, evidenceHash, sourceIds };
}

/** Called only after the original candidate and evidence have been rechecked under the fixture lock. */
export function buildForecastDecision(input: ForecastDecisionInput) {
  const { candidate } = input, evaluated = evaluateForecastMarkets({ candidateMarkets: candidate.markets });
  const { body: identity, evidenceHash, sourceIds } = decisionBody(input, evaluated);
  const markets = evaluated.markets.flatMap((row) => {
    if (row.status === "unavailable") return [];
    const original = isMarketFamily(row.family) ? candidate.markets[row.family] : null;
    if (!original?.available || original.market.source !== row.source) throw new Error("Forecast market proof is unavailable.");
    return [{ ...row, ...marketProof(original, evidenceHash, sourceIds) }];
  });
  const { audit } = candidate;
  const picked = audit.recommendation?.selected;
  const canonicalSelection = picked ? canonicalLegacyForecastSelection(picked.family, picked.selection) : null;
  const top = picked && markets.find(({ family }) => family === picked.family);
  if (picked && (!top || canonicalSelection === null)) throw new Error("Selected forecast market is unavailable.");
  const body = { ...identity, version: VERSION, status: markets.length ? "estimated" : "abstained",
    topPick: picked && top && canonicalSelection ? { marketKey: top.marketKey, selection: picked.selection, canonicalSelection,
      winProbability: picked.probability, source: picked.source,
      ...(picked.confidence ? { confidence: picked.confidence } : {}) } : null,
    markets };
  return freezeEvidence(forecastDecisionSchema.parse({ ...body, hash: evidenceFingerprint(body) }));
}

function encodeExactMarket(row: Extract<ForecastMarketEvaluation, { status: "estimated" }> & ReturnType<typeof marketProof>): z.infer<typeof exactEstimatedMarket> {
  const { sample, interval, status, ...support } = row.confidence;
  const encodeWin = <T extends { winProbability: number; winProbabilityUpperBound: number }>(item: T) => ({ ...item,
    winProbability: String(item.winProbability), winProbabilityUpperBound: String(item.winProbabilityUpperBound) });
  return { ...row, unrepresentedProbability: String(row.unrepresentedProbability), recommendation: encodeWin(row.recommendation),
    confidence: { ...support, status: status === "provider-unqualified" ? "provider-trusted" : status,
      sample: sample && { matches: sample.matches, homeEffectiveMatches: String(sample.homeEffectiveMatches),
      awayEffectiveMatches: String(sample.awayEffectiveMatches) }, interval },
    selections: row.selections.map((item) => ({ ...encodeWin(item), outcomes: { win: String(item.outcomes.win), loss: String(item.outcomes.loss),
      push: String(item.outcomes.push), "half-win": String(item.outcomes["half-win"]), "half-loss": String(item.outcomes["half-loss"]) } })) };
}

/** Store one outcome distribution per eligible identity and rank only independently supported forecasts. */
export async function buildLocalFirstForecastDecision(input: ForecastDecisionInput & Readonly<{
  goalExtension: StoredGoalMarketExtension | null;
  loadOdds?: () => Promise<PreMatchBookmakerOdds | null>;
}>) {
  const { candidate, goalExtension } = input;
  const evaluated = evaluateForecastMarkets({ candidateMarkets: candidate.markets, localFirst: true,
    ...(goalExtension ? { publishedLocalMarkets: goalExtension.markets } : {}) });
  const { body: identity, evidenceHash, sourceIds } = decisionBody(input, evaluated);
  const local = Object.values(candidate.markets).find((item) => item.available && item.provenance.kind === "local-engine");
  const rows = evaluated.markets.flatMap((row) => {
    if (row.status === "unavailable") return [];
    const family = isMarketFamily(row.family) && row.marketKey === legacyForecastMarketKey(row.family) ? row.family : null;
    const legacy = family ? candidate.markets[family] : null;
    const original = legacy?.available ? legacy : local;
    if (!original?.available || original.market.source !== row.source) throw new Error("Forecast market proof is unavailable.");
    return [{ row: { ...row, ...marketProof(original, evidenceHash, sourceIds) }, family }];
  });
  const candidates = rows.flatMap(({ row, family }) => {
    const confidence: ForecastConfidence = row.confidence.status === "calibrated" ? "calibrated" : forecastSourceConfidence(row.source) ?? "limited";
    return row.selections.filter(({ winProbability }) => winProbability > 0 && winProbability === row.recommendation.winProbability)
      .map(({ key: selection, winProbability: probability }) => ({ key: row.marketKey, selection, source: row.source, probability, confidence, family, odds: null }));
  }).sort(compareForecastPicks);
  const best = candidates[0];
  const ties = best ? candidates.filter(({ probability, confidence }) => probability === best.probability && confidence === best.confidence) : [];
  const odds = ties.length > 1 ? await input.loadOdds?.() ?? null : null;
  const selected = odds ? ties.map((pick) => {
    const { family } = pick, market = family ? candidate.markets[family] : null;
    const selection = family && market?.available ? Object.keys(market.market.probabilities)
      .find((key) => canonicalLegacyForecastSelection(family, key) === pick.selection) : undefined;
    return { ...pick, odds: family && selection ? bookmakerMarketPrice(odds, family, selection) : bookmakerGoalPrice(odds, pick.key, pick.selection) };
  }).sort(compareForecastPicks)[0] : best;
  const top = selected ? { marketKey: selected.key, selection: selected.selection, canonicalSelection: selected.selection,
    winProbability: String(selected.probability), source: selected.source, confidence: selected.confidence } : null;
  const body = { ...identity, version: LOCAL_FIRST_VERSION, status: rows.length ? "estimated" : "abstained",
    goalExtensionHash: goalExtension?.contentHash ?? null, topPick: top, markets: rows.map(({ row }) => encodeExactMarket(row)) };
  return freezeEvidence(forecastDecisionSchema.parse({ ...body, hash: evidenceFingerprint(body) }));
}
