import { createBestSlipsRoute } from "@/app/_components/best-slips-route";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { defaultBestSlipsQuery } from "@/domain/best-slips-query";
import scenarios from "../../scenarios.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic Best Slips loading", robots: { index: false } };
const route = createBestSlipsRoute({ access: async () => ({ tier: "full", signedIn: false, mode: "off" }),
  read: async () => {
    await new Promise(resolve => setTimeout(resolve, 1_800));
    const day = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
    return { day, state: "generated", entitled: true, slips: [], searchLimited: false, partialCoverage: false,
      summary: { from: day, to: day, statistics: scenarios.summary.performance },
      browse: { query: defaultBestSlipsQuery(), total: 0, pageSize: 20, hasMore: false, nextCursor: null,
        from: day, to: day } };
  } });

export default function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return route.Page({ ...props, params: Promise.resolve({ locale: "en" }) });
}
