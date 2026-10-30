import { bestSlipViews, type BestSlip, type BestSlipsResult, type BestSlipView } from "@/domain/best-slips";
import { bestSlipsQueryRules, resolveBestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { addReportingDays, parseReportingDate } from "@/domain/calendar";
import type { SlipStatus } from "@/domain/slip-status";
import { criteria, syntheticBuild } from "../../../tests/helpers/rendering/slips/app/stored";
import type { ReviewViewer } from "./viewer-modes";

/** Review-only synthetic records. No database, account mutations or live provider requests. */
export const reviewDay = parseReportingDate("2026-10-30");
const source = syntheticBuild(criteria, false, false, true).data!.slips[0]!;
const statuses: readonly SlipStatus[] = ["not-started", "in-progress", "won", "lost", "void", "cancelled"];
const dayCounts = [100, 37, 12] as const;
const sampleUuid = (value: number) => `${value.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
export const samples: readonly BestSlipView[] = dayCounts.flatMap((count, dayIndex) => {
  const publicationDay = addReportingDays(reviewDay, -dayIndex);
  return Array.from({ length: count }, (_, index) => {
    const status = statuses[index % statuses.length]!;
    const outcome = status === "won" ? "won" : status === "lost" ? "lost" : status === "void" || status === "cancelled" ? "void" : "pending";
    const slip: BestSlip = { ...source, id: `sample-${publicationDay}-${index + 1}`,
      totalOdds: (4.5 + (index % 21) * .05).toFixed(2), averageProbability: .78 + (index % 16) / 100,
      estimatedProbability: .7 - index / 1000,
      selections: source.selections.map((selection, leg) => ({ ...selection, fixtureId: sampleUuid(dayIndex * 1000 + index * 10 + leg + 1),
        ...(selection.forecast ? { forecast: { ...selection.forecast,
          cycleId: sampleUuid(10000 + dayIndex * 1000 + index * 10 + leg + 1),
          revisionId: sampleUuid(20000 + dayIndex * 1000 + index * 10 + leg + 1) } } : {}) })),
    };
    return { ...bestSlipViews([slip], true)[0]!, rank: index + 1, id: slip.id, publicationDay,
      completed: status !== "not-started" && status !== "in-progress",
      publishedAt: Date.parse(`${publicationDay}T06:15:00Z`) + index * 60_000, outcome, status };
  });
});

export function browseSamples(query: BestSlipsQuery, viewer: ReviewViewer = "subscriber"): BestSlipsResult {
  const dates = resolveBestSlipsDates(query, reviewDay);
  const entitled = viewer === "subscriber";
  const cohort = samples.filter((sample) => (entitled || sample.completed)
    && (!dates.from || sample.publicationDay! >= dates.from && sample.publicationDay! <= dates.to!));
  const filtered = cohort.filter((sample) => query.status === "all" || (query.status === "cancelled" ? sample.status === "cancelled"
    : query.status === "void" ? sample.outcome === "void" && sample.status !== "cancelled" : sample.outcome === query.status));
  const start = (query.page - 1) * bestSlipsQueryRules.pageSize;
  const slips = filtered.slice(start, start + bestSlipsQueryRules.pageSize);
  return { day: reviewDay, entitled, state: "generated", slips, searchLimited: false, partialCoverage: false,
    statistics: { total: cohort.length, won: cohort.filter((sample) => sample.outcome === "won").length,
      lost: cohort.filter((sample) => sample.outcome === "lost").length, pending: cohort.filter((sample) => sample.outcome === "pending").length,
      void: cohort.filter((sample) => sample.outcome === "void" && sample.status !== "cancelled").length,
      cancelled: cohort.filter((sample) => sample.status === "cancelled").length },
    browse: { query, total: filtered.length, pageSize: bestSlipsQueryRules.pageSize, hasMore: start + slips.length < filtered.length,
      nextCursor: null, from: dates.from, to: dates.to } };
}
