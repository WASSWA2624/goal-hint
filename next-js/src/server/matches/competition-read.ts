import "server-only";

import { z } from "zod";
import { competitionTablesSchema, competitionViewSchema, bracketFromFixtures, knockoutStage,
  type CompetitionTeam, type CompetitionView, type KnockoutSourceFixture } from "../../domain/competition-view.ts";
import { canonicalMatchSlug } from "../../domain/match-slug.ts";
import { isSafeRemoteImageUrl } from "../../domain/remote-image.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical, type StoredFixtureResult } from "../results/result-read.ts";
import type { HistoryRow } from "../predictions/history-read.ts";

const clean = (value: string | null | undefined) => value?.normalize("NFC").replace(/\p{Cc}/gu, " ").trim().slice(0,512) || null;
const count = z.number().int().min(0).max(1_000_000).nullable().optional();
const signed = z.number().int().min(-1_000_000).max(1_000_000).nullable().optional();
const rawRow = z.object({ rank: z.number().int().min(1).max(1_000_000).nullable().optional(), team: z.object({ id: z.number().int().positive().safe(), name: z.string().max(512).nullable().optional(),
  code: z.string().max(64).nullable().optional() }), points: signed, goalsDiff: signed, group: z.string().max(512).nullable().optional(),
  form: z.string().max(100).nullable().optional(), description: z.string().max(512).nullable().optional(),
  all: z.object({ played: count, win: count, draw: count, lose: count,
    goals: z.object({ for: count, against: count }).nullable().optional() }).nullable().optional() });
const rawLeague = z.object({ league: z.object({ id: z.number().int().positive().safe(), season: z.number().int().optional(),
  standings: z.array(z.array(z.unknown()).max(128)).max(32) }) });

export function storedStandingLeagues(body: unknown) {
  const candidate = body && typeof body === "object" && "response" in body ? (body as { response: unknown }).response : body;
  return Array.isArray(candidate) ? candidate.flatMap(value => { const parsed = rawLeague.safeParse(value); return parsed.success ? [parsed.data] : []; }) : [];
}

/** API-Football's form field is oldest-to-newest; preserve that order and source ranks. */
export function normalizeStoredStandings(body: unknown, context: { season: number; competitionName: string | null;
  externalId: number | null; retrievedAt: number | null; provider: string }, resolveTeam: (externalId: number) => CompetitionTeam | null) {
  const leagues = storedStandingLeagues(body).filter(entry => (context.externalId === null || entry.league.id === context.externalId)
    && (entry.league.season === undefined || entry.league.season === context.season));
  if (leagues.length !== 1) return null;
  const paging = body && typeof body === "object" && "paging" in body ? (body as {paging?:{current?:number;total?:number}}).paging : null;
  let complete = !(paging?.current !== undefined && paging?.total !== undefined && paging.current < paging.total);
  const groups = leagues[0]!.league.standings.flatMap((values, index) => {
    const seen = new Set<string>();
    const rows = values.flatMap(value => {
      const parsed = rawRow.safeParse(value);
      if (!parsed.success) { complete = false; return []; }
      const row = parsed.data, mapped = resolveTeam(row.team.id);
      const team: CompetitionTeam = mapped ?? { id: `${context.provider}-${row.team.id}`, name: clean(row.team.name), shortName: clean(row.team.code), logoUrl: null };
      if (seen.has(team.id)) { complete = false; return []; }
      seen.add(team.id);
      const rawForm = row.form?.trim().toUpperCase() ?? "";
      const form = (/^[WDL]*$/u.test(rawForm) ? [...rawForm].slice(-5) : []).map(result => ({ result: result as "W" | "D" | "L" }));
      return [{ team, rank: row.rank ?? null, played: row.all?.played ?? null, wins: row.all?.win ?? null, draws: row.all?.draw ?? null,
        losses: row.all?.lose ?? null, goalsFor: row.all?.goals?.for ?? null, goalsAgainst: row.all?.goals?.against ?? null,
        goalDifference: row.goalsDiff ?? null, points: row.points ?? null, form, note: clean(row.description) }];
    }).sort((a,b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const first = values.map(value => rawRow.safeParse(value)).find(value => value.success);
    const supplied = first?.success ? clean(first.data.group) : null;
    const name = supplied === context.competitionName ? null : context.competitionName && supplied?.startsWith(`${context.competitionName} - `)
      ? supplied.slice(context.competitionName.length + 3) : supplied;
    return rows.length ? [{ id: `group-${index + 1}`, name, rows }] : [];
  });
  return groups.length ? competitionTablesSchema.parse({ groups, complete, retrievedAt: context.retrievedAt }) : null;
}

type Binding = { seasonId: string; season: number; competitionId: string; competitionName: string | null;
  competitionType: string | null; provider: string; round: string | null };
const publicTeam = (team: { id: string; name: string | null; code: string | null; logoUrl: string | null }): CompetitionTeam => ({
  id: team.id, name: clean(team.name), shortName: clean(team.code), logoUrl: isSafeRemoteImageUrl(team.logoUrl) ? team.logoUrl : null });

/** Bounded catalog/snapshot reads only. Opening standings never dispatches provider requests. */
export async function readCompetitionView(tx: Prisma.TransactionClient, binding: Binding, asOf: number): Promise<CompetitionView | null> {
  const stored = await tx.seasonStandings.findUnique({ where: { seasonId: binding.seasonId } });
  let tables: CompetitionView["tables"] = null, bracket: CompetitionView["bracket"] = null;
  if (stored?.status === "available" && stored.retrievedAt && stored.retrievedAt.getTime() <= asOf) {
    const supplied = competitionViewSchema.safeParse(stored.body);
    if (supplied.success && supplied.data.season === binding.season) {
      tables = supplied.data.tables && (supplied.data.tables.retrievedAt === null || supplied.data.tables.retrievedAt <= asOf) ? supplied.data.tables : null;
      bracket = supplied.data.bracket && (supplied.data.bracket.retrievedAt === null || supplied.data.bracket.retrievedAt <= asOf) ? supplied.data.bracket : null;
    } else {
      const leagues = storedStandingLeagues(stored.body);
      const ids = leagues.flatMap(entry => entry.league.standings.flat()).flatMap(value => {
        const row = rawRow.safeParse(value); return row.success ? [BigInt(row.data.team.id)] : [];
      });
      const [competition, mappings] = await Promise.all([
        tx.footballCompetitionProvider.findFirst({ where: { competitionId: binding.competitionId, provider: binding.provider }, select: { externalId: true } }),
        tx.footballTeamProvider.findMany({ where: { provider: binding.provider, externalId: { in: ids } }, include: { team: true } }),
      ]);
      const teams = new Map(mappings.map(mapping => [Number(mapping.externalId), publicTeam(mapping.team)]));
      tables = normalizeStoredStandings(stored.body, { ...binding, externalId: competition ? Number(competition.externalId) : null,
        retrievedAt: stored.retrievedAt.getTime() }, id => teams.get(id) ?? null);
    }
  }
  if (!bracket && (binding.competitionType?.toLowerCase() === "cup" || knockoutStage(binding.round))) {
    const fixtures = await tx.footballFixture.findMany({ where: { seasonId: binding.seasonId, retrievedAt: { lte: new Date(asOf) } },
      include: { homeTeam: true, awayTeam: true, lifecycleState: { select: { issue: true } }, resultState: { select: { resultId: true } } },
      orderBy: [{ kickoff: "asc" }, { id: "asc" }], take: 512 });
    const rows = await tx.$queryRaw<HistoryRow[]>`SELECT r.*, r.integrity = SHA2(CAST(r.body AS CHAR), 256) AS validIntegrity
      FROM FixtureResult r JOIN FixtureResultState s ON s.resultId = r.id AND s.fixtureId = r.fixtureId
      JOIN FootballFixture f ON f.id = r.fixtureId WHERE f.seasonId = ${binding.seasonId}
      ORDER BY f.kickoff ASC, f.id ASC LIMIT 512`;
    const results = new Map<string, StoredFixtureResult>();
    for (const row of rows) { try { const value = fixtureResultFromRow(row); if (value.observedAt <= asOf) results.set(value.fixtureId, value); } catch { /* Unsealed scores stay unavailable. */ } }
    const matches: KnockoutSourceFixture[] = fixtures.map(fixture => {
      const result = results.get(fixture.id) ?? null;
      const coherent = fixtureResultMatchesCanonical(fixture, result, fixture.lifecycleState?.issue ?? null);
      const catalog = !fixture.resultState?.resultId && !fixture.lifecycleState?.issue && fixture.regulationVerifiedAt !== null
        && fixture.regulationEvidenceRef !== null && fixture.regulationVerifiedAt.getTime() <= asOf;
      const final = coherent && ["finished-regulation", "finished-extra-time", "finished-penalties"].includes(fixture.status);
      const live = coherent && fixture.status === "live";
      const score = (final || live) && result!.reportedGoals.home !== null && result!.reportedGoals.away !== null ? result!.reportedGoals
        : coherent && result!.regulation.verified ? result!.regulation : catalog ? { home: fixture.regulationHome, away: fixture.regulationAway } : null;
      return { id: fixture.id, slug: canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name), round: fixture.round,
        kickoffAt: fixture.kickoff?.getTime() ?? null, home: publicTeam(fixture.homeTeam), away: publicTeam(fixture.awayTeam),
        status: fixture.status, homeGoals: score?.home ?? null, awayGoals: score?.away ?? null,
        penaltyHome: final ? result!.penaltyScore.home : null, penaltyAway: final ? result!.penaltyScore.away : null,
        scorePeriod: score ? final ? "final" : live ? "live" : "regulation" : null };
    });
    bracket = bracketFromFixtures(matches, fixtures.reduce((latest, fixture) => Math.max(latest, fixture.retrievedAt.getTime()), 0) || null);
  }
  return tables || bracket ? competitionViewSchema.parse({ season: binding.season, tables, bracket,
    defaultView: bracket && (knockoutStage(binding.round) || !tables) ? "bracket" : "table" }) : null;
}
