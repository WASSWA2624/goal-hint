import type { LiveClock } from "./match-card.ts";
import type { StoredMatchFeedRecord } from "./match-feed.ts";
import { isPlayedFinalStatus, settleMarketSelection, type SettlementStatus } from "./market-settlement.ts";
import type { MarketFamily, MarketSelection } from "./markets.ts";
import type { SavedSlipResult } from "./saved-slips.ts";
import type { BuiltSlip, SlipForecastReference, SlipSelection } from "./slip-builder.ts";

/** Current presentation facts stay outside the immutable saved/publication snapshot. */
export type SlipMatchState = Readonly<{
  fixtureId: string; family: MarketFamily; selection: MarketSelection; forecast?: SlipForecastReference;
  status: SettlementStatus; score: Readonly<{ home: number; away: number }> | null; liveClock: LiveClock | null;
  outcome: "correct" | "incorrect" | "pending" | "void";
}>;
export type SlipMatchProgress = Pick<SlipMatchState, "score" | "liveClock">;
type SelectionIdentity = Pick<SlipSelection, "fixtureId" | "family" | "selection" | "forecast">;

const stateIndexes = new WeakMap<readonly SlipMatchState[], ReadonlyMap<string, readonly SlipMatchState[]>>();

function groupByFixture<T extends { fixtureId: string }>(records: readonly T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const record of records) {
    const group = index.get(record.fixtureId);
    if (group) group.push(record); else index.set(record.fixtureId, [record]);
  }
  return index;
}

/** Immutable observation snapshots share their fixture index across every slip and leg. */
function indexedStates(states: readonly SlipMatchState[]): ReadonlyMap<string, readonly SlipMatchState[]> {
  const existing = stateIndexes.get(states);
  if (existing) return existing;
  const index = groupByFixture(states);
  stateIndexes.set(states, index);
  return index;
}

function matchesSelection(selection: SelectionIdentity, state: Pick<SlipMatchState, "fixtureId" | "family" | "selection" | "forecast">) {
  const original = selection.forecast, supplied = state.forecast;
  return state.fixtureId === selection.fixtureId && state.family === selection.family && state.selection === selection.selection
    && (original ? supplied?.cycleId === original.cycleId && supplied.revisionId === original.revisionId
      && supplied.publishedAt === original.publishedAt : supplied === undefined);
}

/** A replacement cycle or another pick on the same fixture can never populate this row. */
export function slipMatchStateForSelection(selection: SelectionIdentity, states: readonly SlipMatchState[] = []): SlipMatchState | undefined {
  if (!states.length) return undefined;
  return indexedStates(states).get(selection.fixtureId)?.find((state) => matchesSelection(selection, state));
}

const validScore = (home: number | null | undefined, away: number | null | undefined) =>
  Number.isSafeInteger(home) && home! >= 0 && home! <= 1000 && Number.isSafeInteger(away) && away! >= 0 && away! <= 1000;

/** Reuses original-cycle result adjudication; live scores never settle a selection early. */
export function slipMatchStatesFromResults(selections: readonly SelectionIdentity[], results: readonly SavedSlipResult[]): readonly SlipMatchState[] {
  const resultsByFixture = groupByFixture(results);
  return selections.flatMap<SlipMatchState>((selection) => {
    const result = resultsByFixture.get(selection.fixtureId)?.find((candidate) => candidate.family !== undefined && candidate.selection !== undefined
      && matchesSelection(selection, { ...candidate, family: candidate.family, selection: candidate.selection }));
    if (!result) return [];
    const final = isPlayedFinalStatus(result.status), verified = final && result.regulationVerified
      && validScore(result.regulationHome, result.regulationAway);
    const regulation = verified ? { home: result.regulationHome!, away: result.regulationAway! } : null;
    const live = result.status === "live" && validScore(result.progress?.score?.home, result.progress?.score?.away)
      ? result.progress!.score : null;
    const settled = result.completed === true ? settleMarketSelection(selection.family, selection.selection, {
      status: result.status, cycleEligibility: result.cycleEligibility ?? { eligible: true },
      regulationScore: regulation ? { ...regulation, verified: true, period: "regulation-including-stoppage-time" } : null,
    }).status : "pending";
    return [{ fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
      ...(selection.forecast ? { forecast: selection.forecast } : {}), status: result.status,
      score: final ? regulation : live, liveClock: result.status === "live" ? result.progress?.liveClock ?? null : null,
      outcome: settled === "correct" || settled === "incorrect" || settled === "void" ? settled : "pending" }];
  });
}

/** The builder already reads a validated scheduled cohort; no extra storage or provider read is needed. */
export function scheduledSlipMatchStates(slips: readonly BuiltSlip[], records: readonly StoredMatchFeedRecord[]): readonly SlipMatchState[] {
  const states: SlipMatchState[] = [];
  const seen = new Map<string, SlipMatchState[]>();
  const source = new Map(records.map((record) => [record.fixtureId, record]));
  for (const selection of slips.flatMap((slip) => slip.selections)) {
    if (seen.get(selection.fixtureId)?.some((state) => matchesSelection(selection, state))) continue;
    const record = source.get(selection.fixtureId), reference = selection.forecast;
    if (!record || record.status !== "scheduled" || record.kickoffAt !== selection.kickoffAt
      || record.homeTeam.id !== selection.homeTeam.id || record.awayTeam.id !== selection.awayTeam.id
      || reference && (record.cycleId !== reference.cycleId || record.forecast?.revisionId !== reference.revisionId
        || record.forecast.publishedAt !== reference.publishedAt)) continue;
    const state: SlipMatchState = { fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
      ...(reference ? { forecast: reference } : {}), status: "scheduled", score: null, liveClock: null, outcome: "pending" };
    states.push(state);
    const group = seen.get(selection.fixtureId);
    if (group) group.push(state); else seen.set(selection.fixtureId, [state]);
  }
  return states;
}
