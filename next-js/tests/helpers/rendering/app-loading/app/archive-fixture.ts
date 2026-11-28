import { bestSlipsQueryRules, matchesBestSlipsStatus, resolveBestSlipsDates, type BestSlipsQuery, type BestSlipsWindow } from "@/domain/best-slips-query";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { SlipBrowsePage } from "@/domain/slip-browse-window";

export function archiveFixture(query: BestSlipsQuery, epoch?: string, asOf = Date.now()): SlipBrowsePage {
  const day = getReportingDate(utcInstantFromEpochMilliseconds(asOf));
  const { from, to } = resolveBestSlipsDates(query, day);
  const covered = (from === null || from <= day) && (to === null || to >= day);
  const count = covered ? 65 : 0;
  const won = Math.min(count, epoch === "shrink" ? 50 : epoch === "settled" ? 4 : 0);
  const matching = Array.from({ length: count }, (_, index) => ({ rank: index + 1,
    outcome: index < won ? "won" as const : "pending" as const }))
    .filter(({ outcome }) => matchesBestSlipsStatus(outcome, query.status));
  const total = matching.length;
  const pageSize = bestSlipsQueryRules.pageSize, offset = (query.page - 1) * pageSize;
  const slips = matching.slice(offset, offset + pageSize).map(({ rank, outcome }) => ({
    id: rank === 1 ? "synthetic-archive-slip" : `synthetic-archive-slip-${rank}`,
    rank, matchCount: 2, totalOdds: "3.00", averageProbability: 0.8, publicationDay: day, outcome,
  }));
  const statistics = { total: count, won, lost: 0, pending: count - won, void: 0, cancelled: 0 };
  return { day, state: "generated", slips, searchLimited: false, partialCoverage: false, statistics,
    summary: { from, to, asOf, statistics },
    browse: { query, total, pageSize, hasMore: offset + slips.length < total, nextCursor: null, from, to,
      version: (epoch === "shrink" ? "c" : epoch === "settled" ? "b" : "a").repeat(64) } };
}

export function archiveWindowFixture(query: BestSlipsQuery, window: BestSlipsWindow, epoch?: string) {
  const asOf = Date.now(), initial = archiveFixture(query, epoch, asOf);
  const last = Math.max(query.page, Math.min(window.through, Math.ceil((initial.browse.total ?? 0) / initial.browse.pageSize)));
  const reusedPrefix = last === window.through && last > query.page && window.knownVersion === initial.browse.version;
  const first = reusedPrefix ? last : query.page;
  return { pages: Array.from({ length: last - first + 1 }, (_, index) => archiveFixture({ ...query, page: first + index }, epoch, asOf)), reusedPrefix };
}
