import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { apiFootballLeaderboards, type ApiFootballLeaderboard } from "./api-football-contract.ts";
import type { FootballHistoryReferenceTarget } from "./history-reference.ts";

const provider = "api-football";
const leaderboardDatasets = [["top-scorers", "topScorers"], ["top-assists", "topAssists"],
  ["top-yellow-cards", "topYellowCards"], ["top-red-cards", "topRedCards"]] as const;
export const historyReferenceDatasets = ["teams", "venues", "standings", "injuries", "transfers",
  "countries", "timezones", "league-seasons", "team-statistics", "player-statistics", "player-profiles", "coaches", "squads", "rounds", "team-seasons",
  "half-statistics",
  ...leaderboardDatasets.map(([dataset]) => dataset)] as const;
export type HistoryReferenceDataset = typeof historyReferenceDatasets[number];

type LeagueSeason = Readonly<{ competitionId: bigint; season: number }>;
type TeamSeason = LeagueSeason & Readonly<{ teamId: bigint }>;
type LeaderboardSeason = LeagueSeason & Readonly<{ endpoint: ApiFootballLeaderboard }>;
type HalfStatisticsFixture = Readonly<{ fixtureId: bigint; homeTeamId: bigint; awayTeamId: bigint }>;

function pendingRounds(database: DatabaseRuntime, competitionIds: readonly number[], limit: number) {
  // Match the same sorted selector used by the oversized fixture fallback.
  return database.query((client) => client.$queryRaw<LeagueSeason[]>(Prisma.sql`
    SELECT league.externalId AS competitionId, season.year AS season
    FROM FootballSeason AS season
    JOIN FootballCompetitionProvider AS league ON league.competitionId = season.competitionId AND league.provider = ${provider}
    WHERE league.externalId IN (${Prisma.join(competitionIds.map(BigInt))})
      AND EXISTS (SELECT 1 FROM FootballFixture AS fixture WHERE fixture.seasonId = season.id AND fixture.provider = ${provider})
      AND NOT EXISTS (SELECT 1 FROM FootballCompetitionProvider AS alternate WHERE alternate.competitionId = league.competitionId
        AND alternate.provider = league.provider AND alternate.externalId <> league.externalId)
      AND NOT EXISTS (SELECT 1 FROM FootballHistorySourcePage AS archived WHERE archived.endpoint = 'fixtureRounds'
        AND archived.selectorHash = SHA2(CONCAT('{"dates":"true","league":"', league.externalId,
          '","season":"', season.year, '","timezone":"Africa/Kampala"}'), 256))
    ORDER BY season.year DESC, league.externalId
    LIMIT ${limit}`));
}

function pendingLeaderboards(database: DatabaseRuntime, competitionIds: readonly number[], endpoints: readonly ApiFootballLeaderboard[], limit: number) {
  const requested = endpoints.map((endpoint, order) => Prisma.sql`SELECT CONVERT(${endpoint} USING utf8mb4) COLLATE utf8mb4_unicode_ci AS endpoint,
    ${`$.${apiFootballLeaderboards[endpoint].coverage}`} AS coveragePath, ${order} AS sortOrder`);
  return database.query((client) => client.$queryRaw<LeaderboardSeason[]>(Prisma.sql`
    SELECT league.externalId AS competitionId, season.year AS season, requested.endpoint
    FROM FootballSeason AS season
    JOIN FootballCompetitionProvider AS league ON league.competitionId = season.competitionId AND league.provider = ${provider}
    CROSS JOIN (${Prisma.join(requested, " UNION ALL ")}) AS requested
    WHERE league.externalId IN (${Prisma.join(competitionIds.map(BigInt))})
      AND EXISTS (SELECT 1 FROM FootballFixture AS fixture WHERE fixture.seasonId = season.id AND fixture.provider = ${provider})
      AND NOT EXISTS (SELECT 1 FROM FootballCompetitionProvider AS alternate WHERE alternate.competitionId = league.competitionId
        AND alternate.provider = league.provider AND alternate.externalId <> league.externalId)
      AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(season.coverage, requested.coveragePath)), 'null') <> 'false'
      AND NOT EXISTS (SELECT 1 FROM FootballHistorySourcePage AS archived WHERE archived.endpoint = requested.endpoint
        AND archived.selectorHash = SHA2(CONCAT('{"league":"', league.externalId, '","season":"', season.year, '"}'), 256))
    ORDER BY season.year DESC, league.externalId, requested.sortOrder
    LIMIT ${limit}`));
}

function pendingHalfStatistics(database: DatabaseRuntime, competitionIds: readonly number[], limit: number) {
  const coverage = Prisma.sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(season.coverage, '$."fixtures.statistics_fixtures"')), 'null')`;
  return database.query((client) => client.$queryRaw<HalfStatisticsFixture[]>(Prisma.sql`
    SELECT fixture.externalId AS fixtureId, home.externalId AS homeTeamId, away.externalId AS awayTeamId
    FROM FootballFixture AS fixture
    JOIN FootballSeason AS season ON season.id = fixture.seasonId
    JOIN FootballCompetitionProvider AS league ON league.competitionId = season.competitionId AND league.provider = fixture.provider
    JOIN FootballTeamProvider AS home ON home.teamId = fixture.homeTeamId AND home.provider = fixture.provider
    JOIN FootballTeamProvider AS away ON away.teamId = fixture.awayTeamId AND away.provider = fixture.provider
    LEFT JOIN FixtureFacts AS facts ON facts.fixtureId = fixture.id
    WHERE fixture.provider = ${provider} AND league.externalId IN (${Prisma.join(competitionIds.map(BigInt))}) AND season.year >= 2024
      AND fixture.status IN ('finished-regulation', 'finished-extra-time', 'finished-penalties') AND fixture.kickoff <= UTC_TIMESTAMP(3)
      AND fixture.regulationVerifiedAt <= UTC_TIMESTAMP(3) AND fixture.regulationEvidenceRef IS NOT NULL
      AND fixture.regulationHome IS NOT NULL AND fixture.regulationAway IS NOT NULL AND fixture.homeTeamId <> fixture.awayTeamId
      AND (${coverage} = 'true' OR (${coverage} = 'null' AND JSON_LENGTH(facts.statistics, '$[0].statistics') > 0
        AND JSON_LENGTH(facts.statistics, '$[1].statistics') > 0))
      AND NOT EXISTS (SELECT 1 FROM FootballCompetitionProvider AS alternate WHERE alternate.competitionId = league.competitionId
        AND alternate.provider = league.provider AND alternate.externalId <> league.externalId)
      AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider AS alternate WHERE alternate.teamId IN (home.teamId, away.teamId)
        AND alternate.provider = fixture.provider AND alternate.externalId NOT IN (home.externalId, away.externalId))
      AND NOT EXISTS (SELECT 1 FROM FootballHistorySourcePage AS archived WHERE archived.endpoint = 'fixtureHalfStatistics'
        AND archived.selectorHash = SHA2(CONCAT('{"fixture":"', fixture.externalId, '","half":"true"}'), 256))
    ORDER BY fixture.kickoff DESC, fixture.externalId
    LIMIT ${limit}`));
}

function pendingTeamStatistics(database: DatabaseRuntime, competitionIds: readonly number[], limit: number) {
  // The archive hashes JSON with selector keys sorted as league, season, team.
  return database.query((client) => client.$queryRaw<TeamSeason[]>(Prisma.sql`
    WITH observed_teams AS (
      SELECT seasonId, homeTeamId AS teamId FROM FootballFixture WHERE provider = ${provider}
      UNION
      SELECT seasonId, awayTeamId AS teamId FROM FootballFixture WHERE provider = ${provider}
    )
    SELECT league.externalId AS competitionId, season.year AS season, team.externalId AS teamId
    FROM observed_teams AS observed
    JOIN FootballSeason AS season ON season.id = observed.seasonId
    JOIN FootballCompetitionProvider AS league ON league.competitionId = season.competitionId AND league.provider = ${provider}
    JOIN FootballTeamProvider AS team ON team.teamId = observed.teamId AND team.provider = ${provider}
    WHERE league.externalId IN (${Prisma.join(competitionIds.map(BigInt))})
      AND NOT EXISTS (SELECT 1 FROM FootballCompetitionProvider AS alternate WHERE alternate.competitionId = league.competitionId
        AND alternate.provider = league.provider AND alternate.externalId <> league.externalId)
      AND NOT EXISTS (SELECT 1 FROM FootballTeamProvider AS alternate WHERE alternate.teamId = team.teamId
        AND alternate.provider = team.provider AND alternate.externalId <> team.externalId)
      AND NOT EXISTS (SELECT 1 FROM FootballHistorySourcePage AS archived WHERE archived.endpoint = 'teamStatistics'
        AND archived.selectorHash = SHA2(CONCAT('{"league":"', league.externalId, '","season":"', season.year, '","team":"', team.externalId, '"}'), 256))
    ORDER BY season.year DESC, league.externalId, team.externalId
    LIMIT ${limit}`));
}

/** Reuse canonical season, team and venue identities already discovered by the archive. */
export async function readHistoryReferenceTargets(database: DatabaseRuntime, competitionIds: readonly number[],
  dataset: HistoryReferenceDataset | undefined, maxDatasetTargets: number) {
  if (!Number.isSafeInteger(maxDatasetTargets) || maxDatasetTargets < 1 || maxDatasetTargets > 100) {
    throw new RangeError("Choose a historical reference request limit between 1 and 100.");
  }
  const competitionMapping = { provider, externalId: { in: competitionIds.map(BigInt) } };
  const competition = { providers: { some: competitionMapping } };
  const fixture = { provider, season: { competition } };
  const include = (value: HistoryReferenceDataset) => dataset === undefined || dataset === value;
  const leaderboardEndpoints = leaderboardDatasets.filter(([name]) => include(name)).map(([, endpoint]) => endpoint);
  const targets: FootballHistoryReferenceTarget[] = [];
  if (include("countries")) targets.push({ endpoint: "countries" });
  if (include("timezones")) targets.push({ endpoint: "timezones" });
  if (include("league-seasons")) targets.push({ endpoint: "leagueSeasons" });
  const [seasons, venues, teams, teamStatistics, rounds, leaderboards, halfStatistics] = await Promise.all([
    include("teams") || include("standings") || include("injuries") ? database.query((client) => client.footballSeason.findMany({
      where: { competition, fixtures: { some: { provider } } }, select: { year: true, coverage: true,
        competition: { select: { providers: { where: competitionMapping, select: { externalId: true } } } } },
      orderBy: { year: "desc" },
    })) : [],
    include("venues") ? database.query((client) => client.fixtureFacts.findMany({ where: { fixture, venueExternalId: { not: null } },
      distinct: ["venueExternalId"], select: { venueExternalId: true }, orderBy: { venueExternalId: "asc" } })) : [],
    include("transfers") || include("coaches") || include("squads") || include("team-seasons") ? database.query((client) => client.footballTeamProvider.findMany({ where: { provider, team: { OR: [
      { homeFixtures: { some: fixture } }, { awayFixtures: { some: fixture } },
    ] } }, select: { externalId: true, team: { select: { providers: { where: { provider }, select: { externalId: true }, take: 2 } } } },
    orderBy: { externalId: "asc" } })) : [],
    include("team-statistics") && competitionIds.length ? pendingTeamStatistics(database, competitionIds, maxDatasetTargets + 1) : [],
    include("rounds") && competitionIds.length ? pendingRounds(database, competitionIds, maxDatasetTargets + 1) : [],
    leaderboardEndpoints.length && competitionIds.length ? pendingLeaderboards(database, competitionIds, leaderboardEndpoints, maxDatasetTargets + 1) : [],
    include("half-statistics") && competitionIds.length ? pendingHalfStatistics(database, competitionIds, maxDatasetTargets + 1) : [],
  ]);
  for (const row of seasons) {
    if (row.competition.providers.length !== 1) continue;
    const competitionId = Number(row.competition.providers[0]!.externalId), season = row.year;
    const coverage = row.coverage && typeof row.coverage === "object" && !Array.isArray(row.coverage) ? row.coverage : {};
    if (include("teams")) targets.push({ endpoint: "teams", competitionId, season });
    if (include("standings") && coverage.standings !== false) targets.push({ endpoint: "standings", competitionId, season });
    // A 2020-start season can still include matches after the provider's April 2021 injury coverage began.
    if (include("injuries") && season >= 2020 && coverage.injuries !== false) targets.push({ endpoint: "injuries", competitionId, season });
  }
  for (const { venueExternalId } of venues) if (venueExternalId !== null) targets.push({ endpoint: "venues", venueId: Number(venueExternalId) });
  const teamSnapshots: FootballHistoryReferenceTarget[] = [];
  for (const { externalId, team } of teams) {
    const teamId = Number(externalId);
    if (include("transfers")) targets.push({ endpoint: "transfers", teamId });
    if (team.providers.length !== 1) continue;
    if (include("coaches")) teamSnapshots.push({ endpoint: "coaches", teamId });
    if (include("squads")) teamSnapshots.push({ endpoint: "squads", teamId });
    if (include("team-seasons")) teamSnapshots.push({ endpoint: "teamSeasons", teamId });
  }
  const statistics = teamStatistics.slice(0, maxDatasetTargets), roundScopes = rounds.slice(0, maxDatasetTargets);
  const leaderboardScopes = leaderboards.slice(0, maxDatasetTargets), halfFixtures = halfStatistics.slice(0, maxDatasetTargets);
  const queueLength = Math.max(teamSnapshots.length, statistics.length, roundScopes.length, leaderboardScopes.length, halfFixtures.length);
  for (let index = 0; index < queueLength; index++) {
    const snapshot = teamSnapshots[index], round = roundScopes[index], row = statistics[index], leaderboard = leaderboardScopes[index];
    if (snapshot) targets.push(snapshot);
    if (round) targets.push({ endpoint: "fixtureRounds", competitionId: Number(round.competitionId), season: round.season });
    if (row) targets.push({ endpoint: "teamStatistics", competitionId: Number(row.competitionId), season: row.season, teamId: Number(row.teamId) });
    if (leaderboard) targets.push({ endpoint: leaderboard.endpoint, competitionId: Number(leaderboard.competitionId), season: leaderboard.season });
    const half = halfFixtures[index];
    if (half) targets.push({ endpoint: "fixtureHalfStatistics", fixtureId: Number(half.fixtureId),
      homeTeamId: Number(half.homeTeamId), awayTeamId: Number(half.awayTeamId) });
  }
  return { targets, hasMoreTargets: [teamStatistics, rounds, leaderboards, halfStatistics].some((rows) => rows.length > maxDatasetTargets) };
}

/** Use observed competition seasons and skip explicit provider noncoverage. */
export async function readHistoryPlayerStatisticsTargets(database: DatabaseRuntime, competitionIds: readonly number[]) {
  const scope = new Set(competitionIds);
  if (!scope.size) return [];
  const rows = await database.query((client) => client.footballSeason.findMany({ where: {
    fixtures: { some: { provider } }, competition: { providers: { some: { provider, externalId: { in: [...scope].map(BigInt) } } } },
  }, select: { year: true, coverage: true,
    competition: { select: { providers: { where: { provider }, select: { externalId: true } } } } }, orderBy: { year: "desc" } }));
  return rows.flatMap(({ year, coverage, competition }) => {
    if (competition.providers.length !== 1 || coverage && typeof coverage === "object" && !Array.isArray(coverage) && coverage.players === false) return [];
    const competitionId = Number(competition.providers[0]!.externalId);
    return scope.has(competitionId) ? [{ competitionId, season: year }] : [];
  });
}
