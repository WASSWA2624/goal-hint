import "server-only";

import { z } from "zod";
import { getPublicationDeadline, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { MARKET_RULE_VERSION } from "../../domain/markets.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence, parseEvidenceContext } from "../evidence/evidence-input.ts";
import { parseFallbackMarketSnapshot } from "../fallback/fallback-input.ts";
import { parseModelVersion } from "../predictor/predictor-input.ts";
import { EVALUATION_VERSION, evaluationSystems } from "./evaluation-contract.ts";
import type { BaselineConfiguration, EvaluationDataset, EvaluationDatasetConfiguration, EvaluationProtocol, EvaluationProtocolConfiguration } from "./evaluation-contract.ts";

export class EvaluationInputError extends Error {
  readonly reason: "invalid-protocol" | "invalid-dataset" | "leakage" | "not-authorized" | "invalid-request";
  constructor(reason: EvaluationInputError["reason"] = "invalid-request") {
    super("Forecast evaluation is invalid or unavailable. Private dataset details are withheld."); this.name = "EvaluationInputError"; this.reason = reason;
  }
}
const label = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);
const ref = z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value));
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const uuid = z.uuid().transform((value) => value.toLowerCase());
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = count.positive();
const instant = z.number().int().transform(utcInstantFromEpochMilliseconds);
const window = z.object({ startsAt: instant, endsAt: instant }).strict().refine((value) => value.startsAt < value.endsAt);
const family = z.enum(["match-result", "double-chance", "total-goals", "both-teams-to-score"]);
const boundedNumber = z.number().finite().min(-1_000_000).max(1_000_000);
const baseline = z.object({ version: label, lookbackMs: positive, minimumMatches: positive.max(100_000),
  leagueFrequency: z.object({ alpha: z.number().positive().max(1_000_000) }).strict(),
  teamStrength: z.object({ initialRating: boundedNumber, kFactor: z.number().positive().max(10_000),
    scale: z.number().positive().max(1_000_000), homeAdvantage: boundedNumber, drawWeight: z.number().positive().max(1_000_000) }).strict(),
}).strict();
const gate = z.object({ id: label, purpose: z.enum(["candidate", "public-claim"]), system: z.enum(evaluationSystems), family,
  horizonId: label, minimumSamples: positive.max(1_000_000), minimumCoverage: z.number().min(0).max(1),
  maximumBrier: z.number().nonnegative().max(2).nullable(), maximumLogLoss: z.number().nonnegative().finite().nullable(),
  maximumCalibrationError: z.number().min(0).max(1).nullable(), baseline: z.enum(["league-frequency", "team-strength"]).nullable(),
  maximumBrierDifference: z.number().finite().min(-2).max(2).nullable(),
}).strict().refine((value) => (value.baseline === null) === (value.maximumBrierDifference === null) &&
  (value.maximumBrier !== null || value.maximumLogLoss !== null || value.maximumCalibrationError !== null || value.baseline !== null));
const model = z.unknown().transform(parseModelVersion);
const protocol = z.object({ version: z.literal(EVALUATION_VERSION), name: label, ruleVersion: z.literal(MARKET_RULE_VERSION),
  frozenAt: instant.nullable(), approvalRef: ref.nullable(), selectionVersion: label,
  windows: z.object({ training: window.nullable(), validation: window.nullable(), calibration: window.nullable(), finalTest: window.nullable() }).strict(),
  competitionIds: z.array(uuid).max(1000), horizons: z.array(z.object({ id: label, minimumMs: count, maximumMs: positive }).strict()
    .refine((value) => value.minimumMs < value.maximumMs)).max(32),
  candidateModel: model.nullable(), previousApprovedModel: model.nullable(), providerContractVersion: label.nullable(),
  calibrationBands: z.array(z.number().min(0).max(1)).min(2).max(101), confidenceZ: z.number().positive().max(10),
  baselines: baseline, gates: z.array(gate).min(1).max(1000).nullable(),
}).strict().superRefine((value, context) => {
  const problem = () => context.addIssue({ code: "custom", message: "Invalid chronological evaluation configuration." });
  const windows = Object.values(value.windows).filter((entry) => entry !== null);
  if (windows.some((entry, index) => index > 0 && windows[index - 1]!.endsAt > entry.startsAt)) problem();
  if (new Set(value.competitionIds).size !== value.competitionIds.length || new Set(value.horizons.map((entry) => entry.id)).size !== value.horizons.length) problem();
  const sortedHorizons = [...value.horizons].sort((a, b) => a.minimumMs - b.minimumMs);
  if (sortedHorizons.some((entry, index) => index > 0 && sortedHorizons[index - 1]!.maximumMs > entry.minimumMs)) problem();
  const bands = value.calibrationBands;
  if (bands[0] !== 0 || bands.at(-1) !== 1 || bands.some((entry, index) => index > 0 && entry <= bands[index - 1]!)) problem();
  if (value.gates && (new Set(value.gates.map((entry) => entry.id)).size !== value.gates.length ||
    value.gates.some((entry) => !value.horizons.some((band) => band.id === entry.horizonId)))) problem();
  if (value.frozenAt !== null && (!value.approvalRef || windows.length !== 4 || value.competitionIds.length === 0 || value.horizons.length === 0 ||
    value.gates === null || value.frozenAt > value.windows.finalTest!.startsAt || value.frozenAt < value.windows.calibration!.endsAt)) problem();
  if (value.previousApprovedModel && value.previousApprovedModel.evaluation.status !== "evaluated") problem();
});
const context = z.unknown().transform(parseEvidenceContext);
const markets = z.unknown().transform((value) => parseFallbackMarketSnapshot(value));
const proof = z.object({ id: hash, version: label, kind: z.enum(["football", "news", "provider-forecast"]),
  availableAt: instant, retrievedAt: instant, publishedAt: instant.nullable(), providerUpdatedAt: instant.nullable(), evidenceRef: ref }).strict();
const forecast = z.object({ version: label, modelVersionId: hash.nullable(), calibrationVersion: label.nullable(), receiptHash: hash,
  evidenceRef: ref, capture: z.enum(["historical-snapshot", "prospective"]), capturedAt: instant, generatedAt: instant.nullable(),
  providerUpdatedAt: instant.nullable(), evidence: z.array(proof).max(10_000), markets }).strict();
const score = z.union([z.object({ verified: z.literal(true), period: z.literal("regulation-including-stoppage-time"), home: count, away: count }).strict()
  .refine((value) => Number.isSafeInteger(value.home + value.away)), z.object({ verified: z.literal(false) }).strict()]);
const settlement = z.object({ status: z.enum(["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties",
  "postponed", "canceled", "abandoned", "awarded", "unknown"]), cycleEligibility: z.union([
    z.object({ eligible: z.literal(true) }).strict(), z.object({ eligible: z.literal(false), reason: z.enum(["postponed-cycle", "cutoff-invalidated", "ineligible-cycle"]) }).strict(),
  ]), regulationScore: score.nullable() }).strict();
const fixture = z.object({ context, competitionId: uuid, forecastAt: instant, manifestAt: instant,
  result: z.object({ context: settlement, availableAt: instant.nullable(), observationHash: hash, evidenceRef: ref }).strict(),
  forecasts: z.object({ ai: forecast.nullable(), "api-football": forecast.nullable(), combined: forecast.nullable() }).strict(),
  unavailableReasons: z.object({ ai: ref.nullable(), "api-football": ref.nullable(), combined: ref.nullable() }).strict(),
}).strict();
const history = z.object({ fixtureId: uuid, cycleId: uuid, competitionId: uuid, homeTeamId: uuid, awayTeamId: uuid,
  kickoffAt: instant, availableAt: instant, homeGoals: count, awayGoals: count, period: z.literal("regulation-including-stoppage-time"),
  observationHash: hash, evidenceRef: ref }).strict().refine((value) => value.homeTeamId !== value.awayTeamId &&
  value.availableAt >= value.kickoffAt && Number.isSafeInteger(value.homeGoals + value.awayGoals));
const dataset = z.object({ version: z.literal(1), selectionVersion: label, evidenceRef: ref,
  mode: z.enum(["historical", "prospective", "synthetic"]), fixtures: z.array(fixture).max(100_000), history: z.array(history).max(100_000) }).strict();

function bounded(value: unknown) { if (Buffer.byteLength(evidenceSerialize(value), "utf8") > 67_108_864) throw new Error(); return value; }
function parse<Value>(operation: () => Value, reason: EvaluationInputError["reason"]): Value {
  try { return freezeEvidence(operation()); } catch (error) { if (error instanceof EvaluationInputError) throw error; throw new EvaluationInputError(reason); }
}
export function parseBaselineConfiguration(value: unknown): BaselineConfiguration { return parse(() => baseline.parse(value), "invalid-protocol"); }
export function createEvaluationProtocol(value: unknown): EvaluationProtocol {
  return parse(() => {
    const parsed = protocol.parse(bounded(value));
    const body: EvaluationProtocolConfiguration = { ...parsed, competitionIds: [...parsed.competitionIds].sort(),
      horizons: [...parsed.horizons].sort((a, b) => a.minimumMs - b.minimumMs), gates: parsed.gates === null ? null : [...parsed.gates].sort((a, b) => a.id.localeCompare(b.id, "en")) };
    const id = evidenceFingerprint(body); return { ...body, id, hash: id };
  }, "invalid-protocol");
}
export function parseEvaluationProtocol(value: unknown): EvaluationProtocol {
  return parse(() => {
    const parsed = z.object({ id: hash, hash }).passthrough().parse(bounded(value));
    const { id, hash: checksum, ...body } = parsed, result = createEvaluationProtocol(body);
    if (id !== result.id || checksum !== result.hash) throw new Error(); return result;
  }, "invalid-protocol");
}
export function evaluationFixtureKey(value: EvaluationDataset["fixtures"][number]): string {
  return evidenceFingerprint({ fixtureId: value.context.fixtureId, fixtureVersion: value.context.fixtureVersion, cycleId: value.context.cycleId,
    kickoffAt: value.context.kickoffAt, cutoffAt: value.context.cutoffAt, forecastAt: value.forecastAt });
}
export function createEvaluationDataset(value: unknown): EvaluationDataset {
  return parse(() => {
    const parsed = dataset.parse(bounded(value)), seen = new Set<string>(), cycles = new Map<string, string>();
    for (const row of parsed.fixtures) {
      const key = evaluationFixtureKey(row), cycle = `${row.context.fixtureId}:${row.context.cycleId}`;
      const binding = evidenceFingerprint({ version: row.context.fixtureVersion, home: row.context.home, away: row.context.away, kickoff: row.context.kickoffAt, competition: row.competitionId });
      if (seen.has(key) || cycles.has(cycle) && cycles.get(cycle) !== binding) throw new Error(); seen.add(key); cycles.set(cycle, binding);
      if (row.context.cycleId === null || row.manifestAt > row.context.cutoffAt || row.forecastAt < row.context.analysisAt ||
        row.forecastAt >= getPublicationDeadline(row.context.kickoffAt) || row.result.availableAt !== null && row.result.availableAt < row.context.kickoffAt ||
        row.result.context.regulationScore?.verified === true && row.result.availableAt === null) throw new EvaluationInputError("leakage");
      for (const system of ["ai", "api-football", "combined"] as const) {
        const entry = row.forecasts[system];
        if (entry === null) { if (row.unavailableReasons[system] === null) throw new Error(); continue; }
        if (row.unavailableReasons[system] !== null || entry.capturedAt > row.forecastAt || entry.capturedAt < row.context.analysisAt ||
          entry.generatedAt !== null && entry.generatedAt > entry.capturedAt || entry.providerUpdatedAt !== null && entry.providerUpdatedAt > entry.capturedAt ||
          entry.evidence.length === 0 || new Set(entry.evidence.map((item) => item.id)).size !== entry.evidence.length ||
          parsed.mode === "historical" && entry.capture !== "historical-snapshot") throw new EvaluationInputError("leakage");
        for (const item of entry.evidence) {
          const cutoff = item.kind === "provider-forecast" ? row.forecastAt : row.context.cutoffAt;
          if (system === "ai" && item.kind === "provider-forecast" || item.availableAt > item.retrievedAt ||
            item.availableAt > cutoff || item.retrievedAt > cutoff || item.publishedAt !== null && item.publishedAt > item.availableAt ||
            item.providerUpdatedAt !== null && item.providerUpdatedAt > item.retrievedAt) throw new EvaluationInputError("leakage");
        }
        const available = Object.values(entry.markets.markets).filter((market) => market.available);
        if (system !== "combined" && available.some((market) => market.market.source !== system) ||
          available.some((market) => market.market.source === "ai") && (entry.modelVersionId === null || entry.calibrationVersion === null)) throw new Error();
      }
    }
    const histories = new Set<string>();
    for (const entry of parsed.history) { const key = `${entry.fixtureId}:${entry.cycleId}`; if (histories.has(key)) throw new Error(); histories.add(key); }
    const body: EvaluationDatasetConfiguration = { ...parsed, fixtures: [...parsed.fixtures].sort((a, b) => evaluationFixtureKey(a).localeCompare(evaluationFixtureKey(b), "en")),
      history: [...parsed.history].sort((a, b) => a.kickoffAt - b.kickoffAt || a.availableAt - b.availableAt ||
        a.fixtureId.localeCompare(b.fixtureId, "en") || a.cycleId.localeCompare(b.cycleId, "en") || a.observationHash.localeCompare(b.observationHash, "en")) };
    const id = evidenceFingerprint(body); return { ...body, id, hash: id };
  }, "invalid-dataset");
}
export function parseEvaluationDataset(value: unknown): EvaluationDataset {
  return parse(() => { const parsed = z.object({ id: hash, hash }).passthrough().parse(bounded(value));
    const { id, hash: checksum, ...body } = parsed, result = createEvaluationDataset(body);
    if (id !== result.id || checksum !== result.hash) throw new Error(); return result;
  }, "invalid-dataset");
}
