import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getReportingDate, type UtcInstant } from "@/domain/calendar";
import { breadcrumbStructuredData, feedDiscovery, homeStructuredData, serializeStructuredData } from "@/domain/discovery";
import { homeHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { applyFeedPageDefaults, getFeedToday, isFeedDatePreset, serializeFeedQuery } from "@/domain/feed-query";
import { feedQueryHref } from "@/domain/feed-query";
import { emptyFeedPerformanceReply, feedPerformanceApiHref, performanceFeedQuery, type FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { synchronizeFeedStatusDates } from "@/domain/feed-controls";
import { withoutSubscriberFeedOracle } from "@/domain/paywall";
import { emptyArchiveIsMissing } from "@/domain/feed-date-navigation";
import { resolveViewerAccess } from "@/server/members/viewer-access";
import { contentAccess } from "@/server/members/gated-reads";
import { parseMatchFeedQuery } from "@/server/matches/feed-service";
import { loadMatchFeedPage } from "@/server/matches/feed-page";
import { readPublicMatchFeedList } from "@/server/matches/public-feed";
import { readGatedFeedSummary } from "@/server/matches/feed-summary-read";
import { MatchFeedError } from "@/server/matches/feed-error";
import { publicOddsEnabled } from "@/server/odds/public-odds-policy";
import { feedMetadata } from "@/server/seo/metadata";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { isDocumentRequest, PublicReadUnavailableError } from "@/server/seo/read-status";
import { MatchFeedPage } from "./match-feed-page";
import { getShellInstant } from "./public-shell";

type Props = { params: Promise<{ locale: string; date?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Metadata and initial HTML share the same stored read and request-owned clock. */
export function createFeedRoute({ dated = false, read = readPublicMatchFeedList, instant = getShellInstant, policy = getDiscoveryPolicy,
  resolveAccess = resolveViewerAccess, readSummary = readGatedFeedSummary, document = isDocumentRequest } = {}) {
  const load = cache(async (parameters: string, locale: string, at: UtcInstant, providerOdds: boolean) => {
    const query = parseMatchFeedQuery(new URLSearchParams(parameters), getReportingDate(at), { locale, asOf: at,
      providerOdds: providerOdds || (await contentAccess(resolveAccess)).tier === "free" });
    const today = getFeedToday(query, at);
    return loadMatchFeedPage(query, today, { now: () => at }, read, resolveAccess);
  });
  async function resolve({ params, searchParams }: Props, includeSummary = false) {
    const route = await params, at = await instant(), access = await contentAccess(resolveAccess);
    const providerOdds = publicOddsEnabled();
    let query, today, result, summary: Promise<FeedPerformanceSeed> | undefined;
    // The canonical re-parse inside load() also enforces the byte limit, so it must map to 404 too.
    try {
      const { period, ...parameters } = await searchParams;
      // The native phone selector can replace an applied custom date without JavaScript.
      // Its form field is page-only; the stored API continues to accept canonical query keys.
      if (period !== undefined) {
        if (typeof period !== "string" || period !== "custom" && !isFeedDatePreset(period)) throw new MatchFeedError("invalid-query");
        if (isFeedDatePreset(period)) {
          delete parameters.date; delete parameters.from; delete parameters.to; delete parameters.when;
          parameters.when = period;
        }
      }
      query = parseMatchFeedQuery(parameters, getReportingDate(at), { locale: route.locale, asOf: at,
        providerOdds: providerOdds || access.tier === "free",
        ...(dated && (period === undefined || period === "custom") ? { routeDate: route.date } : {}) });
      query = applyFeedPageDefaults(query, parameters, { dated });
      today = getFeedToday(query, at);
      if (!dated || query.status === "live" || period !== undefined) {
        const synchronized = synchronizeFeedStatusDates(query, today);
        if (period !== undefined || feedQueryHref(synchronized, today) !== feedQueryHref(query, today)) redirect(feedQueryHref(synchronized, today));
        query = synchronized;
      }
      if (includeSummary) {
        const scope = performanceFeedQuery(query), href = feedPerformanceApiHref(scope, today);
        // Begin the audit alongside the list, before hydration, without delaying cards or HTTP status validation.
        summary = readSummary(serializeFeedQuery(scope, today), { now: () => at })
          .then((reply) => ({ href, reply }), () => ({ href, reply: null }));
      }
      result = await load(serializeFeedQuery(query, today).toString(), route.locale, at, providerOdds);
      if (result.error === "subscription-required") redirect(feedQueryHref(withoutSubscriberFeedOracle(query), today));
      if (includeSummary && result.data) {
        const reply = emptyFeedPerformanceReply(query, result.data);
        if (reply) summary = Promise.resolve({ href: feedPerformanceApiHref(query, today), reply });
      }
    } catch (error) { if (error instanceof MatchFeedError && error.code === "invalid-query") notFound(); throw error; }
    const discovery = feedDiscovery(query, today);
    // An empty day beyond the archive window is not a page; the day's cohort count ignores every filter. Strip,
    // calendar and adjacent-day taps keep the in-feed empty state, so only document requests answer 404.
    if (result.data && emptyArchiveIsMissing(discovery.range, today, result.data.coverage.knownFixtures) && await document()) notFound();
    if (result.error === "unavailable" && policy().index && discovery.eligible && await document()) throw new PublicReadUnavailableError();
    return { query, today, result, discovery, access, summary, providerOdds };
  }
  return {
    async generateMetadata(props: Props) {
      const { query, today, result, discovery } = await resolve(props);
      return feedMetadata(query, today, result, policy(), discovery);
    },
    async Page(props: Props) {
      const { query, today, result, access, discovery, summary, providerOdds } = await resolve(props, true);
      const messages = createMessages(query.locale);
      const structured = !discovery.eligible || discovery.home ? null : breadcrumbStructuredData([{ name: publicPolicy.name, path: homeHref(query.locale) },
        { name: dated ? messages.text("metadata.breadcrumbArchive", { date: messages.reportingDate(discovery.range.startDate) }) : messages.text("navigation.matches") }]);
      return <>
        {discovery.home && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }} />}
        {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structured) }} />}
        <MatchFeedPage query={query} today={today} result={result} showAccount subscriberOnly={access.tier === "free"} providerOdds={providerOdds}
          {...(summary ? { summary } : {})} />
      </>;
    },
  };
}
