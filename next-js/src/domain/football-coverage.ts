import { z } from "zod";

export const historyImportPhases = ["fixtures", "replay", "details", "half-statistics", "team-statistics", "player-statistics", "odds-mapping"] as const;
export type HistoryImportPhase = typeof historyImportPhases[number];
export const historyImportStatus = z.enum(["running", "waiting-quota", "retrying", "caught-up", "pending", "unavailable"]);
export const historyImportCoverage = z.strictObject({ imported: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(), unavailable: z.number().int().nonnegative().nullable(),
  scan: z.strictObject({ date: z.string(), dateScanned: z.boolean(), dateComplete: z.boolean().nullable(),
    scannedSeasons: z.number().int().nonnegative(), partialSeasons: z.number().int().nonnegative(),
    nextScope: z.strictObject({ competitionId: z.number().int().positive(), season: z.number().int().positive(),
      round: z.string().exactOptional() }).nullable(),
    dateRepair: z.strictObject({ complete: z.boolean(), nextOlder: z.string(), nextRecent: z.string(),
      completed: z.number().int().nonnegative(), unavailable: z.number().int().nonnegative(), fixtures: z.number().int().nonnegative(),
      changed: z.number().int().nonnegative(), partial: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
      deferred: z.number().int().nonnegative(), last: z.strictObject({ date: z.string(),
        status: z.enum(["complete", "unavailable", "partial", "failed", "deferred"]), reason: z.string().nullable() }).nullable() }).exactOptional(),
  }).exactOptional() });

export type FootballWorkerHealth = Readonly<{
  at: number; workerWindowHours: number;
  lanes: readonly Readonly<{ type: string; ready: number; active: number; future: number; stalled: number; queueLagMs: number;
    nextRunAt: number | null; lastSuccessAt: number | null; lastErrorAt: number | null }>[];
  quota: Readonly<{ periodStartsAt: number; resetAt: number; used: number; remaining: number; dailyLimit: number;
    providerDailyLimit: number; providerUsage: Readonly<{ observedAt: number; limit: number; remaining: number }> | null;
    minuteLimit: number; reserve: number; resetPending: boolean }> | null;
  resultPoller: Readonly<{ leaseUntil: number; nextLiveAt: number; nextDateAt: number; liveFailures: number; dateFailures: number;
    liveError: string | null; dateError: string | null }> | null;
  lastCompletedResultAt: number | null; detailsLeaseUntil: number | null;
}>;

export type FootballCoverage = Readonly<{
  archive: readonly Readonly<{ phase: HistoryImportPhase; status: z.infer<typeof historyImportStatus> | "unreported";
    coverage: z.infer<typeof historyImportCoverage> | null; checkpointAt?: number | null }>[];
  fixtures: Readonly<{ date: string; receipt: Readonly<{ status: string; receivedCount: number; importedCount: number; rejectedCount: number }> | null;
    attemptFailed: boolean; stored: number | null; publicScope: number | null; published: number | null;
    discovered?: number | null; discoveryComplete?: boolean; discoveryObservedAt?: number | null; reportedMissingIds?: number | null;
    forecastPublished?: number | null; predictionReady?: number | null; marketPredictions?: number | null;
    awaitingData?: number | null; excluded?: number | null;
    priced?: number | null; observedOdds?: number | null; observedWithoutFreshPrice?: number | null }>;
  odds: readonly Readonly<{ kind: string; status: string; batches: number }>[] | null;
  sections?: readonly Readonly<{ resource: string; status: string; count: number; lastCheckpointAt: number | null }>[] | null;
  marketMapping?: Readonly<Record<"pre-match" | "in-play", Readonly<{ checkedAt: number | null; mapped: number; unmapped: number; unsupported: number }> | null>>;
  workers?: FootballWorkerHealth | null;
}>;
