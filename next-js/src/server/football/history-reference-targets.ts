import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import type { FootballHistoryReferenceTarget } from "./history-reference.ts";

const provider = "api-football";
export const historyReferenceDatasets = ["teams", "venues", "standings", "injuries", "transfers"] as const;
export type HistoryReferenceDataset = typeof historyReferenceDatasets[number];

/** Reuse canonical season, team and venue identities already discovered by the archive. */
export async function readHistoryReferenceTargets(database: DatabaseRuntime, competitionIds: readonly number[],
  dataset?: HistoryReferenceDataset): Promise<FootballHistoryReferenceTarget[]> {
  const competitionMapping = { provider, externalId: { in: competitionIds.map(BigInt) } };
  const competition = { providers: { some: competitionMapping } };
  const fixture = { provider, season: { competition } };
  const include = (value: HistoryReferenceDataset) => dataset === undefined || dataset === value;
  const targets: FootballHistoryReferenceTarget[] = [];
  const [seasons, venues, teams] = await Promise.all([
    include("teams") || include("standings") || include("injuries") ? database.query((client) => client.footballSeason.findMany({
      where: { competition, fixtures: { some: { provider } } }, select: { year: true, coverage: true,
        competition: { select: { providers: { where: competitionMapping, select: { externalId: true } } } } },
      orderBy: { year: "desc" },
    })) : [],
    include("venues") ? database.query((client) => client.fixtureFacts.findMany({ where: { fixture, venueExternalId: { not: null } },
      distinct: ["venueExternalId"], select: { venueExternalId: true }, orderBy: { venueExternalId: "asc" } })) : [],
    include("transfers") ? database.query((client) => client.footballTeamProvider.findMany({ where: { provider, team: { OR: [
      { homeFixtures: { some: fixture } }, { awayFixtures: { some: fixture } },
    ] } }, select: { externalId: true }, orderBy: { externalId: "asc" } })) : [],
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
  for (const { externalId } of teams) targets.push({ endpoint: "transfers", teamId: Number(externalId) });
  return targets;
}
