import "server-only";

import { bestSlipBuilder, bestSlipCriteria, bestSlipViews, qualifiedJointModel, type BestSlip, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { readPublicSlipBuild } from "./public-slips.ts";

export function gateBestSlips(result: BestSlipsResult, access: ViewerAccess): BestSlipsResult {
  return { ...result, slips: result.slips.map((view) => ({ rank: view.rank, ...(access.tier === "full" && view.totalOdds ? { totalOdds: view.totalOdds } : {}),
    ...(access.tier === "full" && view.estimatedProbability !== undefined ? { estimatedProbability: view.estimatedProbability } : {}), matchCount: view.matchCount,
    ...(access.tier === "full" && view.slip ? { slip: view.slip } : {}) })) };
}

/** Recomputed from today's current stored cohort; no shared cache ever contains a viewer response. */
export function createBestSlipsService({ read = readPublicSlipBuild, model = null, providerOdds = publicPolicy.features.providerOdds,
  now = Date.now }: { read?: typeof readPublicSlipBuild; model?: JointSlipModel | null; providerOdds?: boolean; now?: () => number } = {}) {
  return async (access: ViewerAccess, locale = "en"): Promise<BestSlipsResult> => {
    const at = utcInstantFromEpochMilliseconds(now()), day = getReportingDate(at);
    const base = { day, slips: [], searchLimited: false, partialCoverage: false } as const;
    if (!providerOdds) return { ...base, state: "odds-unavailable" };
    if (!qualifiedJointModel(model, at)) return { ...base, state: "model-unavailable" };
    let started = false;
    const clock = { now: () => { if (!started) { started = true; return at; } return utcInstantFromEpochMilliseconds(now()); } };
    const result = await read(bestSlipCriteria(day), clock, locale, bestSlipBuilder(model));
    // A day/model rollover during the bounded read must not publish an outdated daily set.
    const completedAt = now();
    if (getReportingDate(utcInstantFromEpochMilliseconds(completedAt)) !== day || !qualifiedJointModel(model, completedAt)) {
      return { ...base, state: "data-unavailable" };
    }
    const slips = (result.data?.slips ?? []) as readonly BestSlip[];
    if (slips.some((slip) => !Number.isFinite(slip.estimatedProbability))) return { ...base, state: "model-unavailable" };
    return { day, state: result.state, slips: bestSlipViews(slips, access.tier === "full"),
      searchLimited: result.searchLimited, partialCoverage: result.partialCoverage };
  };
}

// OP-15/17 model qualification and OP-36 public odds rights remain unresolved. Fail closed.
export const readBestSlips = createBestSlipsService();
