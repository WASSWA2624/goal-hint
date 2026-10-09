import "server-only";

import { z } from "zod";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { lifecycleFail, type LifecycleInput, type LifecycleObservation, type LifecyclePolicy } from "./lifecycle-contract.ts";
import { historyId, historyInstant } from "./history-input.ts";

const label = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const externalId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const statuses = z.enum(["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties",
  "postponed", "canceled", "abandoned", "awarded", "unknown"]);
const goal = z.number().int().min(0).max(1000).nullable();
const pair = z.strictObject({ home: goal, away: goal });
export const lifecycleObservationSchema = z.strictObject({
  fixtureId: historyId, externalFixtureId: externalId, homeExternalId: externalId, awayExternalId: externalId,
  competitionExternalId: externalId, season: z.number().int().min(1).max(9999).nullable(),
  kickoffAt: historyInstant.nullable(), status: statuses, providerStatus: label(32).nullable(),
  actualStartedAt: historyInstant.nullable(), elapsedMinutes: z.number().int().min(0).max(1000).nullable(),
  retrievedAt: historyInstant, providerUpdatedAt: historyInstant.nullable(), endpoint: label(512),
  reportedGoals: pair, extraTimeScore: pair, penaltyScore: pair,
  regulationScore: z.strictObject({ fixtureId: externalId, providerStatus: z.enum(["FT", "AET", "PEN"]),
    sourceField: z.literal("score.fulltime"), period: z.literal("regulation-including-stoppage-time"),
    home: goal.unwrap(), away: goal.unwrap(), verified: z.boolean() }).nullable(),
  actor: label(128), evidenceRef: label(512),
}).refine((value) => value.homeExternalId !== value.awayExternalId &&
  (value.providerUpdatedAt === null || value.providerUpdatedAt <= value.retrievedAt) &&
  (value.actualStartedAt === null || value.actualStartedAt <= value.retrievedAt) &&
  (value.regulationScore === null || value.regulationScore.fixtureId === value.externalFixtureId));
export function parseLifecycle<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { return schema.parse(value); } catch { return lifecycleFail("invalid-request"); }
}
export function parseLifecycleInput(input: LifecycleInput): LifecycleObservation {
  try {
    const { fixture, fixtureId, actualStartedAt, actor, evidenceRef } = input;
    if (fixture.source.provider !== "api-football") return lifecycleFail("invalid-request");
    return freezeEvidence(parseLifecycle(lifecycleObservationSchema, { fixtureId, actualStartedAt, actor, evidenceRef,
      externalFixtureId: fixture.id, homeExternalId: fixture.homeTeam.id, awayExternalId: fixture.awayTeam.id,
      competitionExternalId: fixture.competition.id, season: fixture.competition.season,
      kickoffAt: fixture.kickoff, status: fixture.status, providerStatus: fixture.providerStatus, elapsedMinutes: fixture.elapsedMinutes,
      retrievedAt: fixture.source.retrievedAt, providerUpdatedAt: fixture.source.providerUpdatedAt, endpoint: fixture.source.endpoint,
      reportedGoals: fixture.reportedGoals, regulationScore: fixture.regulationScore,
      extraTimeScore: fixture.extraTimeScore, penaltyScore: fixture.penaltyScore }));
  } catch { return lifecycleFail("invalid-request"); }
}
export function parseLifecyclePolicy(value: unknown): LifecyclePolicy {
  try {
    return freezeEvidence(z.strictObject({ version: z.literal(1), evidenceRef: label(512),
      ordering: z.literal("retrieval-and-provider-update"), unknownUpdate: z.enum(["use-retrieval", "hold"]),
      conflictResolution: z.literal("newer-verified-observation"),
      mappings: z.array(z.strictObject({ providerStatus: label(32), status: statuses })).min(1).max(100),
    }).refine((policy) => new Set(policy.mappings.map((entry) => entry.providerStatus)).size === policy.mappings.length).parse(value));
  } catch { return lifecycleFail("policy-required"); }
}
