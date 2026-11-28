import { bestSlipView, type BestSlipsResult, type BestSlipView } from "@/domain/best-slips";
import { bestSlipsQueryRules, matchesBestSlipsRanges, matchesBestSlipsStatus, parseBestSlipsCursor, resolveBestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { addReportingDays, type ReportingDate } from "@/domain/calendar";
import { bestSlipOddsBands, bestSlipOddsBandFor, dailyBestSlipBandLimit, defaultBestSlipOddsBand } from "@/domain/best-slip-odds-bands";
import { slipStatusCategory } from "@/domain/slip-status";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { ViewerAccess } from "@/server/members/viewer-access";
import { criteria, now, syntheticBuild, today } from "./stored";

/** Isolated browser transport data: never read, generated, or persisted by the live service. */
const source = syntheticBuild(criteria, false, false, true).data!.slips[0]!;
const outcomes = ["won", "lost", "pending"] as const;
const publications: readonly BestSlipView[] = Array.from({ length: 41 }, (_, dayIndex) => {
  const publicationDay = addReportingDays(today, -dayIndex);
  const dayOutcomes = dayIndex === 38 ? [...outcomes, "void", "cancelled"] as const : outcomes;
  return bestSlipOddsBands.flatMap((band, bandIndex) => dayOutcomes.map((status, index): BestSlipView => {
    const outcome = status === "cancelled" ? "void" : status;
    const bandKey = band.id.replaceAll(".", "-");
    const totalOdds = (band.minimumTotal / 100).toFixed(2);
    const averageProbability = [0.75, 0.85, 0.95][index] ?? 0.8;
    const count = index === 0 ? 1 : 2;
    const slip = {
      ...source, id: `synthetic-filter-${publicationDay}-${bandKey}-${index + 1}`, totalOdds,
      averageProbability, ...(publicationDay !== today ? { estimatedProbability: count === 1 ? averageProbability : averageProbability - 0.1 } : {}),
      selections: source.selections.slice(0, count).map((selection, leg) => ({ ...selection, probability: averageProbability, odds: totalOdds,
        fixtureId: `synthetic-filter-${publicationDay}-${bandKey}-${index + 1}-leg-${leg + 1}`,
        kickoffAt: selection.kickoffAt - dayIndex * 86_400_000,
      })),
    };
    const matchStates: readonly SlipMatchState[] = slip.selections.map((selection) => ({
      fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
      ...(selection.forecast ? { forecast: selection.forecast } : {}),
      status: status === "cancelled" ? "canceled" : outcome === "pending" ? "scheduled" : outcome === "void" ? "abandoned" : "finished-regulation", liveClock: null,
      score: outcome === "pending" || outcome === "void" ? null : { home: 2, away: 1 },
      outcome: outcome === "won" ? "correct" : outcome === "lost" ? "incorrect" : outcome,
    }));
    return { ...bestSlipView(slip, bandIndex * 20 + index + 1, true, matchStates), id: slip.id, publicationDay, outcome };
  }));
}).flat();

export async function fixtureBestSlipsSnapshot(query: BestSlipsQuery): Promise<BestSlipsResult> {
  const dates = resolveBestSlipsDates(query, today);
  const scoped = publications.filter(view => bestSlipOddsBandFor(view.totalOdds) === (query.oddsBand ?? defaultBestSlipOddsBand)
    && !(view.publicationDay === today && query.oddsBand === "100-200"));
  const bandRows = scoped.filter((view) => !dates.from || view.publicationDay! >= dates.from && view.publicationDay! <= dates.to!);
  const inRange = bandRows.filter((view) => matchesBestSlipsRanges(query, view));
  const cursor = query.cursor ? parseBestSlipsCursor(query.cursor) : null;
  const remaining = inRange.filter((view) => !cursor || view.publicationDay! < cursor.day || view.publicationDay === cursor.day && view.rank > cursor.rank);
  const matches = remaining.filter((view) => matchesBestSlipsStatus(view.status ? slipStatusCategory(view.status) : view.outcome ?? "pending", query.status));
  const start = query.period === "all" ? 0 : (query.page - 1) * bestSlipsQueryRules.pageSize;
  const slips = matches.slice(start, start + bestSlipsQueryRules.pageSize);
  const hasMore = start + slips.length < matches.length;
  const last = slips.at(-1);
  const from: ReportingDate | null = dates.from ?? remaining.at(-1)?.publicationDay ?? null;
  const to: ReportingDate | null = dates.to ?? remaining[0]?.publicationDay ?? null;
  const counts = (summarized: readonly BestSlipView[]) => ({ total: summarized.length,
    won: summarized.filter(view => view.outcome === "won").length,
    lost: summarized.filter(view => view.outcome === "lost").length,
    pending: summarized.filter(view => view.outcome === "pending").length,
    void: summarized.filter(view => view.status === "void").length,
    cancelled: summarized.filter(view => view.status === "cancelled").length });
  const statistics = query.period === "all" ? null : counts(inRange);
  const summary = { asOf: now, ...dates, statistics };
  const dayLimit = dates.from === dates.to && (dates.from === today || bandRows.length && dates.from !== addReportingDays(today, -2))
    ? dailyBestSlipBandLimit : undefined;
  return { day: today, state: dates.from === today && dates.to === today && !bandRows.length ? "awaiting-publication" : "generated",
    slips, searchLimited: false, partialCoverage: false, statistics, summary,
    browse: { query, total: query.period === "all" ? null : matches.length, bandTotal: query.period === "all" ? null : bandRows.length,
      ...(dayLimit === undefined ? {} : { dailyBandLimit: dayLimit }), pageSize: bestSlipsQueryRules.pageSize, hasMore,
      nextCursor: query.period === "all" && hasMore && last ? `${last.publicationDay}:${last.rank}` : null, from, to },
  };
}

export const fixtureBestSlipsNow = () => now;
export async function fixtureBestSlipsAccess(request: Request): Promise<ViewerAccess> {
  const locked = /\/best-slips\/locked(?:-member)?(?:[/?]|$)/u.test(request.headers.get("referer") ?? "");
  return { tier: locked ? "free" : "full", signedIn: !locked, mode: "off" };
}
