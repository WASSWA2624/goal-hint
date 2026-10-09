import "server-only";

import { z } from "zod";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { parseResolvedForecastCandidate } from "../fallback/fallback-input.ts";
import { historyHash, historyId, historyInstant, historyVersion } from "./history-input.ts";
import { publicationFail, type PublicationObservation, type PublicationPolicy, type PublishRevisionInput } from "./publication-contract.ts";

const ref = z.string().trim().min(1).max(512).regex(/^[^\p{Cc}]+$/u);
const freshness = z.strictObject({ maxAgeMs: z.number().int().nonnegative().max(2_147_483_647),
  basis: z.enum(["generated", "retrieved", "provider-updated"]), unknownGeneration: z.enum(["reject", "allow-flagged"]),
  unknownUpdate: z.enum(["reject", "allow-flagged"]) });
const policy = z.strictObject({ version: z.literal(1), evidenceRef: ref,
  maxObservationAgeMs: z.number().int().positive().max(2_147_483_647),
  sources: z.strictObject({ ai: freshness, "api-football": freshness }) });
const observation = z.strictObject({ provider: z.literal("api-football"), fixtureId: historyId,
  externalFixtureId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), cycleId: historyId, kickoffAt: historyInstant,
  status: z.enum(["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties", "postponed", "canceled", "abandoned", "awarded", "unknown"]),
  retrievedAt: historyInstant, providerUpdatedAt: historyInstant.nullable(), actualStartedAt: historyInstant.nullable(), evidenceRef: ref,
}).refine((value) => (value.providerUpdatedAt === null || value.providerUpdatedAt <= value.retrievedAt) &&
  (value.actualStartedAt === null || value.actualStartedAt <= value.retrievedAt));
export function parsePublication<Value>(schema: z.ZodType<Value>, input: unknown): Value {
  try { return freezeEvidence(schema.parse(input)); } catch { return publicationFail("invalid-request"); }
}
export function parsePublicationPolicy(input: unknown): PublicationPolicy {
  if (input == null) return publicationFail("policy-required");
  return parsePublication(policy, input);
}
export function parsePublicationObservation(input: unknown): PublicationObservation { return parsePublication(observation, input); }
export function parsePublishRevision(input: unknown): PublishRevisionInput {
  const value = parsePublication(z.strictObject({ attemptKey: historyHash, candidate: z.unknown(), evidenceSnapshotId: historyHash,
    scheduleVersion: historyVersion, generationCompletedAt: historyInstant, observation }), input);
  try {
    const candidate = parseResolvedForecastCandidate(value.candidate), context = candidate.context.context;
    if (context.cycleId === null || context.runId === null || value.generationCompletedAt < context.analysisAt ||
      value.observation.fixtureId !== context.fixtureId || value.observation.externalFixtureId !== context.externalFixtureId ||
      value.observation.cycleId !== context.cycleId || Object.values(candidate.markets).some((item) =>
        item.available && item.timestamps.retrievedAt > value.generationCompletedAt)) return publicationFail("invalid-request");
    return freezeEvidence({ ...value, candidate });
  } catch { return publicationFail("invalid-request"); }
}
