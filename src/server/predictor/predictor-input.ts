import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { ModelPin, ModelVersion, ModelVersionConfiguration } from "./predictor-contract.ts";

export class PredictorInputError extends Error {
  readonly reason: "invalid-model" | "invalid-pin";
  constructor(reason: PredictorInputError["reason"] = "invalid-model") {
    super("Predictor configuration is invalid. Private model details are withheld.");
    this.name = "PredictorInputError"; this.reason = reason;
  }
}
const label = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);
const reference = z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value));
const identity = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = count.positive();
const instant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); const year = new Date(value).getUTCFullYear(); return year >= 1000 && year <= 9999; }
  catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const window = z.object({ startsAt: instant, endsAt: instant }).strict().refine((value) => value.startsAt < value.endsAt);
const families = z.array(z.enum(["match-result", "total-goals", "both-teams-to-score"])).min(1).max(3)
  .refine((value) => new Set(value).size === value.length).transform((value) => [...value].sort());
const parameters = z.record(label, z.union([z.string().max(512), z.number().finite(), z.boolean()]))
  .refine((value) => Object.keys(value).length <= 64 && !Object.keys(value).some((key) => ["__proto__", "prototype", "constructor"].includes(key)));
const calibration = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none"), version: label, evidenceRef: reference }).strict(),
  z.object({ kind: z.literal("evaluated"), version: label, method: label, parameters, sourceFamilies: families,
    evidenceRef: reference, evaluationRef: reference }).strict(),
]);
const configuration = z.object({ version: z.literal(1), provider: label, model: label, providerModelVersion: label,
  contractVersion: label, contractEvidenceRef: reference, promptVersion: label, schemaVersion: label,
  windows: z.object({ training: window.nullable(), validation: window.nullable(), calibration: window.nullable(), finalTest: window.nullable() }).strict(),
  calibration,
  evaluation: z.object({ version: label, evidenceRef: reference, status: z.enum(["provisional", "evaluated"]), evaluationRef: reference.nullable() }).strict(),
  outputTiming: z.object({ maxAgeMs: count, basis: z.enum(["generated", "retrieved", "provider-updated"]),
    unknownGeneration: z.enum(["reject", "allow-flagged"]), unknownUpdate: z.enum(["reject", "allow-flagged"]) }).strict(),
  bounds: z.object({ maxInputBytes: positive.max(67_108_864), maxOutputBytes: positive.max(16_777_216),
    maxSources: positive.max(10_000), maxFacts: positive.max(100_000), maxReasonCharacters: positive.max(4096),
    maxUncertaintyCharacters: positive.max(4096), maxCitationsPerItem: positive.max(100), maxCitationCharacters: positive.max(4096) }).strict(),
}).strict().refine((value) => {
  const known = [value.windows.training, value.windows.validation, value.windows.calibration, value.windows.finalTest]
    .filter((entry) => entry !== null);
  return known.every((entry, index) => index === 0 || known[index - 1]!.endsAt <= entry.startsAt) &&
    (value.calibration.kind !== "evaluated" || value.windows.calibration !== null) &&
    (value.evaluation.status === "evaluated" ? value.evaluation.evaluationRef !== null : value.evaluation.evaluationRef === null);
});
const modelSchema = configuration.safeExtend({ id: identity, hash: identity })
  .refine((value) => value.id === value.hash && value.hash === modelVersionHash(value));
const pinSchema = z.object({ version: z.literal(1), id: identity, invocationId: identity, jobId: identity, modelVersionId: identity }).strict()
  .refine((value) => value.id === modelPinHash(value));

function parse<Value>(schema: z.ZodType<Value>, value: unknown, reason: PredictorInputError["reason"]): Value {
  try { const result = schema.safeParse(value); if (result.success) return freezeEvidence(result.data); }
  catch { /* A malformed object never escapes parser diagnostics. */ }
  throw new PredictorInputError(reason);
}
export function parseModelVersionConfiguration(value: unknown): ModelVersionConfiguration {
  return parse(configuration, value, "invalid-model");
}
export function modelVersionHash(value: ModelVersionConfiguration | ModelVersion): string {
  const { id: _id, hash: _hash, ...body } = value as ModelVersion;
  void _id; void _hash;
  return evidenceFingerprint(body);
}
export function createModelVersion(value: unknown): ModelVersion {
  const body = parseModelVersionConfiguration(value), hash = modelVersionHash(body);
  return freezeEvidence({ ...body, id: hash, hash });
}
export function parseModelVersion(value: unknown): ModelVersion { return parse(modelSchema, value, "invalid-model"); }
export function modelPinHash(value: Omit<ModelPin, "id"> | ModelPin): string {
  const { id: _id, ...body } = value as ModelPin; void _id;
  return evidenceFingerprint(body);
}
export function createModelPin(value: unknown): ModelPin {
  const body = parse(z.object({ version: z.literal(1), invocationId: identity, jobId: identity, modelVersionId: identity }).strict(), value, "invalid-pin");
  return freezeEvidence({ ...body, id: modelPinHash(body) });
}
export function parseModelPin(value: unknown): ModelPin { return parse(pinSchema, value, "invalid-pin"); }
/** Uses the existing canonical JSON codec; model configurations contain no bigint. */
export const serializeModelVersion = (model: ModelVersion): string => evidenceSerialize(model);
