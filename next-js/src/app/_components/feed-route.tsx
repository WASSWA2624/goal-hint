import "server-only";

import { cache, Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AppLoading } from "@/components/navigation/navigation-progress";
import { getReportingDate, type UtcInstant } from "@/domain/calendar";
import { breadcrumbStructuredData, feedDiscovery, homeStructuredData, serializeStructuredData } from "@/domain/discovery";
import { homeHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { applyFeedPageDefaults, getFeedToday, isFeedDatePreset, serializeFeedQuery } from "@/domain/feed-query";
import { feedQueryHref } from "@/domain/feed-query";
import { emptyFeedPerformanceReply, feedPerformanceApiHref, performanceFeedQuery, type FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { synchronizeFeedStatusDates } from "@/domain/feed-controls";
import { usesPremiumFeedOracle, withoutPremiumFeedOracle } from "@/domain/paywall";
import { emptyArchiveIsMissing } from "@/domain/feed-date-navigation";
import { resolveViewerAccess } from "@/server/members/viewer-access";
import { contentAccess } from "@/server/members/gated-reads";
import { withDocumentTiming } from "@/server/http/request-timing";
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

/** Crawlers share the stored read between metadata and HTML. Browser metadata uses the route identity. */
export function createFeedRoute({ dated = false, read = readPublicMatchFeedList, instant = getShellInstant, policy = getDiscoveryPolicy,
  resolveAccess = resolveViewerAccess, readSummary = readGatedFeedSummary, document = isDocumentRequest,
  browserDocument }: { dated?: boolean; read?: typeof readPublicMatchFeedList; instant?: typeof getShellInstant;
    policy?: typeof getDiscoveryPolicy; resolveAccess?: typeof resolveViewerAccess; readSummary?: typeof readGatedFeedSummary;
    document?: typeof isDocumentRequest; browserDocument?: typeof isDocumentRequest } = {}) {
  const browser = cache(async () => browserDocument?.() ?? false);
  const requestInstant = cache(instant);
  const browserView = cache(async (params: Props["params"], searchParams: Props["searchParams"]) => {
    if (dated || !await browser()) return null;
    const [{ locale }, parameters, at] = await Promise.all([params, searchParams, requestInstant()]);
    if (parameters.period !== undefined) return null;
    const parsing = { locale, asOf: at, providerOdds: publicOddsEnabled() };
    try {
      const query = applyFeedPageDefaults(parseMatchFeedQuery(parameters, getReportingDate(at), parsing), parameters);
      const today = getFeedToday(query, at), discovery = feedDiscovery(query, today);
      if (usesPremiumFeedOracle(query) || emptyArchiveIsMissing(discovery.range, today, 0) || discovery.eligible && !discovery.home ||
          feedQueryHref(synchronizeFeedStatusDates(query, today), today) !== feedQueryHref(query, today)) return null;
      // The stored reader re-parses this exact bounded representation before reading.
      parseMatchFeedQuery(serializeFeedQuery(query, today), getReportingDate(at), parsing);
      return { query, today, discovery };
    } catch (error) {
      if (error instanceof MatchFeedError && error.code === "invalid-query") return null;
      throw error;
    }
  });
  const load = cache(async (parameters: string, locale: string, at: UtcInstant, providerOdds: boolean) => {
    const query = parseMatchFeedQuery(new URLSearchParams(parameters), getReportingDate(at), { locale, asOf: at,
      providerOdds: providerOdds || (await contentAccess(resolveAccess)).tier === "free" });
    const today = getFeedToday(query, at);
    return withDocumentTiming("matches-document", () => loadMatchFeedPage(query, today, { now: () => at }, read, resolveAccess),
      result => result.error === "unavailable");
  });
  async function resolve({ params, searchParams }: Props, includeSummary = false, streaming = false) {
    const route = await params, at = await requestInstant(), access = await contentAccess(resolveAccess);
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
      result = await load(serializeFeedQuery(query, today).toString(), route.locale, at, providerOdds);
      if (result.error === "subscription-required") redirect(feedQueryHref(withoutPremiumFeedOracle(query), today));
      if (includeSummary && result.data) {
        const scope = performanceFeedQuery(query), href = feedPerformanceApiHref(scope, today);
        const reply = emptyFeedPerformanceReply(query, result.data);
        // The list owns the initial read budget. Stream the independent audit after
        // the accepted list, and avoid starting work for a failed or verified zero cohort.
        summary = reply ? Promise.resolve({ href, reply }) : readSummary(serializeFeedQuery(scope, today), { now: () => at })
          .then(result => ({ href, reply: result }), (error: unknown) => {
            const code = error instanceof MatchFeedError ? error.code : "unavailable";
            return { href, reply: null, failure: {
              code: code === "subscription-required" || code === "rate-limited" || code === "unavailable" ? code : "invalid-response",
              ...(error instanceof MatchFeedError && error.retryAfterSeconds
                ? { retryAt: Date.now() + error.retryAfterSeconds * 1_000 } : {}),
            } };
          });
      }
    } catch (error) { if (error instanceof MatchFeedError && error.code === "invalid-query") notFound(); throw error; }
    const discovery = feedDiscovery(query, today);
    // An empty day beyond the archive window is not a page; the day's cohort count ignores every filter. Strip,
    // calendar and adjacent-day taps keep the in-feed empty state, so only document requests answer 404.
    if (result.data && emptyArchiveIsMissing(discovery.range, today, result.data.coverage.knownFixtures) && await document()) notFound();
    if (result.error === "unavailable" && !streaming && policy().index && discovery.eligible && await document()) throw new PublicReadUnavailableError();
    return { query, today, result, discovery, access, summary, providerOdds };
  }
  async function Content({ props, streaming }: { props: Props; streaming: boolean }) {
    // Keep an optional audit out of browser HTML and route transitions. The
    // accepted list supplies the snapshot against which the browser checks it.
    const includeSummary = !await browser() && await document();
    const { query, today, result, access, discovery, summary, providerOdds } = await resolve(props, includeSummary, streaming);
    // Start the exact browser audit while the accepted list hydrates. The client
    // consumes this request through its normal cohort and viewer checks.
    const summaryHref = streaming && !result.error && result.data && result.data.state !== "data-unavailable"
      && !emptyFeedPerformanceReply(query, result.data) ? feedPerformanceApiHref(query, today) : null;
    const messages = createMessages(query.locale);
    const { tier, signedIn } = result.data?.access ?? access;
    const structured = !discovery.eligible || discovery.home ? null : breadcrumbStructuredData([{ name: publicPolicy.name, path: homeHref(query.locale) },
      { name: dated ? messages.text("metadata.breadcrumbArchive", { date: messages.reportingDate(discovery.range.startDate) }) : messages.text("navigation.matches") }]);
    return <>
      {summaryHref && <link rel="preload" as="fetch" href={summaryHref} crossOrigin="anonymous" />}
      {discovery.home && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(homeStructuredData()) }} />}
      {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(structured) }} />}
      <MatchFeedPage query={query} today={today} result={result} access={{ tier, signedIn }} showAccount
        providerOdds={providerOdds} retryInitial={streaming && result.error === "unavailable"}
        {...(summary ? { summary } : {})} />
    </>;
  }
  return {
    async generateMetadata(props: Props) {
      const view = await browserView(props.params, props.searchParams);
      if (view) return feedMetadata(view.query, view.today, null, policy(), view.discovery);
      const { query, today, result, discovery } = await resolve(props);
      return feedMetadata(query, today, result, policy(), discovery);
    },
    async Page(props: Props) {
      if (!await browserView(props.params, props.searchParams)) return Content({ props, streaming: false });
      return <Suspense fallback={<AppLoading />}><Content props={props} streaming /></Suspense>;
    },
  };
}
