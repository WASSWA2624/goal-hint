import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { getReportingDate, type UtcInstant } from "@/domain/calendar";
import { feedDiscovery, serializeStructuredData, websiteStructuredData } from "@/domain/discovery";
import { serializeFeedQuery } from "@/domain/feed-query";
import { parseMatchFeedQuery } from "@/server/matches/feed-service";
import { loadMatchFeedPage } from "@/server/matches/feed-page";
import { readPublicMatchFeed } from "@/server/matches/public-feed";
import { MatchFeedError } from "@/server/matches/feed-error";
import { feedMetadata } from "@/server/seo/metadata";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { MatchFeedPage } from "./match-feed-page";
import { getShellInstant } from "./public-shell";

type Props = { params: Promise<{ locale: string; date?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Metadata and initial HTML share the same stored read and request-owned clock. */
export function createFeedRoute({ dated = false, read = readPublicMatchFeed, instant = getShellInstant, policy = getDiscoveryPolicy } = {}) {
  const load = cache(async (parameters: string, locale: string, at: UtcInstant) => {
    const today = getReportingDate(at), query = parseMatchFeedQuery(new URLSearchParams(parameters), today, { locale });
    return loadMatchFeedPage(query, today, { now: () => at }, read);
  });
  async function resolve({ params, searchParams }: Props) {
    const route = await params, at = await instant(), today = getReportingDate(at);
    let query;
    try { query = parseMatchFeedQuery(await searchParams, today, { locale: route.locale, ...(dated ? { routeDate: route.date } : {}) }); }
    catch (error) { if (error instanceof MatchFeedError && error.code === "invalid-query") notFound(); throw error; }
    const result = await load(serializeFeedQuery(query, today).toString(), route.locale, at);
    return { query, today, result };
  }
  return {
    async generateMetadata(props: Props) {
      const { query, today, result } = await resolve(props);
      return feedMetadata(query, today, result, policy());
    },
    async Page(props: Props) {
      const { query, today, result } = await resolve(props), discovery = feedDiscovery(query, today);
      return <>
        {!dated && discovery.home && discovery.eligible && <script type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(websiteStructuredData()) }} />}
        <MatchFeedPage query={query} today={today} result={result} />
      </>;
    },
  };
}
