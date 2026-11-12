import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseRuntime } from "../database/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballReferenceParameters, type FootballHistoryReferenceTarget } from "./api-football-contract.ts";
import { createFootballHistorySource } from "./history-source.ts";

const countryHash = (country: string) => createHash("sha256").update(JSON.stringify({ country })).digest("hex");

/** The provider's country dictionaries define the discoverable country selectors. */
export async function readHistoryCountryTargets(database: DatabaseRuntime, teams: boolean, venues: boolean, limit: number) {
  const source = createFootballHistorySource(database);
  const [teamCountries, leagueCountries] = await Promise.all([
    source.latestPage({ endpoint: "teamCountries", parameters: {} }),
    venues ? source.latestPage({ endpoint: "countries", parameters: {} }) : null,
  ]);
  const targets: FootballHistoryReferenceTarget[] = [];
  if (!teamCountries) targets.push({ endpoint: "teamCountries" });
  if (venues && !leagueCountries) targets.push({ endpoint: "countries" });
  let hasMoreTargets = !teamCountries || (venues && !leagueCountries);
  const countries = (page: typeof teamCountries) => {
    if (!page) return [];
    if (page.contract !== API_FOOTBALL_CONTRACT_VERSION) throw new Error("The archived provider country dictionary has an unsupported contract.");
    return page.rows.map((row) => {
      const name = row && typeof row === "object" && "name" in row && typeof row.name === "string" ? row.name.trim() : "";
      if (!apiFootballReferenceParameters({ endpoint: "teamsByCountry", country: name })) {
        throw new Error("The archived provider country dictionary has an invalid country.");
      }
      return name;
    });
  };
  const teamNames = countries(teamCountries);
  const candidates = [
    ...(teams ? [{ endpoint: "teamsByCountry", names: new Set(teamNames) } as const] : []),
    ...(venues ? [{ endpoint: "venuesByCountry", names: new Set([...teamNames, ...countries(leagueCountries)]) } as const] : []),
  ].filter(({ names }) => names.size > 0);
  if (!candidates.length) return { targets, hasMoreTargets };

  const existing = await database.query((client) => client.footballHistorySourcePage.findMany({
    where: { contract: API_FOOTBALL_CONTRACT_VERSION, OR: candidates.map(({ endpoint, names }) => ({
      endpoint, selectorHash: { in: [...names].map(countryHash) },
    })) },
    distinct: ["endpoint", "selectorHash"], select: { endpoint: true, selectorHash: true },
  }));
  const covered = new Set(existing.map(({ endpoint, selectorHash }) => `${endpoint}:${selectorHash}`));
  const queues = candidates.map(({ endpoint, names }) => {
    const pending = [...names].sort().filter((name) => !covered.has(`${endpoint}:${countryHash(name)}`));
    hasMoreTargets ||= pending.length > limit;
    return pending.slice(0, limit).map((country) => ({ endpoint, country }));
  });
  for (let index = 0; index < Math.max(...queues.map((queue) => queue.length)); index++) {
    for (const queue of queues) {
      const target = queue[index];
      if (target) targets.push(target);
    }
  }
  return { targets, hasMoreTargets };
}
