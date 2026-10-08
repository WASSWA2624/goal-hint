import { validateMarketSnapshot, marketRules } from "../../src/domain/markets.ts";
import { applyPredictorCalibration } from "../../src/server/predictor/predictor-calibration.ts";
import { createModelPin } from "../../src/server/predictor/predictor-input.ts";
import { evidenceHash } from "./evidence-fixtures.mjs";
import { modelAuthority, modelVersion } from "./predictor-fixtures.mjs";
import { predictorSnapshot, predictorAcceptedOutput } from "./predictor-output-fixtures.mjs";

// All model forecasts, clocks and authority records are synthetic local data.
// These fixtures do not establish any actual provider rights or market support.
export function fallbackFixture(options = {}) {
  const snapshot = options.snapshot ?? predictorSnapshot(), model = options.model ?? modelVersion();
  const jobId = evidenceHash("synthetic-fallback-job"), invocationId = evidenceHash("synthetic-fallback-ai-invocation");
  const pin = createModelPin({ version: 1, invocationId, jobId, modelVersionId: model.id });
  const calibrated = applyPredictorCalibration(predictorAcceptedOutput(snapshot, model, options.output ?? {}), { model, authority: modelAuthority() });
  if (!calibrated.valid) throw new Error("Synthetic fallback calibration failed.");
  const ai = { status: "candidate", pin, output: calibrated.output, requestsDispatched: 1, requestCountUnknown: false };
  const expected = { context: snapshot.context, jobId, pin, evidenceHash: snapshot.hash };
  const now = snapshot.context.analysisAt + 2000;
  return { expected, ai, now, snapshot, model, authority: fallbackAuthority() };
}
export function fallbackAuthority(overrides = {}) {
  return { authorize() {}, verifyContext: () => true, verifyAi: () => true, verifyProvider: () => true, ...overrides };
}
export function fallbackProvider(expected = fallbackFixture().expected, options = {}) {
  const groups = options.groups ?? { "match-result": { source: "api-football", period: marketRules.period,
    probabilities: { "home-win": 0.5, draw: 0.3, "away-win": 0.2 } } };
  const checked = validateMarketSnapshot(groups);
  const unavailable = { available: false, reason: "unsupported-family" };
  const candidate = { context: expected.context, policyVersion: "synthetic-provider-policy-v1", policyEvidenceRef: "synthetic-provider-policy-proof",
    markets: { ...checked, markets: { ...checked.markets, "total-goals": unavailable, "both-teams-to-score": unavailable } },
    timestamps: { generatedAt: null, retrievedAt: expected.context.analysisAt + 1000, providerUpdatedAt: null },
    provenance: { provider: "api-football", endpoint: "predictions", externalFixtureId: expected.context.externalFixtureId, jobId: expected.jobId,
      contractVersion: "synthetic-provider-v1", observationHash: evidenceHash("synthetic-fallback-response"),
      sourceUrl: null, sourceEvidenceRef: "synthetic-provider-response-proof", supportEvidenceRefs: { "match-result": "synthetic-regulation-mapping" }, fromCache: false },
    flags: ["unknown-generation-time", "unknown-provider-update-time"], ...options.candidate };
  return { status: "candidate", candidate, requestsDispatched: options.requestsDispatched ?? 1, requestCountUnknown: false };
}
export function fallbackAiDenied(reason = "unconfigured", overrides = {}) {
  return { status: "denied", reason, requestsDispatched: 0, requestCountUnknown: false, ...overrides };
}
