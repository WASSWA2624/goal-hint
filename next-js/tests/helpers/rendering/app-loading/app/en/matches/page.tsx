import { createFeedRoute } from "@/app/_components/feed-route";
import { cookies } from "next/headers";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { feedFixture, guestHistoryFixture, summaryFixture } from "../../feed-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic match loading", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { fail, ...input } = await searchParams;
  const jar = await cookies(), guest = jar.has(guestHistoryFixture);
  const feedUnavailable = fail === "feed" || jar.get("synthetic-feed-unavailable")?.value === "1";
  const at = utcInstantFromEpochMilliseconds(Date.now()), today = getReportingDate(at);
  const access = { tier: guest ? "free" : "full", signedIn: false } as const;
  const route = createFeedRoute({ instant: async () => at, policy: () => ({ deployment: "staging", index: false }),
    document: async () => true, resolveAccess: async () => ({ ...access, mode: "off" }),
    read: async parameters => {
      if (feedUnavailable) throw new Error("Synthetic match feed outage");
      return feedFixture(parseFeedQuery(parameters, { today }), guest ? at - 25_000 : at, guest);
    },
    readSummary: async parameters => {
      await new Promise(resolve => setTimeout(resolve, 1_800));
      if (fail === "1") throw new Error("Synthetic summary outage");
      return { ...summaryFixture(parseFeedQuery(parameters, { today }), guest), access };
    },
  });
  return route.Page({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve(input) });
}
