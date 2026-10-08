import { buildEvidenceSnapshot } from "../../src/server/evidence/evidence-snapshot.ts";
import { validatePredictorOutput } from "../../src/server/predictor/predictor-output.ts";
import { evidenceAuthority, evidenceContext, evidencePolicy, evidenceSource } from "./evidence-fixtures.mjs";
import { modelAuthority, modelVersion } from "./predictor-fixtures.mjs";

// All facts, model identities, permissions and clocks are synthetic local data.
export const predictorSnapshot = (sources, policy = evidencePolicy(), context = evidenceContext()) =>
  buildEvidenceSnapshot({ context, policy, sources: sources ?? [evidenceSource(context)] }, evidenceAuthority());
export function predictorRawOutput(snapshot = predictorSnapshot(), model = modelVersion(), overrides = {}) {
  const context = snapshot.context, fact = snapshot.facts[0], variant = fact.values[0];
  const reference = { sourceId: variant.sourceIds[0], factId: fact.id, claimId: variant.claimIds[0], subjectTeamId: fact.subjectTeamId };
  return { schemaVersion: model.schemaVersion, modelVersionId: model.id, evidenceHash: snapshot.hash,
    fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion.toString(), externalFixtureId: context.externalFixtureId,
    homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, homeExternalId: context.home.externalId, awayExternalId: context.away.externalId,
    cycleId: context.cycleId, runId: context.runId, cutoffAt: context.cutoffAt,
    groups: { "match-result": { period: "regulation-including-stoppage-time", probabilities: { "home-win": 0.4, draw: 0.3, "away-win": 0.3 } },
      "total-goals": { period: "regulation-including-stoppage-time", line: 2.5, probabilities: { "over-2.5": 0.6, "under-2.5": 0.4 } },
      "both-teams-to-score": { period: "regulation-including-stoppage-time", probabilities: { yes: 0.6, no: 0.4 } } },
    reasons: [{ text: "The supplied observation identifies the home team's venue role.", references: [reference] },
      { text: "The supplied observation reports a non-neutral venue.", references: [reference] }],
    uncertainty: { text: "Player availability is missing from these synthetic observations.", references: [] }, ...overrides };
}
export function predictorOutputOptions(snapshot = predictorSnapshot(), model = modelVersion(), overrides = {}) {
  return { snapshot, model, now: snapshot.context.analysisAt + 2000,
    metadata: { generatedAt: snapshot.context.analysisAt + 1000, retrievedAt: snapshot.context.analysisAt + 1500,
      providerUpdatedAt: snapshot.context.analysisAt + 1000, evidenceRef: "synthetic-ai-transport-observation" },
    authority: { modelAuthority: modelAuthority(), evidenceAuthority: evidenceAuthority(), verifyTransport: () => true, verifyExplanation: () => true },
    ...overrides };
}
export function predictorAcceptedOutput(snapshot = predictorSnapshot(), model = modelVersion(), overrides = {}) {
  const result = validatePredictorOutput(predictorRawOutput(snapshot, model, overrides), predictorOutputOptions(snapshot, model));
  if (!result.valid) throw new Error(`Synthetic predictor fixture failed validation: ${result.reason}`);
  return result.output;
}
