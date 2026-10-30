import "server-only";

import { bestSlipBuilder, bestSlipCriteria, bestSlipViews, qualifiedJointModel, type BestSlip, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { slipMatchStateForSelection } from "../../domain/slip-match-state.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { readPublicSlipBuild } from "./public-slips.ts";
import { getDatabase } from "../database/client.ts";
import { createPublishedSlips } from "./published-slips.ts";

export function gateBestSlips(result: BestSlipsResult, access: ViewerAccess): BestSlipsResult {
  return { ...result, entitled: access.tier === "full", slips: result.slips.map((view) => ({ rank: view.rank, matchCount: view.matchCount,
    totalOdds: view.totalOdds, estimatedProbability: view.estimatedProbability, averageProbability: view.averageProbability,
    ...(view.id !== undefined ? { id: view.id } : {}),
    ...(view.publicationDay !== undefined ? { publicationDay: view.publicationDay } : {}),
    ...(view.publishedAt !== undefined ? { publishedAt: view.publishedAt } : {}),
    ...(view.outcome !== undefined ? { outcome: view.outcome } : {}),
    ...(view.status !== undefined ? { status: view.status } : {}),
    ...((access.tier === "full" || view.publicationDay !== undefined && view.publicationDay < result.day) && view.slip ? { slip: view.slip,
      ...(view.matchStates ? { matchStates: view.slip.selections.flatMap((selection) => {
        const state = slipMatchStateForSelection(selection, view.matchStates); return state ? [state] : [];
      }) } : {}) } : {}) })) };
}

/** Recomputed from today's current stored cohort; no shared cache ever contains a viewer response. */
export function createBestSlipsService({ read = readPublicSlipBuild, model = null, providerOdds = publicPolicy.features.providerOdds,
  now = Date.now }: { read?: typeof readPublicSlipBuild; model?: JointSlipModel | null; providerOdds?: boolean; now?: () => number } = {}) {
  return async (access: ViewerAccess, locale = "en"): Promise<BestSlipsResult> => {
    const at = utcInstantFromEpochMilliseconds(now()), day = getReportingDate(at);
    const base = { day, entitled: access.tier === "full", slips: [], searchLimited: false, partialCoverage: false } as const;
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
    return { day, entitled: access.tier === "full", state: result.state, slips: bestSlipViews(slips, access.tier === "full", result.matchStates),
      searchLimited: result.searchLimited, partialCoverage: result.partialCoverage,
      statistics: { total: slips.length, won: 0, lost: 0, pending: slips.length, void: 0 } };
  };
}

type PublishedBestSlipsReader = (day: ReportingDate, locale: string) => Promise<BestSlipsResult | null>;
const readPublishedDay: PublishedBestSlipsReader = async (day) => {
  const database = getDatabase();
  if (isDevelopmentDemo()) {
    const { ensureDemoSlipDates } = await import("../demo/slips-seed.ts");
    await ensureDemoSlipDates(database, [day]);
  }
  return createPublishedSlips(database).day(day);
};

/** Public results start yesterday; current predictions require a valid entitlement. Reads never publish a cohort. */
export function createPublishedBestSlipsService({ read = readPublishedDay, providerOdds = publicPolicy.features.providerOdds, now = Date.now }: {
  read?: PublishedBestSlipsReader; providerOdds?: boolean; now?: () => number;
} = {}) {
  return async (access: ViewerAccess, locale = "en"): Promise<BestSlipsResult> => {
    const day = getReportingDate(utcInstantFromEpochMilliseconds(now())), publicationDay = access.tier === "full" ? day : addReportingDays(day, -1);
    const empty = { day, entitled: access.tier === "full", slips: [], searchLimited: false, partialCoverage: false } as const;
    if (!providerOdds) return { ...empty, state: "odds-unavailable" };
    try {
      const published = await read(publicationDay, locale);
      return published ? gateBestSlips({ ...published, day }, access) : { ...empty, state: "model-unavailable" };
    } catch { return { ...empty, state: "data-unavailable" }; }
  };
}

export const readBestSlips = createPublishedBestSlipsService();
