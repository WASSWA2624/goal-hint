import { createHash } from "node:crypto";
import { createModelVersion } from "../../src/server/predictor/predictor-input.ts";

// Configuration, permissions, windows and any evaluation artifact here are
// synthetic. They do not select a real provider or establish forecast quality.
export const PREDICTOR_NOW = Date.parse("2026-10-09T08:00:00.000Z");
export const predictorHash = (value) => createHash("sha256").update(value).digest("hex");
export function modelConfiguration(overrides = {}) {
  const base = {
    version: 1, provider: "synthetic-ai", model: "synthetic-model", providerModelVersion: "synthetic-model-2026-01-01",
    contractVersion: "synthetic-structured-api-v1", contractEvidenceRef: "synthetic-contract-proof",
    promptVersion: "regulation-ai-prompt-v1", schemaVersion: "regulation-ai-output-v1",
    windows: { training: null, validation: null, calibration: null, finalTest: null },
    calibration: { kind: "none", version: "synthetic-no-calibration-v1", evidenceRef: "synthetic-calibration-policy" },
    evaluation: { version: "synthetic-evaluation-v1", evidenceRef: "synthetic-evaluation-policy", status: "provisional", evaluationRef: null },
    outputTiming: { maxAgeMs: 60_000, basis: "generated", unknownGeneration: "allow-flagged", unknownUpdate: "allow-flagged" },
    bounds: { maxInputBytes: 500_000, maxOutputBytes: 100_000, maxSources: 100, maxFacts: 1000,
      maxReasonCharacters: 500, maxUncertaintyCharacters: 500, maxCitationsPerItem: 10, maxCitationCharacters: 512 },
  };
  return { ...base, ...overrides, windows: { ...base.windows, ...overrides.windows },
    outputTiming: { ...base.outputTiming, ...overrides.outputTiming }, bounds: { ...base.bounds, ...overrides.bounds } };
}
export const modelVersion = (overrides = {}) => createModelVersion(modelConfiguration(overrides));
export function modelAuthority(overrides = {}) {
  return { authorize() {}, verifyModel: () => true, verifyCalibration: () => true, verifyEvaluation: () => true, ...overrides };
}
export function modelMemoryStore() {
  const records = new Map();
  return { records, store: { async save(model) { records.set(model.id, model); return model; }, async find(id) { return records.get(id) ?? null; } } };
}
