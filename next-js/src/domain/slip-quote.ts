import { z } from "zod";
import { localFeaturedQuoteSchema } from "./local-featured-decision.ts";

export const slipQuoteOddsSchema = z.string().regex(/^[1-9]\d{0,3}\.\d{2,4}$/u);
export const slipBookmakerSchema = z.strictObject({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().min(1).max(128).refine((name) => name === name.trim() && !/[\p{Cc}<>]/u.test(name)).nullable(),
});
export type SlipBookmaker = Readonly<z.infer<typeof slipBookmakerSchema>>;

export const editorialSlipOfferSchema = localFeaturedQuoteSchema.safeExtend({
  snapshotId: localFeaturedQuoteSchema.shape.snapshotId.unwrap(),
  receiptId: localFeaturedQuoteSchema.shape.receiptId.unwrap(),
});
export type EditorialSlipOffer = Readonly<z.infer<typeof editorialSlipOfferSchema>>;
