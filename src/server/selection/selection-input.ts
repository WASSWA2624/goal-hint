import "server-only";

import { z } from "zod";
import { createPredictionWindow, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { maximumCompetitionScope } from "../../domain/feed-query.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { parseCatalogImportRequest } from "../football/catalog-input.ts";
import { jobHash, jobInstant, jobVersion, parseJobEnvelope } from "../jobs/job-input.ts";
import { selectionFail, type CycleSelectionEligibility, type DegradedSelectionAction, type SelectionPolicy } from "./selection-contract.ts";

const ref = z.string().min(1).max(512).regex(/^[^\p{Cc}]+$/u);
const actor = z.string().min(1).max(128).regex(/^[^\p{Cc}]+$/u);
export const scheduledSelection = z.strictObject({ scheduledFor: jobInstant }).refine(({ scheduledFor }) => {
  try { return selectionWindow(scheduledFor).startInclusive === scheduledFor; } catch { return false; }
});
export function selectionWindow(scheduledFor: number) {
  const at = utcInstantFromEpochMilliseconds(scheduledFor), window = createPredictionWindow(getReportingDate(at));
  if (at !== window.startInclusive) return selectionFail("invalid-request");
  return window;
}
export function parseSelection<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { return freezeEvidence(schema.parse(value)); } catch { return selectionFail("invalid-request"); }
}
export const degradedActionSchema = z.strictObject({ actor, evidenceRef: ref, policyRef: ref });
export function parseDegradedAction(input: unknown): DegradedSelectionAction { return parseSelection(degradedActionSchema, input); }
export function parseCycleSelectionEligibility(input: unknown): CycleSelectionEligibility {
  return parseSelection(z.strictObject({ id: jobHash, fixtureId: z.uuid(), previousCycleId: z.uuid(), previousVersion: jobVersion,
    kickoffAt: jobInstant, state: z.enum(["postponed", "void"]), actor, evidenceRef: ref }), input);
}
const policy = z.strictObject({ version: z.literal(1), evidenceRef: ref,
  competitionIds: z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(maximumCompetitionScope)
    .refine((ids) => new Set(ids).size === ids.length), eligibleStatuses: z.tuple([z.literal("scheduled")]),
  degradationPolicyRef: ref.nullable(), retentionEvidenceRef: ref, leaseMs: z.number().int().min(1000).max(120_000),
  attemptsPerInvocation: z.number().int().min(1).max(4), maxFixtures: z.number().int().min(1).max(10_000),
  // Optional nearest-kickoff budget priority; omitted keeps every eligible fixture.
  refreshCapacity: z.number().int().min(0).max(10_000).optional(),
  // Optional provider date horizon; later dates stay explicit missing coverage without a request.
  importDays: z.number().int().min(1).max(7).optional(),
  // Optional minimum time before the publication cutoff; omitted keeps the cutoff itself as the limit.
  refreshLeadMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  importBounds: z.strictObject({ priority: z.literal("daily-inputs"), deadlineMs: z.number().int().min(100).max(3_600_000),
    timeoutMs: z.number().int().positive(), maxRequests: z.number().int().positive(), maxPages: z.number().int().positive(),
    maxRows: z.number().int().positive(), maxResponseBytes: z.number().int().positive(),
    retry: z.strictObject({ maxAttempts: z.number().int().positive(), baseDelayMs: z.number().int().nonnegative(), maxDelayMs: z.number().int().nonnegative() }),
    cacheMaxAgeMs: z.number().int().nonnegative() }), refresh: z.unknown(),
});
export function parseSelectionPolicy(input: unknown): SelectionPolicy {
  if (input === null || input === undefined) return selectionFail("policy-required");
  const value = parseSelection(policy, input);
  const refresh = value.refresh as Record<string, unknown>;
  const template = parseJobEnvelope({ ...refresh, version: 1, idempotencyKey: "0".repeat(64), refresh: null,
    notBefore: Date.UTC(2026, 0, 1), expiresAt: Date.UTC(2027, 0, 1), priority: 0 });
  if (!refresh || Object.keys(refresh).some((key) => !["type", "handlerVersion", "payload", "maxAttempts", "timeoutMs", "leaseMs", "fallbackReserveMs", "backoff"].includes(key))) return selectionFail("invalid-request");
  const { deadlineMs, ...bounds } = value.importBounds;
  parseCatalogImportRequest({ id: "00000000-0000-4000-8000-000000000000", selection: { kind: "fixtures", query: { date: "2026-10-07" } },
    retentionEvidenceRef: value.retentionEvidenceRef, bounds: { ...bounds, deadlineAt: Date.UTC(2026, 0, 1) + deadlineMs } });
  return freezeEvidence({ ...value, refresh: { type: template.type, handlerVersion: template.handlerVersion, payload: template.payload,
    maxAttempts: template.maxAttempts, timeoutMs: template.timeoutMs, leaseMs: template.leaseMs,
    fallbackReserveMs: template.fallbackReserveMs, backoff: template.backoff } }) as SelectionPolicy;
}
