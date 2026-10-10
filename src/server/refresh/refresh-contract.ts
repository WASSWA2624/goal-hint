import "server-only";

import type { EvidenceCollectionRequest } from "../evidence/evidence-service.ts";
import type { CostJobPolicy, CostRequest } from "../cost-control/cost-contract.ts";
import type { ApiFootballBounds } from "../football/api-football-contract.ts";
import type { ModelPin } from "../predictor/predictor-contract.ts";
import type { SelectionEntry, SelectionManifest } from "../selection/selection-contract.ts";
import type { StoredCycle } from "../predictions/history-contract.ts";

export class PredictionRefreshError extends Error {
  readonly reason: "invalid-request" | "policy-required" | "unauthorized" | "ineligible" | "lost-lease" | "unavailable";
  readonly detail: string;
  constructor(reason: PredictionRefreshError["reason"], detail: string = reason) {
    super("Prediction refresh refused or unavailable. Private diagnostics are withheld.");
    this.name = "PredictionRefreshError"; this.reason = reason; this.detail = detail;
  }
}
export const refreshFail = (reason: PredictionRefreshError["reason"], detail?: string): never => { throw new PredictionRefreshError(reason, detail); };
export type RefreshMember = Readonly<{
  jobId: string; manifest: SelectionManifest; entry: SelectionEntry; cycle: StoredCycle;
  context: EvidenceCollectionRequest["context"]; now: number;
}>;
/** Explicit reviewed allocations. No live provider/model/budget/freshness defaults.
 * A null model and AI allocation together select provider fallback only. */
export type RefreshPlan = Readonly<{
  version: 1; evidenceRef: string; modelVersionId: string | null;
  evidence: EvidenceCollectionRequest;
  ai: Readonly<{ job: CostJobPolicy; request: CostRequest; maxElapsedMs: number }> | null;
  fallback: Readonly<{ bounds: ApiFootballBounds | null; maxElapsedMs: number }>;
  observation: Readonly<{ bounds: ApiFootballBounds; maxAgeMs: number }>;
  publicationReserveMs: number;
  footballRequestLimit: number;
}>;
export type RefreshIntent = Readonly<{ member: RefreshMember; plan: RefreshPlan; pin: ModelPin | null }>;
export type RefreshPhase = "evidence" | "ai" | "fallback" | "observation";
export type RefreshOutcome = Readonly<{
  jobId: string; runId: string; fixtureId: string; cycleId: string; at: number;
  outcome: "published" | "retained-previous" | "unavailable" | "skipped" | "failed";
  reason: string; revisionId: string | null; publicationId: string | null;
  /** Original ledger references and separate estimates/observations/liability, never guessed spend. */
  costs: Readonly<{ ai: unknown; research: unknown }>;
  phases: Readonly<Partial<Record<RefreshPhase, string>>>;
}>;
export type RefreshAuthority = Readonly<{
  authorize(member: RefreshMember): void;
  verifyPlan(plan: RefreshPlan, member: RefreshMember): boolean;
}>;
