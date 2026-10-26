import "server-only";

import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { EvidenceAuthority, EvidenceContext, EvidencePolicy, EvidenceSource, EvidenceClaim } from "../evidence/evidence-contract.ts";
import { EvidenceInputError, evidenceFingerprint, evidenceSourceId, freezeEvidence } from "../evidence/evidence-input.ts";
import { buildEvidenceSnapshot } from "../evidence/evidence-snapshot.ts";
import { baselineEvidencePolicy } from "../evidence/baseline-evidence.ts";
import { buildPlayerFootballSources, PLAYER_FOOTBALL_VERSION, verifyPlayerFootballClaims } from "../evidence/player-football.ts";
import { API_FOOTBALL_CONTRACT_VERSION, type ApiFootballResult, type ApiFootballBounds } from "../football/api-football-contract.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import type { NormalizedAvailability, NormalizedPlayerStatistics } from "../football/api-football-normalize.ts";
import type { createFootballCatalogImporter } from "../football/catalog-service.ts";
import type { JobHandlerContext } from "../jobs/job-registry.ts";
import type { RefreshMember } from "../refresh/refresh-contract.ts";
import { refreshReference } from "../refresh/refresh-input.ts";
import type { LiveReferences, RefreshPacing } from "./live-plan.ts";

export const LIVE_AI_EVIDENCE_VERSION = "goal-hint-stored-football-v1";
export const LIVE_AI_HISTORY_REQUESTS = 2;
export const LIVE_PLAYER_EVIDENCE_REQUESTS = 4;
const HISTORY_DAYS = 120, HISTORY_PER_TEAM = 8, RETAIN_MS = 30 * 86_400_000;
const uuid = (hash: string) => `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
const integer = (value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const keys = (value: EvidenceClaim["value"], expected: readonly string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));

/** Fit the complete serialized snapshot, including duplicated normalized facts, without allowing optional squad/news
 * coverage to evict required football cohorts. Narrowing keeps the original observation clocks and source identity;
 * the content-addressed source version describes exactly the retained claims. */
export function fitLiveFootballSources(context: EvidenceContext, policy: EvidencePolicy, authority: EvidenceAuthority,
  history: readonly EvidenceSource[], optional: readonly EvidenceSource[]): readonly EvidenceSource[] {
  const selected = new Map<string, EvidenceSource>();
  // Authorization failures remain fatal. Only an exceeded data bound may omit optional content.
  buildEvidenceSnapshot({ context, policy, sources: [] }, authority);
  function add(source: EvidenceSource, claims: readonly EvidenceClaim[] = source.claims): boolean {
    const existing = selected.get(source.id);
    const combined = [...new Map([...(existing?.claims ?? []), ...claims].map((claim) => [evidenceFingerprint(claim), claim])).values()];
    const { id: _id, ...body } = source; void _id;
    const narrowed = { ...body, title: `${source.title} (bounded subset)`, claims: combined };
    const next = combined.length === source.claims.length ? source : freezeEvidence({ ...narrowed, id: evidenceSourceId(narrowed) });
    const proposal = new Map(selected); proposal.set(source.id, next);
    try {
      const snapshot = buildEvidenceSnapshot({ context, policy, sources: [...proposal.values()] }, authority);
      if (snapshot.sources.length !== proposal.size) return false;
      selected.set(source.id, next); return true;
    } catch (error) {
      if (error instanceof EvidenceInputError && (error.reason === "snapshot-too-large" || error.reason === "invalid-request")) return false;
      throw error;
    }
  }
  const histories = history.filter((source) => source.claims.some((claim) => claim.kind === "history"));
  const recent = (source: EvidenceSource) => Math.max(...source.claims.filter((claim) => claim.kind === "history").map((claim) => Number(claim.value.kickoffAt)));
  const stable = (a: EvidenceSource, b: EvidenceSource) => recent(b) - recent(a) || a.id.localeCompare(b.id);
  const cohorts = [context.home, context.away].map((team) => histories.filter((source) => source.claims.some((claim) => claim.kind === "history" && claim.subjectTeamId === team.teamId)).sort(stable));
  for (const source of history.filter((source) => source.claims.some((claim) => ["venue", "form", "rest"].includes(claim.kind)))) add(source);
  // Round-robin protects both team cohorts when the policy has a tighter archive bound.
  for (let index = 0; index < policy.minimum.historyPerTeam; index++) for (const cohort of cohorts) if (cohort[index]) add(cohort[index]!);
  for (const source of histories.sort(stable)) add(source);

  const claims = optional.flatMap((source) => source.claims.map((claim) => ({ source, claim })));
  const contributions = claims.filter(({ claim }) => claim.kind === "statistic" && claim.value.metric === "player-season-contribution");
  const absences = claims.filter(({ claim }) => claim.kind === "injury" && claim.certainty === "confirmed" && claim.value.status === "confirmed-absent")
    .sort((a, b) => String(a.claim.subjectTeamId).localeCompare(String(b.claim.subjectTeamId)) || Number(a.claim.value.playerExternalId) - Number(b.claim.value.playerExternalId));
  const used = new Set<string>();
  for (const entry of absences) {
    const contribution = contributions.find(({ claim }) => claim.subjectTeamId === entry.claim.subjectTeamId &&
      claim.value.playerExternalId === entry.claim.value.playerExternalId && claim.value.competitionExternalId === entry.claim.value.competitionExternalId &&
      claim.value.season === entry.claim.value.season && Number(claim.value.minutes) >= baselineEvidencePolicy.importantPlayerMinutes &&
      Number(claim.value.goals) + Number(claim.value.assists) >= baselineEvidencePolicy.importantPlayerContributions);
    if (contribution) {
      // Keep the impact pair together: an optional absence alone cannot displace its numerical contribution.
      const before = new Map(selected);
      if (add(entry.source, [entry.claim]) && add(contribution.source, [contribution.claim])) {
        used.add(evidenceFingerprint(entry.claim)); used.add(evidenceFingerprint(contribution.claim));
      } else { selected.clear(); before.forEach((value, key) => selected.set(key, value)); }
    }
  }
  for (const source of optional.filter((source) => source.kind === "news")) add(source);
  const others = claims.filter((entry) => entry.source.kind !== "news" && !used.has(evidenceFingerprint(entry.claim)))
    .sort((a, b) => {
      const priority = (claim: EvidenceClaim) => claim.kind === "injury" ? 0 : claim.kind === "lineup" ? 1 : 2;
      return priority(a.claim) - priority(b.claim) || a.source.id.localeCompare(b.source.id) || a.claim.key.localeCompare(b.claim.key);
    });
  const batches = new Map<string, { source: EvidenceSource; claims: EvidenceClaim[] }>();
  for (const entry of others) {
    const batch = batches.get(entry.source.id) ?? { source: entry.source, claims: [] };
    batch.claims.push(entry.claim); batches.set(entry.source.id, batch);
  }
  for (const batch of batches.values()) {
    if (add(batch.source, batch.claims)) continue;
    // Capacity is monotonic for additional claims from one source. Find its largest stable prefix with logarithmic
    // snapshot builds, rather than reparsing the whole archive once per squad member.
    let low = 0, high = batch.claims.length - 1;
    while (low < high) {
      const count = Math.ceil((low + high) / 2);
      if (add(batch.source, batch.claims.slice(0, count))) low = count; else high = count - 1;
    }
  }
  return freezeEvidence([...selected.values()]);
}

/** Accept only the canonical numeric facts this reader derives, with exact fixture and team bindings. */
export function verifyLiveFootballSource(source: EvidenceSource, context: EvidenceContext, refs: LiveReferences): boolean {
  const binding = { fixtureId: context.fixtureId, fixtureVersion: context.fixtureVersion, externalFixtureId: context.externalFixtureId,
    homeTeamId: context.home.teamId, awayTeamId: context.away.teamId, homeExternalId: context.home.externalId, awayExternalId: context.away.externalId };
  if (source.kind !== "football" || ![LIVE_AI_EVIDENCE_VERSION, PLAYER_FOOTBALL_VERSION].includes(source.version) || source.publisher !== "API-Football" ||
      source.evidenceRef !== refs.evidence || source.sourceUrl !== "https://www.api-football.com/documentation-v3" ||
      evidenceFingerprint(source.binding) !== evidenceFingerprint(binding) || source.retrievedAt > context.cutoffAt ||
      source.providerUpdatedAt !== null && source.providerUpdatedAt > context.cutoffAt || source.claims.length === 0) return false;
  if (source.version === PLAYER_FOOTBALL_VERSION) return verifyPlayerFootballClaims(source, context) && source.claims.every((claim) => claim.asOfAt === null || claim.asOfAt <= context.cutoffAt);
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
  database?: DatabaseRuntime;
  adapter?: Pick<ReturnType<typeof createApiFootballAdapter>["evidence"], "availability" | "playerStatistics">;
}) {
  return async (member: RefreshMember, context: JobHandlerContext) => {
    const until = getReportingDate(utcInstantFromEpochMilliseconds(member.now)), from = addReportingDays(until, -HISTORY_DAYS);
    const timeoutMs = options.pacing === "slow" ? 75_000 : 25_000;
    for (const team of [member.context.home, member.context.away]) {
      await context.checkpoint();
      const deadlineAt = utcInstantFromEpochMilliseconds(context.deadlineAt - member.entry.envelope.fallbackReserveMs);
      if (context.remainingMs() <= member.entry.envelope.fallbackReserveMs + timeoutMs) return { sources: [] };
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
    if (!options.database || !options.adapter) return { sources: [] };
    const fixture = await options.database.query((client) => client.footballFixture.findUnique({ where: { id: member.context.fixtureId },
      select: { dataVersion: true, homeTeamId: true, awayTeamId: true, season: { select: { year: true, coverage: true,
        competition: { select: { providers: { where: { provider: "api-football" }, select: { externalId: true } } } } } } } }));
    if (!fixture || fixture.dataVersion !== member.context.fixtureVersion || fixture.homeTeamId !== member.context.home.teamId ||
      fixture.awayTeamId !== member.context.away.teamId || fixture.season.competition.providers.length !== 1) return { sources: [] };
    const coverage = fixture.season.coverage as Record<string, unknown> | null, competitionExternalId = Number(fixture.season.competition.providers[0]!.externalId);
    if (!coverage || !integer(competitionExternalId, 1)) return { sources: [] };
    const playerRows: NormalizedPlayerStatistics[] = [], availabilityRows: NormalizedAvailability[] = [];
    let uncertain = false;
    async function collect<Row extends NormalizedAvailability | NormalizedPlayerStatistics>(label: string, endpoint: "injuries" | "lineups" | "playerStatistics",
      parameters: Readonly<Record<string, string>>, operation: (bounds: ApiFootballBounds) => Promise<ApiFootballResult<Row>>) {
      if (uncertain || context.remainingMs() <= member.entry.envelope.fallbackReserveMs + timeoutMs) return;
      await context.checkpoint();
      const reference = refreshReference(member.jobId, `player-${label}`), deadlineAt = utcInstantFromEpochMilliseconds(context.deadlineAt - member.entry.envelope.fallbackReserveMs);
      try {
        const result = await operation({ priority: "daily-inputs", deadlineAt, timeoutMs, maxRequests: 1, maxPages: 1, maxRows: 100,
          maxResponseBytes: 2_000_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 });
        uncertain = result.provenance.some((page) => page.quota.kind === "uncertain") || result.error?.reason === "transport-error" || result.error?.reason === "deadline-exceeded";
        await context.recordUsage({ provider: "football", requestReference: reference, costReference: null,
          phase: uncertain ? "uncertain" : "completed", requests: result.requestsDispatched, durationMs: null });
        // Exact returned query/endpoint, single page, original clocks; a partial player page is useful only for the named observed players.
        if (!result.provenance.length || result.provenance.some((page) => page.provider !== "api-football" || page.endpoint !== endpoint ||
          page.contractVersion !== API_FOOTBALL_CONTRACT_VERSION || page.quota.kind !== "success" || page.retrievedAt > Date.now() ||
          evidenceFingerprint(page.requestParameters) !== evidenceFingerprint(parameters))) return;
        for (const row of result.data) {
          if (!result.provenance.some((page) => page.retrievedAt === row.source.retrievedAt && page.providerUpdatedAt === row.source.providerUpdatedAt)) continue;
          if ("player" in row) playerRows.push(row); else availabilityRows.push(row);
        }
      } catch {
        uncertain = true;
        await context.recordUsage({ provider: "football", requestReference: reference, costReference: null, phase: "uncertain", requests: 1, durationMs: null });
      }
    }
    // Never infer coverage from the plan name. These booleans are the selected account's canonical league-season coverage.
    for (const kind of ["injuries", "lineups"] as const) {
      const supported = kind === "lineups" ? coverage["fixtures.lineups"] === true : coverage.injuries === true;
      if (supported) await collect(kind, kind, { fixture: String(member.context.externalFixtureId) },
        (bounds) => options.adapter!.availability(member.context.externalFixtureId, kind, bounds));
    }
    if (coverage.players === true) for (const team of [member.context.home, member.context.away]) await collect(String(team.externalId), "playerStatistics",
      { league: String(competitionExternalId), season: String(fixture.season.year), team: String(team.externalId), page: "1" },
      (bounds) => options.adapter!.playerStatistics({ competitionId: competitionExternalId, season: fixture.season.year, teamId: team.externalId }, bounds));
    return { sources: buildPlayerFootballSources(member.context, { competitionExternalId, season: fixture.season.year }, playerRows, availabilityRows, options.refs) };
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
