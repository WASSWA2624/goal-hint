import { parseReportingDate } from "@/domain/calendar";
import { defaultSlipCriteria, serializeSlipCriteria, type BuiltSlip, type SlipSelection } from "@/domain/slip-builder";
import { sharedSlipSchema, sharedSlipUrl, type SharedSlip, type ShareSlipSource } from "@/domain/shared-slips";

export const scenarios = ["builder", "best", "shared", "unauthorized", "changed", "failure", "long", "badges", "scores", "demo-badges", "missing-logos", "remote-badges"] as const;
export type Scenario = typeof scenarios[number];
export const today = parseReportingDate("2026-10-29");
export const createdAt = "2026-10-29T09:00:00.000Z";
const examples = [
  { home: "Arsenal", away: "Chelsea", homeBadge: 42, awayBadge: 49, leagueBadge: 39, league: "Premier League", country: "England", family: "match-result", selection: "home-win", odds: "1.72", probability: 0.762 },
  { home: "Inter Milan", away: "Napoli", homeBadge: 505, awayBadge: 492, leagueBadge: 135, league: "Serie A", country: "Italy", family: "total-goals", selection: "over-2.5", odds: "1.42", probability: 0.817 },
  { home: "Sporting CP", away: "Braga", homeBadge: 228, awayBadge: 217, leagueBadge: 94, league: "Primeira Liga", country: "Portugal", family: "both-teams-to-score", selection: "yes", odds: "1.68", probability: 0.694 },
] as const;
const uuid = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const demoExamples = [
  { home: "Nashville United", away: "Boston City", league: "Major League Soccer", country: "USA", code: "us" },
  { home: "Busan United", away: "Daegu City", league: "K League 1", country: "South Korea", code: "kr" },
  { home: "Mecca United", away: "Jeddah City", league: "Pro League", country: "Saudi Arabia", code: "sa" },
  { home: "Iasi United", away: "Oradea United", league: "Liga I", country: "Romania", code: "ro" },
  { home: "Sligo United", away: "Drogheda United", league: "Premier Division", country: "Ireland", code: "ie" },
  { home: "Arnhem City", away: "Amsterdam United", league: "Eredivisie", country: "Netherlands", code: "nl" },
] as const;

export function fixtureSlip(scenario: Scenario = "builder"): BuiltSlip {
  const count = scenario === "long" ? 800 : scenario === "demo-badges" ? 6 : 3;
  const badges = scenario === "badges" || scenario === "scores";
  const selections = Array.from({ length: count }, (_, index): SlipSelection => {
    const example = examples[index % examples.length]!;
    const demo = scenario === "demo-badges" ? demoExamples[index]! : undefined;
    const code = demo?.code ?? ["gb", "it", "pt"][index % 3];
    const local = `https://media.api-sports.io/flags/${code}.svg`, remote = "https://static.match-card.test/crest.png";
    return { fixtureId: uuid(index + 1), kickoffAt: Date.parse("2026-10-29T15:30:00Z") + index * 60000,
      homeTeam: { id: uuid(index * 2 + 1000), name: demo?.home ?? example.home,
        ...(scenario === "missing-logos" ? {} : { logoUrl: badges ? `https://media.api-sports.io/football/teams/${example.homeBadge}.png`
          : demo ? `https://media.api-sports.io/flags/${code}.svg` : scenario === "remote-badges" ? remote : local }) },
      awayTeam: { id: uuid(index * 2 + 1001), name: demo?.away ?? example.away,
        logoUrl: badges ? `https://media.api-sports.io/football/teams/${example.awayBadge}.png`
          : demo ? `https://media.api-sports.io/flags/${code}.svg` : scenario === "remote-badges" ? remote : local },
      competition: { id: `fixture-league-${index % 3}`, name: demo?.league ?? example.league, country: demo?.country ?? example.country,
        logoUrl: badges ? `https://media.api-sports.io/football/leagues/${example.leagueBadge}.png`
          : demo ? `https://flagcdn.com/w80/${code}.png` : scenario === "remote-badges" ? remote : local },
      family: example.family, selection: example.selection, odds: scenario === "long" ? "1.01" : example.odds,
      probability: example.probability, oddsBasis: "bookmaker" };
  });
  const product = selections.reduce((value, item) => value * BigInt(item.odds.replace(".", "")), 1n);
  const denominator = 100n ** BigInt(selections.length);
  const cents = (product * 200n + denominator) / (denominator * 2n);
  return { id: `share-fixture-${scenario}`, selections, totalOdds: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`,
    averageProbability: selections.reduce((sum, item) => sum + item.probability, 0) / count, oddsBasis: "bookmaker" };
}

export function fixtureShared(scenario: Scenario = "builder"): SharedSlip {
  const id = scenario === "shared" ? "e".repeat(32) : String(scenarios.indexOf(scenario) + 1).padStart(32, "0");
  return sharedSlipSchema.parse({ id, url: sharedSlipUrl(id), createdAt, slip: fixtureSlip(scenario) });
}

export function fixtureSource(scenario: Scenario): ShareSlipSource {
  const slipId = fixtureSlip(scenario).id;
  return scenario === "best" ? { source: "best", day: today, slipId }
    : { source: "builder", criteria: serializeSlipCriteria(defaultSlipCriteria(today)).toString(), slipId };
}
