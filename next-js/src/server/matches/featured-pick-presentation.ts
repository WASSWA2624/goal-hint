import "server-only";

import type { FeaturedPrediction } from "../../domain/extended-markets.ts";
import { feedMarketPickIdentity } from "../../domain/feed-market-picks.ts";
import type { LocalFeaturedDecision } from "../../domain/local-featured-decision.ts";
import { isMarketFamily } from "../../domain/markets.ts";
import { predictionText } from "../../domain/prediction-label.ts";
import { createMessages } from "../../i18n/messages.ts";

type FeaturedIdentity = Pick<FeaturedPrediction, "key" | "family" | "label" | "code" | "selection" | "selectionLabel">;

/** Keep legacy aliases and extended labels identical across read-time and frozen decisions. */
export function featuredPickIdentity(marketKey: string, selection: string, locale: string): FeaturedIdentity | null {
  const identity = feedMarketPickIdentity(isMarketFamily(marketKey) ? `${marketKey}:${selection}` : `${marketKey}~${selection}`);
  if (!identity) return null;
  const { definition, legacy } = identity;
  const choice = definition.selections.find(({ key }) => key === identity.selection)!;
  const messages = createMessages(locale);
  return { key: legacy?.family ?? marketKey, family: legacy?.family ?? "total-goals",
    label: legacy ? messages.text(`market.family.${legacy.family}`) : definition.label, code: legacy ? null : definition.code,
    selection: legacy?.selection ?? selection,
    selectionLabel: predictionText(messages, legacy?.selection ?? selection, { marketKey: identity.marketKey, rule: choice.rule, label: choice.label }) };
}

/** Convert a sealed selection without making a fresh odds choice or exposing private receipt identities. */
export function toFeaturedLocalDecision(decision: LocalFeaturedDecision, locale = "en", oddsPermitted = true,
  knownIdentity?: FeaturedIdentity): (FeaturedPrediction & { source: "local-engine" }) | null {
  if (decision.status === "abstained") return null;
  const identity = knownIdentity ?? featuredPickIdentity(decision.marketKey, decision.selection, locale);
  if (!identity) return null;
  const base = { ...identity, probability: decision.probability, source: "local-engine" as const };
  if (decision.status === "forecast-only") return { ...base, tier: "forecast-only", odds: null, forecastOnlyReason: decision.reason };
  const tier = "tier" in decision ? decision.tier : undefined;
  if (!oddsPermitted) return { ...base, odds: null, ...(tier ? { tier: "forecast-only", forecastOnlyReason: "odds-not-permitted" } : {}) };
  const { snapshotId: _snapshotId, receiptId: _receiptId, ...featuredQuote } = decision.quote;
  void _snapshotId; void _receiptId;
  return { ...base, odds: featuredQuote.decimal, featuredQuote, featuredExpectedNetReturn: decision.expectedNetReturn,
    ...(tier ? { tier } : {}) };
}
