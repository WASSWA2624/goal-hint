import { z } from "zod";
import { bookmakerOddsId, oddsDisplayText, oddsVersionSchema, replayBookmakerBetIds } from "./bookmaker-odds.ts";
import { legacyLocalFirstGoalMarketDefinitions, localFirstGoalMarketDefinitions } from "./goal-market-definitions.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey, legacyForecastOutcome } from "./legacy-goal-market-identities.ts";
import { isMarketFamily } from "./markets.ts";
import { parseDecimalOdds, type DecimalOdds } from "./odds.ts";
import { binaryGoalTotalOddsMapping, fullTimeTeamTotalOddsMapping, launchOddsMapping } from "./odds-markets.ts";
import { preMatchReferenceOddsFreshMs } from "./reference-odds.ts";
import type { GoalGrade } from "./score-distribution-markets.ts";

export const legacyLocalFeaturedDecisionVersion = "local-featured-pre-match-v1";
export const previousLocalFeaturedDecisionVersion = "local-featured-pre-match-v2";
export const localFeaturedDecisionVersion = "local-featured-pre-match-v3";
export const localFeaturedBookmakerBetIds = replayBookmakerBetIds;
const legacyThresholds = [0.95, 0.90, 0.85, 0.80, 0.75] as const;
const thresholds = [...legacyThresholds, 0.70, 0.65, 0.60] as const;
const featuredDecisionVersionSchema = z.literal([legacyLocalFeaturedDecisionVersion, previousLocalFeaturedDecisionVersion, localFeaturedDecisionVersion]);
export type LocalFeaturedDecisionVersion = z.infer<typeof featuredDecisionVersionSchema>;
const thresholdsByVersion = { [legacyLocalFeaturedDecisionVersion]: legacyThresholds,
  [previousLocalFeaturedDecisionVersion]: thresholds, [localFeaturedDecisionVersion]: thresholds } as const;
const thresholdFor = (probability: number, version: LocalFeaturedDecisionVersion) => thresholdsByVersion[version].find((floor) => probability >= floor);
const minimumPrice = parseDecimalOdds("1.10")!;
const minimumProbability = 0.60;
const unitPrice = 10_000n;
const instant = z.number().int().nonnegative().max(253_402_300_799_999);
export const featuredExpectedReturnSchema = z.string().max(96).regex(/^(?:[1-9]\d*(?:\.\d*[1-9])?|0\.\d*[1-9])$/u);
export const featuredNetReturnSchema = z.string().max(97).regex(/^(?:-?(?:[1-9]\d*(?:\.\d*[1-9])?|0\.\d*[1-9])|0)$/u);
export const localFeaturedQuoteSchema = z.strictObject({
  bookmakerId: bookmakerOddsId, bookmakerName: oddsDisplayText(128).nullable(),
  betId: bookmakerOddsId, betName: oddsDisplayText(256), providerSelection: oddsDisplayText(64),
  decimal: z.string().refine((text) => parseDecimalOdds(text)?.text === text),
  observedAt: instant, checkedAt: instant, providerUpdatedAt: instant.nullable(),
  snapshotId: oddsVersionSchema.optional(), receiptId: oddsVersionSchema.optional(),
}).refine(({ observedAt, checkedAt, providerUpdatedAt }) =>
  observedAt <= checkedAt && (providerUpdatedAt === null || providerUpdatedAt <= checkedAt));
export type LocalFeaturedQuote = z.infer<typeof localFeaturedQuoteSchema>;

const outcomeKey = z.string().min(1).max(128);
const selectionFields = { marketKey: outcomeKey, selection: outcomeKey, probability: z.number().min(minimumProbability).max(1) };
export const featuredForecastOnlyReasonSchema = z.enum(["odds-not-permitted", "no-verified-odds", "no-comparable-quote", "no-qualifying-outcome"]);
export const localFeaturedDecisionSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...selectionFields, version: featuredDecisionVersionSchema, status: z.literal("priced"),
    tier: z.enum(["standard", "priced-fallback"]).optional(),
    threshold: z.literal(thresholds), expectedNetReturn: featuredNetReturnSchema, quote: localFeaturedQuoteSchema,
  }).refine(({ probability, threshold, version, tier, expectedNetReturn, quote }) => {
    const price = parseDecimalOdds(quote.decimal);
    const standard = price !== null && price.scaled >= minimumPrice.scaled && featuredExpectedReturnSchema.safeParse(expectedNetReturn).success;
    return thresholdFor(probability, version) === threshold && (version === localFeaturedDecisionVersion
      ? (standard ? tier === "standard" : tier === "priced-fallback") : tier === undefined && standard);
  }),
  z.strictObject({ ...selectionFields, version: z.literal(localFeaturedDecisionVersion), status: z.literal("forecast-only"),
    reason: featuredForecastOnlyReasonSchema }),
  z.strictObject({ version: featuredDecisionVersionSchema, status: z.literal("abstained"),
    reason: z.enum([...featuredForecastOnlyReasonSchema.options, "no-local-forecast", "no-modeled-outcome-meets-floor", "invalid-decision-time"]),
  }).refine(({ version, reason }) => version === localFeaturedDecisionVersion ||
    reason !== "no-modeled-outcome-meets-floor" && reason !== "invalid-decision-time"),
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
type FeaturedDecisionInput = Readonly<{ fixtureId: string; kickoffAt: number; decisionAt: number;
  outcomes: readonly LocalOutcome[]; quotes: BookmakerQuotes | null | undefined; quotesPermitted: boolean;
  coverageByMarket?: ReadonlyMap<string, number> }>;

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
  const digits = (value < 0n ? -value : value).toString().padStart(places + 1, "0");
  const text = `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/u, "");
  return value < 0n ? `-${text}` : text;
}

function representedSettlement(settlement: Settlement, terms: "binary" | "asian", unrepresentedProbability = 0) {
  const masses = [settlement.win, settlement.loss, settlement.push, settlement["half-win"], settlement["half-loss"]];
  if (unrepresentedProbability !== 0 || masses.some((mass) => !Number.isFinite(mass) || mass < 0 || mass > 1) ||
    Math.abs(masses.reduce((sum, mass) => sum + mass, 0) - 1) > 1e-12 ||
    terms === "binary" && masses.slice(2).some((mass) => mass !== 0)) return null;
  return masses;
}

export function modeledFeaturedReturn(settlement: Settlement, price: DecimalOdds,
  terms: "binary" | "asian", unrepresentedProbability = 0): string | null {
  const masses = representedSettlement(settlement, terms, unrepresentedProbability);
  if (!masses) return null;
  const parts = masses.map(decimalParts);
  const places = Math.max(...parts.map((part) => part.places));
  const scale = 10n ** BigInt(places);
  const [win, loss, , halfWin, halfLoss] = parts.map(({ integer, places: digits }) =>
    integer * 10n ** BigInt(places - digits)) as [bigint, bigint, bigint, bigint, bigint];
  // Net payouts per unit staked are (d-1), -1, 0, (d-1)/2 and -1/2.
  const profit = terms === "binary" ? (win * price.scaled - scale * unitPrice) * 10n
    : ((2n * win + halfWin) * (price.scaled - unitPrice) - (2n * loss + halfLoss) * unitPrice) * 5n;
  return decimalText(profit, places + 5);
}

const positiveReturn = (value: string) => value !== "0" && !value.startsWith("-");
export function positiveFeaturedReturn(settlement: Settlement, price: DecimalOdds,
  terms: "binary" | "asian", unrepresentedProbability = 0): string | null {
  const result = modeledFeaturedReturn(settlement, price, terms, unrepresentedProbability);
  return result !== null && positiveReturn(result) ? result : null;
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
const reviewedGoalDefinitions = new Map([...legacyLocalFirstGoalMarketDefinitions, ...localFirstGoalMarketDefinitions]
  .map((definition) => [definition.key, definition]));

function reviewedForecastMarket(marketKey: string, selection: string) {
  if (isMarketFamily(marketKey) && canonicalLegacyForecastSelection(marketKey, selection))
    return { key: legacyForecastMarketKey(marketKey), terms: "binary" as const };
  if (legacyForecastOutcome(marketKey, selection)) return { key: marketKey, terms: "binary" as const };
  const definition = reviewedGoalDefinitions.get(marketKey);
  return definition?.selections.some(({ key }) => selection === key)
    ? { key: marketKey, terms: definition.group === "payout" ? "asian" as const : "binary" as const } : null;
}

/** Reviewed common regulation markets and central totals precede alternate lines or periods when coverage is unproved. */
function commonMarketOrder(marketKey: string) {
  if (/^goal:full-time:(?:result|double-chance|btts|totals:total:[123]\.5:binary)$/u.test(marketKey)) return 0;
  if (/^goal:full-time:totals:(?:total:4\.5|(?:home|away):[012]\.5):binary$/u.test(marketKey) ||
      /^goal:half-time:totals:total:[01]\.5:binary$/u.test(marketKey)) return 1;
  return marketKey.endsWith(":binary") && !marketKey.startsWith("goal:second-half:") ? 2 : 3;
}

type FeaturedSelection = z.infer<z.ZodObject<typeof selectionFields>>;
function stableSelectionOrder(left: FeaturedSelection, right: FeaturedSelection) {
  return byText(outcomeOrder(left.marketKey, left.selection), outcomeOrder(right.marketKey, right.selection)) ||
    byText(left.marketKey, right.marketKey) || byText(left.selection, right.selection);
}

function bestForecastOnlyOutcome(outcomes: readonly LocalOutcome[], coverage: ReadonlyMap<string, number> | undefined) {
  type Ranked = FeaturedSelection & Readonly<{ coverage: number; commonOrder: number }>;
  let best: Ranked | null = null;
  for (const { marketKey, selection, settlementProbabilities, unrepresentedProbability } of outcomes) {
    const market = reviewedForecastMarket(marketKey, selection), probability = settlementProbabilities.win;
    if (!market || probability < minimumProbability ||
      !representedSettlement(settlementProbabilities, market.terms, unrepresentedProbability)) continue;
    const count = coverage?.get(market.key) ?? 0;
    const candidate: Ranked = { marketKey, selection, probability, commonOrder: commonMarketOrder(market.key),
      coverage: Number.isSafeInteger(count) && count > 0 ? count : 0 };
    if (!best || (best.coverage - candidate.coverage ||
      (best.coverage ? 0 : candidate.commonOrder - best.commonOrder) ||
      best.probability - candidate.probability || stableSelectionOrder(candidate, best)) < 0) best = candidate;
  }
  return best && { marketKey: best.marketKey, selection: best.selection, probability: best.probability };
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
    const name = oddsDisplayText(128).safeParse(bookmakerName);
    const quote = localFeaturedQuoteSchema.safeParse({ bookmakerId, bookmakerName: name.success ? name.data : null,
      betId: mapping.betId, betName: mapping.betName, providerSelection: mapping.label, decimal: price.text, ...clocks });
    if (quote.success && (!best || (byPrice(price, best.price) || bookmakerId - best.quote.bookmakerId) < 0))
      best = { quote: quote.data, price };
  }
  return { best, comparable };
}

/** Count modeled outcomes at each gate and rank the survivors using the selected policy version. */
export function assessLocalFeaturedPick(input: FeaturedDecisionInput, version: LocalFeaturedDecisionVersion = localFeaturedDecisionVersion) {
  const { fixtureId, kickoffAt, decisionAt, outcomes, quotes, quotesPermitted, coverageByMarket } = input;
  const tiered = version === localFeaturedDecisionVersion;
  const eligible = new Map<PricedDecision["threshold"], number>();
  let comparableQuoteOutcomes = 0, oddsFloorOutcomes = 0, positiveReturnOutcomes = 0;
  const finish = (decision: LocalFeaturedDecision) => ({ decision, diagnostics: {
    modeledOutcomes: outcomes.length, comparableQuoteOutcomes, oddsFloorOutcomes, positiveReturnOutcomes,
    eligibleByRung: thresholdsByVersion[version].map((threshold) => ({ threshold, outcomes: eligible.get(threshold) ?? 0 })),
  } });
  const abstain = (reason: Extract<LocalFeaturedDecision, { status: "abstained" }>["reason"]) =>
    finish({ version, status: "abstained", reason });
  const withoutPrice = (reason: z.infer<typeof featuredForecastOnlyReasonSchema>) => {
    if (!tiered) return abstain(reason);
    const forecast = bestForecastOnlyOutcome(outcomes, coverageByMarket);
    return forecast ? finish({ ...forecast, version, status: "forecast-only", reason }) : abstain("no-modeled-outcome-meets-floor");
  };
  if (!outcomes.length) return abstain("no-local-forecast");
  const validTime = instant.safeParse(decisionAt).success && decisionAt < kickoffAt;
  if (tiered && !validTime) return abstain("invalid-decision-time");
  if (!quotesPermitted) return withoutPrice("odds-not-permitted");
  if (!validTime || !quotes || quotes.fixtureId !== fixtureId || quotes.kickoffAt !== kickoffAt || quotes.checkedAt > decisionAt ||
    quotes.provenance === "in-play" || quotes.provenance === "closing") return withoutPrice("no-verified-odds");

  type Rated = Readonly<{ decision: PricedDecision; price: DecimalOdds; positive: boolean }>;
  const rankPriced = (left: Rated, right: Rated) => Number(right.positive) - Number(left.positive) ||
    right.decision.threshold - left.decision.threshold || byPrice(left.price, right.price) ||
    right.decision.probability - left.decision.probability || stableSelectionOrder(left.decision, right.decision);
  let chosen: Rated | null = null, fallback: Rated | null = null;
  for (const { marketKey, selection, settlementProbabilities, unrepresentedProbability } of outcomes) {
    const mapping = verifiedMapping(marketKey, selection);
    if (!mapping) continue;
    const { best, comparable: hasQuote } = bestQuote(quotes.bookmakers, mapping, decisionAt);
    if (hasQuote) comparableQuoteOutcomes++;
    if (!best) continue;
    const standardPrice = best.price.scaled >= minimumPrice.scaled;
    if (standardPrice) oddsFloorOutcomes++;
    else if (!tiered) continue;
    const expectedNetReturn = modeledFeaturedReturn(settlementProbabilities, best.price, mapping.terms, unrepresentedProbability);
    if (expectedNetReturn === null || !featuredNetReturnSchema.safeParse(expectedNetReturn).success) continue;
    const positive = positiveReturn(expectedNetReturn), standard = standardPrice && positive;
    if (standard) positiveReturnOutcomes++;
    else if (!tiered) continue;
    const probability = settlementProbabilities.win, threshold = thresholdFor(probability, version);
    if (threshold === undefined) continue;
    if (standard) eligible.set(threshold, (eligible.get(threshold) ?? 0) + 1);
    const decision: PricedDecision = { version, status: "priced",
      ...(tiered ? { tier: standard ? "standard" as const : "priced-fallback" as const } : {}),
      marketKey, selection, expectedNetReturn, probability, threshold, quote: best.quote };
    const rated = { decision, price: best.price, positive };
    if (standard && (!chosen || rankPriced(rated, chosen) < 0)) chosen = rated;
    if (!standard && (!fallback || rankPriced(rated, fallback) < 0)) fallback = rated;
  }
  const selected = chosen ?? fallback;
  return selected ? finish(selected.decision) : withoutPrice(comparableQuoteOutcomes ? "no-qualifying-outcome" : "no-comparable-quote");
}

/** Keep the qualifying quote frozen with the pick. */
export function decideLocalFeaturedPick(input: FeaturedDecisionInput, version: LocalFeaturedDecisionVersion = localFeaturedDecisionVersion): LocalFeaturedDecision {
  return assessLocalFeaturedPick(input, version).decision;
}
