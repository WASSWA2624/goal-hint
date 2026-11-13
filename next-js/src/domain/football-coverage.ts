import { z } from "zod";

export const historyImportPhases = ["fixtures", "replay", "details", "half-statistics", "team-statistics", "player-statistics", "odds-mapping"] as const;
export type HistoryImportPhase = typeof historyImportPhases[number];
export const historyImportStatus = z.enum(["running", "waiting-quota", "retrying", "caught-up", "pending", "unavailable"]);
export const historyImportCoverage = z.strictObject({ imported: z.number().int().nonnegative().nullable(),
  remaining: z.number().int().nonnegative().nullable(), unavailable: z.number().int().nonnegative().nullable() });

export type FootballCoverage = Readonly<{
  archive: readonly Readonly<{ phase: HistoryImportPhase; status: z.infer<typeof historyImportStatus> | "unreported";
    coverage: z.infer<typeof historyImportCoverage> | null }>[];
  fixtures: Readonly<{ date: string; receipt: Readonly<{ status: string; receivedCount: number; importedCount: number; rejectedCount: number }> | null;
    attemptFailed: boolean; stored: number | null; publicScope: number | null; published: number | null }>;
  odds: readonly Readonly<{ kind: string; status: string; batches: number }>[] | null;
}>;
