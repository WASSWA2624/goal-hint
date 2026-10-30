import { bestSlipViews, type BestSlip, type BestSlipsResult } from "@/domain/best-slips";
import type { ViewerAccess } from "@/server/members/viewer-access";
import { getReportingDate } from "@/domain/calendar";
import { savedSlipCompleted, savedSlipOutcome, savedSlipStatus, type SavedSlipResult } from "@/domain/saved-slips";
import { gateBestSlips } from "@/server/slips/best-slips";
import { at, scenarios } from "./stored";

/** Synthetic transport fixture only; model generation has separate bounded-search tests. */
async function read(access: ViewerAccess, completed: boolean): Promise<BestSlipsResult> {
  const record = scenarios.scheduled!.detail.fixture;
  const second = scenarios.live!.detail.fixture;
  const slip: BestSlip = { id: `SENTINEL-PRIVATE-SLIP-${record.fixtureId}`, totalOdds: "10.98", oddsBasis: "bookmaker",
    averageProbability: 0.66, estimatedProbability: 0.3456, selections: [{ fixtureId: record.fixtureId, kickoffAt: at + (completed ? -7_200_000 : 3_600_000),
      homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
      family: "match-result", selection: "home-win", probability: 0.6173, odds: "7.73", oddsBasis: "bookmaker" },
    { fixtureId: second.fixtureId, kickoffAt: at + (completed ? -3_600_000 : 7_200_000), homeTeam: second.homeTeam, awayTeam: second.awayTeam,
      competition: second.competition, family: "total-goals", selection: "under-2.5", probability: 0.7027, odds: "1.42", oddsBasis: "bookmaker" }] };
  const results: SavedSlipResult[] = slip.selections.map((selection) => ({ fixtureId: selection.fixtureId,
    status: completed ? "finished-regulation" : "live", fixtureCompleted: completed,
    regulationVerified: completed, regulationHome: completed ? 1 : null, regulationAway: completed ? 0 : null }));
  const outcome = savedSlipOutcome(slip, results), status = savedSlipStatus(slip, results, outcome);
  return gateBestSlips({ day: getReportingDate(at), state: "generated", entitled: true,
    slips: bestSlipViews([slip], true).map((view) => ({ ...view, outcome, status, completed: savedSlipCompleted(slip, results) })),
    statistics: { total: 1, won: completed ? 1 : 0, lost: 0, pending: completed ? 0 : 1, void: 0 },
    searchLimited: false, partialCoverage: false }, access);
}

export const readBest = (access: ViewerAccess) => read(access, false);
export const readCompletedBest = (access: ViewerAccess) => read(access, true);
