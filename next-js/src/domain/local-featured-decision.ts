import { z } from "zod";
import { bookmakerOddsId, oddsDisplayText, oddsVersionSchema, replayBookmakerBetIds } from "./bookmaker-odds.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey, legacyForecastOutcome } from "./legacy-goal-market-identities.ts";
import { isMarketFamily } from "./markets.ts";
import { parseDecimalOdds, type DecimalOdds } from "./odds.ts";
import { binaryGoalTotalOddsMapping, fullTimeTeamTotalOddsMapping, launchOddsMapping } from "./odds-markets.ts";
import { preMatchReferenceOddsFreshMs } from "./reference-odds.ts";
import type { GoalGrade } from "./score-distribution-markets.ts";

export const localFeaturedDecisionVersion = "local-featured-pre-match-v1";
export const localFeaturedBookmakerBetIds = replayBookmakerBetIds;
const thresholds = [0.95, 0.90, 0.85, 0.80, 0.75] as const;
const minimumPrice = parseDecimalOdds("1.10")!;
const unitPrice = 10_000n;
const instant = z.number().int().nonnegative().max(253_402_300_799_999);
export const featuredExpectedReturnSchema = z.string().max(96).regex(/^(?:[1-9]\d*(?:\.\d*[1-9])?|0\.\d*[1-9])$/u);
export const localFeaturedQuoteSchema = z.strictObject({
  bookmakerId: bookmakerOddsId, bookmakerName: oddsDisplayText(128).nullable(),
  betId: bookmakerOddsId, betName: oddsDisplayText(256), providerSelection: oddsDisplayText(64),
  decimal: z.string().refine((text) => {
    const price = parseDecimalOdds(text);
    return price?.text === text && price.scaled >= minimumPrice.scaled;
  }),
  observedAt: instant, checkedAt: instant, providerUpdatedAt: instant.nullable(),
  snapshotId: oddsVersionSchema.optional(), receiptId: oddsVersionSchema.optional(),
}).refine(({ observedAt, checkedAt, providerUpdatedAt }) =>
  observedAt <= checkedAt && (providerUpdatedAt === null || providerUpdatedAt <= checkedAt));
export type LocalFeaturedQuote = z.infer<typeof localFeaturedQuoteSchema>;

const outcomeKey = z.string().min(1).max(128);
export const localFeaturedDecisionSchema = z.discriminatedUnion("status", [
  z.strictObject({ version: z.literal(localFeaturedDecisionVersion), status: z.literal("priced"),
    marketKey: outcomeKey, selection: outcomeKey, probability: z.number().min(0.75).max(1),
    threshold: z.literal(thresholds), expectedNetReturn: featuredExpectedReturnSchema, quote: localFeaturedQuoteSchema,
  }).refine(({ probability, threshold }) => thresholds.find((floor) => probability >= floor) === threshold),
  z.strictObject({ version: z.literal(localFeaturedDecisionVersion), status: z.literal("abstained"),
    reason: z.enum(["odds-not-permitted", "no-local-forecast", "no-verified-odds", "no-comparable-quote", "no-qualifying-outcome"]),
  }),
]);
export type LocalFeaturedDecision = Readonly<z.infer<typeof localFeaturedDecisionSchema>>;
type PricedDecision = Extract<LocalFeaturedDecision, { status: "priced" }>;
type Settlement = Readonly<Record<GoalGrade, number>>;
type LocalOutcome = Readonly<{
  marketKey: string; selection: string; settlementProbabilities: Settlement; unrepresentedProbability?: number;
}>;
type Observation = Readonly<{ observedAt: number; checkedAt: number; providerUpdatedAt: number | null;
  snapshotId?: string; receiptId?: string }>;
type BookmakerOffer = Readonly<{
  betId: number; betName: string; values: readonly Readonly<{
    label: string; odd: string; observation?: Observation; suspended?: boolean; permitted?: boolean;
  }>[];
  observedAt?: number; checkedAt?: number; providerUpdatedAt: number | null; snapshotId?: string; receiptId?: string;
}>;
type BookmakerQuotes = Readonly<{
  fixtureId: string; kickoffAt: number; checkedAt: number;
  provenance?: "pre-match" | "historical-pre-match" | "in-play" | "closing";
  bookmakers: readonly Readonly<{ bookmakerId: number; bookmakerName: string | null; offers: readonly BookmakerOffer[] }>[];
}>;

export function binaryFeaturedSettlement(win: number): Settlement {
  return { win, loss: 1 - win, push: 0, "half-win": 0, "half-loss": 0 };
}

/** Use the full serialized probability and integer price. A break-even quote stays at zero. */
function decimalParts(value: number) {
  const [mantissa, exponent = "0"] = String(value).split("e") as [string, string?];
  const [whole, fraction = ""] = mantissa.split(".");
  return { integer: BigInt(whole! + fraction), places: fraction.length - Number(exponent) };
}

function decimalText(value: bigint, places: number) {
  const digits = value.toString().padStart(places + 1, "0");
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/u, "");
}

export function positiveFeaturedReturn(settlement: Settlement, price: DecimalOdds,
  terms: "binary" | "asian", unrepresentedProbability = 0): string | null {
  const masses = [settlement.win, settlement.loss, settlement.push, settlement["half-win"], settlement["half-loss"]];
  if (unrepresentedProbability !== 0 || masses.some((mass) => !Number.isFinite(mass) || mass < 0 || mass > 1) ||
    Math.abs(masses.reduce((sum, mass) => sum + mass, 0) - 1) > 1e-12 ||
    terms === "binary" && masses.slice(2).some((mass) => mass !== 0)) return null;
  const parts = masses.map(decimalParts);
  const places = Math.max(...parts.map((part) => part.places));
  const scale = 10n ** BigInt(places);
  const [win, loss, , halfWin, halfLoss] = parts.map(({ integer, places: digits }) =>
    integer * 10n ** BigInt(places - digits)) as [bigint, bigint, bigint, bigint, bigint];
  // Net payouts per unit staked are (d-1), -1, 0, (d-1)/2 and -1/2.
  const profit = terms === "binary" ? (win * price.scaled - scale * unitPrice) * 10n
    : ((2n * win + halfWin) * (price.scaled - unitPrice) - (2n * loss + halfLoss) * unitPrice) * 5n;
  return profit > 0n ? decimalText(profit, places + 5) : null;
}

function verifiedMapping(marketKey: string, selection: string) {
  const legacy = legacyForecastOutcome(marketKey, selection);
  const launch = launchOddsMapping.find(({ family }) => family === (legacy?.family ?? marketKey));
  const label = launch && Object.entries(launch.selections).find(([key]) => key === (legacy?.selection ?? selection))?.[1];
  if (launch && label) return { betId: launch.betId, betName: launch.betName, label, terms: "binary" as const };
  // The retained catalog identifies the period and side by bet ID/name and embeds the exact line in the label.
  // These mappings verify half-goal binary settlement. Integer and quarter lines require separately verified payout terms.
  const total = /^goal:(full-time|half-time):totals:(total|home|away):(\d+\.5):binary$/u.exec(marketKey);
  if (!total || selection !== "over" && selection !== "under") return null;
  const [, period, side, line] = total;
  const mapping = side === "total" ? binaryGoalTotalOddsMapping[period as "full-time" | "half-time"]
    : period === "full-time" && (side === "home" || side === "away") ? fullTimeTeamTotalOddsMapping[side] : null;
  return mapping ? { ...mapping, label: `${selection === "over" ? "Over" : "Under"} ${line}`, terms: "binary" as const } : null;
}

function freshObservation(offer: BookmakerOffer, observation: Observation | undefined, decisionAt: number) {
  const clocks = observation ?? { observedAt: offer.observedAt, checkedAt: offer.checkedAt, providerUpdatedAt: offer.providerUpdatedAt,
    snapshotId: offer.snapshotId, receiptId: offer.receiptId };
  const { observedAt, checkedAt, providerUpdatedAt, snapshotId, receiptId } = clocks;
  if (observedAt === undefined || checkedAt === undefined || observedAt > checkedAt || checkedAt > decisionAt ||
    decisionAt - observedAt > preMatchReferenceOddsFreshMs ||
    providerUpdatedAt !== null && (providerUpdatedAt > checkedAt || decisionAt - providerUpdatedAt > preMatchReferenceOddsFreshMs)) return null;
  return { observedAt, checkedAt, providerUpdatedAt, ...(snapshotId ? { snapshotId } : {}), ...(receiptId ? { receiptId } : {}) };
}

const byText = (left: string, right: string) => left < right ? -1 : Number(left > right);
const byPrice = (left: DecimalOdds, right: DecimalOdds) => left.scaled > right.scaled ? -1 : Number(left.scaled < right.scaled);
function outcomeOrder(marketKey: string, selection: string) {
  return isMarketFamily(marketKey)
    ? `${legacyForecastMarketKey(marketKey)}\0${canonicalLegacyForecastSelection(marketKey, selection) ?? selection}`
    : `${marketKey}\0${selection}`;
}
function bestQuote(books: BookmakerQuotes["bookmakers"], mapping: NonNullable<ReturnType<typeof verifiedMapping>>, decisionAt: number) {
  let best: { quote: LocalFeaturedQuote; price: DecimalOdds } | null = null;
  let comparable = false;
  for (const { bookmakerId, bookmakerName, offers } of books) {
    const markets = offers.filter(({ betId, betName }) => betId === mapping.betId && betName === mapping.betName);
    if (markets.length !== 1) continue;
    const offer = markets[0]!;
    const selections = offer.values.filter(({ label }) => label === mapping.label);
    if (selections.length !== 1) continue;
    const value = selections[0]!;
    if (value.suspended || value.permitted === false) continue;
    const price = parseDecimalOdds(value.odd), clocks = freshObservation(offer, value.observation, decisionAt);
    if (!price || !clocks) continue;
    comparable = true;
    if (price.scaled < minimumPrice.scaled) continue;
    const name = oddsDisplayText(128).safeParse(bookmakerName);
    const quote = localFeaturedQuoteSchema.safeParse({ bookmakerId, bookmakerName: name.success ? name.data : null,
      betId: mapping.betId, betName: mapping.betName, providerSelection: mapping.label, decimal: price.text, ...clocks });
    if (quote.success && (!best || (byPrice(price, best.price) || bookmakerId - best.quote.bookmakerId) < 0))
      best = { quote: quote.data, price };
  }
  return { best, comparable };
}

/** Rank only independently validated Local Engine outcomes and keep the qualifying quote frozen with the pick. */
export function decideLocalFeaturedPick(input: Readonly<{ fixtureId: string; kickoffAt: number; decisionAt: number;
  outcomes: readonly LocalOutcome[]; quotes: BookmakerQuotes | null | undefined; quotesPermitted: boolean }>): LocalFeaturedDecision {
  const { fixtureId, kickoffAt, decisionAt, outcomes, quotes, quotesPermitted } = input;
  const abstain = (reason: Extract<LocalFeaturedDecision, { status: "abstained" }>["reason"]): LocalFeaturedDecision =>
    ({ version: localFeaturedDecisionVersion, status: "abstained", reason });
  if (!outcomes.length) return abstain("no-local-forecast");
  if (!quotesPermitted) return abstain("odds-not-permitted");
  if (!quotes || quotes.fixtureId !== fixtureId || quotes.kickoffAt !== kickoffAt || quotes.checkedAt > decisionAt ||
    quotes.provenance === "in-play" || quotes.provenance === "closing" ||
    !instant.safeParse(decisionAt).success || decisionAt >= kickoffAt) return abstain("no-verified-odds");

  let chosen: { decision: PricedDecision; price: DecimalOdds; order: string } | null = null, comparable = false;
  for (const { marketKey, selection, settlementProbabilities, unrepresentedProbability } of outcomes) {
    const mapping = verifiedMapping(marketKey, selection);
    if (!mapping) continue;
    const { best, comparable: hasQuote } = bestQuote(quotes.bookmakers, mapping, decisionAt);
    comparable ||= hasQuote;
    if (!best) continue;
    const expectedNetReturn = positiveFeaturedReturn(settlementProbabilities, best.price, mapping.terms, unrepresentedProbability);
    const probability = settlementProbabilities.win, threshold = thresholds.find((floor) => probability >= floor);
    if (!expectedNetReturn || threshold === undefined) continue;
    const decision: PricedDecision = { version: localFeaturedDecisionVersion, status: "priced",
      marketKey, selection, expectedNetReturn, probability, threshold, quote: best.quote };
    const order = outcomeOrder(marketKey, selection);
    if (!chosen || (chosen.decision.threshold - threshold || byPrice(best.price, chosen.price) ||
      chosen.decision.probability - probability || byText(order, chosen.order) ||
      byText(marketKey, chosen.decision.marketKey) || byText(selection, chosen.decision.selection)) < 0) {
      chosen = { decision, price: best.price, order };
    }
  }
  return chosen?.decision ?? abstain(comparable ? "no-qualifying-outcome" : "no-comparable-quote");
}
