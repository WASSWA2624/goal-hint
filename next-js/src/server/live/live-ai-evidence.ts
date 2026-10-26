import "server-only";

import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { EvidenceContext, EvidencePolicy, EvidenceSource, EvidenceClaim } from "../evidence/evidence-contract.ts";
import { evidenceFingerprint, evidenceSourceId, freezeEvidence } from "../evidence/evidence-input.ts";
import type { createFootballCatalogImporter } from "../football/catalog-service.ts";
import type { JobHandlerContext } from "../jobs/job-registry.ts";
import type { RefreshMember } from "../refresh/refresh-contract.ts";
import { refreshReference } from "../refresh/refresh-input.ts";
import type { LiveReferences, RefreshPacing } from "./live-plan.ts";

export const LIVE_AI_EVIDENCE_VERSION = "goal-hint-stored-football-v1";
export const LIVE_AI_HISTORY_REQUESTS = 2;
const HISTORY_DAYS = 120, HISTORY_PER_TEAM = 5, RETAIN_MS = 30 * 86_400_000;
const uuid = (hash: string) => `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
const integer = (value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const keys = (value: EvidenceClaim["value"], expected: readonly string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));

/** Accept only the canonical numeric facts this reader derives, with exact fixture and team bindings. */
export function verifyLiveFootballSource(source: EvidenceSource, context: EvidenceContext, refs: LiveReferences): boolean {
  const binding = { fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion, externalFixtureId: context.externalFixtureId,
    homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, homeExternalId: context.home.externalId, awayExternalId: context.away.externalId };
  if (source.kind !== "football" || source.version !== LIVE_AI_EVIDENCE_VERSION || source.publisher !== "API-Football" ||
      source.evidenceRef !== refs.evidence || source.sourceUrl !== "https://www.api-football.com/documentation-v3" ||
      evidenceFingerprint(source.binding) !== evidenceFingerprint(binding) || source.retrievedAt > context.cutoffAt ||
      source.providerUpdatedAt !== null && source.providerUpdatedAt > context.cutoffAt || source.claims.length === 0) return false;
  return source.claims.every((claim) => {
    const team = [context.home, context.away].find((item) => item.teamId === claim.subjectTeamId);
    if (!team || claim.certainty !== "confirmed" || claim.asOfAt !== null && claim.asOfAt > context.cutoffAt) return false;
    const role = team.teamId === context.home.teamId ? "Home" : "Away", value = claim.value;
    switch (claim.kind) {
      case "history": {
        if (!keys(value, ["fixtureId", "homeExternalId", "awayExternalId", "kickoffAt", "homeGoals", "awayGoals", "regulationVerified", "period"]) ||
            !integer(value.fixtureId, 1) || !integer(value.homeExternalId, 1) || !integer(value.awayExternalId, 1) ||
            value.homeExternalId === value.awayExternalId || ![value.homeExternalId, value.awayExternalId].includes(team.externalId) ||
            !integer(value.kickoffAt) || value.kickoffAt >= context.cutoffAt || !integer(value.homeGoals, 0, 99) || !integer(value.awayGoals, 0, 99) ||
            value.regulationVerified !== true || value.period !== "regulation-including-stoppage-time" || claim.key !== `fixture-${value.fixtureId}`) return false;
        const home = value.homeExternalId === team.externalId, scored = home ? value.homeGoals : value.awayGoals, conceded = home ? value.awayGoals : value.homeGoals;
        return claim.summary === `${role} team recorded ${scored} goals for and ${conceded} against in a completed regulation match.`;
      }
      case "form":
        return claim.key === "regulation-form" && keys(value, ["matches", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "points", "windowStartsAt", "windowEndsAt", "period"]) &&
          integer(value.matches, 1, HISTORY_PER_TEAM) && integer(value.wins, 0, HISTORY_PER_TEAM) && integer(value.draws, 0, HISTORY_PER_TEAM) &&
          integer(value.losses, 0, HISTORY_PER_TEAM) && value.wins + value.draws + value.losses === value.matches &&
          integer(value.goalsFor, 0, 99 * HISTORY_PER_TEAM) && integer(value.goalsAgainst, 0, 99 * HISTORY_PER_TEAM) &&
          value.points === 3 * value.wins + value.draws && integer(value.windowStartsAt) && integer(value.windowEndsAt) &&
          value.windowStartsAt <= value.windowEndsAt && value.windowEndsAt < context.cutoffAt && value.period === "regulation-including-stoppage-time" &&
          claim.summary === `${role} team has ${value.wins} wins, ${value.draws} draws and ${value.losses} losses across ${value.matches} retained regulation matches.`;
      case "rest":
        return claim.key === "kickoff-gap" && keys(value, ["lastKickoffAt", "restDays"]) && integer(value.lastKickoffAt) &&
          value.lastKickoffAt < context.cutoffAt && value.restDays === (context.kickoffAt - value.lastKickoffAt) / 86_400_000 &&
          claim.summary === `${role} team last played a completed match before the scheduled kickoff; actual recovery and squad fitness remain unknown.`;
      case "venue":
        return claim.key === "venue-role" && keys(value, ["role", "neutral", "venueName"]) && value.role === role.toLowerCase() &&
          value.neutral === null && value.venueName === null && claim.summary === (role === "Home" ?
            "The fixture lists the home team; neutral venue status is unknown." : "The fixture lists the away team; neutral venue status is unknown.");
      default: return false;
    }
  });
}

/** History imports finish before analysis; quota and catalog boundaries retain all original clocks. */
export function createLiveFootballPreparation(options: {
  importer: Pick<ReturnType<typeof createFootballCatalogImporter>, "import">;
  refs: LiveReferences; pacing: RefreshPacing;
}) {
  return async (member: RefreshMember, context: JobHandlerContext) => {
    const until = getReportingDate(utcInstantFromEpochMilliseconds(member.now)), from = addReportingDays(until, -HISTORY_DAYS);
    const timeoutMs = options.pacing === "slow" ? 75_000 : 25_000;
    for (const team of [member.context.home, member.context.away]) {
      await context.checkpoint();
      const deadlineAt = utcInstantFromEpochMilliseconds(context.deadlineAt - member.entry.envelope.fallbackReserveMs);
      if (context.remainingMs() <= member.entry.envelope.fallbackReserveMs + timeoutMs) return;
      const reference = refreshReference(member.jobId, `history-${team.externalId}`);
      try {
        const result = await options.importer.import({ id: uuid(reference), retentionEvidenceRef: options.refs.retention,
          selection: { kind: "fixtures", query: { teamId: team.externalId, from, to: until } },
          bounds: { priority: "daily-inputs", deadlineAt, timeoutMs, maxRequests: 1, maxPages: 1, maxRows: 500,
            maxResponseBytes: 8_000_000, retry: { maxAttempts: options.pacing === "slow" ? 40 : 8,
              baseDelayMs: 250, maxDelayMs: 5000 }, cacheMaxAgeMs: 0 } });
        await context.recordUsage({ provider: "football", requestReference: reference, costReference: null,
          phase: "completed", requests: result.requestsDispatched, durationMs: null });
      } catch {
        // An ambiguous import is never retried by this preparation stage.
        await context.recordUsage({ provider: "football", requestReference: reference, costReference: null,
          phase: "uncertain", requests: 1, durationMs: null });
      }
    }
  };
}

/** Primary input is canonical history/form/venue, never API-Football forecast votes or odds. */
export async function readLiveFootballSources(database: DatabaseRuntime, context: EvidenceContext,
  policy: EvidencePolicy, refs: LiveReferences): Promise<readonly EvidenceSource[]> {
  const sources: EvidenceSource[] = [], binding = { fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion,
    externalFixtureId: context.externalFixtureId, homeTeamId: context.home.teamId, awayTeamId: context.away.teamId,
    homeExternalId: context.home.externalId, awayExternalId: context.away.externalId };
  function source(key: unknown, title: string, retrievedAt: number, providerUpdatedAt: number | null, claims: EvidenceClaim[]) {
    const body = { kind: "football" as const, sourceKey: evidenceFingerprint(key), syndicationKey: null,
      version: LIVE_AI_EVIDENCE_VERSION, publisher: "API-Football", title, sourceUrl: "https://www.api-football.com/documentation-v3",
      publishedAt: null, retrievedAt: utcInstantFromEpochMilliseconds(retrievedAt),
      providerUpdatedAt: providerUpdatedAt === null ? null : utcInstantFromEpochMilliseconds(providerUpdatedAt),
      binding, evidenceRef: policy.evidenceRef,
      reuse: { evidenceRef: refs.retention, allowSummary: true, retainUntil: utcInstantFromEpochMilliseconds(context.analysisAt + RETAIN_MS) }, claims };
    sources.push(freezeEvidence({ ...body, id: evidenceSourceId(body) }));
  }
  for (const team of [context.home, context.away]) {
    const rows = await database.query((client) => client.footballFixture.findMany({
      where: { provider: "api-football", OR: [{ homeTeamId: team.teamId }, { awayTeamId: team.teamId }],
        id: { not: context.fixtureId }, status: { in: ["finished-regulation", "finished-extra-time", "finished-penalties"] },
        kickoff: { lt: new Date(context.cutoffAt), gte: new Date(context.cutoffAt - HISTORY_DAYS * 86_400_000) },
        retrievedAt: { lte: new Date(context.cutoffAt) }, regulationVerifiedAt: { not: null, lte: new Date(context.cutoffAt) },
        regulationEvidenceRef: { not: null }, regulationHome: { not: null }, regulationAway: { not: null } },
      select: { id: true, externalId: true, dataVersion: true, homeTeamId: true, awayTeamId: true, kickoff: true,
        regulationHome: true, regulationAway: true, regulationEvidenceRef: true, regulationVerifiedAt: true,
        retrievedAt: true, providerUpdatedAt: true,
        homeTeam: { select: { providers: { where: { provider: "api-football" }, select: { externalId: true } } } },
        awayTeam: { select: { providers: { where: { provider: "api-football" }, select: { externalId: true } } } } },
      orderBy: [{ kickoff: "desc" }, { id: "asc" }], take: HISTORY_PER_TEAM,
    }));
    const usable = rows.filter((row) => row.kickoff !== null && row.regulationHome !== null && row.regulationAway !== null &&
      row.homeTeam.providers.length === 1 && row.awayTeam.providers.length === 1 &&
      integer(Number(row.externalId), 1) && integer(Number(row.homeTeam.providers[0]!.externalId), 1) &&
      integer(Number(row.awayTeam.providers[0]!.externalId), 1) && integer(row.regulationHome, 0, 99) && integer(row.regulationAway, 0, 99) &&
      (row.providerUpdatedAt === null || row.providerUpdatedAt.getTime() <= context.cutoffAt));
    let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
    const role = team.teamId === context.home.teamId ? "Home" : "Away";
    for (const row of usable) {
      const home = row.homeTeamId === team.teamId, scored = home ? row.regulationHome! : row.regulationAway!, conceded = home ? row.regulationAway! : row.regulationHome!;
      goalsFor += scored; goalsAgainst += conceded; if (scored > conceded) wins++; else if (scored === conceded) draws++; else losses++;
      source({ fixtureId: row.id, version: row.dataVersion, proof: row.regulationEvidenceRef }, "Verified regulation result",
        row.retrievedAt.getTime(), row.providerUpdatedAt?.getTime() ?? null, [{ kind: "history", subjectTeamId: team.teamId,
          key: `fixture-${row.externalId}`, value: { fixtureId: Number(row.externalId),
            homeExternalId: Number(row.homeTeam.providers[0]!.externalId), awayExternalId: Number(row.awayTeam.providers[0]!.externalId),
            kickoffAt: row.kickoff!.getTime(), homeGoals: row.regulationHome!, awayGoals: row.regulationAway!,
            regulationVerified: true, period: "regulation-including-stoppage-time" },
          summary: `${role} team recorded ${scored} goals for and ${conceded} against in a completed regulation match.`,
          certainty: "confirmed", asOfAt: row.providerUpdatedAt === null ? null : utcInstantFromEpochMilliseconds(row.providerUpdatedAt.getTime()) }]);
    }
    if (usable.length) {
      const retrievedAt = Math.max(...usable.map((row) => row.retrievedAt.getTime())), lastKickoff = usable[0]!.kickoff!.getTime();
      source({ teamId: team.teamId, history: usable.map((row) => [row.id, row.dataVersion]) }, "Derived recent form and rest",
        retrievedAt, null, [{ kind: "form", subjectTeamId: team.teamId, key: "regulation-form",
          value: { matches: usable.length, wins, draws, losses, goalsFor, goalsAgainst, points: 3 * wins + draws,
            windowStartsAt: Math.min(...usable.map((row) => row.kickoff!.getTime())), windowEndsAt: lastKickoff,
            period: "regulation-including-stoppage-time" },
          summary: `${role} team has ${wins} wins, ${draws} draws and ${losses} losses across ${usable.length} retained regulation matches.`,
          certainty: "confirmed", asOfAt: null },
        { kind: "rest", subjectTeamId: team.teamId, key: "kickoff-gap", value: { lastKickoffAt: lastKickoff,
          restDays: (context.kickoffAt - lastKickoff) / 86_400_000 },
          summary: `${role} team last played a completed match before the scheduled kickoff; actual recovery and squad fitness remain unknown.`,
          certainty: "confirmed", asOfAt: null }]);
    }
  }
  const fixture = await database.query((client) => client.footballFixture.findUnique({ where: { id: context.fixtureId },
    select: { dataVersion: true, homeTeamId: true, awayTeamId: true, kickoff: true, retrievedAt: true, providerUpdatedAt: true } }));
  if (fixture && fixture.dataVersion === context.fixtureVersion && fixture.homeTeamId === context.home.teamId &&
    fixture.awayTeamId === context.away.teamId && fixture.kickoff?.getTime() === context.kickoffAt && fixture.retrievedAt.getTime() <= context.cutoffAt &&
    (fixture.providerUpdatedAt === null || fixture.providerUpdatedAt.getTime() <= context.cutoffAt))
    source({ fixtureId: context.fixtureId, version: context.fixtureVersion }, "Canonical venue assignment", fixture.retrievedAt.getTime(),
      fixture.providerUpdatedAt?.getTime() ?? null, [context.home, context.away].map((team, index) => ({ kind: "venue",
        subjectTeamId: team.teamId, key: "venue-role", value: { role: index === 0 ? "home" : "away", neutral: null, venueName: null },
        summary: index === 0 ? "The fixture lists the home team; neutral venue status is unknown." : "The fixture lists the away team; neutral venue status is unknown.",
        certainty: "confirmed", asOfAt: null })));
  return freezeEvidence(sources);
}
