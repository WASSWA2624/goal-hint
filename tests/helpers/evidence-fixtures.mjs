import { createHash } from "node:crypto";
import { evidenceSourceId } from "../../src/server/evidence/evidence-input.ts";

// Every provider response, permission and clock in this helper is synthetic.
// It never reads live credentials, queries a research provider or copies articles.
export const EVIDENCE_NOW = Date.parse("2026-10-09T08:00:00.000Z");
export const evidenceHash = (value) => createHash("sha256").update(value).digest("hex");

export function evidenceContext(fixture, overrides = {}) {
  return {
    fixtureId: fixture?.id ?? "10000000-0000-4000-8000-000000000001",
    fixtureVersion: fixture?.dataVersion ?? 1n,
    provider: "api-football", externalFixtureId: fixture?.externalId ?? 101,
    home: { teamId: fixture?.homeTeamId ?? "10000000-0000-4000-8000-000000000002", externalId: 10 },
    away: { teamId: fixture?.awayTeamId ?? "10000000-0000-4000-8000-000000000003", externalId: 20 },
    kickoffAt: fixture?.kickoff ?? EVIDENCE_NOW + 12 * 60 * 60 * 1000,
    analysisAt: EVIDENCE_NOW, cutoffAt: EVIDENCE_NOW, cycleId: null, runId: null, ...overrides,
  };
}

export function evidencePolicy(overrides = {}) {
  const base = {
    version: "synthetic-evidence-policy-v1", evidenceRef: "synthetic-evidence-policy-proof",
    freshness: {
      football: { maxAgeMs: 86_400_000, basis: "retrieved", unknownTimestamp: "allow-flagged", conflicts: "preserve" },
      news: { maxAgeMs: 86_400_000, basis: "published", unknownTimestamp: "allow-flagged", conflicts: "preserve" },
    },
    minimum: { historyPerTeam: 0, formPerTeam: 0, statisticsPerTeam: 0, requireVenue: true, requireRest: false, newsSources: 0 },
    bounds: { maxSources: 100, maxClaimsPerSource: 100, maxSummaryCharacters: 500, maxTitleCharacters: 500,
      maxPublisherCharacters: 100, maxValueCharacters: 500, maxSourceBytes: 20_000, maxSnapshotBytes: 200_000 },
  };
  return { ...base, ...overrides,
    freshness: { ...base.freshness, ...overrides.freshness },
    minimum: { ...base.minimum, ...overrides.minimum },
    bounds: { ...base.bounds, ...overrides.bounds },
  };
}

export function evidenceAuthority(overrides = {}) {
  return { authorize() {}, verifyContext: () => true, verifyPolicy: () => true,
    verifySource: () => true, verifyReuse: () => true, ...overrides };
}

export function evidenceSource(context = evidenceContext(), overrides = {}) {
  const base = {
    kind: "football", sourceKey: evidenceHash(`synthetic-football-source:${context.fixtureId}`), syndicationKey: null,
    version: "synthetic-football-v1", publisher: "Synthetic football provider", title: "Synthetic venue observation",
    sourceUrl: null, publishedAt: null, retrievedAt: context.cutoffAt - 1000, providerUpdatedAt: context.cutoffAt - 2000,
    binding: { fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion, externalFixtureId: context.externalFixtureId,
      homeTeamId: context.home.teamId, awayTeamId: context.away.teamId,
      homeExternalId: context.home.externalId, awayExternalId: context.away.externalId },
    evidenceRef: "synthetic-football-observation-proof",
    reuse: { evidenceRef: "synthetic-evidence-retention-proof", retainUntil: context.analysisAt + 86_400_000, allowSummary: true },
    claims: [{ kind: "venue", subjectTeamId: context.home.teamId, key: "venue-role",
      value: { role: "home", neutral: false }, summary: "Synthetic home-team venue observation.", certainty: "confirmed", asOfAt: context.cutoffAt - 2000 }],
  };
  const body = { ...base, ...overrides, binding: { ...base.binding, ...overrides.binding }, reuse: { ...base.reuse, ...overrides.reuse } };
  delete body.id;
  return { ...body, id: evidenceSourceId(body) };
}
