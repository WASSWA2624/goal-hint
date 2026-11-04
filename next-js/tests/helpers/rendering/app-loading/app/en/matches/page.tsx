import { createFeedRoute } from "@/app/_components/feed-route";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { feedFixture } from "../../feed-fixture";
import { feedPerformanceReplySchema } from "@/domain/feed-performance-summary";
import scenarios from "../../scenarios.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic match loading", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { fail, ...input } = await searchParams;
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at);
  const route = createFeedRoute({ instant: async () => at, policy: () => ({ deployment: "staging", index: false }),
    document: async () => true, resolveAccess: async () => ({ tier: "full", signedIn: false, mode: "off" }),
    read: async parameters => feedFixture(parseFeedQuery(parameters, { today })),
    readSummary: async () => {
      await new Promise(resolve => setTimeout(resolve, 1_800));
      if (fail === "1") throw new Error("Synthetic summary outage");
      return feedPerformanceReplySchema.parse({ ...scenarios.summary, asOf: at });
    },
  });
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(input) });
}
