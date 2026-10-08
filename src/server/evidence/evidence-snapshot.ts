import "server-only";

import type { EvidenceAuthority, EvidenceBuildRequest, EvidenceContext, EvidenceExclusionReason, EvidenceFact,
  EvidenceFlag, EvidenceKind, EvidencePolicy, EvidenceSnapshot, EvidenceSource } from "./evidence-contract.ts";
import { EvidenceInputError, evidenceFingerprint, evidenceSerialize, evidenceSnapshotHash, freezeEvidence,
  parseEvidenceContext, parseEvidencePolicy, parseEvidenceSnapshot, parseEvidenceSource } from "./evidence-input.ts";

const prepared = new WeakMap<EvidenceSnapshot, EvidenceAuthority>();
const kinds: readonly EvidenceKind[] = ["history", "form", "rest", "venue", "statistic", "injury", "lineup", "xg", "news"];
function synchronous(value: unknown): unknown {
  if (value instanceof Promise) void value.catch(() => undefined);
  return value;
}
function trusted(operation: () => boolean): boolean { try { return synchronous(operation()) === true; } catch { return false; } }
function authorize(context: EvidenceContext, policy: EvidencePolicy, authority: EvidenceAuthority) {
  try {
    if (synchronous(authority.authorize(context)) !== undefined || !trusted(() => authority.verifyContext(context)) ||
      !trusted(() => authority.verifyPolicy(policy)))
      throw new EvidenceInputError("not-authorized");
  } catch { throw new EvidenceInputError("not-authorized"); }
}
function scope(source: EvidenceSource, context: EvidenceContext): EvidenceExclusionReason | null {
  const binding = source.binding;
  if (binding.fixtureId !== context.fixtureId || binding.fixtureVersion !== context.fixtureVersion ||
    binding.externalFixtureId !== context.externalFixtureId) return "wrong-fixture";
  if (binding.homeTeamId !== context.home.teamId || binding.awayTeamId !== context.away.teamId ||
    binding.homeExternalId !== context.home.externalId || binding.awayExternalId !== context.away.externalId || source.claims.some((claim) => {
      const externalId = claim.subjectTeamId === context.home.teamId ? context.home.externalId :
        claim.subjectTeamId === context.away.teamId ? context.away.externalId : null;
      return claim.subjectTeamId !== null && externalId === null || claim.value.teamExternalId !== undefined &&
        claim.value.teamExternalId !== externalId || claim.kind === "history" && externalId !== null &&
        claim.value.homeExternalId !== externalId && claim.value.awayExternalId !== externalId;
    })) return "wrong-team";
  return null;
}
function unknown(source: EvidenceSource): boolean {
  return (source.kind === "news" ? source.publishedAt === null : source.providerUpdatedAt === null) || source.claims.some((claim) => claim.asOfAt === null);
}
export function evidenceSourceExclusion(source: EvidenceSource, context: EvidenceContext, policy: EvidencePolicy): EvidenceExclusionReason | null {
  const bound = scope(source, context); if (bound) return bound;
  const rule = policy.freshness[source.kind];
  const times = [source.retrievedAt, source.publishedAt, source.providerUpdatedAt, ...source.claims.map((claim) => claim.asOfAt),
    ...source.claims.flatMap((claim) => Object.entries(claim.value).filter(([key]) => /At$/u.test(key)).map(([, value]) => value))];
  if (times.some((time) => time !== null && typeof time === "number" && time > context.cutoffAt)) return "future";
  const basis = rule.basis === "retrieved" ? source.retrievedAt : rule.basis === "published" ? source.publishedAt : source.providerUpdatedAt;
  if ((unknown(source) || basis === null) && rule.unknownTimestamp === "exclude") return "unknown-timestamp";
  // An explicitly approved retrieval-only bound is still required when the chosen source clock is unknown.
  if (context.analysisAt - (basis ?? source.retrievedAt) > rule.maxAgeMs) return "stale";
  return null;
}
function newsContent(source: EvidenceSource): string {
  // Original claim content catches unlabelled copies without equating unrelated reporting by team/name alone.
  const claims = source.claims.map((claim) => ({ kind: claim.kind,
    subjectTeamId: claim.subjectTeamId, value: Object.fromEntries(Object.entries(claim.value).map(([key, value]) =>
      [key, typeof value === "string" ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase() : value])),
    summary: claim.summary.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(), certainty: claim.certainty,
  })).sort((a, b) => evidenceFingerprint(a).localeCompare(evidenceFingerprint(b)));
  return claims.length > 0 ? evidenceFingerprint(claims) : source.sourceKey;
}
function usableFactValue(kind: EvidenceKind, value: EvidenceFact["values"][number]): boolean {
  return value.certainty === "confirmed" && (kind === "statistic" ? value.value.value !== null : Object.values(value.value).some((entry) => entry !== null));
}
function independentNewsCount(sources: readonly EvidenceSource[], facts: readonly EvidenceFact[], valid: (fact: EvidenceFact) => boolean): number {
  const parents = new Map<string, string>();
  const confirmed = new Map<string, Set<string>>();
  for (const fact of facts.filter(valid)) for (const value of fact.values.filter((variant) => usableFactValue(fact.kind, variant))) {
    for (const sourceId of value.sourceIds) {
      const claimIds = confirmed.get(sourceId) ?? new Set<string>();
      for (const claimId of value.claimIds) claimIds.add(claimId);
      confirmed.set(sourceId, claimIds);
    }
  }
  const root = (key: string): string => {
    const path: string[] = []; let owner = key, parent = parents.get(owner);
    while (parent !== undefined && parent !== owner) { path.push(owner); owner = parent; parent = parents.get(owner); }
    for (const entry of path) parents.set(entry, owner);
    return owner;
  };
  const families: string[] = [];
  for (const source of sources.filter((candidate) => candidate.kind === "news" && candidate.claims.some((claim) =>
    claim.certainty === "confirmed" && confirmed.get(candidate.id)?.has(evidenceFingerprint(claim))))) {
    const keys = [`source:${source.sourceKey}`, `content:${newsContent(source)}`,
      ...(source.syndicationKey === null ? [] : [`syndication:${source.syndicationKey}`])];
    const first = keys[0]!; parents.set(first, root(first));
    for (const key of keys.slice(1)) { const other = root(key), owner = root(first); if (other !== owner) parents.set(other, owner); }
    families.push(first);
  }
  return new Set(families.map(root)).size;
}
function factsFrom(sources: readonly EvidenceSource[]): EvidenceFact[] {
  type MutableFact = { id: string; kind: EvidenceKind; subjectTeamId: string | null; key: string;
    variants: Map<string, EvidenceFact["values"][number]>; flags: Set<EvidenceFlag> };
  const groups = new Map<string, MutableFact>();
  for (const source of sources) for (const claim of source.claims) {
    const key = claim.kind === "history" ? `fixture-${claim.value.fixtureId}` : claim.kind === "statistic" ?
      `statistic-${evidenceFingerprint({ fixtureId: claim.value.fixtureId ?? null, metric: claim.value.metric })}` :
      claim.kind === "rest" ? "schedule-rest" : claim.kind === "venue" ? "venue-role" : claim.kind === "form" ?
        `form-${evidenceFingerprint({ startsAt: claim.value.windowStartsAt, endsAt: claim.value.windowEndsAt })}` : claim.key;
    const group = { kind: claim.kind, subjectTeamId: claim.subjectTeamId, key }, id = evidenceFingerprint(group);
    let fact = groups.get(id);
    if (!fact) { fact = { ...group, id, variants: new Map(), flags: new Set() }; groups.set(id, fact); }
    const variant = { value: claim.value, summary: claim.summary, certainty: claim.certainty, asOfAt: claim.asOfAt },
      variantId = evidenceFingerprint(variant), claimId = evidenceFingerprint(claim), previous = fact.variants.get(variantId);
    fact.variants.set(variantId, { ...variant, sourceIds: [...new Set([...(previous?.sourceIds ?? []), source.id])].sort(),
      claimIds: [...new Set([...(previous?.claimIds ?? []), claimId])].sort() });
    if (claim.certainty === "rumor") fact.flags.add("rumor");
    if (claim.certainty === "unknown") fact.flags.add("unknown");
    if (Object.values(claim.value).some((value) => value === null)) fact.flags.add("unknown");
    if (unknown(source)) fact.flags.add("unknown-timestamp");
    if (Object.values(claim.value).every((value) => value === null) || claim.kind === "statistic" && claim.value.value === null) fact.flags.add("missing");
  }
  return [...groups.values()].map((fact) => {
    const values = [...fact.variants.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
    if (new Set(values.map((value) => evidenceFingerprint(value.value))).size > 1) fact.flags.add("conflict");
    return { id: fact.id, kind: fact.kind, subjectTeamId: fact.subjectTeamId, key: fact.key, values, flags: [...fact.flags].sort() };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
function coverageFor(context: EvidenceContext, policy: EvidencePolicy, sources: readonly EvidenceSource[], facts: readonly EvidenceFact[]) {
  const reasons: string[] = [], missingness: EvidenceSnapshot["missingness"][number][] = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const valid = (fact: EvidenceFact) => fact.values.some((value) => usableFactValue(fact.kind, value)) &&
    (!fact.flags.includes("conflict") || !fact.values.some((value) => value.sourceIds.some((id) => {
      const source = sourceById.get(id); return source && policy.freshness[source.kind].conflicts === "fail-coverage";
    })));
  const count = (kind: EvidenceKind, teamId: string | null) => {
    const selected = facts.filter((fact) => fact.kind === kind && fact.subjectTeamId === teamId && valid(fact));
    if (kind === "history") return new Set(selected.flatMap((fact) => fact.values.filter((value) => usableFactValue(kind, value)).map((value) => value.value.fixtureId))).size;
    if (kind === "statistic") return new Set(selected.flatMap((fact) => fact.values.filter((value) => usableFactValue(kind, value)).map((value) =>
      evidenceFingerprint({ metric: value.value.metric, fixtureId: value.value.fixtureId ?? null })))).size;
    if (kind === "form") return selected.length;
    return selected.length;
  };
  for (const team of [context.home.teamId, context.away.teamId]) {
    for (const kind of kinds.filter((value) => value !== "venue" && value !== "news")) {
      const required = kind === "history" ? policy.minimum.historyPerTeam : kind === "form" ? policy.minimum.formPerTeam :
        kind === "statistic" ? policy.minimum.statisticsPerTeam : kind === "rest" && policy.minimum.requireRest ? 1 : 0;
      const available = count(kind, team);
      if (available === 0) missingness.push({ kind, subjectTeamId: team, reason: facts.some((fact) => fact.kind === kind &&
        fact.subjectTeamId === team && fact.flags.includes("conflict")) ? "conflicting" : "unavailable" });
      if (available < required) reasons.push(`${kind}-${team === context.home.teamId ? "home" : "away"}-below-minimum`);
    }
  }
  const venue = facts.some((fact) => fact.kind === "venue" && valid(fact));
  if (!venue) missingness.push({ kind: "venue", subjectTeamId: null, reason: "unavailable" });
  if (policy.minimum.requireVenue && !venue) reasons.push("venue-below-minimum");
  const independentNewsSources = independentNewsCount(sources, facts, valid);
  if (independentNewsSources < policy.minimum.newsSources) reasons.push("news-below-minimum");
  const limitedNews = independentNewsSources === 0 || independentNewsSources < policy.minimum.newsSources;
  if (independentNewsSources === 0) missingness.push({ kind: "news", subjectTeamId: null, reason: "unavailable" });
  return { missingness, coverage: { sufficient: reasons.length === 0, independentNewsSources, limitedNews,
    labels: limitedNews ? ["Limited news coverage" as const] : [], reasons: reasons.sort() } };
}
/** All retrieved strings remain passive data; this function has no network, tool or credential capability. */
export function buildEvidenceSnapshot(request: EvidenceBuildRequest, authority: EvidenceAuthority): EvidenceSnapshot {
  const context = parseEvidenceContext(request.context), policy = parseEvidencePolicy(request.policy);
  if (!Array.isArray(request.sources) || request.sources.length > policy.bounds.maxSources) throw new EvidenceInputError();
  authorize(context, policy, authority);
  const sources: EvidenceSource[] = [], exclusions: EvidenceSnapshot["exclusions"][number][] = [], ids = new Set<string>();
  let totalSourceBytes = 0;
  for (const raw of request.sources) {
    let source: EvidenceSource;
    try { source = parseEvidenceSource(raw, policy); } catch { exclusions.push({ sourceId: null, reason: "invalid-source" }); continue; }
    if (ids.has(source.id)) continue;
    ids.add(source.id);
    const reason = evidenceSourceExclusion(source, context, policy) ??
      (!trusted(() => authority.verifySource(source, context)) ? "unverified-source" :
        !source.reuse.allowSummary || source.reuse.retainUntil < context.analysisAt ||
        !trusted(() => authority.verifyReuse(source, context, policy)) ? "reuse-not-permitted" : null);
    if (reason) exclusions.push({ sourceId: source.id, reason }); else {
      totalSourceBytes += Buffer.byteLength(evidenceSerialize(source), "utf8");
      if (totalSourceBytes > policy.bounds.maxSnapshotBytes) throw new EvidenceInputError("snapshot-too-large");
      sources.push(source);
    }
  }
  sources.sort((a, b) => a.id.localeCompare(b.id));
  exclusions.sort((a, b) => `${a.sourceId ?? ""}:${a.reason}`.localeCompare(`${b.sourceId ?? ""}:${b.reason}`));
  const facts = factsFrom(sources), { missingness, coverage } = coverageFor(context, policy, sources, facts);
  const body = { version: 1 as const, context, policy, sources, facts, exclusions, missingness, coverage }, hash = evidenceSnapshotHash(body);
  const snapshot = parseEvidenceSnapshot({ ...body, id: hash, hash });
  authorize(context, policy, authority);
  // A revocation during extraction invalidates the prepared object instead of silently retaining unapproved data.
  for (const source of sources) if (!trusted(() => authority.verifySource(source, context)) || !trusted(() => authority.verifyReuse(source, context, policy)))
    throw new EvidenceInputError("not-authorized");
  prepared.set(snapshot, authority); return freezeEvidence(snapshot);
}
export function assertPreparedEvidenceSnapshot(snapshot: EvidenceSnapshot, authority: EvidenceAuthority): void {
  if (prepared.get(snapshot) !== authority) throw new EvidenceInputError("not-authorized");
  parseEvidenceSnapshot(snapshot);
  authorize(snapshot.context, snapshot.policy, authority);
  for (const source of snapshot.sources) if (evidenceSourceExclusion(source, snapshot.context, snapshot.policy) !== null ||
    !trusted(() => authority.verifySource(source, snapshot.context)) || !trusted(() => authority.verifyReuse(source, snapshot.context, snapshot.policy)))
    throw new EvidenceInputError("not-authorized");
  authorize(snapshot.context, snapshot.policy, authority);
}
