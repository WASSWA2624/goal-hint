import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";

export type EvidenceKind = "history" | "form" | "rest" | "venue" | "statistic" | "injury" | "lineup" | "xg" | "news";
export type EvidenceContext = Readonly<{
  fixtureId: string; fixtureVersion: bigint; provider: "api-football"; externalFixtureId: number;
  home: Readonly<{ teamId: string; externalId: number }>;
  away: Readonly<{ teamId: string; externalId: number }>;
  kickoffAt: UtcInstant; analysisAt: UtcInstant; cutoffAt: UtcInstant;
  cycleId: string | null; runId: string | null;
}>;
export type EvidenceFreshness = Readonly<{
  maxAgeMs: number;
  basis: "retrieved" | "published" | "provider-updated";
  unknownTimestamp: "exclude" | "allow-flagged";
  conflicts: "preserve" | "fail-coverage";
}>;
export type EvidencePolicy = Readonly<{
  version: string; evidenceRef: string;
  freshness: Readonly<{ football: EvidenceFreshness; news: EvidenceFreshness }>;
  minimum: Readonly<{
    historyPerTeam: number; formPerTeam: number; statisticsPerTeam: number;
    requireVenue: boolean; requireRest: boolean; newsSources: number;
  }>;
  bounds: Readonly<{
    maxSources: number; maxClaimsPerSource: number; maxSummaryCharacters: number;
    maxTitleCharacters: number; maxPublisherCharacters: number; maxValueCharacters: number;
    maxSourceBytes: number; maxSnapshotBytes: number;
  }>;
}>;
/** A single flat map keeps extraction bounded and excludes executable/nested payloads. */
export type EvidenceValue = Readonly<Record<string, string | number | boolean | null>>;
export type EvidenceClaim = Readonly<{
  kind: EvidenceKind; subjectTeamId: string | null; key: string; value: EvidenceValue;
  summary: string; certainty: "confirmed" | "rumor" | "unknown"; asOfAt: UtcInstant | null;
}>;
export type EvidenceSource = Readonly<{
  id: string; kind: "football" | "news"; sourceKey: string; syndicationKey: string | null;
  version: string; publisher: string; title: string; sourceUrl: string | null;
  publishedAt: UtcInstant | null; retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null;
  binding: Readonly<{
    fixtureId: string; fixtureVersion: bigint; externalFixtureId: number;
    homeTeamId: string; awayTeamId: string; homeExternalId: number; awayExternalId: number;
  }>;
  evidenceRef: string;
  reuse: Readonly<{ evidenceRef: string; retainUntil: UtcInstant; allowSummary: boolean }>;
  claims: readonly EvidenceClaim[];
}>;
export type EvidenceAuthority = Readonly<{
  authorize(context: EvidenceContext): void;
  verifyContext(context: EvidenceContext): boolean;
  verifyPolicy(policy: EvidencePolicy): boolean;
  verifySource(source: EvidenceSource, context: EvidenceContext): boolean;
  verifyReuse(source: EvidenceSource, context: EvidenceContext, policy: EvidencePolicy): boolean;
}>;
export type EvidenceFlag = "rumor" | "unknown" | "unknown-timestamp" | "conflict" | "missing";
export type EvidenceFact = Readonly<{
  id: string; kind: EvidenceKind; subjectTeamId: string | null; key: string;
  values: readonly Readonly<{
    value: EvidenceValue; summary: string; certainty: EvidenceClaim["certainty"];
    asOfAt: UtcInstant | null; sourceIds: readonly string[]; claimIds: readonly string[];
  }>[];
  flags: readonly EvidenceFlag[];
}>;
export type EvidenceExclusionReason = "invalid-source" | "wrong-fixture" | "wrong-team" | "unverified-source" |
  "reuse-not-permitted" | "future" | "stale" | "unknown-timestamp" | "duplicate";
export type EvidenceSnapshot = Readonly<{
  version: 1; id: string; hash: string; context: EvidenceContext; policy: EvidencePolicy;
  sources: readonly EvidenceSource[]; facts: readonly EvidenceFact[];
  exclusions: readonly Readonly<{ sourceId: string | null; reason: EvidenceExclusionReason }>[];
  missingness: readonly Readonly<{ kind: EvidenceKind; subjectTeamId: string | null; reason: "unavailable" | "conflicting" }>[];
  coverage: Readonly<{ sufficient: boolean; independentNewsSources: number; limitedNews: boolean;
    labels: readonly "Limited news coverage"[]; reasons: readonly string[] }>;
}>;
export type EvidenceBuildRequest = Readonly<{ context: EvidenceContext; policy: EvidencePolicy; sources: readonly unknown[] }>;
/** Internal cancellation/authorization boundary, never part of a stored request or source payload. */
export type EvidenceWorkflow = Readonly<{ signal: AbortSignal; deadlineAt: UtcInstant; check(): void }>;
