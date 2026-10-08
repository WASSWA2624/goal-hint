import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import type { SourceGroup } from "../../domain/markets.ts";

export type ModelWindow = Readonly<{ startsAt: UtcInstant; endsAt: UtcInstant }>;
export type ModelCalibration = Readonly<{
  kind: "none"; version: string; evidenceRef: string;
}> | Readonly<{
  kind: "evaluated"; version: string; method: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  sourceFamilies: readonly SourceGroup[]; evidenceRef: string; evaluationRef: string;
}>;
/** Exact provider/model versions and policy are part of the immutable identity.
 * An artifact verifier must bind evaluation evidence to this complete hash. */
export type ModelVersion = Readonly<{
  version: 1; id: string; hash: string; provider: string; model: string;
  providerModelVersion: string; contractVersion: string; contractEvidenceRef: string;
  promptVersion: string; schemaVersion: string;
  windows: Readonly<{
    training: ModelWindow | null; validation: ModelWindow | null;
    calibration: ModelWindow | null; finalTest: ModelWindow | null;
  }>;
  calibration: ModelCalibration;
  evaluation: Readonly<{
    version: string; evidenceRef: string; status: "provisional" | "evaluated"; evaluationRef: string | null;
  }>;
  outputTiming: Readonly<{
    maxAgeMs: number; basis: "generated" | "retrieved" | "provider-updated";
    unknownGeneration: "reject" | "allow-flagged"; unknownUpdate: "reject" | "allow-flagged";
  }>;
  bounds: Readonly<{
    maxInputBytes: number; maxOutputBytes: number; maxSources: number; maxFacts: number;
    maxReasonCharacters: number; maxUncertaintyCharacters: number;
    maxCitationsPerItem: number; maxCitationCharacters: number;
  }>;
}>;
export type ModelVersionConfiguration = Omit<ModelVersion, "id" | "hash">;
export type ModelPin = Readonly<{
  version: 1; id: string; invocationId: string; jobId: string; modelVersionId: string;
}>;
/** These synchronous verifiers inspect trusted operating decisions/artifacts.
 * No model or source text can supply authority or approve its own evaluation. */
export type ModelAuthority = Readonly<{
  authorize(model: ModelVersion): void;
  verifyModel(model: ModelVersion): boolean;
  verifyCalibration(model: ModelVersion): boolean;
  verifyEvaluation(model: ModelVersion): boolean;
}>;
export type ModelVersionStore = Readonly<{
  save(model: ModelVersion, authority: ModelAuthority): Promise<ModelVersion>;
  find(id: string): Promise<ModelVersion | null>;
}>;
