import "server-only";

import { normalizeAvailability, normalizeEvent, normalizeFixture, normalizeStatistics,
  type NormalizationContext, type NormalizationResult, type NormalizedEvent, type NormalizedFixture,
  type NormalizedStatistics } from "./api-football-normalize.ts";

export type FixtureDetailFacts = Readonly<{
  events: readonly unknown[] | null;
  statistics: readonly unknown[] | null;
  lineups: readonly unknown[] | null;
  players: readonly unknown[] | null;
}>;
export type NormalizedFixtureMatchDetails = NormalizedFixture & Readonly<{
  matchEvents: readonly NormalizedEvent[] | null;
  matchStatistics: readonly NormalizedStatistics[] | null;
  facts: FixtureDetailFacts;
}>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalized<T>(raw: readonly unknown[] | null, parse: (value: unknown) => NormalizationResult<T>): readonly T[] | null {
  if (raw === null) return null;
  const rows: T[] = [];
  for (const item of raw) {
    const entry = parse(item);
    if (!entry.valid) return null;
    rows.push(entry.data);
  }
  return Object.freeze(rows);
}

function section(value: unknown, maximum: number): readonly unknown[] | null {
  return Array.isArray(value) && value.length <= maximum ? Object.freeze(value) : null;
}

/** Retain only correlated sections. An invalid detail block does not discard the fixture or other blocks. */
export function normalizeFixtureMatchDetails(raw: unknown, context: NormalizationContext): NormalizationResult<NormalizedFixtureMatchDetails> {
  const fixture = normalizeFixture(raw, context);
  if (!fixture.valid) return fixture;
  const data = fixture.data, row = object(raw)!;
  const teams = new Set([data.homeTeam.id, data.awayTeam.id]);
  const events = section(row.events, 500), statistics = section(row.statistics, 2);
  const normalizedEvents = normalized(events, (value) => normalizeEvent(value, context));
  const normalizedStatistics = normalized(statistics, (value) => normalizeStatistics(value, context));
  const matchEvents = normalizedEvents?.every((entry) => teams.has(entry.teamId)) ? normalizedEvents : null;
  const matchStatistics = normalizedStatistics?.every((entry) => teams.has(entry.team.id))
    && new Set(normalizedStatistics.map((entry) => entry.team.id)).size === normalizedStatistics.length ? normalizedStatistics : null;
  const lineups = section(row.lineups, 2), players = section(row.players, 2);
  const validLineups = normalized(lineups, (value) => normalizeAvailability(value, "lineups", context));
  const matchLineups = validLineups?.every((entry) => teams.has(entry.team.id)) &&
    new Set(validLineups.map((entry) => entry.team.id)).size === validLineups.length ? lineups : null;
  const playerTeams = new Set<unknown>();
  const matchPlayers = players?.every((value) => {
    const group = object(value), team = object(group?.team)?.id, items = section(group?.players, 100);
    if (typeof team !== "number" || !teams.has(team) || playerTeams.has(team) || items === null) return false;
    playerTeams.add(team);
    return items.every((item) => {
      const player = object(item), id = object(player?.player)?.id;
      return typeof id === "number" && Number.isSafeInteger(id) && id > 0 && section(player?.statistics, 10) !== null;
    });
  }) ? players : null;
  return { ...fixture, data: Object.freeze({ ...data, matchEvents, matchStatistics,
    facts: Object.freeze({ events: matchEvents === null ? null : events, statistics: matchStatistics === null ? null : statistics,
      lineups: matchLineups, players: matchPlayers }) }) };
}
