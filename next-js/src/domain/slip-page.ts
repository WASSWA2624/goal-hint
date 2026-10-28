import type { SlipBuildResult } from "./slip-builder.ts";
import type { SlipMatchState } from "./slip-match-state.ts";

/** Public page data shared by the stored reader and browser presentation. */
export type SlipBuildState = "generated" | "no-qualifying" | "no-combinations" | "odds-unavailable" | "model-unavailable" | "data-unavailable" | "rate-limited";
export type SlipBuildPageResult = Readonly<{
  state: SlipBuildState;
  data: SlipBuildResult | null;
  asOf: number;
  examined: number;
  searchLimited: boolean;
  partialCoverage: boolean;
  retryAfterSeconds: number | null;
  matchStates?: readonly SlipMatchState[];
}>;
