import "server-only";

import { z } from "zod";
import { getPublicationDeadline, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { parseResolvedForecastCandidate } from "../fallback/fallback-input.ts";
import { historyFail, type AppendRevisionInput, type ChangeCycleInput, type CreateCycleInput, type HistoryAuditSnapshot, type StoredCycle } from "./history-contract.ts";

export const historyId = z.uuid();
export const historyHash = z.string().regex(/^[a-f0-9]{64}$/u);
export const historyVersion = z.number().int().positive().max(4_294_967_295);
export const historyInstant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); const year = new Date(value).getUTCFullYear(); return year >= 1000 && year <= 9999; }
  catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const label = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const actor = { actor: label(128), reason: label(2000), evidenceRef: label(512) };
const references = z.strictObject({ state: z.enum(["open", "closed", "void"]), currentSetId: historyId.nullable(),
  lockedSetId: historyId.nullable(), closedAt: historyInstant.nullable(), lockedAt: historyInstant.nullable(),
  voidedAt: historyInstant.nullable(), voidReason: label(2000).nullable(),
}).refine((value) => (value.lockedSetId === null) === (value.lockedAt === null) &&
  (value.state === "open" ? value.closedAt === null && value.lockedSetId === null && value.voidedAt === null && value.voidReason === null
    : value.closedAt !== null && (value.lockedAt === null || value.lockedAt >= value.closedAt) &&
      (value.state === "void" ? value.voidedAt !== null && value.voidedAt >= value.closedAt && value.voidReason !== null
        : value.voidedAt === null && value.voidReason === null)));
const creation = z.strictObject({ ...actor, fixtureId: historyId, creationKey: historyHash,
  kickoffAt: historyInstant, openedAt: historyInstant, activate: z.boolean(),
});
const change = z.strictObject({ ...actor, cycleId: historyId, expectedVersion: historyVersion,
  eventKey: historyHash, at: historyInstant, next: references, activate: z.boolean().optional(),
  schedule: z.strictObject({ kickoffAt: historyInstant, providerObservedAt: historyInstant.nullable(),
    actualStartedAt: historyInstant.nullable() }).optional(),
}).refine((value) => [value.next.closedAt, value.next.lockedAt, value.next.voidedAt,
  value.schedule?.providerObservedAt, value.schedule?.actualStartedAt].every((time) => time == null || time <= value.at));
const append = z.strictObject({ ...actor, candidate: z.unknown(), evidenceSnapshotId: historyHash,
  scheduleVersion: historyVersion, generationCompletedAt: historyInstant, publishedAt: historyInstant,
});
const cycle = references.safeExtend({ id: historyId, fixtureId: historyId, creationKey: historyHash, creationHash: historyHash,
  ordinal: historyVersion, version: historyVersion, scheduleVersion: historyVersion,
  kickoffAt: historyInstant, cutoffAt: historyInstant, openedAt: historyInstant,
}).refine((value) => value.cutoffAt === getPublicationDeadline(value.kickoffAt) &&
  (value.closedAt === null || value.closedAt >= value.openedAt));
export function parseHistory<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { return schema.parse(value); } catch { return historyFail("invalid-request"); }
}
export function parseCreateCycle(value: unknown): CreateCycleInput { return freezeEvidence(parseHistory(creation, value)); }
export function parseChangeCycle(value: unknown): ChangeCycleInput {
  const { activate, schedule, ...input } = parseHistory(change, value);
  return freezeEvidence({ ...input, ...(activate === undefined ? {} : { activate }), ...(schedule === undefined ? {} : { schedule }) });
}
export function parseStoredCycle(value: unknown): StoredCycle { return freezeEvidence(parseHistory(cycle, value)); }
export function parseHistoryAuditSnapshot(value: unknown): HistoryAuditSnapshot {
  return freezeEvidence(parseHistory(z.strictObject({ cycle: cycle.nullable(), activeCycleId: historyId.nullable(), revisionId: historyId.nullable() }), value));
}
export function parseAppendRevision(value: unknown): AppendRevisionInput {
  const input = parseHistory(append, value);
  try {
    const candidate = parseResolvedForecastCandidate(input.candidate), context = candidate.context.context;
    const available = Object.values(candidate.markets).filter((item) => item.available);
    if (context.cycleId === null || context.runId === null || available.length === 0 ||
      input.generationCompletedAt < context.analysisAt || input.publishedAt < input.generationCompletedAt ||
      available.some((item) => item.timestamps.retrievedAt > input.generationCompletedAt)) return historyFail("invalid-request");
    return freezeEvidence({ ...input, candidate });
  } catch { return historyFail("invalid-request"); }
}
export function nextHistoryVersion(value: number): number {
  return parseHistory(historyVersion, value + 1);
}
