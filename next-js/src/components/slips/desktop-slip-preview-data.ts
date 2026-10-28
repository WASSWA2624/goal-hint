import type { BuiltSlip, SlipSelection } from "@/domain/slip-builder";
import type { SlipMatchState } from "@/domain/slip-match-state";
import { compactSlipPreview } from "./compact-slip-preview-data";

/** Illustrative presentation states belong only to the desktop design review. */
export type DesktopPreviewMatchState = Pick<SlipMatchState, "status" | "outcome" | "liveClock" | "score">;

export type DesktopSlipPreview = Readonly<{
  slip: BuiltSlip;
  states: Readonly<Record<string, DesktopPreviewMatchState>>;
}>;

const crests = ["azure", "red", "green", "ink"] as const;
const examples = [
  { home: "Ajax", away: "PSV", league: "Eredivisie", country: "Netherlands", source: 0,
    state: { status: "scheduled", outcome: "pending", liveClock: null, score: null } },
  { home: "Wolverhampton Wanderers", away: "Brighton & Hove Albion", league: "International Club Championship — Qualification", country: "United Arab Emirates", source: 1,
    state: { status: "live", outcome: "pending", liveClock: { phase: "first-half", minute: 30 }, score: { home: 1, away: 0 } } },
  { home: "Borussia Mönchengladbach", away: "1. FC Heidenheim 1846", league: "Bundesliga", country: "Germany", source: 0,
    state: { status: "live", outcome: "pending", liveClock: { phase: "half-time", minute: null }, score: { home: 1, away: 1 } } },
  { home: "Arsenal", away: "Chelsea", league: "Premier League", country: "England", source: 0,
    state: { status: "finished-regulation", outcome: "correct", liveClock: null, score: { home: 2, away: 1 } } },
  { home: "Sporting CP", away: "Braga", league: "Primeira Liga", country: "Portugal", source: 2,
    state: { status: "finished-regulation", outcome: "incorrect", liveClock: null, score: { home: 0, away: 1 } } },
] as const satisfies readonly (Readonly<{
  home: string; away: string; league: string; country: string; source: number; state: DesktopPreviewMatchState;
}>)[];

/** No live records or APIs: copies of review forecasts demonstrate every requested score/status state. */
export function desktopSlipPreview(): DesktopSlipPreview {
  const original = compactSlipPreview("standard").slip;
  const selections = examples.map((example, index): SlipSelection => {
    const selection = original.selections[example.source]!;
    return {
      ...selection, fixtureId: `desktop-status-preview-${index}`, kickoffAt: Date.parse("2026-10-28T15:00:00Z") + index * 900_000,
      homeTeam: { ...selection.homeTeam, id: `desktop-preview-home-${index}`, name: example.home, logoUrl: `/design/slip-desktop/${crests[index % crests.length]}.svg` },
      awayTeam: { ...selection.awayTeam, id: `desktop-preview-away-${index}`, name: example.away, logoUrl: `/design/slip-desktop/${crests[(index + 1) % crests.length]}.svg` },
      competition: { id: `desktop-preview-league-${index}`, name: example.league, country: example.country, logoUrl: "/design/slip-desktop/league.svg" },
    };
  });
  return {
    slip: {
      id: "desktop-status-preview", selections, oddsBasis: original.oddsBasis,
      totalOdds: selections.reduce((product, selection) => product * Number(selection.odds), 1).toFixed(2),
      averageProbability: selections.reduce((sum, selection) => sum + selection.probability, 0) / selections.length,
    },
    states: Object.fromEntries(selections.map((selection, index) => [selection.fixtureId, examples[index]!.state])),
  };
}
