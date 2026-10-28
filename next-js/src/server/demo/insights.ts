import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { insightStandingSchema, lineupSchema, newsItemSchema, playerSchema, storedMatchInsightsSchema, summarize, type StoredMatchInsights } from "../../domain/match-insights.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { normalizeAvailability } from "../football/api-football-normalize.ts";
import { publicFixtureVenue } from "../matches/insights-read.ts";
import { demoApiFootballResponse, demoFixtureById, demoFixtureLineups, demoFixturePlayers, type ApiFootballDemoFixture } from "./api-football.ts";
import { demoId } from "./forecast.ts";

type VenueFacts = { providerFixtureId: bigint; venueName: string | null; venueCity: string | null; infoRetrievedAt: Date | null };
type Binding = Readonly<{ provider: string; externalId: bigint; homeTeamId: string; awayTeamId: string; facts?: VenueFacts | null }>;
type Player = StoredMatchInsights["sections"]["players"]["players"][number];
type Lineups = StoredMatchInsights["sections"]["lineups"];
type Context = StoredMatchInsights["sections"]["context"];
const standingResponseSchema = z.array(z.object({ league: z.object({ id: z.number().int().positive(),
  standings: z.array(z.array(z.object({ rank: z.number().int().positive(), team: z.object({ id: z.number().int().positive() }),
    points: z.number().int().nonnegative(), group: z.string(), all: z.object({ played: z.number().int().nonnegative() }) }))) }) }));

function demoCurrentStandings(fixture: ApiFootballDemoFixture, asOf: number): Context["standings"] {
  const raw = demoApiFootballResponse("standings", { league: String(fixture.league.id), season: String(fixture.league.season) }, asOf);
  const table = standingResponseSchema.parse(raw.response).find((row) => row.league.id === fixture.league.id)?.league.standings.flat();
  if (!table) return null;
  const standing = (teamId: number) => {
    const row = table.find((entry) => entry.team.id === teamId);
    return row ? insightStandingSchema.parse({ rank: row.rank, points: row.points, played: row.all.played, group: row.group }) : null;
  };
  const home = standing(fixture.teams.home.id), away = standing(fixture.teams.away.id);
  return home || away ? { home, away, retrievedAt: asOf } : null;
}

/** API-Football does not publish news. These app reports are explicitly synthetic,
 * derived from observed demo football data, and never injected into raw provider responses. */
function demoAuxiliaryReports(insights: StoredMatchInsights, fixture: ApiFootballDemoFixture, lineups: Lineups, context: Context, asOf: number) {
  const prefix = `demo-report-${fixture.fixture.id}-`, kickoffAt = fixture.fixture.timestamp * 1_000;
  const items = insights.sections.news.items.filter((item) => !item.id.startsWith(prefix));
  const report = (key: string, title: string, details: string[], publishedAt: number) => newsItemSchema.parse({
    id: `${prefix}${key}`, kind: "report", publisher: "Goal Hint synthetic demo", title: `Demo report: ${title}`,
    url: null, publishedAt: Math.min(asOf, publishedAt), retrievedAt: asOf,
    details: ["Synthetic report derived from simulated football observations.", ...details].slice(0, 20) });
  items.push(report("fixture", `${fixture.teams.home.name} face ${fixture.teams.away.name}`, [
    `${fixture.league.name}: ${fixture.league.round}.`,
    `Kickoff: ${fixture.fixture.date}.`,
    ...(context.venue ? [`Venue: ${context.venue.name}${context.venue.city ? `, ${context.venue.city}` : ""}.`] : []),
  ], kickoffAt - 86_400_000));
  for (const side of ["home", "away"] as const) {
    const team = insights[side], recent = insights.sections.form[side].filter((row) => row.kickoffAt + 155 * 60_000 <= asOf).slice(0, 5);
    if (recent.length) {
      const form = summarize(recent, team.id);
      items.push(report(`form-${side}`, `${team.name ?? fixture.teams[side].name} recent form`, [
        `${form.matches} recorded matches: ${form.wins} wins, ${form.draws} draws and ${form.losses} defeats.`,
        `${form.goalsFor} goals scored and ${form.goalsAgainst} conceded in this sample.`,
      ], recent[0]!.kickoffAt + 155 * 60_000));
    }
    const lineup = lineups[side];
    if (lineup) items.push(report(`lineup-${side}`, `${team.name ?? fixture.teams[side].name} confirm ${lineup.formation ?? "their"} lineup`, [
      `${lineup.starters.length} starters and ${lineup.substitutes.length} substitutes are listed.`,
      ...lineup.starters.map((player) => `${player.number ?? "—"}: ${player.name ?? "Unnamed player"}${player.position ? ` (${player.position})` : ""}`),
    ], kickoffAt - 40 * 60_000));
    const injuries = insights.sections.injuries.injuries.filter((injury) => injury.team === side && injury.retrievedAt <= asOf);
    if (injuries.length) items.push(report(`availability-${side}`, `${team.name ?? fixture.teams[side].name} availability update`,
      injuries.map((injury) => `${injury.playerName ?? "Player"}: ${[injury.type, injury.reason].filter(Boolean).join(" — ") || injury.status}.`),
      Math.max(...injuries.map((injury) => injury.updatedAt ?? injury.retrievedAt))));
  }
  return { ...insights.sections.news, items: items.slice(0, 80) };
}

/** Current match availability/context is observation data, separate from a forecast's immutable evidence.
 * Only canonical synthetic identities are eligible; foreign/production bindings are unchanged. */
export function projectDemoCurrentAvailability(insights: StoredMatchInsights, binding: Binding, asOf: number): StoredMatchInsights {
  const externalId = Number(binding.externalId), fixture = demoFixtureById(externalId, asOf);
  if (binding.provider !== "api-football" || !fixture || insights.fixtureId !== demoId("fixture", externalId) ||
    insights.home.id !== binding.homeTeamId || insights.away.id !== binding.awayTeamId ||
    binding.homeTeamId !== demoId("team", fixture.teams.home.id) || binding.awayTeamId !== demoId("team", fixture.teams.away.id)) return insights;

  const lineups: StoredMatchInsights["sections"]["lineups"] = { home: null, away: null };
  // Retain sourced injury-only profiles, but never preserve an older confirmed lineup
  // if the requested clock precedes confirmation or the current fixture is postponed.
  const players = new Map<string, Player>(insights.sections.players.players.filter((player) => player.role === null)
    .map((player) => [`${player.team}:${player.id}`, player]));
  const sideOf = (teamId: number) => teamId === fixture.teams.home.id ? "home" as const : teamId === fixture.teams.away.id ? "away" as const : null;
  for (const raw of demoFixtureLineups(externalId, asOf)) {
    const normalized = normalizeAvailability(raw, "lineups", { endpoint: "/fixtures/lineups", retrievedAt: utcInstantFromEpochMilliseconds(asOf) });
    if (!normalized.valid) throw new Error("Invalid local demo lineup observation.");
    const value = normalized.data, side = sideOf(value.team.id);
    if (!side) continue;
    const project = (player: typeof value.startingPlayers[number], role: "starting" | "substitute") => {
      const entry = playerSchema.parse({ id: player.id, team: side, name: player.name, number: player.number,
        position: player.position, grid: player.grid, role });
      players.set(`${side}:${entry.id}`, entry);
      return entry;
    };
    lineups[side] = lineupSchema.parse({ team: side, formation: value.formation, status: "confirmed",
      updatedAt: value.source.providerUpdatedAt, retrievedAt: value.source.retrievedAt,
      starters: value.startingPlayers.map((player) => project(player, "starting")), substitutes: value.substitutes.map((player) => project(player, "substitute")) });
  }
  // A fixture's live player endpoint can contain additional participants. Keep its
  // observed profile/role, while confirmed lineup grids retain their precise positions.
  for (const raw of demoFixturePlayers(externalId, asOf)) {
    const side = sideOf(raw.team.id);
    if (!side) continue;
    for (const row of raw.players) {
      const key = `${side}:${row.player.id}`;
      if (players.has(key)) continue;
      const games = row.statistics[0]?.games;
      if (!games) continue;
      players.set(key, playerSchema.parse({ id: row.player.id, team: side, name: row.player.name,
        number: games.number, position: games.position, grid: null, role: games.substitute ? "substitute" : "starting" }));
    }
  }
  const context: Context = { ...insights.sections.context,
    venue: binding.facts ? publicFixtureVenue(binding.externalId, binding.facts, asOf) : insights.sections.context.venue ?? null,
    standings: demoCurrentStandings(fixture, asOf) };
  const news = demoAuxiliaryReports(insights, fixture, lineups, context, asOf);
  return storedMatchInsightsSchema.parse({ ...insights, asOf,
    sections: { ...insights.sections, lineups, players: { players: [...players.values()].slice(0, 120) }, context, news } });
}

/** Called only inside the development-demo read branch and its ordinary read transaction. */
export async function readDemoCurrentAvailability(tx: Prisma.TransactionClient, insights: StoredMatchInsights, asOf: number) {
  const binding = await tx.footballFixture.findUnique({ where: { id: insights.fixtureId },
    select: { provider: true, externalId: true, homeTeamId: true, awayTeamId: true,
      facts: { select: { providerFixtureId: true, venueName: true, venueCity: true, infoRetrievedAt: true } } } });
  return binding ? projectDemoCurrentAvailability(insights, binding, asOf) : insights;
}
