import "server-only";

import { z } from "zod";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { recommendationPolicy, type RecommendationDecision } from "../../domain/recommendation.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { FallbackContext, ResolvedForecastMarket } from "../fallback/fallback-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";

const id = z.string().min(1).max(128), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const instant = z.number().int().min(0).max(253_402_300_799_999), version = z.string().regex(/^[1-9]\d{0,19}$/u);
const family = z.enum(publicPolicy.markets), selection = z.enum(Object.values(marketSelections).flat());
const probability = z.number().finite().gt(0).lt(1);
const timing = z.strictObject({ generatedAt: instant.nullable(), retrievedAt: instant, providerUpdatedAt: instant.nullable() });
const quote = z.strictObject({ fixtureId: id, fixtureVersion: version, homeTeamId: id, awayTeamId: id,
  family, selection, period: z.literal(publicPolicy.matchPeriod), line: z.number().nullable(), bookmakerId: z.number().int().positive(),
  decimal: z.string().refine((value) => parseDecimalOdds(value) !== null), snapshotId: hash, observedAt: instant,
  observationReceiptId: hash.optional(),
  providerUpdatedAt: instant.nullable(), permitted: z.boolean(), suspended: z.boolean() });
const pick = z.strictObject({ family, selection, period: z.literal(publicPolicy.matchPeriod), line: z.number().nullable(),
  source: z.enum(["ai", "api-football"]), probability, forecastTimestamps: timing, quote });
export const recommendationDecisionSchema = z.strictObject({ version: z.literal(1), policyVersion: z.string().min(1).max(128),
  fixtureId: id, fixtureVersion: version, homeTeamId: id, awayTeamId: id, analysisAt: instant, evidenceSnapshotId: hash, evidenceHash: hash,
  status: z.enum(["selected", "no-qualified-recommendation"]), selected: pick.nullable(),
  decisions: z.array(z.strictObject({ source: z.enum(["ai", "api-football"]), family, selection, probability: z.number(),
    eligible: z.boolean(), reasons: z.array(z.string().min(1).max(128)).max(32), evidence: z.record(z.string(), z.unknown()) })).max(64),
  fallbackReason: z.string().max(512).nullable(), explanation: z.string().min(1).max(4096),
}).superRefine((value, ctx) => {
  const selected = value.selected;
  if ((value.status === "selected") !== (selected !== null)) ctx.addIssue({ code: "custom", message: "Incoherent recommendation availability." });
  if (!selected) return;
  const price = selected.quote;
  if (!(marketSelections[selected.family] as readonly string[]).includes(selected.selection) ||
    selected.line !== (selected.family === "total-goals" ? publicPolicy.totalGoalsLine : null) ||
    selected.probability < recommendationPolicy.minimumProbability || !price.permitted || price.suspended ||
    price.fixtureId !== value.fixtureId || price.fixtureVersion !== value.fixtureVersion ||
    price.homeTeamId !== value.homeTeamId || price.awayTeamId !== value.awayTeamId ||
    price.family !== selected.family || price.selection !== selected.selection || price.period !== selected.period || price.line !== selected.line ||
    price.providerUpdatedAt !== null && price.providerUpdatedAt > price.observedAt ||
    !value.decisions.some((entry) => entry.eligible && entry.family === selected.family && entry.selection === selected.selection &&
      entry.source === selected.source && entry.probability === selected.probability)) ctx.addIssue({ code: "custom", message: "Invalid recommendation identity or eligibility." });
});

/** Archive validation keeps the recommendation separate from the complete-family argmax contract. */
export function parseRecommendationDecision(value: unknown, context: FallbackContext,
  markets: Readonly<Record<MarketFamily, ResolvedForecastMarket>>): RecommendationDecision {
  const parsed = recommendationDecisionSchema.parse(value), expected = context.context, selected = parsed.selected;
  if (parsed.fixtureId !== expected.fixtureId || parsed.fixtureVersion !== String(expected.fixtureVersion) ||
    parsed.homeTeamId !== expected.home.teamId || parsed.awayTeamId !== expected.away.teamId ||
    parsed.analysisAt !== expected.analysisAt || parsed.evidenceHash !== context.evidenceHash ||
    selected && (selected.quote.observedAt > expected.cutoffAt ||
      expected.cutoffAt - selected.quote.observedAt > recommendationPolicy.quoteMaxAgeMs ||
      selected.forecastTimestamps.retrievedAt > expected.kickoffAt)) throw new RangeError("Invalid recommendation context.");
  if (selected) {
    const item = markets[selected.family];
    if (!item.available || item.market.source !== selected.source ||
      (item.market.probabilities as Readonly<Record<string, number>>)[selected.selection] !== selected.probability ||
      evidenceFingerprint(item.timestamps) !== evidenceFingerprint(selected.forecastTimestamps)) throw new RangeError("Invalid recommendation forecast.");
  }
  return freezeEvidence(parsed) as RecommendationDecision;
}
