import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { liveClockSchema, marketFamilySchema } from "./fixture-snapshot.ts";
import { isPlayedFinalStatus, settlementStatuses } from "./market-settlement.ts";
import { isMarketSelection } from "./markets.ts";
import { slipBuilderRules, type SlipSelection } from "./slip-builder.ts";
import { slipForecastReferenceSchema } from "./slip-forecast-reference.ts";
import type { SlipMatchState } from "./slip-match-state.ts";

export const slipMatchRefreshRules = Object.freeze({
  intervalMs: 20_000, maximumSelections: slipBuilderRules.maximumCandidates,
  maximumRequestBytes: 1_048_576, requestDeadlineMs: 10_000, requestsPerMinute: 12,
});

/** Names, logos, prices and whole slips never need to travel back for an observation refresh. */
export type SlipMatchWatch = Pick<SlipSelection, "fixtureId" | "kickoffAt" | "family" | "selection" | "probability" | "forecast"> & Readonly<{
  homeTeam: Readonly<{ id: string }>; awayTeam: Readonly<{ id: string }>;
}>;

const instant = z.number().int().positive().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); return true; } catch { return false; }
}, "Invalid UTC instant.");
const identity = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u);
export const slipMatchWatchSchema = z.strictObject({
  fixtureId: z.uuid(), kickoffAt: instant, homeTeam: z.strictObject({ id: identity }), awayTeam: z.strictObject({ id: identity }),
  family: marketFamilySchema, selection: z.string().min(1).max(64), probability: z.number().min(0).max(1),
  forecast: slipForecastReferenceSchema.optional(),
}).refine((value) => isMarketSelection(value.family, value.selection), "Invalid original selection.")
  .transform((value) => value as SlipMatchWatch);

export function slipMatchSelectionKey(selection: Pick<SlipMatchWatch, "fixtureId" | "family" | "selection" | "forecast">): string {
  const reference = selection.forecast;
  return JSON.stringify([selection.fixtureId, selection.family, selection.selection,
    reference?.cycleId ?? null, reference?.revisionId ?? null, reference?.publishedAt ?? null]);
}

export function slipMatchWatch(selection: SlipMatchWatch): SlipMatchWatch {
  return { fixtureId: selection.fixtureId, kickoffAt: selection.kickoffAt, homeTeam: { id: selection.homeTeam.id },
    awayTeam: { id: selection.awayTeam.id }, family: selection.family, selection: selection.selection,
    probability: selection.probability, ...(selection.forecast ? { forecast: { cycleId: selection.forecast.cycleId,
      revisionId: selection.forecast.revisionId, publishedAt: selection.forecast.publishedAt } } : {}) };
}

/** Repeated legs across slips consume one observation read; contradictory originals fail closed. */
export function uniqueSlipMatchWatches(selections: readonly SlipMatchWatch[]): readonly SlipMatchWatch[] {
  const unique = new Map<string, SlipMatchWatch>();
  for (const selection of selections) {
    const watch = slipMatchWatch(selection), key = slipMatchSelectionKey(watch), previous = unique.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(watch)) throw new RangeError("Conflicting original slip selection.");
    unique.set(key, watch);
  }
  return [...unique.values()];
}

export const slipMatchRefreshRequestSchema = z.strictObject({
  selections: z.array(slipMatchWatchSchema).min(1).max(slipMatchRefreshRules.maximumSelections),
}).superRefine((value, context) => {
  try { uniqueSlipMatchWatches(value.selections as readonly SlipMatchWatch[]); }
  catch { context.addIssue({ code: "custom", message: "Conflicting original selections." }); }
});

const score = z.strictObject({ home: z.number().int().min(0).max(1000), away: z.number().int().min(0).max(1000) });
export const slipMatchStateSchema = z.strictObject({
  fixtureId: z.uuid(), family: marketFamilySchema, selection: z.string().min(1).max(64), forecast: slipForecastReferenceSchema.optional(),
  status: z.enum(settlementStatuses), score: score.nullable(), liveClock: liveClockSchema.nullable(),
  outcome: z.enum(["correct", "incorrect", "pending", "void"]),
}).superRefine((value, context) => {
  const final = isPlayedFinalStatus(value.status);
  if (!isMarketSelection(value.family, value.selection) || value.status !== "live" && value.liveClock !== null
    || value.status !== "live" && !final && value.score !== null
    || (value.outcome === "correct" || value.outcome === "incorrect") && (!final || value.score === null)
    || (value.status === "scheduled" || value.status === "live") && value.outcome !== "pending") {
    context.addIssue({ code: "custom", message: "Incoherent match observation." });
  }
}).transform((value) => value as SlipMatchState);

export const slipMatchRefreshResponseSchema = z.strictObject({
  states: z.array(slipMatchStateSchema).max(slipMatchRefreshRules.maximumSelections), asOf: instant,
}).superRefine((value, context) => {
  if (new Set(value.states.map(slipMatchSelectionKey)).size !== value.states.length) {
    context.addIssue({ code: "custom", message: "Duplicate match observations." });
  }
});

export type SlipMatchRefreshResponse = Readonly<{ states: readonly SlipMatchState[]; asOf: number }>;
