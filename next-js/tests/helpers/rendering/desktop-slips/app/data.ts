import type { BuiltSlip, SlipSelection } from "@/domain/slip-builder";
import type { SavedSlipView } from "@/domain/saved-slips";
import type { SlipMatchState } from "@/domain/slip-match-state";

const selections: readonly SlipSelection[] = [
  {
    fixtureId: "desktop-fixture-short", kickoffAt: Date.parse("2026-10-28T18:00:00Z"),
    homeTeam: { id: "desktop-home", name: "Ajax", logoUrl: "/design/slip-desktop/azure.svg" },
    awayTeam: { id: "desktop-away", name: "PSV", logoUrl: "/design/slip-desktop/red.svg" },
    competition: { id: "desktop-league", name: "Synthetic Premier League", country: "England", logoUrl: "/design/slip-desktop/league.svg" },
    family: "match-result", selection: "home-win", probability: 0.82, odds: "2.00", oddsBasis: "bookmaker",
  },
  {
    fixtureId: "desktop-fixture-midnight", kickoffAt: Date.parse("2026-10-29T21:00:00Z"),
    homeTeam: { id: "desktop-second-home", name: "Original Inter", logoUrl: "/design/slip-desktop/ink.svg" },
    awayTeam: { id: "desktop-second-away", name: "Original Napoli", logoUrl: "/design/slip-desktop/green.svg" },
    competition: { id: "desktop-second-league", name: "Synthetic Serie A", country: "Italy", logoUrl: "/design/slip-desktop/league.svg" },
    family: "total-goals", selection: "under-2.5", probability: 0.6173, odds: "7.73", oddsBasis: "bookmaker",
  },
  {
    fixtureId: "desktop-fixture-long", kickoffAt: Date.parse("2026-10-30T15:30:00Z"),
    homeTeam: { id: "desktop-long-home", name: "Synthetic Metropolitan International Athletic Football Club", logoUrl: "/design/slip-desktop/red.svg" },
    awayTeam: { id: "desktop-long-away", name: "Synthetic Coastal Union Championship Sporting Association", logoUrl: "/design/slip-desktop/azure.svg" },
    competition: { id: "desktop-long-league", name: "Synthetic International Club Championship — Qualification", country: "United Arab Emirates", logoUrl: "/design/slip-desktop/league.svg" },
    family: "both-teams-to-score", selection: "yes", probability: 0.734, odds: "1.42", oddsBasis: "bookmaker",
  },
];

export const desktopSlip: BuiltSlip = {
  id: "desktop-original-slip", selections, totalOdds: "21.95", oddsBasis: "bookmaker",
  averageProbability: selections.reduce((sum, selection) => sum + selection.probability, 0) / selections.length,
};

export const savedResults: SavedSlipView["results"] = [
  { fixtureId: selections[0]!.fixtureId, home: 2, away: 1, outcome: "correct" },
  { fixtureId: selections[1]!.fixtureId, home: 4, away: 0, outcome: "incorrect" },
  { fixtureId: selections[2]!.fixtureId, home: null, away: null, outcome: "void" },
];

const stateSelections = [0, 1, 2, 0, 2].map((source, index): SlipSelection => ({
  ...selections[source]!, fixtureId: `desktop-state-${index}`,
}));

/** Original pre-match facts are separate from these explicitly supplied fixture observations. */
export const stateSlip: BuiltSlip = {
  id: "desktop-state-slip", selections: stateSelections, oddsBasis: "bookmaker",
  totalOdds: stateSelections.reduce((product, item) => product * Number(item.odds), 1).toFixed(2),
  averageProbability: stateSelections.reduce((sum, item) => sum + item.probability, 0) / stateSelections.length,
};

export const matchStates: readonly SlipMatchState[] = stateSelections.map((selection, index) => ({
  fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
  status: (["scheduled", "live", "live", "finished-regulation", "finished-regulation"] as const)[index]!,
  score: ([null, { home: 1, away: 0 }, { home: 1, away: 1 }, { home: 2, away: 1 }, { home: 0, away: 1 }] as const)[index]!,
  liveClock: index === 1 ? { phase: "first-half", minute: 30 } : index === 2 ? { phase: "half-time", minute: null } : null,
  outcome: index === 3 ? "correct" : index === 4 ? "incorrect" : "pending",
}));

/** UUID-bound original snapshots exercise the real desktop polling request contract. */
export const autoSlip: BuiltSlip = {
  ...desktopSlip, id: "desktop-auto-original", totalOdds: "8.00",
  selections: selections.map((selection, index): SlipSelection => ({
    ...selection, fixtureId: `00000000-0000-4000-8000-00000000a00${index + 1}`,
    family: "match-result", selection: "home-win", odds: "2.00",
    forecast: { cycleId: `00000000-0000-4000-8000-00000000b00${index + 1}`,
      revisionId: `00000000-0000-4000-8000-00000000c00${index + 1}`, publishedAt: Date.parse("2026-10-28T08:00:00Z") },
  })),
};

export const autoInitialStates: readonly SlipMatchState[] = autoSlip.selections.map((selection) => ({
  fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
  forecast: selection.forecast!, status: "scheduled", score: null, liveClock: null, outcome: "pending",
}));
