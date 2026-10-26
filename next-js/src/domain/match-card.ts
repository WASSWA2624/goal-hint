import { presentMarketProbabilities, type AcceptedMarket, type MarketFamily, type MarketSelection } from "./markets.ts";
import type { FixtureSnapshot, liveClockPhases } from "./fixture-snapshot.ts";
import { isPlayedFinalStatus, selectionOccurred, type SettlementOutcomeStatus } from "./market-settlement.ts";
import { recommendationMarket, type DisplayedMarketPick } from "./recommendation-view.ts";

export function teamInitials(name: string | null): string {
  const words = name?.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = words[0];
  if (!first) return "?";
  const last = words.length > 1 ? words.at(-1)! : first;
  const initials = words.length > 1 ? [...first][0]! + [...last][0]! : [...first].slice(0, 2).join("");
  return [...initials.toUpperCase()].slice(0, 2).join("");
}

export function probabilityEntry(market: AcceptedMarket | DisplayedMarketPick, selection: MarketSelection = market.selection) {
  const original = "presentationOf" in market ? market.presentationOf : market;
  if (original !== market && (market.family !== original.family || market.ruleVersion !== original.ruleVersion ||
    market.source !== original.source || market.period !== original.period ||
    market.selectedProbability !== (original.probabilities as Readonly<Record<string, number>>)[market.selection] ||
    Object.keys(market.probabilities).length !== Object.keys(original.probabilities).length ||
    Object.entries(original.probabilities).some(([key, value]) => (market.probabilities as Readonly<Record<string, number>>)[key] !== value) ||
    (market.family === "total-goals" && original.family === "total-goals" && market.line !== original.line) ||
    (market.family === "double-chance" && original.family === "double-chance" && market.derivedFrom !== original.derivedFrom))) {
    throw new RangeError("Recommendation presentation must preserve its original forecast.");
  }
  const entry = presentMarketProbabilities(original).entries.find((item) => item.selection === selection);
  if (!entry) throw new RangeError("Probability selection does not belong to this market.");
  return entry;
}

/** Present supplied facts only; the card never adjudicates a score or combines families. */
export function selectedCardPrediction(fixture: FixtureSnapshot, family: MarketFamily = "match-result") {
  const forecast = fixture.forecast;
  if (forecast && "gated" in forecast) return null;
  if (forecast?.recommendation?.status === "no-qualified-recommendation") return null;
  const item = forecast?.markets.find((entry) => entry.market.family === family);
  if (!forecast || !item) return null;
  const selected = recommendationMarket(item.market, forecast.recommendation);
  const probability = probabilityEntry(item.market, selected.selection);
  const supplied = item.outcome;
  const matched = supplied && supplied.cycleId === fixture.cycleId && supplied.revisionId === forecast.revisionId &&
    supplied.selection === selected.selection &&
    (!["correct", "incorrect"].includes(supplied.status) || isPlayedFinalStatus(fixture.status));
  const recommendationSettled = selected.selection !== item.market.selection && supplied &&
    supplied.cycleId === fixture.cycleId && supplied.revisionId === forecast.revisionId &&
    ["correct", "incorrect"].includes(supplied.status) && fixture.cycle?.mode === "locked" &&
    isPlayedFinalStatus(fixture.status) && fixture.scorePeriod === "regulation" && fixture.score !== null;
  const status: SettlementOutcomeStatus = matched ? supplied.status : recommendationSettled
    ? selectionOccurred(selected.selection, fixture.score!.home, fixture.score!.away) ? "correct" : "incorrect" : "pending";
  return { item: selected === item.market ? item : { ...item, market: selected }, probability, publishedAt: forecast.publishedAt, status,
    explanation: matched ? supplied.explanation : null, provisional: forecast.provisional ?? true,
    updateDelayed: forecast.updateDelayed === true };
}

/** Upcoming describes the fixture, without changing the selected market's audited settlement. */
export function cardResultStatus(status: FixtureSnapshot["status"], outcome: SettlementOutcomeStatus | "unavailable") {
  return status === "scheduled" ? "upcoming" : outcome;
}

/**
 * Whether a card renders a refreshed record exactly as before. A version bump replaces the whole
 * record; at an equal version only the fields `mergeFixtureObservation` refreshes can differ.
 * Keep this list in step with it. `syncedAt` is not shown on cards. Team names, codes and logos are
 * not compared: a catalog change to a shared team bumps the version of every fixture that renders it.
 */
export function sameCardFixture(previous: FixtureSnapshot, next: FixtureSnapshot): boolean {
  return previous === next || previous.fixtureId === next.fixtureId && previous.dataVersion === next.dataVersion &&
    !!(previous.forecast && "gated" in previous.forecast) === !!(next.forecast && "gated" in next.forecast) &&
    previous.partialCoverage === next.partialCoverage && previous.availabilityMessage === next.availabilityMessage &&
    previous.update?.prediction === next.update?.prediction && previous.update?.result === next.update?.result &&
    previous.forecast?.updateDelayed === next.forecast?.updateDelayed && samePrices(previous.prices, next.prices);
}
function samePrices(previous: FixtureSnapshot["prices"], next: FixtureSnapshot["prices"]): boolean {
  const left = previous ?? [], right = next ?? [];
  return left.length === right.length && left.every((item, index) => {
    const other = right[index]!;
    return item.family === other.family && item.selection === other.selection && item.price === other.price &&
      item.basis === other.basis && item.retrievedAt === other.retrievedAt && item.providerUpdatedAt === other.providerUpdatedAt;
  });
}

/** The market price for exactly the shown pick's family and selection (052). Never falls back to another
 * family, line or selection: no price means none is shown. */
export function selectedCardPrice(fixture: FixtureSnapshot, family: MarketFamily) {
  if (fixture.forecast && "gated" in fixture.forecast) return null;
  const pick = fixture.forecast?.markets.find((entry) => entry.market.family === family);
  const price = fixture.prices?.find((entry) => entry.family === family);
  const selected = pick && recommendationMarket(pick.market, fixture.forecast?.recommendation);
  return selected && price && price.selection === selected.selection ? price : null;
}

export type LiveClock = { phase: (typeof liveClockPhases)[number]; minute: number | null; stoppageMinutes?: number | null };
const providerClockPhases: Readonly<Record<string, LiveClock["phase"]>> = Object.freeze({
  "1H": "first-half", HT: "half-time", "2H": "second-half", ET: "extra-time", BT: "break",
  P: "penalties", INT: "interrupted", SUSP: "suspended", LIVE: "in-play",
});
const runningPhases: ReadonlySet<LiveClock["phase"]> = new Set(["first-half", "second-half", "extra-time", "in-play"]);

/** Paused phases never show a stale minute; an unmapped in-play code stays generic. */
export function liveClockFromProvider(providerStatus: string | null, elapsedMinutes: number | null, stoppageMinutes?: number | null): LiveClock {
  const phase = providerStatus !== null && Object.hasOwn(providerClockPhases, providerStatus) ? providerClockPhases[providerStatus]! : "in-play";
  const minute = runningPhases.has(phase) && Number.isSafeInteger(elapsedMinutes) && elapsedMinutes! >= 0 && elapsedMinutes! <= 200
    ? elapsedMinutes : null;
  const stoppage = minute !== null && Number.isSafeInteger(stoppageMinutes) && stoppageMinutes! > 0 && stoppageMinutes! <= 1000
    ? stoppageMinutes! : null;
  return { phase, minute, ...(stoppage !== null ? { stoppageMinutes: stoppage } : {}) };
}

export { isPlayedFinalStatus as hasFinalScoreStatus } from "./market-settlement.ts";
