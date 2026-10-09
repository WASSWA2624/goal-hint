import { presentMarketProbabilities, type AcceptedMarket, type MarketFamily, type MarketSelection } from "./markets.ts";
import type { FixtureSnapshot } from "./fixture-snapshot.ts";
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

export { isPlayedFinalStatus as hasFinalScoreStatus } from "./market-settlement.ts";
