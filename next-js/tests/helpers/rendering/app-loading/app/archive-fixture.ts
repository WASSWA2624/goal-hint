import { bestSlipsQueryRules, matchesBestSlipsStatus, resolveBestSlipsDates, type BestSlipsQuery } from "@/domain/best-slips-query";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { SlipBrowsePage } from "@/domain/slip-browse-window";

export function archiveFixture(query: BestSlipsQuery): SlipBrowsePage {
  const asOf = Date.now(), day = getReportingDate(utcInstantFromEpochMilliseconds(asOf));
  const { from, to } = resolveBestSlipsDates(query, day);
  const covered = (from === null || from <= day) && (to === null || to >= day);
  const count = covered ? 25 : 0;
  const total = matchesBestSlipsStatus("pending", query.status) ? count : 0;
  const pageSize = bestSlipsQueryRules.pageSize, offset = (query.page - 1) * pageSize;
  const slips = Array.from({ length: Math.min(pageSize, Math.max(0, total - offset)) }, (_, index) => {
    const rank = offset + index + 1;
    return { id: rank === 1 ? "synthetic-archive-slip" : `synthetic-archive-slip-${rank}`,
      rank, matchCount: 2, totalOdds: "3.00", averageProbability: 0.8, publicationDay: day, outcome: "pending" as const };
  });
  const statistics = { total: count, won: 0, lost: 0, pending: count, void: 0, cancelled: 0 };
  return { day, state: "generated", slips, searchLimited: false, partialCoverage: false, statistics,
    summary: { from, to, asOf, statistics },
    browse: { query, total, pageSize, hasMore: offset + slips.length < total, nextCursor: null, from, to, version: "a".repeat(64) } };
}
