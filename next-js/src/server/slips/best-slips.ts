import "server-only";

import { bestSlipBuilder, bestSlipCriteria, bestSlipViews, qualifiedJointModel, type BestSlip, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { gateSlipView } from "./slip-preview.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { readPublicSlipBuild } from "./public-slips.ts";
import { getDatabase } from "../database/client.ts";
import { createPublishedSlips } from "./published-slips.ts";

/** Explicit public projection; incomplete original selections never cross the response boundary. */
export function gateBestSlips(result: BestSlipsResult, access: ViewerAccess): BestSlipsResult {
  const entitled = access.tier === "full";
  return { ...result, entitled, access: { tier: access.tier, signedIn: access.signedIn }, slips: result.slips.map((view) => {
    return gateSlipView(view, access);
  }) };
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
    const visible = slips;
    return gateBestSlips({ day, state: result.state, slips: bestSlipViews(visible, true, result.matchStates),
      searchLimited: result.searchLimited, partialCoverage: result.partialCoverage,
      statistics: { total: visible.length, won: 0, lost: 0, pending: visible.length, void: 0 } }, access);
  };
}

type PublishedBestSlipsReader = (day: ReportingDate, locale: string, completedOnly: boolean) => Promise<BestSlipsResult | null>;
const readPublishedDay: PublishedBestSlipsReader = async (day, _locale, completedOnly) => {
  const database = getDatabase();
  if (isDevelopmentDemo()) {
    const { ensureDemoSlipDates } = await import("../demo/slips-seed.ts");
    await ensureDemoSlipDates(database, [day]);
  }
  return createPublishedSlips(database).day(day, completedOnly);
};

/** All viewers browse today; the projection withholds unfinished per-match predictions. */
export function createPublishedBestSlipsService({ read = readPublishedDay, providerOdds = publicPolicy.features.providerOdds, now = Date.now }: {
  read?: PublishedBestSlipsReader; providerOdds?: boolean; now?: () => number;
} = {}) {
  return async (access: ViewerAccess, locale = "en"): Promise<BestSlipsResult> => {
    const day = getReportingDate(utcInstantFromEpochMilliseconds(now()));
    const empty = { day, entitled: access.tier === "full", slips: [], searchLimited: false, partialCoverage: false } as const;
    if (!providerOdds) return { ...empty, state: "odds-unavailable" };
    try {
      const published = await read(day, locale, false);
      return published ? gateBestSlips({ ...published, day }, access) : { ...empty, state: "model-unavailable" };
    } catch { return { ...empty, state: "data-unavailable" }; }
  };
}

/** The entry screen and its API share the same paginated 30-day collection. */
export async function readBestSlips(access: ViewerAccess, locale = "en"): Promise<BestSlipsResult> {
  const [{ readBestSlipsBrowse }, { defaultBestSlipsQuery }] = await Promise.all([import("./best-slips-browse.ts"), import("../../domain/best-slips-query.ts")]);
  return readBestSlipsBrowse(access, defaultBestSlipsQuery(), locale);
}
