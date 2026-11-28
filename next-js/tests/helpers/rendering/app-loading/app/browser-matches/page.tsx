import { createFeedRoute } from "@/app/_components/feed-route";
import { cookies } from "next/headers";
import { PersistentAppShell } from "@/components/navigation/public-shell-chrome";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { isBrowserDocumentRequest } from "@/server/seo/read-status";
import { feedFixture, summaryFixture } from "../feed-fixture";

const instant = async () => utcInstantFromEpochMilliseconds(Date.now());
const route = createFeedRoute({
  instant, browserDocument: isBrowserDocumentRequest,
  policy: () => ({ deployment: "production", index: true }),
  resolveAccess: async () => ({ tier: "full", signedIn: false, mode: "off" }),
  read: async (parameters) => {
    const failure = (await cookies()).get("synthetic-feed-unavailable")?.value === "1";
    await new Promise(resolve => setTimeout(resolve, 1_800));
    if (failure) throw new Error("Synthetic stored read failure");
    return feedFixture(parseFeedQuery(parameters, { today: getReportingDate(await instant()) }));
  },
  readSummary: async (parameters) => {
    await new Promise(resolve => setTimeout(resolve, 6_000));
    return summaryFixture(parseFeedQuery(parameters, { today: getReportingDate(await instant()) }));
  },
});

const params = Promise.resolve({ locale: "en" });
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ searchParams }: Props) {
  return route.generateMetadata({ params, searchParams });
}

export default async function Page({ searchParams }: Props) {
  return <PersistentAppShell locale="en" asOf={await instant()}>{await route.Page({ params, searchParams })}</PersistentAppShell>;
}
