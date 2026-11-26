import { z } from "zod";
import { bookmakerOddsId, oddsDisplayText, oddsVersionSchema, replayBookmakerBetIds } from "./bookmaker-odds.ts";
import { legacyLocalFirstGoalMarketDefinitions, localFirstGoalMarketDefinitions, localFirstRegulationScoreMarketDefinitions } from "./goal-market-definitions.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey, legacyForecastOutcome } from "./legacy-goal-market-identities.ts";
import { isMarketFamily } from "./markets.ts";
import { parseDecimalOdds, type DecimalOdds } from "./odds.ts";
import { binaryGoalTotalOddsMapping, fullTimeTeamTotalOddsMapping, launchOddsMapping } from "./odds-markets.ts";
import { preMatchReferenceOddsFreshMs } from "./reference-odds.ts";
import type { GoalGrade } from "./score-distribution-markets.ts";

export const legacyLocalFeaturedDecisionVersion = "local-featured-pre-match-v1";
export const previousLocalFeaturedDecisionVersion = "local-featured-pre-match-v2";
export const oddsFirstTieredFeaturedDecisionVersion = "local-featured-pre-match-v3";
export const localFeaturedDecisionVersion = "local-featured-pre-match-v4";
export const tieredLocalFeaturedDecisionVersions = [oddsFirstTieredFeaturedDecisionVersion, localFeaturedDecisionVersion] as const;
export const localFeaturedBookmakerBetIds = replayBookmakerBetIds;
const legacyThresholds = [0.95, 0.90, 0.85, 0.80, 0.75] as const;
const thresholds = [...legacyThresholds, 0.70, 0.65, 0.60] as const;
const featuredDecisionVersionSchema = z.literal([legacyLocalFeaturedDecisionVersion, previousLocalFeaturedDecisionVersion, ...tieredLocalFeaturedDecisionVersions]);
export type LocalFeaturedDecisionVersion = z.infer<typeof featuredDecisionVersionSchema>;
const thresholdsByVersion = { [legacyLocalFeaturedDecisionVersion]: legacyThresholds,
  [previousLocalFeaturedDecisionVersion]: thresholds, [oddsFirstTieredFeaturedDecisionVersion]: thresholds, [localFeaturedDecisionVersion]: thresholds } as const;
const thresholdFor = (probability: number, version: LocalFeaturedDecisionVersion) => thresholdsByVersion[version].find((floor) => probability >= floor);
export const isTieredLocalFeaturedDecision = (version: LocalFeaturedDecisionVersion): version is typeof tieredLocalFeaturedDecisionVersions[number] =>
  tieredLocalFeaturedDecisionVersions.some((tiered) => tiered === version);
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
  }).refine(({ marketKey, selection, probability, threshold, version, tier, expectedNetReturn, quote }) => {
    const price = parseDecimalOdds(quote.decimal);
    const standard = price !== null && price.scaled >= minimumPrice.scaled && featuredExpectedReturnSchema.safeParse(expectedNetReturn).success;
    const binding = version === localFeaturedDecisionVersion ? verifiedLocalFeaturedBinding(marketKey, selection) : undefined;
    if (version === localFeaturedDecisionVersion && (!binding || quote.betId !== binding.betId || quote.betName !== binding.betName
      || quote.providerSelection !== binding.label)) return false;
    return thresholdFor(probability, version) === threshold && (isTieredLocalFeaturedDecision(version)
      ? (standard ? tier === "standard" : tier === "priced-fallback") : tier === undefined && standard);
  }),
  z.strictObject({ ...selectionFields, version: z.literal(tieredLocalFeaturedDecisionVersions), status: z.literal("forecast-only"),
    reason: featuredForecastOnlyReasonSchema }),
  z.strictObject({ version: featuredDecisionVersionSchema, status: z.literal("abstained"),
    reason: z.enum([...featuredForecastOnlyReasonSchema.options, "no-local-forecast", "no-modeled-outcome-meets-floor", "invalid-decision-time"]),
  }).refine(({ version, reason }) => isTieredLocalFeaturedDecision(version) ||
    reason !== "no-modeled-outcome-meets-floor" && reason !== "invalid-decision-time"),
]);
export type LocalFeaturedDecision = Readonly<z.infer<typeof localFeaturedDecisionSchema>>;
type PricedDecision = Extract<LocalFeaturedDecision, { status: "priced" }>;
type Settlement = Readonly<Record<GoalGrade, number>>;
export type LocalFeaturedOutcome = Readonly<{
  marketKey: string; selection: string; settlementProbabilities: Settlement; unrepresentedProbability?: number;
}>;
type Observation = Readonly<{ observedAt: number; checkedAt: number; providerUpdatedAt: number | null;
  snapshotId?: string; receiptId?: string }>;
export type LocalFeaturedBookmakerOffer = Readonly<{
  betId: number; betName: string; values: readonly Readonly<{
    label: string; odd: string; observation?: Observation; suspended?: boolean; permitted?: boolean;
  }>[];
  observedAt?: number; checkedAt?: number; providerUpdatedAt: number | null; snapshotId?: string; receiptId?: string;
}>;
export type LocalFeaturedBookmaker = Readonly<{
  bookmakerId: number; bookmakerName: string | null; offers: readonly LocalFeaturedBookmakerOffer[];
}>;
export type LocalFeaturedBookmakerQuotes = Readonly<{
  fixtureId: string; kickoffAt: number; checkedAt: number;
  provenance?: "pre-match" | "historical-pre-match" | "in-play" | "closing";
  bookmakers: readonly LocalFeaturedBookmaker[];
}>;
export type FeaturedDecisionInput = Readonly<{ fixtureId: string; kickoffAt: number; decisionAt: number;
  outcomes: readonly LocalFeaturedOutcome[]; quotes: LocalFeaturedBookmakerQuotes | null | undefined; quotesPermitted: boolean;
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

export function representedSettlement(settlement: Settlement, terms: "binary" | "asian", unrepresentedProbability = 0) {
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

export function verifiedLocalFeaturedBinding(marketKey: string, selection: string) {
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

type ObservationIssue = "missing-observation-clock" | "incoherent-observation-clock" | "post-decision-quote" | "stale-quote";
type QuoteIssue = ObservationIssue | "suspended-quote" | "quote-not-permitted" | "invalid-decimal-quote" | "invalid-quote-attribution";
type QuoteInspection = Readonly<{ quote: LocalFeaturedQuote; price: DecimalOdds }> | Readonly<{ reason: QuoteIssue }>;

function inspectObservation(offer: LocalFeaturedBookmakerOffer, observation: Observation | undefined, decisionAt: number):
  Readonly<{ clocks: Observation }> | Readonly<{ reason: ObservationIssue }> {
  const clocks = observation ?? { observedAt: offer.observedAt, checkedAt: offer.checkedAt, providerUpdatedAt: offer.providerUpdatedAt,
    snapshotId: offer.snapshotId, receiptId: offer.receiptId };
  const { observedAt, checkedAt, providerUpdatedAt, snapshotId, receiptId } = clocks;
  if (observedAt === undefined || checkedAt === undefined) return { reason: "missing-observation-clock" } as const;
  if (observedAt > checkedAt || providerUpdatedAt !== null && providerUpdatedAt > checkedAt)
    return { reason: "incoherent-observation-clock" } as const;
  if (checkedAt > decisionAt) return { reason: "post-decision-quote" } as const;
  if (decisionAt - observedAt > preMatchReferenceOddsFreshMs ||
    providerUpdatedAt !== null && decisionAt - providerUpdatedAt > preMatchReferenceOddsFreshMs)
    return { reason: "stale-quote" } as const;
  return { clocks: { observedAt, checkedAt, providerUpdatedAt, ...(snapshotId ? { snapshotId } : {}), ...(receiptId ? { receiptId } : {}) } } as const;
}

export function validLocalFeaturedDecisionTime(kickoffAt: number, decisionAt: number): boolean {
  return instant.safeParse(decisionAt).success && decisionAt < kickoffAt;
}

export function localFeaturedQuoteScopeReason(input: Pick<FeaturedDecisionInput, "fixtureId" | "kickoffAt" | "decisionAt" | "quotes" | "quotesPermitted">) {
  const { fixtureId, kickoffAt, decisionAt, quotes, quotesPermitted } = input;
  if (!validLocalFeaturedDecisionTime(kickoffAt, decisionAt)) return "invalid-decision-time";
  if (!quotesPermitted) return "odds-not-permitted";
  if (!quotes) return "no-stored-odds";
  if (quotes.fixtureId !== fixtureId || quotes.kickoffAt !== kickoffAt) return "different-fixture-occurrence";
  if (quotes.provenance === "closing" || quotes.provenance === "in-play") return "unverified-pre-match-phase";
  if (quotes.checkedAt > decisionAt) return "post-decision-quote";
  return null;
}

export function inspectLocalFeaturedQuote(book: LocalFeaturedBookmaker, offer: LocalFeaturedBookmakerOffer,
  value: LocalFeaturedBookmakerOffer["values"][number], decisionAt: number): QuoteInspection {
  if (value.suspended) return { reason: "suspended-quote" } as const;
  if (value.permitted === false) return { reason: "quote-not-permitted" } as const;
  const price = parseDecimalOdds(value.odd);
  if (!price) return { reason: "invalid-decimal-quote" } as const;
  const observed = inspectObservation(offer, value.observation, decisionAt);
  if ("reason" in observed) return observed;
  const name = oddsDisplayText(128).safeParse(book.bookmakerName);
  const checked = localFeaturedQuoteSchema.safeParse({ bookmakerId: book.bookmakerId, bookmakerName: name.success ? name.data : null,
    betId: offer.betId, betName: offer.betName, providerSelection: value.label, decimal: price.text, ...observed.clocks });
  if (!checked.success) return { reason: "invalid-quote-attribution" } as const;
  return { quote: checked.data, price } as const;
}

export function inspectExactLocalFeaturedQuote(book: LocalFeaturedBookmaker, binding: NonNullable<ReturnType<typeof verifiedLocalFeaturedBinding>>,
  decisionAt: number): QuoteInspection | null {
  const offers = book.offers.filter(({ betId, betName }) => betId === binding.betId && betName === binding.betName);
  if (offers.length !== 1) return null;
  const offer = offers[0]!;
  const values = offer.values.filter(({ label }) => label === binding.label);
  return values.length === 1 ? inspectLocalFeaturedQuote(book, offer, values[0]!, decisionAt) : null;
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
const reviewedScoreDefinitions = new Map(localFirstRegulationScoreMarketDefinitions.map((definition) => [definition.key, definition]));

function reviewedForecastMarket(marketKey: string, selection: string, includeScoreMarkets: boolean) {
  if (isMarketFamily(marketKey) && canonicalLegacyForecastSelection(marketKey, selection))
    return { key: legacyForecastMarketKey(marketKey), terms: "binary" as const };
  if (legacyForecastOutcome(marketKey, selection)) return { key: marketKey, terms: "binary" as const };
  const definition = reviewedGoalDefinitions.get(marketKey) ?? (includeScoreMarkets ? reviewedScoreDefinitions.get(marketKey) : undefined);
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
type RankingProbability = (selection: Readonly<FeaturedSelection>) => number;

function compareRankingProbability(left: FeaturedSelection, right: FeaturedSelection, rank: RankingProbability | undefined) {
  if (!rank) return right.probability - left.probability;
  const probability = (pick: FeaturedSelection) => {
    const value = rank({ marketKey: pick.marketKey, selection: pick.selection, probability: pick.probability });
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : pick.probability;
  };
  return probability(right) - probability(left) || right.probability - left.probability;
}

function stableSelectionOrder(left: FeaturedSelection, right: FeaturedSelection) {
  return byText(outcomeOrder(left.marketKey, left.selection), outcomeOrder(right.marketKey, right.selection)) ||
    byText(left.marketKey, right.marketKey) || byText(left.selection, right.selection);
}

function bestForecastOnlyOutcome(outcomes: readonly LocalFeaturedOutcome[], coverage: ReadonlyMap<string, number> | undefined,
  rank: RankingProbability | undefined, probabilityFirst: boolean) {
  type Ranked = FeaturedSelection & Readonly<{ coverage: number; commonOrder: number }>;
  let best: Ranked | null = null;
  for (const { marketKey, selection, settlementProbabilities, unrepresentedProbability } of outcomes) {
    const market = reviewedForecastMarket(marketKey, selection, probabilityFirst), probability = settlementProbabilities.win;
    if (!market || probability < minimumProbability ||
      !representedSettlement(settlementProbabilities, market.terms, unrepresentedProbability)) continue;
    const count = coverage?.get(market.key) ?? 0;
    const candidate: Ranked = { marketKey, selection, probability, commonOrder: commonMarketOrder(market.key),
      coverage: Number.isSafeInteger(count) && count > 0 ? count : 0 };
    if (!best || ((probabilityFirst ? compareRankingProbability(candidate, best, rank) : 0) || best.coverage - candidate.coverage ||
      (best.coverage ? 0 : candidate.commonOrder - best.commonOrder) ||
      compareRankingProbability(candidate, best, rank) || stableSelectionOrder(candidate, best)) < 0) best = candidate;
  }
  return best && { marketKey: best.marketKey, selection: best.selection, probability: best.probability };
}

function bestQuote(books: LocalFeaturedBookmakerQuotes["bookmakers"], mapping: NonNullable<ReturnType<typeof verifiedLocalFeaturedBinding>>, decisionAt: number) {
  let best: { quote: LocalFeaturedQuote; price: DecimalOdds } | null = null;
  let comparable = false;
  for (const book of books) {
    const inspected = inspectExactLocalFeaturedQuote(book, mapping, decisionAt);
    if (!inspected) continue;
    if ("reason" in inspected) {
      if (inspected.reason === "invalid-quote-attribution") comparable = true;
      continue;
    }
    comparable = true;
    if (!best || (byPrice(inspected.price, best.price) || book.bookmakerId - best.quote.bookmakerId) < 0) best = inspected;
  }
  return { best, comparable };
}

function assessPick(input: FeaturedDecisionInput, version: LocalFeaturedDecisionVersion, rank?: RankingProbability) {
  const { kickoffAt, decisionAt, outcomes, quotes, quotesPermitted, coverageByMarket } = input;
  const tiered = isTieredLocalFeaturedDecision(version);
  const probabilityFirst = version === localFeaturedDecisionVersion;
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
    const forecast = bestForecastOnlyOutcome(outcomes, coverageByMarket, rank, probabilityFirst);
    return forecast ? finish({ ...forecast, version, status: "forecast-only", reason }) : abstain("no-modeled-outcome-meets-floor");
  };
  if (!outcomes.length) return abstain("no-local-forecast");
  const validTime = validLocalFeaturedDecisionTime(kickoffAt, decisionAt);
  if (tiered && !validTime) return abstain("invalid-decision-time");
  if (!quotesPermitted) return withoutPrice("odds-not-permitted");
  if (!quotes || localFeaturedQuoteScopeReason(input)) return withoutPrice("no-verified-odds");

  const bookmakerOccurrences = new Map<number, number>();
  if (probabilityFirst) for (const { bookmakerId } of quotes.bookmakers)
    bookmakerOccurrences.set(bookmakerId, (bookmakerOccurrences.get(bookmakerId) ?? 0) + 1);
  const books = probabilityFirst ? quotes.bookmakers.filter(({ bookmakerId }) => bookmakerOccurrences.get(bookmakerId) === 1) : quotes.bookmakers;
  type Rated = Readonly<{ decision: PricedDecision; price: DecimalOdds; positive: boolean }>;
  const rankPriced = (left: Rated, right: Rated) => (probabilityFirst ? compareRankingProbability(left.decision, right.decision, rank) : 0) ||
    Number(right.positive) - Number(left.positive) ||
    right.decision.threshold - left.decision.threshold || byPrice(left.price, right.price) ||
    compareRankingProbability(left.decision, right.decision, rank) || stableSelectionOrder(left.decision, right.decision);
  let chosen: Rated | null = null, fallback: Rated | null = null;
  for (const { marketKey, selection, settlementProbabilities, unrepresentedProbability } of outcomes) {
    const mapping = verifiedLocalFeaturedBinding(marketKey, selection);
    if (!mapping) continue;
    const { best, comparable: hasQuote } = bestQuote(books, mapping, decisionAt);
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

/** Count modeled outcomes at each gate and rank the survivors using the released policy version. */
export function assessLocalFeaturedPick(input: FeaturedDecisionInput, version: LocalFeaturedDecisionVersion = localFeaturedDecisionVersion) {
  return assessPick(input, version);
}

/** Chronological validation only. Do not publish these candidate decisions as released-policy records. */
export function assessLocalFeaturedPickWithHistory(input: FeaturedDecisionInput, rankingProbability: RankingProbability) {
  return assessPick(input, oddsFirstTieredFeaturedDecisionVersion, rankingProbability);
}

/** Keep the qualifying quote frozen with the pick. */
export function decideLocalFeaturedPick(input: FeaturedDecisionInput, version: LocalFeaturedDecisionVersion = localFeaturedDecisionVersion): LocalFeaturedDecision {
  return assessLocalFeaturedPick(input, version).decision;
}
