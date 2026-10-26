import { z } from "zod";
import { isMarketSelection, marketSelections, type AcceptedMarket, type MarketFamily } from "./markets.ts";
import { publicPolicy } from "./public-policy.ts";
import type { RecommendationDecision } from "./recommendation.ts";

/** Subscriber forecast projection: private bookmaker, price, receipt and eligibility audits never leave the server. */
export const publicRecommendationSchema = z.strictObject({ status: z.enum(["selected", "no-qualified-recommendation"]),
  selected: z.strictObject({ family: z.enum(publicPolicy.markets), selection: z.enum(Object.values(marketSelections).flat()),
    probability: z.number().gt(0).lt(1), source: z.enum(["ai", "api-football"]),
    period: z.literal(publicPolicy.matchPeriod), line: z.number().nullable() }).nullable(),
}).refine((value) => (value.status === "selected") === (value.selected !== null) &&
  (value.selected === null || isMarketSelection(value.selected.family, value.selected.selection) &&
    value.selected.line === (value.selected.family === "total-goals" ? publicPolicy.totalGoalsLine : null)));
export type PublicRecommendation = z.infer<typeof publicRecommendationSchema>;

export function publicRecommendation(decision: RecommendationDecision | undefined): PublicRecommendation | undefined {
  if (decision === undefined) return undefined;
  const value = decision.selected;
  return { status: decision.status, selected: value ? { family: value.family, selection: value.selection, probability: value.probability,
    source: value.source, period: value.period, line: value.line } : null };
}

/** Display selection is a separate contract: it need not be the complete family's argmax. */
export type DisplayedMarketPick = { [Family in MarketFamily]: Extract<AcceptedMarket, { family: Family }> & Readonly<{
  /** Original validated argmax forecast, used by shared probability presentation. Never stored as a forecast. */
  presentationOf: Extract<AcceptedMarket, { family: Family }>;
}> }[MarketFamily];
/** A presentation copy for the selected recommendation; the archived complete-family argmax is retained intact. */
export function recommendationMarket(market: AcceptedMarket, recommendation?: PublicRecommendation): AcceptedMarket | DisplayedMarketPick {
  const pick = recommendation?.selected;
  if (!pick || pick.family !== market.family || pick.source !== market.source ||
    (market.probabilities as Readonly<Record<string, number>>)[pick.selection] !== pick.probability) return market;
  return { ...market, selection: pick.selection, selectedProbability: pick.probability, presentationOf: market } as DisplayedMarketPick;
}

export function recommendationFamily(recommendation: PublicRecommendation | undefined, eligible: readonly MarketFamily[]): MarketFamily | null | undefined {
  if (recommendation === undefined) return undefined;
  const pick = recommendation.selected;
  if (pick && eligible.includes(pick.family)) return pick.family;
  // An explicit family filter can still inspect probability-only family forecasts.
  return eligible.length === publicPolicy.markets.length ? null : undefined;
}
