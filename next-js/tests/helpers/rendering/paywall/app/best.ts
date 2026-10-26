import { bestSlipViews, type BestSlip, type BestSlipsResult } from "@/domain/best-slips";
import type { ViewerAccess } from "@/server/members/viewer-access";
import { getReportingDate } from "@/domain/calendar";
import { at, scenarios } from "./stored";

/** Synthetic transport fixture only; model generation has separate bounded-search tests. */
export async function readBest(access: ViewerAccess): Promise<BestSlipsResult> {
  const record = scenarios.scheduled!.detail.fixture;
  const slip: BestSlip = { id: `SENTINEL-PRIVATE-SLIP-${record.fixtureId}`, totalOdds: "5.00", oddsBasis: "bookmaker",
    averageProbability: 0.6173, estimatedProbability: 0.3456, selections: [{ fixtureId: record.fixtureId, kickoffAt: at + 3_600_000,
      homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
      family: "match-result", selection: "home-win", probability: 0.6173, odds: "7.73", oddsBasis: "bookmaker" }] };
  return { day: getReportingDate(at), state: "generated", slips: bestSlipViews([slip], access.tier === "full"), searchLimited: false, partialCoverage: false };
}
