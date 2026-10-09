import "server-only";

import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { historyHash, historyId, historyInstant } from "./history-input.ts";
import { assertHistorySeal, historyJson, historyTime, storedRevision } from "./history-read.ts";
import { publicationFail, type PublicationResult, type RefreshPublicationResult } from "./publication-contract.ts";
import { parsePublication, parsePublicationObservation } from "./publication-input.ts";
import { observationShowsPlay } from "./publication-eligibility.ts";

export const publicationReasons = ["accepted", "no-valid-family", "not-selected", "outside-window", "wrong-cycle", "schedule-changed",
  "closed-cycle", "early-play", "status-ineligible", "cutoff-passed", "stale-observation", "future-observation", "stale-source", "older-run"] as const;
const integer = z.bigint().positive().max(18_446_744_073_709_551_615n);
const resultSchema = z.strictObject({ id: historyHash, requestHash: historyHash, attemptKey: historyHash,
  runId: historyId, runSequence: integer, fixtureId: historyId, cycleId: historyId, jobId: historyHash, fixtureVersion: integer,
  outcome: z.enum(["published", "retained-previous", "unavailable", "skipped"]), reason: z.enum(publicationReasons),
  revisionId: historyId.nullable(), at: historyInstant, evidenceSnapshotId: historyHash, candidateHash: historyHash,
  generationCompletedAt: historyInstant, policyHash: historyHash, observation: z.unknown(),
}).refine((value) => (value.outcome === "published" ? value.reason === "accepted" && value.revisionId !== null
  : value.outcome === "retained-previous" ? value.reason === "no-valid-family" && value.revisionId !== null
    : value.outcome === "unavailable" ? value.reason === "no-valid-family" && value.revisionId === null
      : !["accepted", "no-valid-family"].includes(value.reason) && value.revisionId === null));

export async function storedRefreshResult(tx: Prisma.TransactionClient, id: string): Promise<RefreshPublicationResult | null> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT *,
    integrity = SHA2(CAST(resultJson AS CHAR), 256) AS validIntegrity FROM PredictionRefreshResult WHERE id = ${id}`;
  const row = rows[0]; if (!row) return null;
  try {
    assertHistorySeal(row.validIntegrity);
    const result = parsePublication(resultSchema, historyJson(row.resultJson));
    const observation = parsePublicationObservation(result.observation);
    for (const key of ["id", "requestHash", "attemptKey", "runId", "runSequence", "fixtureId", "cycleId", "jobId", "fixtureVersion", "outcome", "reason", "revisionId"] as const)
      if (row[key] !== result[key]) return publicationFail("unavailable");
    if (historyTime(row.at) !== result.at || observation.fixtureId !== result.fixtureId || observation.cycleId !== result.cycleId) return publicationFail("unavailable");
    return freezeEvidence({ ...result, observation });
  } catch { return publicationFail("unavailable"); }
}
export async function publicationResult(tx: Prisma.TransactionClient, refresh: RefreshPublicationResult): Promise<PublicationResult> {
  const revision = refresh.revisionId === null ? null : await storedRevision(tx, refresh.revisionId);
  if (refresh.revisionId !== null && (!revision || revision.cycleId !== refresh.cycleId || revision.fixtureId !== refresh.fixtureId)) return publicationFail("unavailable");
  return freezeEvidence({ refresh, revision, updateDelayed: refresh.outcome === "retained-previous" });
}

/** Shared safety evidence for subsequent final locking and schedule correction. */
export async function storedPublicationBarrier(tx: Prisma.TransactionClient, cycleId: string) {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT *,
    integrity = SHA2(CAST(observationJson AS CHAR), 256) AS validIntegrity FROM PredictionPublicationBarrier WHERE cycleId = ${cycleId}`;
  const row = rows[0]; if (!row) return null;
  try {
    assertHistorySeal(row.validIntegrity);
    const observation = parsePublicationObservation(historyJson(row.observationJson));
    const closedAt = historyTime(row.closedAt), recordedAt = historyTime(row.recordedAt);
    if (observation.fixtureId !== row.fixtureId || observation.cycleId !== cycleId || !observationShowsPlay(observation) ||
      closedAt !== (observation.actualStartedAt ?? observation.retrievedAt) || closedAt > recordedAt) return publicationFail("unavailable");
    return freezeEvidence({ fixtureId: observation.fixtureId, cycleId, closedAt, recordedAt, observation });
  } catch { return publicationFail("unavailable"); }
}
