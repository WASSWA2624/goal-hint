import { parseReportingDate } from "@/domain/calendar";
import { defaultSlipCriteria, serializeSlipCriteria, type BuiltSlip, type SlipSelection } from "@/domain/slip-builder";
import { sharedSlipSchema, sharedSlipUrl, type SharedSlip, type ShareSlipSource } from "@/domain/shared-slips";

export const scenarios = ["builder", "best", "shared", "unauthorized", "changed", "failure", "long"] as const;
export type Scenario = typeof scenarios[number];
export const today = parseReportingDate("2026-10-29");
export const createdAt = "2026-10-29T09:00:00.000Z";
const examples = [
  { home: "Arsenal", away: "Chelsea", league: "Premier League", country: "England", family: "match-result", selection: "home-win", odds: "1.72", probability: 0.762 },
  { home: "Inter Milan", away: "Napoli", league: "Serie A", country: "Italy", family: "total-goals", selection: "over-2.5", odds: "1.42", probability: 0.817 },
  { home: "Sporting CP", away: "Braga", league: "Primeira Liga", country: "Portugal", family: "both-teams-to-score", selection: "yes", odds: "1.68", probability: 0.694 },
] as const;
const uuid = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

export function fixtureSlip(scenario: Scenario = "builder"): BuiltSlip {
  const count = scenario === "long" ? 800 : 3;
  const selections = Array.from({ length: count }, (_, index): SlipSelection => {
    const example = examples[index % examples.length]!;
    return { fixtureId: uuid(index + 1), kickoffAt: Date.parse("2026-10-29T15:30:00Z") + index * 60000,
      homeTeam: { id: uuid(index * 2 + 1000), name: example.home }, awayTeam: { id: uuid(index * 2 + 1001), name: example.away },
      competition: { id: `fixture-league-${index % 3}`, name: example.league, country: example.country },
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
