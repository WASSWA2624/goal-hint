import { presentMarketProbabilities, type AcceptedMarket, type MarketFamily, type MarketSelection } from "./markets.ts";
import type { FixtureSnapshot, liveClockPhases } from "./fixture-snapshot.ts";
import { isPlayedFinalStatus, type SettlementOutcomeStatus } from "./market-settlement.ts";

export function teamInitials(name: string | null): string {
  const words = name?.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = words[0];
  if (!first) return "?";
  const last = words.length > 1 ? words.at(-1)! : first;
  const initials = words.length > 1 ? [...first][0]! + [...last][0]! : [...first].slice(0, 2).join("");
  return [...initials.toUpperCase()].slice(0, 2).join("");
}

export function probabilityEntry(market: AcceptedMarket, selection: MarketSelection = market.selection) {
  const entry = presentMarketProbabilities(market).entries.find((item) => item.selection === selection);
  if (!entry) throw new RangeError("Probability selection does not belong to this market.");
  return entry;
}

/** Present supplied facts only; the card never adjudicates a score or combines families. */
export function selectedCardPrediction(fixture: FixtureSnapshot, family: MarketFamily = "match-result") {
  const forecast = fixture.forecast;
  const item = forecast?.markets.find((entry) => entry.market.family === family);
  if (!forecast || !item) return null;
  const probability = probabilityEntry(item.market);
  const supplied = item.outcome;
  const matched = supplied && supplied.cycleId === fixture.cycleId && supplied.revisionId === forecast.revisionId &&
    supplied.selection === item.market.selection &&
    (!["correct", "incorrect"].includes(supplied.status) || isPlayedFinalStatus(fixture.status));
  const status: SettlementOutcomeStatus = matched ? supplied.status : "pending";
  return { item, probability, publishedAt: forecast.publishedAt, status,
    explanation: matched ? supplied.explanation : null, provisional: forecast.provisional ?? true,
    updateDelayed: forecast.updateDelayed === true };
}

/**
 * Whether a card renders a refreshed record exactly as before. A version bump replaces the whole
 * record; at an equal version only the fields `mergeFixtureObservation` refreshes can differ.
 * Keep this list in step with it. `syncedAt` is not shown on cards. Team names, codes and logos are
 * not compared: a catalog change to a shared team bumps the version of every fixture that renders it.
 */
export function sameCardFixture(previous: FixtureSnapshot, next: FixtureSnapshot): boolean {
  return previous === next || previous.fixtureId === next.fixtureId && previous.dataVersion === next.dataVersion &&
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
  const pick = fixture.forecast?.markets.find((entry) => entry.market.family === family);
  const price = fixture.prices?.find((entry) => entry.family === family);
  return pick && price && price.selection === pick.market.selection ? price : null;
}

export type LiveClock = { phase: (typeof liveClockPhases)[number]; minute: number | null };
const providerClockPhases: Readonly<Record<string, LiveClock["phase"]>> = Object.freeze({
  "1H": "first-half", HT: "half-time", "2H": "second-half", ET: "extra-time", BT: "break",
  P: "penalties", INT: "interrupted", SUSP: "suspended", LIVE: "in-play",
});
const runningPhases: ReadonlySet<LiveClock["phase"]> = new Set(["first-half", "second-half", "extra-time", "in-play"]);

/** Paused phases never show a stale minute; an unmapped in-play code stays generic. */
export function liveClockFromProvider(providerStatus: string | null, elapsedMinutes: number | null): LiveClock {
  const phase = providerStatus !== null && Object.hasOwn(providerClockPhases, providerStatus) ? providerClockPhases[providerStatus]! : "in-play";
  const minute = runningPhases.has(phase) && Number.isSafeInteger(elapsedMinutes) && elapsedMinutes! >= 0 && elapsedMinutes! <= 200
    ? elapsedMinutes : null;
  return { phase, minute };
}

export { isPlayedFinalStatus as hasFinalScoreStatus } from "./market-settlement.ts";
