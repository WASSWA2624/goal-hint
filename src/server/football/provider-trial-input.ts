import "server-only";

import { z } from "zod";
import { parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { trialCases, PROVIDER_TRIAL_VERSION, type TrialPlan } from "./provider-trial-contract.ts";

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonnegative = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = nonnegative.refine((value) => { try { utcInstantFromEpochMilliseconds(value); return true; } catch { return false; } })
  .transform((value) => utcInstantFromEpochMilliseconds(value));
const slug = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u);
const season = positive.max(9999);
const date = z.string().refine((value) => { try { parseReportingDate(value); return true; } catch { return false; } });
const fixtureQuery = z.object({ date: date.optional(), competitionId: positive.optional(), season: season.optional(),
  teamId: positive.optional(), from: date.optional(), to: date.optional(), round: z.string().min(1).max(200).optional(), fixtureId: positive.optional() }).strict();
const competition = z.object({ id: positive, season }).strict();
const pair = z.object({ competitionId: positive, season }).strict();
const operation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixtures"), query: fixtureQuery }).strict(),
  z.object({ kind: z.literal("live") }).strict(),
  z.object({ kind: z.literal("account-status") }).strict(),
  z.object({ kind: z.literal("fixture-ids"), ids: z.array(positive).min(1).max(1000) }).strict(),
  z.object({ kind: z.literal("teams"), query: z.union([z.object({ teamId: positive }).strict(), pair]) }).strict(),
  z.object({ kind: z.literal("competitions"), query: z.object({ competitionId: positive.optional(), season: season.optional() }).strict() }).strict(),
  z.object({ kind: z.literal("player-statistics"), query: pair }).strict(),
  ...(["statistics", "lineups", "injuries", "predictions"] as const).map((kind) => z.object({ kind: z.literal(kind), fixtureId: positive }).strict()),
]);
export const trialRequirements = ["candidate-competitions", "trial-allowance", "pagination", "canonical-identities", "aliases",
  "league-sample", "cup-sample", "low-coverage-sample", "postponed-sample", "cross-midnight-sample", "extra-time-sample", "shootout-sample", "status-transitions",
  "field-coverage", "provider-update-times", "regulation-scores", "fallback-match-result", "fallback-double-chance", "fallback-total-goals", "fallback-btts",
  "fallback-prematch", "fallback-freshness", "account-plan", "account-limits", "quota-headers", "provider-reset", "subscription-expiry", "payable-total",
  "private-use-rights", "data-redistribution", "prediction-redistribution", "remote-logo-rights", "media-host-restrictions", "credential-free-logo-urls"] as const;
const evidence = z.object({ id: slug, requirement: z.enum(trialRequirements),
  kind: z.enum(["official-source", "account-record", "rights-record", "operator-record", "synthetic"]),
  source: z.string().min(1).max(2000).refine((value) => {
    if (!/^https?:/iu.test(value)) return !/[\r\n\0]/u.test(value);
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }
    catch { return false; }
  }), recordedAt: instant,
  value: z.record(z.string().min(1).max(80), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]))
    .refine((values) => Object.keys(values).length <= 40 && !Object.keys(values).some((key) => /key|password|token|secret|email/iu.test(key))),
}).strict();
const planSchema = z.object({
  version: z.literal(PROVIDER_TRIAL_VERSION), id: slug,
  accountId: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  competitions: z.array(competition).max(200), maxRequests: positive.nullable(), deadlineAt: instant.nullable(),
  bounds: z.object({ priority: z.enum(["daily-inputs", "enrichment"]), timeoutMs: positive.max(2_147_483_647),
    maxPages: positive, maxRows: positive, maxResponseBytes: positive,
    retry: z.object({ maxAttempts: positive, baseDelayMs: nonnegative.max(2_147_483_647), maxDelayMs: nonnegative.max(2_147_483_647) }).strict(),
    cacheMaxAgeMs: nonnegative,
  }).strict().refine((bounds) => bounds.retry.baseDelayMs <= bounds.retry.maxDelayMs).nullable(),
  freshness: z.object({ maxRetrievalAgeMs: positive, maxSourceAgeMs: positive,
    unknownUpdateTime: z.enum(["reject", "retrieval-only"]), evidenceRef: z.string().min(1).max(256) }).strict().nullable(),
  tasks: z.array(z.object({ id: slug, case: z.enum(trialCases), operation, maxRequests: positive, fixtureTaskId: slug.optional(), notBefore: instant.optional() }).strict()).max(1000),
  evidence: z.array(evidence).max(200),
}).strict();
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export class TrialInputError extends Error {
  constructor() { super("Invalid provider trial input; check the documented schema. Private input values are withheld."); this.name = "TrialInputError"; }
}
/** Offline plans may retain unresolved nulls. Live authorization is a separate gate. */
export function parseTrialPlan(input: unknown): TrialPlan {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) throw new TrialInputError();
  const plan = parsed.data;
  const ids = new Set<string>(), competitions = new Set<string>();
  for (const entry of plan.competitions) {
    const key = `${entry.id}:${entry.season}`;
    if (competitions.has(key)) throw new TrialInputError(); competitions.add(key);
  }
  for (const task of plan.tasks) {
    if (ids.has(task.id) || task.fixtureTaskId !== undefined && !ids.has(task.fixtureTaskId)) throw new TrialInputError();
    const query = "query" in task.operation ? task.operation.query : null;
    if (query && "competitionId" in query && query.competitionId !== undefined && "season" in query && query.season !== undefined
      && !competitions.has(`${query.competitionId}:${query.season}`)) throw new TrialInputError();
    ids.add(task.id);
  }
  if (new Set(plan.evidence.map((entry) => entry.id)).size !== plan.evidence.length) throw new TrialInputError();
  return freeze(plan) as TrialPlan;
}
/** An executable offline baseline with no invented allowance, competition or entitlement. */
export function createOfflineTrialPlan(id = "provider-trial"): TrialPlan {
  return parseTrialPlan({ version: PROVIDER_TRIAL_VERSION, id, accountId: null, competitions: [], maxRequests: null,
    deadlineAt: null, bounds: null, freshness: null, tasks: [], evidence: [] });
}
