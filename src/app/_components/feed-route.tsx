import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getReportingDate, type UtcInstant } from "@/domain/calendar";
import { breadcrumbStructuredData, feedDiscovery, serializeStructuredData } from "@/domain/discovery";
import { homeHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { getFeedToday, serializeFeedQuery } from "@/domain/feed-query";
import { feedQueryHref } from "@/domain/feed-query";
import { withoutSubscriberFeedOracle } from "@/domain/paywall";
import { emptyArchiveIsMissing } from "@/domain/feed-date-navigation";
import { resolveViewerAccess } from "@/server/members/viewer-access";
import { contentAccess } from "@/server/members/gated-reads";
import { parseMatchFeedQuery } from "@/server/matches/feed-service";
import { loadMatchFeedPage } from "@/server/matches/feed-page";
import { readPublicMatchFeed } from "@/server/matches/public-feed";
import { MatchFeedError } from "@/server/matches/feed-error";
import { feedMetadata } from "@/server/seo/metadata";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { isDocumentRequest, PublicReadUnavailableError } from "@/server/seo/read-status";
import { MatchFeedPage } from "./match-feed-page";
import { getShellInstant } from "./public-shell";

type Props = { params: Promise<{ locale: string; date?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Metadata and initial HTML share the same stored read and request-owned clock. */
export function createFeedRoute({ dated = false, read = readPublicMatchFeed, instant = getShellInstant, policy = getDiscoveryPolicy, resolveAccess = resolveViewerAccess,
  document = isDocumentRequest } = {}) {
  const load = cache(async (parameters: string, locale: string, at: UtcInstant) => {
    const query = parseMatchFeedQuery(new URLSearchParams(parameters), getReportingDate(at), { locale, asOf: at,
      ...((await contentAccess(resolveAccess)).tier === "free" ? { providerOdds: true } : {}) });
    const today = getFeedToday(query, at);
    return loadMatchFeedPage(query, today, { now: () => at }, read, resolveAccess);
  });
  async function resolve({ params, searchParams }: Props) {
    const route = await params, at = await instant();
    let query, today, result;
    // The canonical re-parse inside load() also enforces the byte limit, so it must map to 404 too.
    try {
      query = parseMatchFeedQuery(await searchParams, getReportingDate(at), { locale: route.locale, asOf: at,
        ...((await contentAccess(resolveAccess)).tier === "free" ? { providerOdds: true } : {}),
        ...(dated ? { routeDate: route.date } : {}) });
      today = getFeedToday(query, at);
      result = await load(serializeFeedQuery(query, today).toString(), route.locale, at);
      if (result.error === "subscription-required") redirect(feedQueryHref(withoutSubscriberFeedOracle(query), today));
    } catch (error) { if (error instanceof MatchFeedError && error.code === "invalid-query") notFound(); throw error; }
    const discovery = feedDiscovery(query, today);
    // An empty day beyond the archive window is not a page; the day's cohort count ignores every filter.
    if (result.data && emptyArchiveIsMissing(discovery.range, today, result.data.coverage.knownFixtures)) notFound();
    if (result.error === "unavailable" && policy().index && discovery.eligible && await document()) throw new PublicReadUnavailableError();
    return { query, today, result, discovery, access: await contentAccess(resolveAccess) };
  }
  return {
    async generateMetadata(props: Props) {
      const { query, today, result } = await resolve(props);
      return feedMetadata(query, today, result, policy());
    },
    async Page(props: Props) {
      const { query, today, result, access, discovery } = await resolve(props);
      const messages = createMessages(query.locale);
      const structured = !discovery.eligible ? null : breadcrumbStructuredData([{ name: publicPolicy.name, path: homeHref(query.locale) },
        { name: dated ? messages.text("metadata.breadcrumbArchive", { date: messages.reportingDate(discovery.range.startDate) }) : messages.text("navigation.matches") }]);
      return <>
        {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structured) }} />}
        <MatchFeedPage query={query} today={today} result={result} showAccount subscriberOnly={access.tier === "free"} />
      </>;
    },
  };
}
