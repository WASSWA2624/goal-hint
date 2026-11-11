import { z } from "zod";
import { marketSelections } from "./markets.ts";
import { marketFamilySchema } from "./fixture-snapshot.ts";
import { parseDecimalOdds } from "./odds.ts";

const at = z.number().int().nonnegative().max(253_402_300_799_999);
const offer = z.strictObject({
  family: marketFamilySchema,
  selections: z.array(z.strictObject({
    selection: z.string().max(24),
    price: z.string().refine((value) => parseDecimalOdds(value)?.text === value),
  })).min(2).max(3),
}).refine(({ family, selections }) => marketSelections[family].length === selections.length
  && marketSelections[family].every((selection, index) => selections[index]?.selection === selection));

export const inPlayOddsBodySchema = z.strictObject({
  state: z.enum(["available", "suspended", "unavailable"]),
  markets: z.array(offer).max(4),
}).refine(({ state, markets }) => (state === "available") === (markets.length > 0)
  && new Set(markets.map(({ family }) => family)).size === markets.length);
export const inPlayOddsObservationSchema = z.strictObject({
  fixtureId: z.uuid(), kickoffAt: at, checkedAt: at, providerUpdatedAt: at.nullable(),
  prices: inPlayOddsBodySchema,
}).refine(({ checkedAt, providerUpdatedAt }) => providerUpdatedAt === null || providerUpdatedAt <= checkedAt);
export type InPlayOddsBody = z.infer<typeof inPlayOddsBodySchema>;
export type InPlayOddsObservation = z.infer<typeof inPlayOddsObservationSchema>;
