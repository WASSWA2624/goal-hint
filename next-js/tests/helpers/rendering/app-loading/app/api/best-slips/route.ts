import { matchesBestSlipsStatus, resolveBestSlipsDates } from "@/domain/best-slips-query";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createBestSlipsHandler } from "@/server/slips/best-slips-http";

export const dynamic = "force-dynamic";
export const GET = createBestSlipsHandler({
  access: async () => ({ tier: "free", signedIn: false, mode: "off" }),
  async snapshot(query) {
    const asOf = Date.now();
    const day = getReportingDate(utcInstantFromEpochMilliseconds(asOf));
    const { from, to } = resolveBestSlipsDates(query, day);
    const covered = (from === null || from <= day) && (to === null || to >= day);
    const statistics = { total: Number(covered), won: 0, lost: 0, pending: Number(covered), void: 0, cancelled: 0 };
    const slips = covered && query.page === 1 && matchesBestSlipsStatus("pending", query.status)
      ? [{ id: "synthetic-archive-slip", rank: 1, matchCount: 2, totalOdds: "2.00", averageProbability: 0.8,
        publicationDay: day, outcome: "pending" as const }]
      : [];
    return { day, state: "generated", slips, searchLimited: false, partialCoverage: false, statistics,
      summary: { from, to, asOf, statistics },
      browse: { query, total: slips.length, pageSize: 20, hasMore: false, nextCursor: null, from, to } };
  },
});
