import { z } from "zod";
import { settlementStatuses } from "./market-settlement.ts";

/** Normalized current/final match data, separate from every pre-match forecast. */
export const liveMatchRules = Object.freeze({ maxStatistics: 16, maxEvents: 500, maxText: 160, maxSnapshotBytes: 300_000 });
export const liveMatchMetrics = ["shots-on-goal", "shots-off-goal", "total-shots", "blocked-shots", "shots-inside-box",
  "shots-outside-box", "fouls", "corners", "offsides", "yellow-cards", "red-cards", "goalkeeper-saves", "total-passes",
  "accurate-passes", "possession", "pass-accuracy"] as const;
const at = z.number().int().min(0).max(253_402_300_799_999);
const text = z.string().trim().min(1).max(liveMatchRules.maxText);
const source = {
  state: z.enum(["available", "partial", "unavailable"]),
  retrievedAt: at.nullable(),
  providerUpdatedAt: at.nullable(),
  reason: z.enum(["not-collected", "coverage-unavailable", "coverage-unknown", "provider-error", "invalid-response", "incomplete-response"]).nullable(),
};
export const liveMatchStatisticSchema = z.strictObject({ metric: z.enum(liveMatchMetrics), unit: z.enum(["count", "percent"]),
  home: z.number().min(0).max(1_000_000).nullable(), away: z.number().min(0).max(1_000_000).nullable(),
}).superRefine((v, ctx) => {
  const percent = v.metric === "possession" || v.metric === "pass-accuracy";
  if (v.unit !== (percent ? "percent" : "count") || [v.home, v.away].some((n) => n !== null && (percent ? n > 100 : !Number.isSafeInteger(n))))
    ctx.addIssue({ code: "custom", message: "Statistic value or unit is invalid." });
});
export const liveMatchEventSchema = z.strictObject({ sequence: z.number().int().min(1).max(liveMatchRules.maxEvents),
  elapsed: z.number().int().min(0).max(180).nullable(), extra: z.number().int().min(0).max(120).nullable(),
  team: z.enum(["home", "away"]), type: z.enum(["goal", "card", "substitution", "var"]),
  detail: text.nullable(), player: text.nullable(), assist: text.nullable(), comments: text.nullable(),
});
export const liveMatchStatisticsSchema = z.strictObject({ ...source, items: z.array(liveMatchStatisticSchema).max(liveMatchRules.maxStatistics) })
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((row) => row.metric)).size !== v.items.length || v.state === "unavailable" && v.items.length > 0 ||
      v.state !== "unavailable" && (v.retrievedAt === null || v.items.length === 0) || v.state === "available" && (v.reason !== null || v.items.some((r) => r.home === null || r.away === null)))
      ctx.addIssue({ code: "custom", message: "Incoherent statistics coverage." });
  });
export const liveMatchEventsSchema = z.strictObject({ ...source, items: z.array(liveMatchEventSchema).max(liveMatchRules.maxEvents) })
  .superRefine((v, ctx) => {
    if (v.state === "unavailable" && v.items.length > 0 || v.state !== "unavailable" && v.retrievedAt === null ||
      v.state === "available" && v.reason !== null || v.items.some((item, index) => item.sequence !== index + 1))
      ctx.addIssue({ code: "custom", message: "Incoherent event coverage." });
  });
export const liveMatchSnapshotSchema = z.strictObject({ version: z.literal(1), fixtureId: z.uuid(), cycleId: z.uuid().nullable(),
  kickoffAt: at.nullable(), status: z.enum(settlementStatuses), collectedAt: at, staleAfterMs: z.number().int().min(60_000).max(86_400_000),
  statistics: liveMatchStatisticsSchema, events: liveMatchEventsSchema,
}).superRefine((v, ctx) => {
  if ([v.statistics, v.events].some((s) => s.retrievedAt !== null && s.retrievedAt > v.collectedAt ||
    s.providerUpdatedAt !== null && (s.retrievedAt === null || s.providerUpdatedAt > s.retrievedAt)))
    ctx.addIssue({ code: "custom", message: "Incoherent source timestamps." });
});
export type LiveMatchSnapshot = z.infer<typeof liveMatchSnapshotSchema>;
export type LiveMatchStatistics = z.infer<typeof liveMatchStatisticsSchema>;
export type LiveMatchEvents = z.infer<typeof liveMatchEventsSchema>;
export type LiveMatchEvent = z.infer<typeof liveMatchEventSchema>;
