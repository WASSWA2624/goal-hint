import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { EvidenceContext, EvidencePolicy, EvidenceSource, EvidenceSnapshot, EvidenceKind } from "./evidence-contract.ts";
import { isSafeEvidenceUrl } from "./evidence-network.ts";

export class EvidenceInputError extends Error {
  readonly reason: "invalid-request" | "not-authorized" | "snapshot-too-large" | "invalid-snapshot";
  constructor(reason: EvidenceInputError["reason"] = "invalid-request") {
    super("Fixture evidence is invalid or unavailable. Private source details are withheld.");
    this.name = "EvidenceInputError"; this.reason = reason;
  }
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = count.positive();
const identity = z.string().regex(/^[a-f0-9]{64}$/u);
const uuid = z.uuid().transform((value) => value.toLowerCase());
const label = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u);
const reference = z.string().min(1).max(512).refine((value) => value === value.trim() && !/[\r\n\0]/u.test(value));
const text = z.string().max(4096).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value));
const short = text.max(512);
const instant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); const year = new Date(value).getUTCFullYear(); return year >= 1000 && year <= 9999; }
  catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
const version = z.bigint().positive().max(18_446_744_073_709_551_615n);
const team = z.object({ teamId: uuid, externalId: positive }).strict();
const contextSchema = z.object({ fixtureId: uuid, fixtureVersion: version, provider: z.literal("api-football"), externalFixtureId: positive,
  home: team, away: team, kickoffAt: instant, analysisAt: instant, cutoffAt: instant, cycleId: uuid.nullable(), runId: uuid.nullable(),
}).strict().refine((value) => value.home.teamId !== value.away.teamId && value.home.externalId !== value.away.externalId &&
  value.cutoffAt <= value.analysisAt && value.analysisAt < value.kickoffAt);
const freshness = z.object({ maxAgeMs: count, basis: z.enum(["retrieved", "published", "provider-updated"]),
  unknownTimestamp: z.enum(["exclude", "allow-flagged"]), conflicts: z.enum(["preserve", "fail-coverage"]),
}).strict();
const policySchema = z.object({ version: label, evidenceRef: reference, freshness: z.object({ football: freshness, news: freshness }).strict(),
  minimum: z.object({ historyPerTeam: count, formPerTeam: count, statisticsPerTeam: count, requireVenue: z.boolean(),
    requireRest: z.boolean(), newsSources: count }).strict(),
  bounds: z.object({ maxSources: positive.max(10_000), maxClaimsPerSource: positive.max(10_000),
    maxSummaryCharacters: positive.max(4096), maxTitleCharacters: positive.max(2048), maxPublisherCharacters: positive.max(512),
    maxValueCharacters: positive.max(4096), maxSourceBytes: positive.max(16_777_216), maxSnapshotBytes: positive.max(67_108_864),
  }).strict(),
}).strict().refine((value) => value.bounds.maxSourceBytes <= value.bounds.maxSnapshotBytes &&
  value.minimum.newsSources <= value.bounds.maxSources &&
  Math.max(value.minimum.historyPerTeam, value.minimum.formPerTeam, value.minimum.statisticsPerTeam) <=
    value.bounds.maxSources * value.bounds.maxClaimsPerSource);
const kindSchema = z.enum(["history", "form", "rest", "venue", "statistic", "injury", "lineup", "xg", "news"]);
const optionalCount = count.optional();
const optionalText = short.nullable().optional();
const valueSchemas = {
  history: z.object({ fixtureId: positive, homeExternalId: positive, awayExternalId: positive,
    kickoffAt: instant, homeGoals: count, awayGoals: count, regulationVerified: z.literal(true),
    period: z.literal("regulation-including-stoppage-time") }).strict().refine((value) => value.homeExternalId !== value.awayExternalId),
  form: z.object({ matches: count, wins: count, draws: count, losses: count,
    goalsFor: optionalCount, goalsAgainst: optionalCount, points: optionalCount, windowStartsAt: instant,
    windowEndsAt: instant, period: z.literal("regulation-including-stoppage-time") }).strict()
    .refine((value) => value.wins + value.draws + value.losses === value.matches &&
      value.windowStartsAt <= value.windowEndsAt),
  rest: z.object({ lastKickoffAt: instant, restDays: z.number().finite().nonnegative() }).strict(),
  venue: z.object({ role: z.enum(["home", "away", "neutral"]), venueName: optionalText, neutral: z.boolean().nullable().optional() }).strict(),
  statistic: z.object({ metric: short, value: z.union([z.number().finite(), short]).nullable(),
    unit: optionalText, fixtureId: positive.optional(), teamExternalId: positive.optional() }).strict(),
  injury: z.object({ playerExternalId: positive.optional(), playerName: optionalText, type: optionalText, reason: optionalText, status: optionalText }).strict(),
  lineup: z.object({ playerExternalId: positive.optional(), playerName: optionalText, number: optionalCount, position: optionalText,
    grid: optionalText, formation: optionalText, role: z.enum(["starting", "substitute", "formation"]).optional() }).strict(),
  xg: z.object({ value: z.number().finite().nonnegative(), unit: optionalText, fixtureId: positive.optional(), teamExternalId: positive.optional() }).strict(),
  news: z.object({ claim: text.min(1), playerExternalId: positive.optional(), playerName: optionalText, event: optionalText }).strict(),
} satisfies Record<EvidenceKind, z.ZodType>;
const claimSchema = z.object({ kind: kindSchema, subjectTeamId: uuid.nullable(), key: label,
  value: z.record(z.string(), z.union([text, z.number().finite(), z.boolean(), z.null()])), summary: text,
  certainty: z.enum(["confirmed", "rumor", "unknown"]), asOfAt: instant.nullable(),
}).strict().refine((value) => Object.keys(value.value).length > 0 && valueSchemas[value.kind].safeParse(value.value).success);
const binding = z.object({ fixtureId: uuid, fixtureVersion: version, externalFixtureId: positive,
  homeTeamId: uuid, awayTeamId: uuid, homeExternalId: positive, awayExternalId: positive,
}).strict().refine((value) => value.homeTeamId !== value.awayTeamId && value.homeExternalId !== value.awayExternalId);
const sourceSchema = z.object({ id: identity, kind: z.enum(["football", "news"]), sourceKey: identity, syndicationKey: identity.nullable(),
  version: label, publisher: short.min(1), title: text.min(1).max(2048), sourceUrl: z.string().max(2048).nullable(),
  publishedAt: instant.nullable(), retrievedAt: instant, providerUpdatedAt: instant.nullable(), binding,
  evidenceRef: reference, reuse: z.object({ evidenceRef: reference, retainUntil: instant, allowSummary: z.boolean() }).strict(),
  claims: z.array(claimSchema).max(10_000),
}).strict().refine((value) => (value.sourceUrl === null ? value.kind === "football" : isSafeEvidenceLink(value.sourceUrl)) &&
  (value.kind !== "football" || value.claims.every((claim) => claim.kind !== "news")) &&
  (value.publishedAt === null || value.publishedAt <= value.retrievedAt) &&
  (value.providerUpdatedAt === null || value.providerUpdatedAt <= value.retrievedAt) && value.reuse.retainUntil >= value.retrievedAt &&
  value.id === evidenceSourceId(value));
const flag = z.enum(["rumor", "unknown", "unknown-timestamp", "conflict", "missing"]);
const factSchema = z.object({ id: identity, kind: kindSchema, subjectTeamId: uuid.nullable(), key: label,
  values: z.array(z.object({ value: z.record(z.string(), z.union([text, z.number().finite(), z.boolean(), z.null()])),
    summary: text, certainty: z.enum(["confirmed", "rumor", "unknown"]), asOfAt: instant.nullable(),
    sourceIds: z.array(identity), claimIds: z.array(identity) }).strict()), flags: z.array(flag),
}).strict();
const snapshotSchema = z.object({ version: z.literal(1), id: identity, hash: identity, context: contextSchema,
  policy: policySchema, sources: z.array(sourceSchema), facts: z.array(factSchema),
  exclusions: z.array(z.object({ sourceId: identity.nullable(), reason: z.enum(["invalid-source", "wrong-fixture", "wrong-team", "unverified-source",
    "reuse-not-permitted", "future", "stale", "unknown-timestamp", "duplicate"]) }).strict()),
  missingness: z.array(z.object({ kind: kindSchema, subjectTeamId: uuid.nullable(), reason: z.enum(["unavailable", "conflicting"]) }).strict()),
  coverage: z.object({ sufficient: z.boolean(), independentNewsSources: count, limitedNews: z.boolean(),
    labels: z.array(z.literal("Limited news coverage")), reasons: z.array(label) }).strict(),
}).strict();

export function freezeEvidence<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freezeEvidence(child); Object.freeze(value); }
  return value;
}
function parsed<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  try { return freezeEvidence(schema.parse(value)); } catch { throw new EvidenceInputError(); }
}
function canonical(value: unknown): unknown {
  if (typeof value === "bigint") return { $evidenceInteger: value.toString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([key, child]) => [key, canonical(child)]));
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  throw new EvidenceInputError();
}
export function evidenceSerialize(value: unknown): string { return JSON.stringify(canonical(value)); }
export function evidenceFingerprint(value: unknown): string { return createHash("sha256").update(evidenceSerialize(value)).digest("hex"); }
export function evidenceSourceId(value: Omit<EvidenceSource, "id"> | EvidenceSource): string {
  const { id: _id, ...body } = value as EvidenceSource;
  void _id; return evidenceFingerprint(body);
}
export function evidenceSnapshotHash(value: Omit<EvidenceSnapshot, "id" | "hash"> | EvidenceSnapshot): string {
  const { id: _id, hash: _hash, ...body } = value as EvidenceSnapshot;
  void _id; void _hash; return evidenceFingerprint(body);
}
/** URL validation complements, rather than replaces, DNS pinning and redirect checks at fetch time. */
export function isSafeEvidenceLink(value: string): boolean {
  return isSafeEvidenceUrl(value);
}
export function parseEvidenceContext(value: unknown): EvidenceContext { return parsed(contextSchema, value); }
export function parseEvidencePolicy(value: unknown): EvidencePolicy { return parsed(policySchema, value); }
export function parseEvidenceSource(value: unknown, policy?: EvidencePolicy): EvidenceSource {
  const result = parsed(sourceSchema, value);
  if (policy) assertEvidenceSourceBounds(result, policy);
  return result;
}
export function assertEvidenceSourceBounds(source: EvidenceSource, policy: EvidencePolicy): void {
  const bounds = policy.bounds;
  if (source.claims.length > bounds.maxClaimsPerSource || source.title.length > bounds.maxTitleCharacters ||
    source.publisher.length > bounds.maxPublisherCharacters || source.claims.some((claim) =>
      claim.summary.length > bounds.maxSummaryCharacters || Object.values(claim.value).some((value) => typeof value === "string" && value.length > bounds.maxValueCharacters)) ||
    Buffer.byteLength(evidenceSerialize(source), "utf8") > bounds.maxSourceBytes) throw new EvidenceInputError();
}
export function parseEvidenceSnapshot(value: unknown): EvidenceSnapshot {
  const snapshot = parsed(snapshotSchema, value) as EvidenceSnapshot;
  if (snapshot.sources.length > snapshot.policy.bounds.maxSources || snapshot.id !== snapshot.hash || evidenceSnapshotHash(snapshot) !== snapshot.hash ||
    new Set(snapshot.sources.map((source) => source.id)).size !== snapshot.sources.length) throw new EvidenceInputError("invalid-snapshot");
  for (const source of snapshot.sources) assertEvidenceSourceBounds(source, snapshot.policy);
  if (Buffer.byteLength(evidenceSerialize(snapshot), "utf8") > snapshot.policy.bounds.maxSnapshotBytes) throw new EvidenceInputError("snapshot-too-large");
  const ids = new Set(snapshot.sources.map((source) => source.id));
  if (snapshot.facts.some((fact) => fact.values.some((variant) => variant.sourceIds.length === 0 || variant.sourceIds.some((id) => !ids.has(id)))))
    throw new EvidenceInputError("invalid-snapshot");
  return snapshot;
}
