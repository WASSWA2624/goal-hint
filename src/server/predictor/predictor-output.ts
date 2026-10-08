import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { validateMarketSnapshot, type MarketSnapshot } from "../../domain/markets.ts";
import type { EvidenceAuthority, EvidenceContext, EvidenceSnapshot } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence, parseEvidenceContext, parseEvidenceSnapshot } from "../evidence/evidence-input.ts";
import { buildEvidenceSnapshot } from "../evidence/evidence-snapshot.ts";
import type { ModelAuthority, ModelVersion } from "./predictor-contract.ts";
import { parseModelVersion } from "./predictor-input.ts";
import { PRIMARY_PROMPT_VERSION, PRIMARY_SCHEMA_VERSION } from "./predictor-prompt.ts";

export type PredictorReference = Readonly<{ sourceId: string; factId: string; claimId: string; subjectTeamId: string | null }>;
export type PredictorExplanation = Readonly<{ text: string; references: readonly PredictorReference[] }>;
/** These clocks come from the verified transport, never the model-authored JSON. */
export type PredictorTransportMetadata = Readonly<{
  generatedAt: UtcInstant | null; retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null; evidenceRef: string;
}>;
export type PredictorOutputAuthority = Readonly<{
  modelAuthority: ModelAuthority; evidenceAuthority: EvidenceAuthority;
  verifyTransport(metadata: PredictorTransportMetadata, model: ModelVersion, snapshot: EvidenceSnapshot): boolean;
  verifyExplanation(item: PredictorExplanation, snapshot: EvidenceSnapshot, model: ModelVersion, kind: "reason" | "uncertainty"): boolean;
}>;
export type PredictorSourceAttribution = Readonly<{
  sourceId: string; publisher: string; title: string; sourceUrl: string | null; version: string;
  publishedAt: UtcInstant | null; retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null;
}>;
export type PredictorValidatedOutput = Readonly<{
  modelVersionId: string; evidenceHash: string; context: EvidenceContext; schemaVersion: string;
  evidence: Readonly<{ policyVersion: string; coverage: EvidenceSnapshot["coverage"]; missingness: EvidenceSnapshot["missingness"] }>;
  markets: MarketSnapshot; reasons: readonly PredictorExplanation[]; uncertainty: PredictorExplanation;
  sources: readonly PredictorSourceAttribution[]; timestamps: PredictorTransportMetadata;
  flags: readonly ("unknown-generation-time" | "unknown-provider-update-time")[];
}>;
export type PredictorOutputRejection = "invalid-output" | "wrong-identity" | "invalid-evidence" | "insufficient-evidence" |
  "invalid-timing" | "invalid-citation" | "unverified-explanation" | "not-authorized";
export type PredictorOutputValidation = Readonly<{ valid: true; output: PredictorValidatedOutput }> |
  Readonly<{ valid: false; reason: PredictorOutputRejection }>;
export type PredictorOutputOptions = Readonly<{
  snapshot: EvidenceSnapshot; model: ModelVersion; metadata: PredictorTransportMetadata; authority: PredictorOutputAuthority; now: UtcInstant;
}>;
const validated = new WeakMap<PredictorValidatedOutput, Readonly<{ snapshot: EvidenceSnapshot; model: ModelVersion; authority: PredictorOutputAuthority }>>();
/** Calibration accepts only a candidate produced by this validator in this process. */
export function assertValidatedPredictorOutput(output: PredictorValidatedOutput): void {
  if (!validated.has(output)) throw new Error("Predictor candidate has not passed output validation.");
}
/** Recheck the original trusted authority after local calibration callbacks. */
export function assertCurrentPredictorOutputAuthority(output: PredictorValidatedOutput): void {
  const known = validated.get(output);
  if (!known || !authorized(known.model, known.authority.modelAuthority) ||
    !eligibleEvidence(known.snapshot, known.authority.evidenceAuthority) ||
    !trusted(() => known.authority.verifyTransport(output.timestamps, known.model, known.snapshot)))
    throw new Error("Predictor candidate authorization is unavailable.");
}

const identity = z.string().regex(/^[a-f0-9]{64}$/u);
const uuid = z.uuid();
const count = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const instant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); const year = new Date(value).getUTCFullYear(); return year >= 1000 && year <= 9999; }
  catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const reference = z.object({ sourceId: identity, factId: identity, claimId: identity, subjectTeamId: uuid.nullable() }).strict();
const plain = z.string().min(1).max(4096).refine((value) => value === value.trim() &&
  !/[\u0000-\u001f\u007f<>`]/u.test(value) && !/(?:https?:\/\/|www\.|\]\s*\()/iu.test(value));
const explanation = z.object({ text: plain, references: z.array(reference).max(100) }).strict();
const envelope = z.object({ schemaVersion: z.string().min(1).max(128), modelVersionId: identity, evidenceHash: identity,
  fixtureId: uuid, fixtureVersion: z.string().regex(/^[1-9][0-9]{0,19}$/u), externalFixtureId: count,
  homeTeamId: uuid, awayTeamId: uuid, homeExternalId: count, awayExternalId: count,
  cycleId: uuid.nullable(), runId: uuid.nullable(), cutoffAt: instant,
  groups: z.object({ "match-result": z.unknown().optional(), "total-goals": z.unknown().optional(),
    "both-teams-to-score": z.unknown().optional() }).strict(),
  reasons: z.array(explanation).min(2).max(4), uncertainty: explanation,
}).strict();
const metadataSchema = z.object({ generatedAt: instant.nullable(), retrievedAt: instant, providerUpdatedAt: instant.nullable(),
  evidenceRef: z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value)) }).strict();
function sync(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
function trusted(check: () => boolean): boolean { try { return sync(check()) === true; } catch { return false; } }
function authorized(model: ModelVersion, authority: ModelAuthority): boolean {
  try { return sync(authority.authorize(model)) === undefined && trusted(() => authority.verifyModel(model)) &&
    trusted(() => authority.verifyCalibration(model)) &&
    (model.evaluation.status !== "evaluated" || trusted(() => authority.verifyEvaluation(model))); } catch { return false; }
}
function boundedInput(input: unknown, maximum: number): unknown {
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > maximum) throw new Error();
    return JSON.parse(input);
  }
  const serialized = JSON.stringify(input);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > maximum) throw new Error();
  return input;
}
function aiCandidate(input: unknown): unknown {
  if (input === undefined || input === null) return undefined;
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).some((key) => !["period", "probabilities", "line"].includes(key))) return { invalidGroup: true };
  return { ...input, source: "ai" };
}
function citationIsGenuine(item: PredictorReference, snapshot: EvidenceSnapshot): boolean {
  const source = snapshot.sources.find((entry) => entry.id === item.sourceId), fact = snapshot.facts.find((entry) => entry.id === item.factId);
  if (!source || !fact || !source.reuse.allowSummary || fact.subjectTeamId !== item.subjectTeamId) return false;
  const claim = source.claims.find((entry) => evidenceFingerprint(entry) === item.claimId);
  return claim !== undefined && claim.subjectTeamId === item.subjectTeamId && claim.kind === fact.kind && fact.values.some((value) =>
    value.sourceIds.includes(item.sourceId) && value.claimIds.includes(item.claimId) &&
    evidenceSerialize({ value: value.value, summary: value.summary, certainty: value.certainty, asOfAt: value.asOfAt }) ===
    evidenceSerialize({ value: claim.value, summary: claim.summary, certainty: claim.certainty, asOfAt: claim.asOfAt }));
}
function sameIdentity(output: z.infer<typeof envelope>, snapshot: EvidenceSnapshot, model: ModelVersion): boolean {
  const context = snapshot.context;
  return output.schemaVersion === model.schemaVersion && output.modelVersionId === model.id && output.evidenceHash === snapshot.hash &&
    output.fixtureId === context.fixtureId && output.fixtureVersion === context.fixtureVersion.toString() &&
    output.externalFixtureId === context.externalFixtureId && output.homeTeamId === context.home.teamId &&
    output.awayTeamId === context.away.teamId && output.homeExternalId === context.home.externalId &&
    output.awayExternalId === context.away.externalId && output.cycleId === context.cycleId && output.runId === context.runId && output.cutoffAt === context.cutoffAt;
}
function eligibleEvidence(snapshot: EvidenceSnapshot, authority: EvidenceAuthority): boolean {
  try {
    const rebuilt = buildEvidenceSnapshot({ context: snapshot.context, policy: snapshot.policy, sources: snapshot.sources }, authority);
    // Original exclusions concern discarded sources and are not primary facts.
    return evidenceSerialize({ sources: rebuilt.sources, facts: rebuilt.facts, missingness: rebuilt.missingness, coverage: rebuilt.coverage }) ===
      evidenceSerialize({ sources: snapshot.sources, facts: snapshot.facts, missingness: snapshot.missingness, coverage: snapshot.coverage });
  } catch { return false; }
}
function timing(metadata: PredictorTransportMetadata, model: ModelVersion, context: EvidenceContext, now: UtcInstant): boolean {
  if (now < context.analysisAt || now >= context.kickoffAt || metadata.retrievedAt < context.analysisAt || metadata.retrievedAt > now ||
    metadata.generatedAt !== null && (metadata.generatedAt < context.analysisAt || metadata.generatedAt > metadata.retrievedAt) ||
    metadata.providerUpdatedAt !== null && metadata.providerUpdatedAt > metadata.retrievedAt ||
    metadata.generatedAt === null && model.outputTiming.unknownGeneration === "reject" ||
    metadata.providerUpdatedAt === null && model.outputTiming.unknownUpdate === "reject") return false;
  const basis = model.outputTiming.basis === "generated" ? metadata.generatedAt :
    model.outputTiming.basis === "provider-updated" ? metadata.providerUpdatedAt : metadata.retrievedAt;
  return now - (basis ?? metadata.retrievedAt) <= model.outputTiming.maxAgeMs;
}
/** Pure temporal check for the final return boundary. It neither restamps
 * clocks nor replaces the original transport and evidence authorization. */
export function isPredictorOutputCurrent(output: PredictorValidatedOutput, modelInput: ModelVersion, nowInput: UtcInstant): boolean {
  try {
    const model = parseModelVersion(modelInput), context = parseEvidenceContext(output.context), metadata = metadataSchema.parse(output.timestamps), now = instant.parse(nowInput);
    return Object.isFrozen(output.timestamps) && output.modelVersionId === model.id && output.schemaVersion === model.schemaVersion &&
      model.schemaVersion === PRIMARY_SCHEMA_VERSION && model.promptVersion === PRIMARY_PROMPT_VERSION && timing(metadata, model, context, now);
  } catch { return false; }
}

/** Global identity, evidence and explanation failures invalidate every candidate.
 * Family validation and double chance remain exclusively owned by shared 005 rules. */
export function validatePredictorOutput(input: unknown, options: PredictorOutputOptions): PredictorOutputValidation {
  const reject = (reason: PredictorOutputRejection): PredictorOutputValidation => Object.freeze({ valid: false, reason });
  let model: ModelVersion, snapshot: EvidenceSnapshot, metadata: PredictorTransportMetadata, now: UtcInstant;
  try { model = parseModelVersion(options.model); snapshot = parseEvidenceSnapshot(options.snapshot); metadata = metadataSchema.parse(options.metadata); now = instant.parse(options.now); }
  catch { return reject("invalid-output"); }
  const authority = options.authority;
  if (!authority) return reject("not-authorized");
  if (!authorized(model, authority.modelAuthority)) return reject("not-authorized");
  if (model.schemaVersion !== PRIMARY_SCHEMA_VERSION || model.promptVersion !== PRIMARY_PROMPT_VERSION) return reject("invalid-output");
  if (Object.values(model.windows).some((window) => window !== null && window.endsAt > snapshot.context.cutoffAt)) return reject("invalid-evidence");
  // Archive hashes alone do not prove facts or permissions: rederive retained facts with current authority.
  if (!eligibleEvidence(snapshot, authority.evidenceAuthority) || snapshot.sources.length > model.bounds.maxSources ||
    snapshot.facts.length > model.bounds.maxFacts) return reject("invalid-evidence");
  if (!snapshot.coverage.sufficient || snapshot.sources.length === 0 || snapshot.facts.length === 0) return reject("insufficient-evidence");
  if (!trusted(() => authority.verifyTransport(metadata, model, snapshot)) || !timing(metadata, model, snapshot.context, now)) return reject("invalid-timing");
  let output: z.infer<typeof envelope>;
  try { output = envelope.parse(boundedInput(input, model.bounds.maxOutputBytes)); } catch { return reject("invalid-output"); }
  if (!sameIdentity(output, snapshot, model)) return reject("wrong-identity");
  if (new Set(output.reasons.map((reason) => reason.text)).size !== output.reasons.length) return reject("invalid-output");
  for (const [kind, items] of [["reason", output.reasons], ["uncertainty", [output.uncertainty]]] as const) {
    for (const item of items) {
      if (item.text.length > (kind === "reason" ? model.bounds.maxReasonCharacters : model.bounds.maxUncertaintyCharacters) ||
        item.references.length > model.bounds.maxCitationsPerItem || kind === "reason" && item.references.length === 0) return reject("invalid-output");
      if (kind === "uncertainty" && item.references.length === 0 && snapshot.missingness.length === 0) return reject("invalid-citation");
      if (new Set(item.references.map(evidenceSerialize)).size !== item.references.length || item.references.some((entry) =>
        JSON.stringify(entry).length > model.bounds.maxCitationCharacters || !citationIsGenuine(entry, snapshot))) return reject("invalid-citation");
      if (!trusted(() => authority.verifyExplanation(item, snapshot, model, kind))) return reject("unverified-explanation");
    }
  }
  const markets = validateMarketSnapshot(Object.fromEntries(Object.entries(output.groups).map(([family, group]) => [family, aiCandidate(group)])));
  const referenced = new Set([...output.reasons, output.uncertainty].flatMap((item) => item.references.map((entry) => entry.sourceId)));
  const sources = snapshot.sources.filter((source) => referenced.has(source.id)).map((source) => ({ sourceId: source.id,
    publisher: source.publisher, title: source.title, sourceUrl: source.sourceUrl, version: source.version,
    publishedAt: source.publishedAt, retrievedAt: source.retrievedAt, providerUpdatedAt: source.providerUpdatedAt }));
  if (!authorized(model, authority.modelAuthority)) return reject("not-authorized");
  if (!eligibleEvidence(snapshot, authority.evidenceAuthority)) return reject("invalid-evidence");
  const accepted: PredictorValidatedOutput = freezeEvidence({ modelVersionId: model.id, evidenceHash: snapshot.hash, context: snapshot.context,
    evidence: { policyVersion: snapshot.policy.version, coverage: snapshot.coverage, missingness: snapshot.missingness },
    schemaVersion: model.schemaVersion, markets, reasons: output.reasons, uncertainty: output.uncertainty, sources, timestamps: metadata,
    flags: [...(metadata.generatedAt === null ? ["unknown-generation-time" as const] : []),
      ...(metadata.providerUpdatedAt === null ? ["unknown-provider-update-time" as const] : [])] });
  validated.set(accepted, Object.freeze({ model, snapshot, authority }));
  return Object.freeze({ valid: true, output: accepted });
}
