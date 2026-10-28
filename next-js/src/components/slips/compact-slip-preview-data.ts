import type { BuiltSlip, SlipSelection } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";

export const compactSlipScenarios = [
  { id: "standard", label: "Typical slip" },
  { id: "long-names", label: "Long names" },
  { id: "eight", label: "8 selections" },
  { id: "settled", label: "Saved results" },
] as const;

export type CompactSlipScenario = typeof compactSlipScenarios[number]["id"];

const selections: readonly SlipSelection[] = [
  {
    fixtureId: "preview-arsenal-chelsea", kickoffAt: Date.parse("2026-10-28T18:00:00Z"),
    homeTeam: { id: "preview-arsenal", name: "Arsenal", logoUrl: null },
    awayTeam: { id: "preview-chelsea", name: "Chelsea", logoUrl: null },
    competition: { id: "preview-england", name: "Premier League", country: "England" },
    family: "match-result", selection: "home-win", probability: 0.762, odds: "1.72", oddsBasis: "median",
  },
  {
    fixtureId: "preview-inter-napoli", kickoffAt: Date.parse("2026-10-28T19:45:00Z"),
    homeTeam: { id: "preview-inter", name: "Inter Milan", logoUrl: null },
    awayTeam: { id: "preview-napoli", name: "Napoli", logoUrl: null },
    competition: { id: "preview-italy", name: "Serie A", country: "Italy" },
    family: "total-goals", selection: "over-2.5", probability: 0.817, odds: "1.42", oddsBasis: "median",
  },
  {
    fixtureId: "preview-sporting-braga", kickoffAt: Date.parse("2026-10-29T21:00:00Z"),
    homeTeam: { id: "preview-sporting", name: "Sporting CP", logoUrl: null },
    awayTeam: { id: "preview-braga", name: "Braga", logoUrl: null },
    competition: { id: "preview-portugal", name: "Primeira Liga", country: "Portugal" },
    family: "both-teams-to-score", selection: "yes", probability: 0.694, odds: "1.68", oddsBasis: "median",
  },
];

/** Illustrative records only: the gallery never requests published or subscriber selections. */
export function compactSlipPreview(scenario: CompactSlipScenario): { slip: BuiltSlip; results?: SavedSlipView["results"] } {
  const matches = scenario === "eight" ? Array.from({ length: 8 }, (_, index): SlipSelection => ({
    ...selections[index % selections.length]!, fixtureId: `preview-eight-${index}`,
    kickoffAt: selections[index % selections.length]!.kickoffAt + Math.floor(index / 3) * 86_400_000,
    ...(index === 3 ? { family: "double-chance", selection: "home-or-draw", probability: 0.889, odds: "1.25" } : {}),
  })) : selections.map((selection, index) => scenario === "long-names" ? {
    ...selection,
    homeTeam: { ...selection.homeTeam, name: ["Wolverhampton Wanderers", "Borussia Mönchengladbach", "Club Athletico Paranaense"][index]! },
    awayTeam: { ...selection.awayTeam, name: ["Brighton & Hove Albion", "1. FC Heidenheim 1846", "Red Bull Bragantino"][index]! },
    competition: { ...selection.competition, name: "International Club Championship — Qualification" },
  } : selection);
  const slip: BuiltSlip = {
    id: `compact-preview-${scenario}`, selections: matches, oddsBasis: "median",
    totalOdds: matches.reduce((product, match) => product * Number(match.odds), 1).toFixed(2),
    averageProbability: matches.reduce((sum, match) => sum + match.probability, 0) / matches.length,
  };
  return scenario === "settled" ? { slip, results: [
    { fixtureId: matches[0]!.fixtureId, home: 2, away: 1, outcome: "correct" },
    { fixtureId: matches[1]!.fixtureId, home: 0, away: 0, outcome: "incorrect" },
    { fixtureId: matches[2]!.fixtureId, home: null, away: null, outcome: "void" },
  ] } : { slip };
}
