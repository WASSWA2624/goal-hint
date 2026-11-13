import { z } from "zod";
import { parseDecimalOdds } from "./odds.ts";
import type { MarketFamily } from "./markets.ts";
import { launchOddsMapping } from "./odds-markets.ts";

const at = z.number().int().nonnegative().max(253_402_300_799_999);
export const oddsVersionSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const bookmakerOddsId = z.number().int().positive().max(4_294_967_295);
export const oddsDisplayText = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim() && !/[\p{Cc}\p{Cf}<>]/u.test(value));

const bookmakerSelection = z.strictObject({ label: oddsDisplayText(64),
  line: z.string().regex(/^-?\d{1,3}(?:\.\d{1,3})?$/u).nullable(),
  price: z.string().refine((value) => parseDecimalOdds(value)?.text === value) });
export const bookmakerMarketSchema = z.strictObject({ betId: bookmakerOddsId, name: oddsDisplayText(256),
  selections: z.array(bookmakerSelection).min(1).max(1000) })
  .refine(({ selections }) => new Set(selections.map(({ label, line }) => JSON.stringify([label, line]))).size === selections.length);
export const bookmakerMarketsSchema = z.array(bookmakerMarketSchema).min(1).max(1000)
  .refine((markets) => new Set(markets.map(({ betId }) => betId)).size === markets.length);

export const preMatchBookmakerOddsSchema = z.strictObject({
  kind: z.enum(["pre-match", "closing"]), fixtureId: z.uuid(), kickoffAt: at, checkedAt: at, version: oddsVersionSchema,
  limited: z.literal(true).optional(),
  books: z.array(z.strictObject({ bookmakerId: bookmakerOddsId, name: oddsDisplayText(128).nullable(), markets: bookmakerMarketsSchema }))
    .min(1).max(250),
}).refine(({ books, checkedAt, kickoffAt }) => checkedAt < kickoffAt && new Set(books.map(({ bookmakerId }) => bookmakerId)).size === books.length);

export type BookmakerMarket = z.infer<typeof bookmakerMarketSchema>;
export type PreMatchBookmakerOdds = z.infer<typeof preMatchBookmakerOddsSchema>;

/** A priced outcome can exist even if the bookmaker omitted the other outcomes in the forecast's family. */
export function bookmakerMarketPrice(odds: PreMatchBookmakerOdds | null | undefined, family: MarketFamily, selection: string): string | null {
  const mapping = launchOddsMapping.find((entry) => entry.family === family);
  const label = mapping && Object.entries(mapping.selections).find(([key]) => key === selection)?.[1];
  if (!mapping || !label) return null;
  return exactBookmakerPrice(odds, mapping, label);
}

function exactBookmakerPrice(odds: PreMatchBookmakerOdds | null | undefined, mapping: { betId: number; betName: string }, label: string): string | null {
  for (const book of odds?.books ?? []) {
    const price = book.markets.find(({ betId, name }) => betId === mapping.betId && name === mapping.betName)
      ?.selections.find((entry) => entry.label === label && entry.line === null)?.price;
    if (price) return price;
  }
  return null;
}

const goalTotalsOffers = {
  "full-time": launchOddsMapping.find(({ family }) => family === "total-goals")!,
  "half-time": { betId: 6, betName: "Goals Over/Under First Half" },
} as const;
export const featuredBookmakerBetIds = Object.freeze([...launchOddsMapping.map(({ betId }) => betId), goalTotalsOffers["half-time"].betId]);

/** Provider prices are matched by verified bet identity and exact outcome/line. */
export function bookmakerGoalPrice(odds: PreMatchBookmakerOdds | null | undefined, marketKey: string, selection: string): string | null {
  if (selection !== "over" && selection !== "under") return null;
  const identity = /^goal:(full-time|half-time):totals:total:(\d+(?:\.\d+)?):(binary|asian)$/u.exec(marketKey);
  if (!identity) return null;
  const [, period, line, payout] = identity;
  // The stored totals mapping has verified binary half-line semantics. Asian and team/second-half bets need their own verified mappings.
  if (payout !== "binary" || !line?.endsWith(".5")) return null;
  return exactBookmakerPrice(odds, goalTotalsOffers[period as keyof typeof goalTotalsOffers], `${selection === "over" ? "Over" : "Under"} ${line}`);
}
