import { utcInstantFromEpochMilliseconds } from "./calendar.ts";
import type { FixtureSnapshot } from "./fixture-snapshot.ts";
import type { CardSnapshotPick } from "./match-card.ts";
import type { SavedSlipView } from "./saved-slips.ts";
import type { SlipSelection } from "./slip-builder.ts";

/** A slip retains its original names, kickoff, pick and price. Current match data must not overwrite that record. */
export function slipSelectionCard(selection: SlipSelection, result?: SavedSlipView["results"][number]): {
  fixture: FixtureSnapshot; snapshotPick: CardSnapshotPick;
} {
  const outcome = result?.fixtureId === selection.fixtureId ? result : undefined;
  return {
    fixture: {
      fixtureId: selection.fixtureId, dataVersion: "1", homeTeam: selection.homeTeam, awayTeam: selection.awayTeam,
      competition: selection.competition, kickoffAt: utcInstantFromEpochMilliseconds(selection.kickoffAt), syncedAt: null,
      // Saved legs contain no live phase or fixture status. A supplied regulation score stays explicitly a snapshot.
      status: "unknown", score: outcome?.home !== null && outcome?.home !== undefined && outcome.away !== null
        ? { home: outcome.home, away: outcome.away } : null,
      scorePeriod: "regulation", cycleId: selection.forecast?.cycleId ?? null, forecast: null,
    },
    snapshotPick: { family: selection.family, selection: selection.selection, probability: selection.probability,
      odds: selection.odds, outcome: outcome?.outcome ?? "pending",
      ...(selection.forecast ? { publishedAt: utcInstantFromEpochMilliseconds(selection.forecast.publishedAt) } : {}) },
  };
}
