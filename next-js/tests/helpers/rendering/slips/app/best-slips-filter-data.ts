import { bestSlipViews, type BestSlip, type BestSlipsResult, type BestSlipView } from "@/domain/best-slips";
import { bestSlipsQueryRules, parseBestSlipsCursor, resolveBestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { addReportingDays, type ReportingDate } from "@/domain/calendar";
import { bestSlipOddsBands, bestSlipOddsBandFor, defaultBestSlipOddsBand } from "@/domain/best-slip-odds-bands";
import type { SlipMatchState } from "@/domain/slip-match-state";
import type { ViewerAccess } from "@/server/members/viewer-access";
import { gateBestSlips } from "@/server/slips/best-slips";
import { criteria, now, syntheticBuild, today } from "./stored";

/** Isolated browser transport data: never read, generated, or persisted by the live service. */
const source = syntheticBuild(criteria, false, false, true).data!.slips[0]!;
const outcomes = ["won", "lost", "pending"] as const;
const publications: readonly BestSlipView[] = Array.from({ length: 41 }, (_, dayIndex) => {
  const publicationDay = addReportingDays(today, -dayIndex);
  return bestSlipOddsBands.flatMap((band, bandIndex) => outcomes.map((outcome, index): BestSlipView => {
    const bandKey = band.id.replaceAll(".", "-");
    const totalOdds = (band.minimumTotal / 100).toFixed(2);
    const slip: BestSlip = {
      ...source, id: `synthetic-filter-${publicationDay}-${bandKey}-${index + 1}`, totalOdds,
      averageProbability: source.selections[0]!.probability, estimatedProbability: source.selections[0]!.probability,
      selections: source.selections.slice(0, 1).map((selection, leg) => ({ ...selection, odds: totalOdds,
        fixtureId: `synthetic-filter-${publicationDay}-${bandKey}-${index + 1}-leg-${leg + 1}`,
        kickoffAt: selection.kickoffAt - dayIndex * 86_400_000,
      })),
    };
    const matchStates: readonly SlipMatchState[] = slip.selections.map((selection) => ({
      fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
      ...(selection.forecast ? { forecast: selection.forecast } : {}),
      status: outcome === "pending" ? "scheduled" : "finished-regulation", liveClock: null,
      score: outcome === "pending" ? null : { home: 2, away: 1 },
      outcome: outcome === "won" ? "correct" : outcome === "lost" ? "incorrect" : "pending",
    }));
    return { ...bestSlipViews([slip], true, matchStates)[0]!, id: slip.id,
      rank: bandIndex * 20 + index + 1, publicationDay, outcome };
  }));
}).flat();

export async function fixtureBestSlips(access: ViewerAccess): Promise<BestSlipsResult> {
  return gateBestSlips({ day: today, state: "generated", slips: publications.filter((view) => view.publicationDay === today && bestSlipOddsBandFor(view.totalOdds) === defaultBestSlipOddsBand),
    searchLimited: false, partialCoverage: false }, access);
}

export async function fixtureBrowseBestSlips(access: ViewerAccess, query: BestSlipsQuery): Promise<BestSlipsResult> {
  const dates = resolveBestSlipsDates(query, today);
  const scoped = publications.filter(view => bestSlipOddsBandFor(view.totalOdds) === (query.oddsBand ?? defaultBestSlipOddsBand));
  const inRange = scoped.filter((view) => !dates.from || view.publicationDay! >= dates.from && view.publicationDay! <= dates.to!);
  const cursor = query.cursor ? parseBestSlipsCursor(query.cursor) : null;
  const remaining = inRange.filter((view) => !cursor || view.publicationDay! < cursor.day || view.publicationDay === cursor.day && view.rank > cursor.rank);
  const matches = remaining.filter((view) => query.status === "all" || view.outcome === query.status);
  const start = query.period === "all" ? 0 : (query.page - 1) * bestSlipsQueryRules.pageSize;
  const slips = matches.slice(start, start + bestSlipsQueryRules.pageSize);
  const hasMore = start + slips.length < matches.length;
  const last = slips.at(-1);
  const from: ReportingDate | null = dates.from ?? remaining.at(-1)?.publicationDay ?? null;
  const to: ReportingDate | null = dates.to ?? remaining[0]?.publicationDay ?? null;
  const counts = (summarized: readonly BestSlipView[]) => ({ total: summarized.length,
    won: summarized.filter(view => view.outcome === "won").length,
    lost: summarized.filter(view => view.outcome === "lost").length,
    pending: summarized.filter(view => view.outcome === "pending").length, void: 0 });
  const statistics = query.period === "all" ? null : counts(inRange);
  const summary = { asOf: now, from: today, to: today, statistics: counts(scoped.filter(view => view.publicationDay === today)) };
  return gateBestSlips({ day: today, state: "generated", slips, searchLimited: false, partialCoverage: false,
    statistics, summary,
    browse: { query, total: query.period === "all" ? null : matches.length,
      pageSize: bestSlipsQueryRules.pageSize, hasMore,
      nextCursor: query.period === "all" && hasMore && last ? `${last.publicationDay}:${last.rank}` : null, from, to },
  }, access);
}

export const fixtureBestSlipsNow = () => now;
export async function fixtureBestSlipsAccess(request: Request): Promise<ViewerAccess> {
  const locked = /\/best-slips\/locked(?:-member)?(?:[/?]|$)/u.test(request.headers.get("referer") ?? "");
  return { tier: locked ? "free" : "full", signedIn: !locked, mode: "off" };
}
