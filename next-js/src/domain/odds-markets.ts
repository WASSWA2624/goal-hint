import { marketRules, type MarketFamily, type MarketSelection } from "./markets.ts";
import { deMargin, DE_MARGIN_METHOD, oddsDisplayHundredths, parseDecimalOdds, type DecimalOdds } from "./odds.ts";

/** Versioned mapping from provider bets to the four launch families. Pure and browser-safe. */
export const ODDS_MAPPING_VERSION = "launch-odds-v1";
export const LIVE_ODDS_MAPPING_VERSION = "launch-live-odds-v1";

export type LaunchOddsMapping = Readonly<{
  family: MarketFamily;
  /** Provider bet identity. A price exists only when this id AND name match both the latest stored
   * /odds/bets catalog and the /odds row; otherwise the family has no price. */
  betId: number;
  betName: string;
  /** Double chance covers each outcome twice, so its own group is normalized to 2. */
  coverage: 1 | 2;
  /** Line for line-based bets; labels embed it verbatim ("Over 2.5"). */
  line: string | null;
  /** Launch selection -> exact provider label. */
  selections: Readonly<Partial<Record<MarketSelection, string>>>;
}>;

/** The documented API-Football v3 bet identities (official examples). They stay unconfirmed until the
 * counted odds trial records the catalog; a mismatch with the stored catalog only withholds prices. */
export const launchOddsMapping: readonly LaunchOddsMapping[] = Object.freeze([
  Object.freeze({ family: "match-result", betId: 1, betName: "Match Winner", coverage: 1, line: null,
    selections: Object.freeze({ "home-win": "Home", draw: "Draw", "away-win": "Away" }) }),
  Object.freeze({ family: "double-chance", betId: 12, betName: "Double Chance", coverage: 2, line: null,
    selections: Object.freeze({ "home-or-draw": "Home/Draw", "away-or-draw": "Draw/Away", "home-or-away": "Home/Away" }) }),
  Object.freeze({ family: "total-goals", betId: 5, betName: "Goals Over/Under", coverage: 1, line: "2.5",
    selections: Object.freeze({ "over-2.5": "Over 2.5", "under-2.5": "Under 2.5" }) }),
  Object.freeze({ family: "both-teams-to-score", betId: 8, betName: "Both Teams Score", coverage: 1, line: null,
    selections: Object.freeze({ yes: "Yes", no: "No" }) }),
]);

/** Independent API-Football in-play IDs. Labels must agree with the live catalog and price response. */
export const launchLiveOddsMapping = Object.freeze({
  "match-result": Object.freeze({ id: 59, name: "Fulltime Result", line: null, labels: Object.freeze(["Home", "Draw", "Away"] as const) }),
  "double-chance": Object.freeze({ id: 72, name: "Double Chance", line: null, labels: Object.freeze(["Home or Draw", "Away or Draw", "Home or Away"] as const) }),
  "total-goals": Object.freeze({ id: 36, name: "Over/Under Line", line: String(marketRules.totalGoalsLine),
    labels: Object.freeze(["Over", "Under"] as const) }),
  "both-teams-to-score": Object.freeze({ id: 69, name: "Both Teams to Score", line: null, labels: Object.freeze(["Yes", "No"] as const) }),
} satisfies Record<MarketFamily, { id: number; name: string; line: string | null; labels: readonly string[] }>);

/** Existing exact-name mapping for binary match totals. No team, second-half or payout semantics are inferred. */
export const binaryGoalTotalOddsMapping = Object.freeze({
  "full-time": launchOddsMapping.find(({ family }) => family === "total-goals")!,
  "half-time": Object.freeze({ betId: 6, betName: "Goals Over/Under First Half" }),
});

export type OddsBetObservation = Readonly<{
  betId: number;
  betName: string | null;
  values: readonly Readonly<{ label: string; odd: string }>[];
}>;
export type LaunchOddsSelection = Readonly<{
  selection: MarketSelection;
  price: DecimalOdds;
  displayHundredths: number;
  impliedProbability: string;
}>;
export type LaunchOddsGroup = Readonly<{
  family: MarketFamily;
  betId: number;
  line: string | null;
  method: typeof DE_MARGIN_METHOD;
  mappingVersion: typeof ODDS_MAPPING_VERSION;
  overround: string;
  selections: readonly LaunchOddsSelection[];
}>;

/** Current bookmaker quotes can be used independently of a complete market-implied distribution. */
export function launchOddsQuotes(mapping: LaunchOddsMapping, bet: OddsBetObservation | undefined, catalogName: string | undefined):
  readonly Readonly<{ selection: MarketSelection; price: DecimalOdds }>[] {
  if (!bet || bet.betId !== mapping.betId || bet.betName !== mapping.betName || catalogName !== mapping.betName) return [];
  return (Object.entries(mapping.selections) as [MarketSelection, string][]).flatMap(([selection, label]) => {
    const matches = bet.values.filter((value) => value.label === label);
    const price = matches.length === 1 ? parseDecimalOdds(matches[0]!.odd) : null;
    return price ? [{ selection, price }] : [];
  });
}

/** A complete, de-margined launch group from ONE bookmaker's latest snapshot of ONE bet, or null.
 * Prices are never borrowed from another line, bet, bookmaker or family. */
export function launchOddsGroup(mapping: LaunchOddsMapping, bet: OddsBetObservation | undefined,
  catalogName: string | undefined): LaunchOddsGroup | null {
  const quotes = launchOddsQuotes(mapping, bet, catalogName);
  if (quotes.length !== Object.keys(mapping.selections).length) return null;
  const implied = deMargin(quotes.map(({ price }) => price), mapping.coverage);
  // DECIMAL(13,12) storage: an implausible overround of 10 or more is not a usable book.
  if (implied === null || !/^\d\./u.test(implied.overround)) return null;
  return Object.freeze({ family: mapping.family, betId: mapping.betId, line: mapping.line, method: DE_MARGIN_METHOD,
    mappingVersion: ODDS_MAPPING_VERSION, overround: implied.overround,
    selections: Object.freeze(quotes.map(({ selection, price }, index) => Object.freeze({ selection, price,
      displayHundredths: oddsDisplayHundredths(price), impliedProbability: implied.probabilities[index]! }))) });
}
