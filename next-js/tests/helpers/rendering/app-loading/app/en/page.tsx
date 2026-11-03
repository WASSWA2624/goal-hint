import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { defaultBestSlipsQuery } from "@/domain/best-slips-query";
import scenarios from "../scenarios.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic homepage loading", robots: { index: false } };
const route = createBestSlipsRoute({ access: async () => ({ tier: "full", signedIn: false, mode: "off" }),
  read: async () => {
    await new Promise(resolve => setTimeout(resolve, 1_800));
    const day = getReportingDate(utcInstantFromEpochMilliseconds(Date.now())), yesterday = addReportingDays(day, -1);
    return { day, state: "generated", entitled: true, slips: [], searchLimited: false, partialCoverage: false,
      summary: { from: yesterday, to: yesterday, statistics: scenarios.summary.performance },
      browse: { query: defaultBestSlipsQuery(), total: 0, pageSize: 20, hasMore: false, nextCursor: null,
        from: addReportingDays(day, -29), to: day } };
  } });
export default route.Page;
