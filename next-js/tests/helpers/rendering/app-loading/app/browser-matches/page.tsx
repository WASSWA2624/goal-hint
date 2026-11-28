import { createFeedRoute } from "@/app/_components/feed-route";
import { cookies } from "next/headers";
import { PersistentAppShell } from "@/components/navigation/public-shell-chrome";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { MatchFeedError } from "@/server/matches/feed-error";
import { isBrowserDocumentRequest } from "@/server/seo/read-status";
import { feedFixture, summaryFixture } from "../feed-fixture";

const instant = async () => utcInstantFromEpochMilliseconds(Date.now());
const summaryGenerationCookie = "synthetic-summary-generation";
const earlySummaryCookie = "synthetic-early-summary";
const options = {
  instant, browserDocument: isBrowserDocumentRequest,
  policy: () => ({ deployment: "production", index: true }),
  resolveAccess: async () => ({ tier: (await cookies()).has(summaryGenerationCookie) ? "free" : "full", signedIn: false, mode: "off" }),
  read: async (parameters) => {
    const jar = await cookies();
    const failure = jar.get("synthetic-feed-unavailable")?.value;
    const generation = jar.get(summaryGenerationCookie)?.value;
    await new Promise(resolve => setTimeout(resolve, 1_800));
    if (failure === "1") throw new Error("Synthetic stored read failure");
    if (failure === "rate-limited") throw new MatchFeedError("rate-limited", 15);
    const feed = feedFixture(parseFeedQuery(parameters, { today: getReportingDate(await instant()) }));
    if (failure === "coverage") return { ...feed, state: "data-unavailable", records: [], total: 0, totalPages: 0,
      coverage: { ...feed.coverage, partial: true, knownFixtures: 0, matchingWithMarket: 0 } };
    return generation === "a" || generation === "b"
      ? { ...feed, performanceVersion: generation.repeat(64), performanceScope: "1".repeat(64) } : feed;
  },
  readSummary: async (parameters) => {
    const early = (await cookies()).has(earlySummaryCookie);
    await new Promise(resolve => setTimeout(resolve, early ? 120 : 6_000));
    return summaryFixture(parseFeedQuery(parameters, { today: getReportingDate(await instant()) }));
  },
} satisfies NonNullable<Parameters<typeof createFeedRoute>[0]>;
const route = createFeedRoute(options);
const parallelRoute = createFeedRoute({ ...options, earlyBrowserSummary: true });
const selectedRoute = async () => (await cookies()).has(earlySummaryCookie) ? parallelRoute : route;

const params = Promise.resolve({ locale: "en" });
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  return (await selectedRoute()).generateMetadata({ params, searchParams });
}

export default async function Page({ searchParams }: Props) {
  const current = await selectedRoute();
  return <PersistentAppShell locale="en" asOf={await instant()}>{await current.Page({ params, searchParams })}</PersistentAppShell>;
}
