import type { CompactSlipScenario } from "./compact-slip-preview-data";
import { compactSlipPreview } from "./compact-slip-preview-data";

const crests = ["azure", "red", "green", "ink"] as const;

/** Copies only review records; generic local crests do not change the mobile samples or live data. */
export function desktopSlipPreview(scenario: CompactSlipScenario = "standard") {
  const sample = compactSlipPreview(scenario);
  const displayNames = [
    { home: "Arsenal", away: "Chelsea", league: "Premier League", country: "England" },
    { home: "Wolverhampton Wanderers", away: "Brighton & Hove Albion", league: "International Club Championship — Qualification", country: "United Arab Emirates" },
    { home: "Borussia Mönchengladbach", away: "1. FC Heidenheim 1846", league: "Bundesliga", country: "Germany" },
  ];
  return { ...sample, slip: { ...sample.slip, selections: sample.slip.selections.map((selection, index) => ({
    ...selection,
    homeTeam: { ...selection.homeTeam, ...(scenario === "standard" ? { name: displayNames[index]!.home } : {}), logoUrl: `/design/slip-desktop/${crests[index % crests.length]}.svg` },
    awayTeam: { ...selection.awayTeam, ...(scenario === "standard" ? { name: displayNames[index]!.away } : {}), logoUrl: `/design/slip-desktop/${crests[(index + 1) % crests.length]}.svg` },
    competition: { ...selection.competition, ...(scenario === "standard" ? { name: displayNames[index]!.league, country: displayNames[index]!.country } : {}), logoUrl: "/design/slip-desktop/league.svg" },
  })) } };
}
