import { z } from "zod";
import { parseDecimalOdds } from "./odds.ts";
import type { MarketFamily } from "./markets.ts";
import { binaryGoalTotalOddsMapping, fullTimeTeamTotalOddsMapping, launchOddsMapping } from "./odds-markets.ts";
import { preMatchReferenceOddsFreshMs, resolveReferenceOdds, type ReferenceBookmakerPolicy, type ReferenceOddsOffer, type ReferenceOddsSelection }
  from "./reference-odds.ts";
import type { GoalMarketPeriod } from "./score-distribution-markets.ts";

const at = z.number().int().nonnegative().max(253_402_300_799_999);
export const oddsVersionSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const bookmakerOddsId = z.number().int().positive().max(4_294_967_295);
export const oddsDisplayText = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim() && !/[\p{Cc}\p{Cf}<>]/u.test(value));

export function isVerifiedPreMatchObservation({ observedAt, providerUpdatedAt }: {
  observedAt: number; providerUpdatedAt: number | null;
}, kickoffAt: number) {
  return observedAt < kickoffAt || providerUpdatedAt !== null && providerUpdatedAt < kickoffAt;
}

const observation = z.strictObject({ observedAt: at, checkedAt: at, providerUpdatedAt: at.nullable() })
  .refine(({ observedAt, checkedAt, providerUpdatedAt }) => observedAt <= checkedAt && (providerUpdatedAt === null || providerUpdatedAt <= checkedAt));
const bookmakerSelection = z.strictObject({ label: oddsDisplayText(64),
  line: z.string().regex(/^-?\d{1,3}(?:\.\d{1,3})?$/u).nullable(),
  price: z.string().refine((value) => parseDecimalOdds(value)?.text === value), observation: observation.optional() });
export const bookmakerMarketSchema = z.strictObject({ betId: bookmakerOddsId, name: oddsDisplayText(256),
  selections: z.array(bookmakerSelection).min(1).max(1000), observation: observation.optional() })
  .refine(({ selections }) => new Set(selections.map(({ label, line }) => JSON.stringify([label, line]))).size === selections.length);
export const bookmakerMarketsSchema = z.array(bookmakerMarketSchema).min(1).max(1000)
  .refine((markets) => new Set(markets.map(({ betId }) => betId)).size === markets.length);

export const preMatchBookmakerOddsSchema = z.strictObject({
  kind: z.enum(["pre-match", "closing", "historical-pre-match"]), fixtureId: z.uuid(), kickoffAt: at, checkedAt: at, version: oddsVersionSchema,
  limited: z.literal(true).optional(),
  primaryBookmakerId: bookmakerOddsId.optional(),
  fallbackBookmakerIds: z.array(bookmakerOddsId).max(64).optional(),
  books: z.array(z.strictObject({ bookmakerId: bookmakerOddsId, name: oddsDisplayText(128).nullable(), markets: bookmakerMarketsSchema }))
    .min(1).max(250),
}).refine(({ kind, books, checkedAt, kickoffAt }) => new Set(books.map(({ bookmakerId }) => bookmakerId)).size === books.length &&
  (kind === "historical-pre-match" || checkedAt < kickoffAt) && books.every(({ markets }) => markets.every(({ selections }) =>
    selections.every(({ observation }) => observation === undefined ? kind !== "historical-pre-match" : observation.checkedAt <= checkedAt))));

export type BookmakerMarket = z.infer<typeof bookmakerMarketSchema>;
export type PreMatchBookmakerOdds = z.infer<typeof preMatchBookmakerOddsSchema>;

/** A priced outcome can exist even if the bookmaker omitted the other outcomes in the forecast's family. */
export function bookmakerMarketPrice(odds: PreMatchBookmakerOdds | null | undefined, family: MarketFamily, selection: string,
  requestedBookmakerId?: number): string | null {
  const quote = bookmakerMarketQuote(odds, family, selection, requestedBookmakerId);
  return quote?.state === "available" ? quote.offer.price : null;
}

export function bookmakerMarketQuote(odds: PreMatchBookmakerOdds | null | undefined, family: MarketFamily, selection: string,
  requestedBookmakerId?: number) {
  const mapping = launchOddsMapping.find((entry) => entry.family === family);
  const label = mapping && Object.entries(mapping.selections).find(([key]) => key === selection)?.[1];
  return odds && mapping && label ? bookmakerReferencePrice(odds, mapping, label, "full-time",
    requestedBookmakerId === undefined ? {} : { requestedBookmakerId }) : null;
}

const fullTimeMappings = [...launchOddsMapping, ...Object.values(fullTimeTeamTotalOddsMapping)];

/** The sealed read already enforces occurrence freshness at its own as-of time. */
export function bookmakerReferencePrice(odds: PreMatchBookmakerOdds, mapping: { betId: number; betName: string },
  label: string, period: GoalMarketPeriod, policy: ReferenceBookmakerPolicy & { asOf?: number; freshnessMs?: number } = {}) {
  const selection: ReferenceOddsSelection = { fixtureId: odds.fixtureId, phase: odds.kind, period, marketId: mapping.betId,
    marketName: mapping.betName, label, line: null, playerId: null, teamId: null };
  const source = period === "full-time" ? fullTimeMappings.find(({ betId, betName }) => betId === mapping.betId && betName === mapping.betName)
    : period === "half-time" ? binaryGoalTotalOddsMapping["half-time"] : null;
  const candidates = source?.betId === mapping.betId && source.betName === mapping.betName ? odds.books.flatMap<ReferenceOddsOffer>(({ bookmakerId, markets }) => {
    const book = markets.find(({ betId, name }) => betId === mapping.betId && name === mapping.betName);
    const exact = book?.selections.find((entry) => entry.label === label && entry.line === null);
    if (!exact) return [];
    const clocks = exact.observation ?? book?.observation ?? { checkedAt: odds.checkedAt, observedAt: odds.checkedAt, providerUpdatedAt: null };
    return [{ ...selection, ...clocks, price: exact.price, state: "open", bookmakerId, sourceId: `api-football:bookmaker:${bookmakerId}` }];
  }) : [];
  const preferredBookmakerId = policy.preferredBookmakerId ?? odds.primaryBookmakerId ?? odds.books[0]?.bookmakerId;
  return resolveReferenceOdds(selection, candidates, { ...policy, asOf: policy.asOf ?? odds.checkedAt,
    freshnessMs: policy.freshnessMs ?? (odds.kind === "historical-pre-match" ? Number.MAX_SAFE_INTEGER : preMatchReferenceOddsFreshMs),
    ...(preferredBookmakerId === undefined ? {} : { preferredBookmakerId }),
    fallbackBookmakerIds: policy.fallbackBookmakerIds ?? odds.fallbackBookmakerIds ?? [] });
}

export const featuredBookmakerBetIds = Object.freeze([...launchOddsMapping.map(({ betId }) => betId), binaryGoalTotalOddsMapping["half-time"].betId]);
export const replayBookmakerBetIds = Object.freeze([...featuredBookmakerBetIds, ...Object.values(fullTimeTeamTotalOddsMapping).map(({ betId }) => betId)]);

function binaryGoalQuote(odds: PreMatchBookmakerOdds | null | undefined, marketKey: string, selection: string,
  teamTotals: boolean, requestedBookmakerId?: number) {
  if (!odds || (selection !== "over" && selection !== "under")) return null;
  const identity = /^goal:(full-time|half-time):totals:(total|home|away):(\d+\.5):binary$/u.exec(marketKey);
  if (!identity) return null;
  const [, period, scope, line] = identity;
  if (period !== "full-time" && period !== "half-time") return null;
  const mapping = scope === "total" ? binaryGoalTotalOddsMapping[period]
    : teamTotals && period === "full-time" && (scope === "home" || scope === "away") ? fullTimeTeamTotalOddsMapping[scope] : null;
  if (!mapping) return null;
  const label = `${selection === "over" ? "Over" : "Under"} ${line}`;
  return bookmakerReferencePrice(odds, mapping, label, period, requestedBookmakerId === undefined ? {} : { requestedBookmakerId });
}

/** Provider prices are matched by verified bet identity and exact outcome and line. */
export function bookmakerGoalPrice(odds: PreMatchBookmakerOdds | null | undefined, marketKey: string, selection: string,
  requestedBookmakerId?: number): string | null {
  const quote = binaryGoalQuote(odds, marketKey, selection, false, requestedBookmakerId);
  return quote?.state === "available" ? quote.offer.price : null;
}

export function replayBookmakerQuote(odds: PreMatchBookmakerOdds, pick: { key: string; family: MarketFamily; selection: string }) {
  if (odds.kind !== "historical-pre-match") return null;
  return pick.key === pick.family ? bookmakerMarketQuote(odds, pick.family, pick.selection)
    : binaryGoalQuote(odds, pick.key, pick.selection, true);
}
