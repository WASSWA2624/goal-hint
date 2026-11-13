"use client";

import { Fragment, memo, Suspense, useCallback, useLayoutEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { FeedAppliedSummary, FeedNote } from "@/components/match/feed-controls";
import { FeedFilters } from "@/components/match/feed-filters";
import { FeedHeader, ResultsToolbar } from "@/components/match/feed-header";
import { plainClick } from "@/components/match/filter-parts";
import { useLiveRefresh } from "@/components/match/use-live-refresh";
import { feedRefreshInterval } from "@/domain/live-refresh";
import { FeedPagination } from "@/components/match/feed-pagination";
import { useFeedPagination } from "@/components/match/use-feed-pagination";
import { useLiveFeedSearch } from "@/components/match/use-live-feed-search";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList, MatchListDivider } from "@/components/match/match-card-list";
import { ButtonLink, TextButton } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { joinedDesktopSections, Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { FeedPerformancePlaceholder, FeedPerformanceSummary } from "@/components/match/feed-performance-summary";
import type { FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import type { ReportingDate } from "@/domain/calendar";
import { feedQueryHref, isFeedDatePreset, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { synchronizeFeedStatusDates } from "@/domain/feed-controls";
import { publicPolicy } from "@/domain/public-policy";
import { feedRowNumber, latestPredictionPublication } from "@/domain/feed-presentation";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { feedReturnStorageKey } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedStateProvider } from "@/state/provider";
import { media } from "@/styles/theme";

const noLeagues: MatchFeedResponse["leagues"] = [];
/** Compact spacing still separates controls and match cards clearly on phones. */
const FeedStack = styled(Stack)`
  ${joinedDesktopSections}
  ${media.belowDesktop} { gap: var(--gh-spacing-2); }
`;
/** Separate the performance figures from the heading for the browsed results. */
const PerformanceSection = styled.div`
  min-inline-size: 0;
  margin-block-end: var(--gh-spacing-2);
  [data-performance-heading] { padding-block-start: var(--gh-spacing-1); }
`;
const MatchResults = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  > [data-results-header]:has(+ [data-match-section]) { border-block-end: 0; }
`;
/** Pending navigations dim the list in place instead of inserting a line that shifts it. */
const Results = styled(FeedStack)`
  transition: opacity var(--gh-duration-disclosure) var(--gh-easing);
  &[aria-busy="true"] { opacity: var(--gh-opacity-60); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
/** The retained-result label keeps body colour on desktop. */
const PreviousNote = styled(FeedNote)`${media.desktop} { color: inherit; }`;
const StableFeedHeader = memo(FeedHeader);

/** Memoized with stable callbacks, so header and filter state changes skip the list. */
const FeedResults = memo(function FeedResults({ data: initial, query, today, enabled, searchPending, performanceQuery, performanceData,
  onStatus, onApply, onRollover, summary, confirmed, onConfirmed }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean;
  searchPending: boolean; performanceQuery: FeedQuery; performanceData: MatchFeedResponse; onRollover: () => void;
  summary?: Promise<FeedPerformanceSeed> | undefined;
  confirmed: FeedPerformanceSeed | null; onConfirmed: (seed: FeedPerformanceSeed) => void;
  onStatus: (href: string, message: string) => void; onApply: (query: FeedQuery) => void;
}) {
  const messages = createMessages(query.locale, undefined, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone);
  const router = useRouter();
  const { view, phase, error, root, retry, refresh } = useFeedPagination({ data: initial, query, today, enabled: enabled && !searchPending, onStatus });
  const { data, records } = view;
  const [performance, setPerformance] = useState({ seed: performanceData, data: performanceData });
  const summaryData = query.search === performanceQuery.search ? data : performanceData === performance.seed ? performance.data : performanceData;
  if (summaryData !== performance.data || performanceData !== performance.seed) setPerformance({ seed: performanceData, data: summaryData });
  // Read when each wait is armed, so the kickoff window always uses the current clock.
  useLiveRefresh({ today, zone: query.zone ?? query.time?.zone ?? null, enabled, interval: () => feedRefreshInterval(data, records, Date.now()), refresh,
    rollover: (day) => {
      onRollover();
      if (isFeedDatePreset(query.dates.kind) && query.page !== 1) {
        router.replace(feedQueryHref({ ...query, page: 1 }, day), { scroll: false });
      } else router.refresh();
    } });
  const first = feedRowNumber(view.firstPage, data.pageSize, 0);
  // Row number of the first similar search result, when this search has any.
  const similarFrom = data.search && data.search.similar > 0 ? data.search.exact + 1 : null;
  return <FeedStack $gap="sm" ref={root} tabIndex={-1} role="region" aria-label={messages.text("feed.matchList")}
    aria-busy={phase !== null} data-feed-pages data-first-page={view.firstPage} data-last-page={view.lastPage}>
    <PerformanceSection data-feed-performance-section><Suspense fallback={<FeedPerformancePlaceholder query={performanceQuery} data={summaryData} />}>
      <ServerThemeUntilHydrated><FeedPerformanceSummary query={performanceQuery} today={today} data={summaryData} enabled={enabled} onApply={onApply}
        initial={summary} confirmed={confirmed} onConfirmed={onConfirmed} /></ServerThemeUntilHydrated>
    </Suspense></PerformanceSection>
    <MatchResults data-feed-match-results aria-busy={searchPending || phase !== null}>
      <ResultsToolbar query={query} today={today} total={data.total} first={first}
        last={first + records.length - 1} publishedAt={latestPredictionPublication(records)} />
      {data.state !== "ready" && data.state !== "insufficient-data" && <EmptyState title={messages.text(`feed.state.${data.state}`)} description={data.message} />}
      {/* Logos stay lazy: an eager image would be hoisted as a third-party preload ahead of the page's own assets. */}
      {records.length > 0 && <MatchCardList aria-label={messages.text("feed.matchList")} locale={query.locale} rowNumberMaximum={first + records.length - 1}>
        {records.map((fixture, index) => <Fragment key={fixture.fixtureId}>
          {/* Exact matches come first, so similar results start right after the last exact position. */}
          {similarFrom !== null && first + index === Math.max(first, similarFrom) && <MatchListDivider title={messages.text("feed.search.similar")}
            note={data.search?.exact === 0 ? messages.text("feed.search.noExact", { query: query.search }) : null} />}
          <li>
            <MatchCard fixture={fixture} gated={data.access.tier === "free"} signedIn={data.access.signedIn} analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)}
              markets={query.markets} publishedMarket={query.picks !== "only"} locale={query.locale} position={first + index}
              titleNote={similarFrom !== null && first + index >= similarFrom ? messages.text("feed.search.similarItem") : undefined} />
          </li>
        </Fragment>)}
      </MatchCardList>}
    </MatchResults>
    {enabled && <FeedPagination firstPage={view.firstPage} shown={records.length} query={query} today={today} data={data} busy={searchPending || phase !== null} error={error} onRetry={retry} />}
  </FeedStack>;
});

/** The count, plus whether a search found only similar results or where they begin. */
function searchAnnouncement(data: MatchFeedResponse, query: FeedQuery): string {
  const messages = createMessages(query.locale), search = data.search;
  if (data.state !== "ready" && data.state !== "insufficient-data") return messages.text(`feed.state.${data.state}`);
  const count = messages.plural("feed.matchCount", data.total);
  if (!search || search.similar === 0) return count;
  return search.exact === 0 ? `${messages.text("feed.search.noExact", { query: query.search })} ${count}`
    : `${count}. ${messages.text("feed.search.similarFrom", { position: messages.number(search.exact + 1) })}`;
}

/** Successful server projections remain visible if a later navigation fails. */
function FeedSurfaceContent({ query, today, result, controls, pagination, showAccount = false, subscriberOnly = result.data?.access.tier === "free", summary,
  providerOdds = publicPolicy.features.providerOdds }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode; showAccount?: boolean; subscriberOnly?: boolean;
  summary?: Promise<FeedPerformanceSeed>; providerOdds?: boolean;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [paginationStatus, setPaginationStatus] = useState<{ href: string; message: string } | null>(null);
  const onPaginationStatus = useCallback((href: string, message: string) => { setPaginationStatus({ href, message }); }, []);
  const [previous, setPrevious] = useState(result.data ? { query, today, data: result.data } : null);
  const [confirmed, setConfirmed] = useState<FeedPerformanceSeed | null>(null);
  if (result.data && previous?.data !== result.data) setPrevious({ query, today, data: result.data });
  const visible = result.data ? { query, today, data: result.data } : previous;
  const messages = createMessages(query.locale);
  const href = feedQueryHref(query, today), leagues = result.data?.leagues ?? previous?.data.leagues ?? noLeagues;
  const failed = result.error !== null;
  const navigate = useCallback((next: FeedQuery) => {
    const nextHref = feedQueryHref(synchronizeFeedStatusDates(next, today), today);
    startTransition(() => {
      // Explicit Clear must supersede Apply even before React exposes pending=true.
      if (nextHref === href && failed && !pending) router.refresh();
      else router.push(nextHref, { scroll: false });
    });
  }, [failed, href, pending, router, today]);
  const refresh = useCallback(() => { router.refresh(); }, [router]);
  const { accepted, cancel, edit, error: searchError, pending: searchPending, search, text, reset } = useLiveFeedSearch({
    query, today, data: result.data, suspended: pending, navigate, refresh,
  });
  const displayed = accepted ? { ...accepted, today } : visible;
  const displayedHref = displayed ? feedQueryHref(displayed.query, displayed.today) : href;
  useLayoutEffect(() => {
    // Match pages link back to this exact accepted list, filters included.
    try { window.sessionStorage.setItem(feedReturnStorageKey, displayedHref); } catch { /* Storage can be blocked. */ }
  }, [displayedHref]);
  const apply = useCallback((next: FeedQuery) => {
    if (feedQueryHref(synchronizeFeedStatusDates(next, today), today) === href) reset();
    else cancel();
    navigate(next);
  }, [cancel, href, navigate, reset, today]);
  const applyPerformance = useCallback((next: FeedQuery) => apply({ ...next, search: accepted?.query.search ?? next.search }), [accepted, apply]);
  const onSearchChange = useCallback((value: string, composing: boolean) => {
    setPaginationStatus(null);
    if (composing) edit(value); else search(value);
  }, [edit, search]);
  const onSearchSubmit = useCallback((value: string) => { setPaginationStatus(null); search(value, true); }, [search]);
  const searchFailure = searchError ? messages.text(searchError === "rate-limited" ? "feed.rateLimited" : "feed.unavailable") : null;
  const announcement = pending || searchPending ? messages.text("feed.filters.loading") : searchFailure ?? (result.error
    ? messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")
    : paginationStatus?.href === displayedHref ? paginationStatus.message
    : displayed ? searchAnnouncement(displayed.data, displayed.query) : messages.text("feed.state.data-unavailable"));
  return <FeedStack $gap="sm">
    <StableFeedHeader query={query} today={today} showAccount={showAccount} />
    <FeedFilters key={`${href}:${today}`} subscriberOnly={subscriberOnly} providerOdds={providerOdds} query={query} today={today} leagues={leagues} onApply={apply} pending={pending}
      searchText={text} onSearchChange={onSearchChange} onSearchSubmit={onSearchSubmit} />
    {controls}
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    <Results $gap="md" aria-busy={pending} data-feed-results>
      {!visible && <ResultsToolbar query={query} today={today} total={null} first={0} last={0} />}
      {result.error && <EmptyState title={messages.text(result.error === "rate-limited" ? "feed.rateLimitedTitle" : "feed.unavailableTitle")}
        description={messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")}
        action={<ButtonLink href={href} prefetch={false} variant="secondary"
          onClick={(event) => plainClick(event, () => apply(query))}>{messages.text("feed.retry")}</ButtonLink>} />}
      {result.error && visible && <Stack $gap="sm">
        <PreviousNote>{messages.text("feed.filters.previous")}</PreviousNote>
        <FeedAppliedSummary query={visible.query} leagues={visible.data.leagues} />
      </Stack>}
      {searchFailure && <FeedNote>{searchFailure}{" "}<TextButton onClick={() => onSearchSubmit(text)}>{messages.text("feed.retry")}</TextButton></FeedNote>}
      {displayed && visible && <FeedResults key={feedQueryHref(visible.query, visible.today) + ":" + resolveFeedDates(visible.query, visible.today).startDate + ":" + visible.data.access.tier + ":" + visible.data.access.signedIn}
        data={displayed.data} query={displayed.query} today={displayed.today} enabled={!pending && !result.error} onStatus={onPaginationStatus} onApply={applyPerformance}
        searchPending={searchPending} performanceQuery={visible.query} performanceData={visible.data} onRollover={cancel}
        summary={summary} confirmed={confirmed} onConfirmed={setConfirmed} />}
      {!result.error && pagination}
    </Results>
  </FeedStack>;
}

export function FeedSurface(props: Parameters<typeof FeedSurfaceContent>[0]) {
  // Cards render from server props and the store reads only the draft, so the bootstrap skips
  // validating the page's records again during hydration.
  return <FeedStateProvider key={`${props.result.data?.access.tier}:${props.result.data?.access.signedIn}:${props.query.locale}:${props.query.zone ?? props.query.time?.zone ?? "reporting"}`} initial={{ query: props.query, today: props.today, data: null }}>
    <FeedSurfaceContent {...props} />
  </FeedStateProvider>;
}
