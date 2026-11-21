import "server-only";

import { setTimeout as sleep } from "node:timers/promises";
import { getPublicationDeadline, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { bestSlipCombinationIdentity, buildDailyBestSlips, qualifiedJointModel, type JointSlipModel } from "../../domain/best-slips.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { feedQueryRules } from "../../domain/feed-query.ts";
import { slipBuilderRules } from "../../domain/slip-builder.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { provenTrue } from "../shared/authority-proof.ts";
import { bestSlipOddsBands } from "../../domain/best-slip-odds-bands.ts";
import { createPublishedSlips } from "./published-slips.ts";
import { createStoredSlipCohort, type SlipCohortReader } from "./slip-cohort.ts";
import { readBestSlipHistory, type BestSlipHistoryReport } from "./best-slip-history.ts";

export type DailySlipPublicationResult = Readonly<{ day: string; status:
  "published" | "already-published" | "model-unavailable" | "odds-unavailable" | "no-qualifying" | "unavailable";
  eligibleSelections?: number; newBands?: number; newSlips?: number;
  history?: Pick<BestSlipHistoryReport, "status" | "scannedDecisions" | "settledDecisions">;
}>;
/** The private worker alone owns generation/publication. Visitors read the first committed daily snapshot. */
export function createDailySlipPublisher({ database, competitionIds, model, verifyModel, verifyPublicOdds,
  providerOdds = true, now = Date.now, read, historicalEvidence = readBestSlipHistory,
  store = createPublishedSlips(database) }: Readonly<{
  database: DatabaseRuntime; competitionIds: readonly number[]; model: JointSlipModel | null;
  verifyModel: (model: JointSlipModel) => boolean; verifyPublicOdds: () => boolean;
  providerOdds?: boolean; now?: () => number; read?: SlipCohortReader; historicalEvidence?: typeof readBestSlipHistory;
  store?: Pick<ReturnType<typeof createPublishedSlips>, "publishedBands" | "publish"> &
    Partial<Pick<ReturnType<typeof createPublishedSlips>, "publishedSelections">>;
}>) {
  const oddsEnabled = () => providerOdds && provenTrue(verifyPublicOdds);
  const storedRead = read ?? createStoredSlipCohort({ database: () => database, competitionIds: () => competitionIds, providerOdds });
  return Object.freeze({
    async publish(): Promise<DailySlipPublicationResult> {
      const asOf = utcInstantFromEpochMilliseconds(now()), day = getReportingDate(asOf);
      if (!oddsEnabled()) return { day, status: "odds-unavailable" };
      if (!qualifiedJointModel(model, asOf) || !provenTrue(() => verifyModel(model))) return { day, status: "model-unavailable" };
      const existing = await store.publishedBands(day);
      if (existing.includes("legacy") || bestSlipOddsBands.every(band => existing.includes(band.id))) return { day, status: "already-published" };
      const [cohort, prior] = await Promise.all([storedRead(new URLSearchParams({ from: day, to: day,
        status: "scheduled", market: publicPolicy.markets.join(","), sort: "probability", dir: "desc", pageSize: String(feedQueryRules.maximumPageSize),
      }), { featured: true }, { now: () => asOf }), store.publishedSelections?.(day)]);
      if (cohort.today !== day || cohort.range.from !== day || cohort.range.to !== day || cohort.asOf !== asOf || !cohort.featuredSelections) {
        return { day, status: "unavailable" };
      }
      const unexpired = () => {
        const current = utcInstantFromEpochMilliseconds(now());
        return cohort.featuredSelections!.filter(({ kickoffAt }) => current < getPublicationDeadline(utcInstantFromEpochMilliseconds(kickoffAt)));
      };
      const eligibleSelections = unexpired().filter(({ probability }) => probability >= slipBuilderRules.minimumPickPercent / 100).length;
      if (!eligibleSelections) return { day, status: !cohort.featuredSelections.length && cohort.records.some(({ forecast }) => forecast !== null)
        ? "odds-unavailable" : "no-qualifying", eligibleSelections };
      const history = await historicalEvidence(database, asOf, competitionIds);
      const historySummary = { status: history.report.status, scannedDecisions: history.report.scannedDecisions, settledDecisions: history.report.settledDecisions };
      const fixtures = prior?.fixtures ?? new Set<string>(), combinations = prior?.combinations ?? new Set<string>();
      let newBands = 0, newSlips = 0, alreadyPublished = false, unestimated = 0, unavailable = false;
      for (const band of bestSlipOddsBands) {
        if (existing.includes(band.id)) continue;
        const current = utcInstantFromEpochMilliseconds(now());
        if (!qualifiedJointModel(model, current) || getReportingDate(current) !== day || !oddsEnabled()) { unavailable = true; break; }
        const result = buildDailyBestSlips(day, band.id, model, asOf,
          { selections: unexpired(), priorFixtures: fixtures, order: history.order }, combinations);
        unestimated += result.excludedUnestimated;
        if (!result.slips.length) continue;
        try {
          const status = await store.publish({ day, oddsBand: band.id, slips: result.slips, model, verifyModel, verifyPublicOdds,
            searchLimited: cohort.searchLimited || result.searchLimited, partialCoverage: cohort.partialCoverage });
          if (status === "published") {
            newBands++;
            newSlips += result.slips.length;
            for (const slip of result.slips) {
              combinations.add(bestSlipCombinationIdentity(slip.selections));
              slip.selections.forEach(({ fixtureId }) => fixtures.add(fixtureId));
            }
          } else {
            alreadyPublished = true;
            const committed = await store.publishedSelections?.(day);
            committed?.combinations.forEach((value) => combinations.add(value));
            committed?.fixtures.forEach((value) => fixtures.add(value));
          }
        } catch {
          // Retry this day from fresh storage after concurrent membership or cutoff/quote drift.
          unavailable = true;
          break;
        }
      }
      return { day, status: newBands ? "published" : unavailable ? "unavailable" : alreadyPublished ? "already-published" :
        unestimated ? "model-unavailable" : "no-qualifying", newBands, newSlips, eligibleSelections, history: historySummary };
    },
  });
}

/** Retry current EAT day until it has a feasible, qualified cohort. Durable uniqueness survives restarts. */
export async function runDailySlipPublisher(publisher: Pick<ReturnType<typeof createDailySlipPublisher>, "publish">,
  signal: AbortSignal, onResult: (result: DailySlipPublicationResult) => void, once = false) {
  let previous = "";
  do {
    if (signal.aborted) return;
    let result: DailySlipPublicationResult;
    try { result = await publisher.publish(); }
    catch { result = { day: getReportingDate(utcInstantFromEpochMilliseconds(Date.now())), status: "unavailable" }; }
    const key = JSON.stringify(result);
    if (key !== previous) { onResult(result); previous = key; }
    if (once || signal.aborted) return;
    await sleep(60_000, undefined, { signal }).catch(() => {});
  } while (!signal.aborted);
}
