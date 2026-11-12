import "server-only";

import { createHash } from "node:crypto";
import type { UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { catalogScopeKey } from "./catalog-input.ts";

const dayMs = 24 * 60 * 60_000;
export const footballHistoryCatalogMaxAgeMs = dayMs;
export type FootballHistorySeasonScope = Readonly<{ competitionId: number; season: number }>;

export function footballHistoryFixtureScopeFingerprint(scopes: Iterable<FootballHistorySeasonScope>) {
  const keys = Array.from(scopes, (query) => catalogScopeKey({ kind: "fixtures", query })).sort();
  return createHash("sha256").update(JSON.stringify(keys)).digest("hex");
}

export async function readUpcomingFootballHistorySeasons(database: DatabaseRuntime, at: UtcInstant) {
  const rows = await database.query((client) => client.$queryRaw<{ id: bigint; year: number; upcoming: bigint }[]>`
    SELECT mapping.externalId AS id, season.year, COUNT(*) AS upcoming
    FROM FootballFixture AS fixture
    JOIN FootballSeason AS season ON season.id=fixture.seasonId
    JOIN FootballCompetitionProvider AS mapping ON mapping.competitionId=season.competitionId AND mapping.provider=fixture.provider
    WHERE fixture.provider='api-football' AND fixture.status='scheduled'
      AND fixture.kickoff>${new Date(at)} AND fixture.kickoff<${new Date(at + 7 * dayMs)}
    GROUP BY mapping.externalId, season.year`);
  return rows.map(({ id, year, upcoming }) => ({ competitionId: Number(id), season: year, fixtures: Number(upcoming) }));
}
