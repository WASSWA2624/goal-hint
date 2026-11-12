import "server-only";

import { playerStatisticsProviderId } from "./history-player-statistics-input.ts";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Coach identities must belong to a lineup for a fixture and team in the archived response scope. */
export function archivedFixtureCoachIds(rows: readonly unknown[], parameters: Readonly<Record<string, string>>) {
  const selector = parameters.id ?? parameters.ids;
  if (!selector || (parameters.id !== undefined && parameters.ids !== undefined)) return null;
  const parts = selector.split("-");
  const requested = parts.map(Number);
  if (requested.length > 20 || (parameters.id !== undefined && requested.length !== 1) ||
    parts.some((part, index) => !playerStatisticsProviderId(requested[index]) || String(requested[index]) !== part)) return null;
  const fixtureIds = new Set(requested), observedFixtures = new Set<number>(), coaches = new Set<number>();
  if (fixtureIds.size !== requested.length) return null;
  for (const row of rows) {
    if (!record(row) || !record(row.fixture) || !playerStatisticsProviderId(row.fixture.id) ||
      !fixtureIds.has(row.fixture.id) || observedFixtures.has(row.fixture.id)) return null;
    observedFixtures.add(row.fixture.id);
    if (row.lineups == null) continue;
    if (!Array.isArray(row.lineups) || !record(row.teams) || !record(row.teams.home) || !record(row.teams.away)) return null;
    const teamIds = new Set([row.teams.home.id, row.teams.away.id]);
    for (const lineup of row.lineups) {
      if (!record(lineup) || !record(lineup.team) || !playerStatisticsProviderId(lineup.team.id) || !teamIds.has(lineup.team.id)) return null;
      if (lineup.coach == null) continue;
      if (!record(lineup.coach)) return null;
      // Provider lineups can use zero to represent an unidentified coach.
      if (lineup.coach.id == null || lineup.coach.id === 0) continue;
      if (!playerStatisticsProviderId(lineup.coach.id)) return null;
      coaches.add(lineup.coach.id);
    }
  }
  return [...coaches];
}
