import "server-only";

import { bestSlipBuilder, bestSlipCriteria, bestSlipViews, qualifiedJointModel, type BestSlip, type BestSlipsResult, type JointSlipModel } from "../../domain/best-slips.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "../../domain/calendar.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { slipMatchStateForSelection } from "../../domain/slip-match-state.ts";
import { slipSelectionCard } from "../../domain/slip-card.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";
import { readPublicSlipBuild } from "./public-slips.ts";
import { getDatabase } from "../database/client.ts";
import { createPublishedSlips } from "./published-slips.ts";

/** Explicit public projection; incomplete original selections never cross the response boundary. */
export function gateBestSlips(result: BestSlipsResult, access: ViewerAccess): BestSlipsResult {
  const entitled = access.tier === "full";
  return { ...result, entitled, access: { tier: access.tier, signedIn: access.signedIn }, slips: result.slips.map((view) => {
    const { rank, matchCount, totalOdds, estimatedProbability, averageProbability, id, publicationDay, publishedAt, outcome, status, completed } = view;
    const summary = { rank, matchCount, totalOdds, estimatedProbability, averageProbability,
      ...(id !== undefined ? { id } : {}), ...(publicationDay ? { publicationDay } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}), ...(outcome ? { outcome } : {}),
      ...(status ? { status } : {}), ...(completed !== undefined ? { completed } : {}) };
    if (view.slip && (entitled || completed === true)) return { ...summary, slip: view.slip,
      ...(view.matchStates ? { matchStates: view.slip.selections.flatMap((selection) => {
        const state = slipMatchStateForSelection(selection, view.matchStates); return state ? [state] : [];
      }) } : {}) };
    if (!view.slip) return { ...summary, ...(view.preview ? { preview: view.preview } : {}) };
    const released = new Set(view.completedFixtureIds ?? []);
    return { ...summary, preview: view.slip.selections.map((selection) => {
      const state = view.matchStates && slipMatchStateForSelection(selection, view.matchStates);
      const card = slipSelectionCard(selection);
      return { fixture: { ...card.fixture, cycleId: null, status: state?.status ?? "unknown",
        score: state?.score ?? null, liveClock: state?.liveClock ?? null },
        pick: released.has(selection.fixtureId) ? { ...card.snapshotPick, outcome: state?.outcome ?? "pending" } : null };
    }) };
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

export const readBestSlips = createPublishedBestSlipsService();
