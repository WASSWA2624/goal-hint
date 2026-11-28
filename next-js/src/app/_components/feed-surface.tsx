"use client";

import { Fragment, memo, Suspense, use, useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { FeedAppliedSummary, FeedNote } from "@/components/match/feed-controls";
import { FeedFilters } from "@/components/match/feed-filters";
import { FeedHeader, ResultsToolbar } from "@/components/match/feed-header";
import { plainClick } from "@/components/match/filter-parts";
import { useLiveRefresh, useMatchesPullToRefresh } from "@/components/match/use-live-refresh";
import { feedRefreshInterval } from "@/domain/live-refresh";
import { FeedPagination } from "@/components/match/feed-pagination";
import { useFeedPagination } from "@/components/match/use-feed-pagination";
import { useFeedRecovery } from "@/components/match/use-feed-recovery";
import { useLiveFeedSearch } from "@/components/match/use-live-feed-search";
import { usePublishedFeedMarkets } from "@/components/match/use-published-feed-markets";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList, MatchListDivider } from "@/components/match/match-card-list";
import { DocumentButtonLink, TextButton, TextLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { joinedDesktopSections, Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { FeedPerformancePlaceholder, FeedPerformanceSummary } from "@/components/match/feed-performance-summary";
import type { FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { ServerThemeUntilHydrated } from "@/styles/provider";
import { LoadingTheme } from "@/styles/loading-theme";
import type { ReportingDate, UtcInstant } from "@/domain/calendar";
import { feedQueryHref, isFeedDatePreset, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { synchronizeFeedStatusDates } from "@/domain/feed-controls";
import { publicPolicy } from "@/domain/public-policy";
import { feedRowNumber, latestPredictionPublication } from "@/domain/feed-presentation";
import type { FeedPageResult, MatchFeedResponse } from "@/domain/match-feed";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { feedReturnStorageKey } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { FeedStateProvider } from "@/state/provider";
import { media } from "@/styles/theme";

const noLeagues: MatchFeedResponse["leagues"] = [];
const navigationDeadlineMs = 15_000;
/** Compact spacing still separates controls and match cards clearly on phones. */
const FeedStack = styled(Stack)`
  ${joinedDesktopSections}
  ${media.belowDesktop} { gap: var(--gh-spacing-2); }
`;
/** Separate the performance figures from the heading for the browsed results. */
const PerformanceSection = styled.div`
  min-inline-size: 0;
  [data-performance-heading] { padding-block-start: var(--gh-spacing-0_5); }
`;
const MatchResults = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  ${media.phone} {
    margin-inline: calc(-1 * var(--public-frame-band, 0px));
    &:has(> [data-match-section]) {
      row-gap: var(--gh-spacing-1);
      background: ${({ theme }) => theme.header.gradient};
    }
  }
  ${media.tablet} { > [data-results-header]:has(+ [data-match-section]) { border-block-end: 0; } }
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
const ignoreLoadingAction = () => {};
type FeedObservation = { initial: MatchFeedResponse; data: MatchFeedResponse };

/** Render the actual control layout before a streamed list delivers its first observation. */
type LoadingSurface = { query: FeedQuery; today: ReportingDate; asOf: UtcInstant; summary?: Promise<FeedPerformanceSeed> | undefined };

function EarlyPerformance({ query, labels, summary }: {
  query: FeedQuery; labels: { range: { from: ReportingDate; to: ReportingDate }; asOf: UtcInstant }; summary: Promise<FeedPerformanceSeed>;
}) {
  const seed = use(summary);
  return <FeedPerformancePlaceholder query={query} data={labels} counts={seed.reply?.performance} />;
}

export function FeedSurfaceLoading({ query, today, asOf, summary }: LoadingSurface) {
  const { startDate: from, endDate: to } = resolveFeedDates(query, today);
  const messages = createMessages(query.locale);
  const labels = { range: { from, to }, asOf };
  const placeholder = <FeedPerformancePlaceholder query={query} data={labels} />;
  return <FeedStateProvider initial={{ query, today, data: null }}>
    <LoadingTheme><FeedStack $gap="sm" data-matches-loading aria-busy="true">
      <StableFeedHeader query={query} today={today} showAccount />
      <div inert>
        <FeedFilters scope={feedQueryHref(query, today)} query={query} today={today} dateQuery={query} dateToday={today}
          leagues={noLeagues} onApply={ignoreLoadingAction} searchText={query.search}
          onSearchChange={ignoreLoadingAction} onSearchSubmit={ignoreLoadingAction} pending
          performance={<PerformanceSection>{summary ? <Suspense fallback={placeholder}>
            <ServerThemeUntilHydrated><EarlyPerformance query={query} labels={labels} summary={summary} /></ServerThemeUntilHydrated>
          </Suspense> : placeholder}</PerformanceSection>} />
      </div>
      <VisuallyHidden role="status">{messages.text("feed.filters.loading")}</VisuallyHidden>
      <MatchResults><ResultsToolbar query={query} today={today} total={null} first={0} last={0} /></MatchResults>
    </FeedStack></LoadingTheme>
  </FeedStateProvider>;
}

/** Memoized with stable callbacks, so header and filter state changes skip the list. */
const FeedResults = memo(function FeedResults({ data: initial, query, today, enabled, searchPending,
  onStatus, onRollover, onObservation, bindSummaryRefresh }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean;
  searchPending: boolean; onRollover: () => void;
  onObservation: (observation: FeedObservation) => void;
  onStatus: (href: string, message: string) => void;
  bindSummaryRefresh: (refresh: () => Promise<void>) => () => void;
}) {
  const messages = createMessages(query.locale, undefined, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone);
  const router = useRouter();
  const canRefresh = enabled && !searchPending;
  const { view, phase, error, root, retry, refresh, refreshInPlace, showMore, appendError } = useFeedPagination({ data: initial, query, today, enabled: canRefresh, onStatus });
  const foreground = phase === "refresh" || phase === "restore";
  const { data, records } = view;
  useEffect(() => {
    // A single response cannot replace membership in an appended list.
    if (canRefresh && view.pages === 1) return bindSummaryRefresh(refresh);
  }, [bindSummaryRefresh, canRefresh, refresh, view.pages]);
  // Refresh the summary from the same list observation without remounting its controls.
  useLayoutEffect(() => {
    if (data !== initial) onObservation({ initial, data });
  }, [data, initial, onObservation]);
  useMatchesPullToRefresh(canRefresh, refreshInPlace);
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
    aria-busy={foreground} data-feed-pages data-first-page={view.firstPage} data-last-page={view.lastPage}>
    <MatchResults data-feed-match-results data-feed-list-state={data.state} aria-busy={searchPending || foreground}>
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
              markets={query.markets} publishedMarket phoneFeed locale={query.locale} position={first + index}
              kickoffPassed={fixture.kickoffAt !== null && fixture.kickoffAt <= data.asOf}
              titleNote={similarFrom !== null && first + index >= similarFrom ? messages.text("feed.search.similarItem") : undefined} />
          </li>
        </Fragment>)}
      </MatchCardList>}
    </MatchResults>
    {enabled && <FeedPagination firstPage={view.firstPage} shown={records.length} locale={query.locale} data={data}
      busy={searchPending || foreground} loadingMore={phase === "append"} appendError={appendError}
      onShowMore={showMore} error={error} onRetry={retry} />}
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
function FeedSurfaceContent({ query, today, result: initial, access, controls, pagination, showAccount = false, summary, retryInitial = false,
  providerOdds = publicPolicy.features.providerOdds }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; access: MatchFeedResponse["access"]; controls?: ReactNode; pagination?: ReactNode; showAccount?: boolean;
  summary?: Promise<FeedPerformanceSeed>; providerOdds?: boolean; retryInitial?: boolean;
}) {
  const router = useRouter(), [transitionPending, startTransition] = useTransition();
  const refresh = useCallback(() => { router.refresh(); }, [router]);
  const recovery = useFeedRecovery({ initial, query, today, access, suspended: transitionPending, retryInitial, recheckAccess: refresh });
  const { result, cancel: cancelRecovery } = recovery;
  const premiumOnly = access.tier === "free";
  const [navigation, setNavigation] = useState<{ href: string; overdue?: true } | null>(null);
  useEffect(() => {
    if (!transitionPending || !navigation || navigation.overdue) return;
    const timer = window.setTimeout(() => {
      setNavigation(current => current === navigation ? { ...current, overdue: true } : current);
    }, navigationDeadlineMs);
    return () => window.clearTimeout(timer);
  }, [navigation, transitionPending]);
  const retryHref = transitionPending && navigation?.overdue ? navigation.href : null;
  const pending = transitionPending && !retryHref;
  const [paginationStatus, setPaginationStatus] = useState<{ href: string; message: string } | null>(null);
  const onPaginationStatus = useCallback((href: string, message: string) => { setPaginationStatus({ href, message }); }, []);
  const [previous, setPrevious] = useState(result.data ? { query, today, data: result.data } : null);
  const [confirmed, setConfirmed] = useState<FeedPerformanceSeed | null>(null);
  const [observation, setObservation] = useState<FeedObservation | null>(null);
  const summaryRefresh = useRef<(() => Promise<void>) | null>(null);
  const bindSummaryRefresh = useCallback((refresh: () => Promise<void>) => {
    summaryRefresh.current = refresh;
    return () => { if (summaryRefresh.current === refresh) summaryRefresh.current = null; };
  }, []);
  const refreshSummaryGeneration = useCallback(() => summaryRefresh.current?.(), []);
  if (result.data && previous?.data !== result.data) setPrevious({ query, today, data: result.data });
  const visible = result.data ? { query, today, data: result.data } : result.error === "subscription-required" ? null : previous;
  const markets = usePublishedFeedMarkets(premiumOnly || visible?.data.access.tier !== "full");
  const messages = createMessages(query.locale);
  const href = feedQueryHref(query, today), leagues = result.data?.leagues ?? previous?.data.leagues ?? noLeagues;
  const failed = result.error !== null;
  const navigate = useCallback((next: FeedQuery) => {
    cancelRecovery();
    const nextHref = feedQueryHref(synchronizeFeedStatusDates(next, today), today);
    setNavigation({ href: nextHref });
    startTransition(() => {
      // Explicit Clear must supersede Apply even before React exposes pending=true.
      if (nextHref === href && failed && !pending) router.refresh();
      else router.push(nextHref, { scroll: false });
    });
  }, [cancelRecovery, failed, href, pending, router, today]);
  const { accepted, cancel, edit, error: searchError, pending: searchPending, search, text, reset } = useLiveFeedSearch({
    query, today, data: result.data, access, suspended: pending, navigate, refresh,
  });
  const displayed = accepted ? { ...accepted, today } : visible;
  const displayedHref = displayed ? feedQueryHref(displayed.query, displayed.today) : href;
  const performanceData = observation && observation.initial === displayed?.data ? observation.data : displayed?.data;
  const enabled = !pending && !result.error;
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
  const navigationFailure = retryHref ? messages.text("feed.filters.slow") : null;
  const rateLimited = result.error === "rate-limited";
  const unavailableTitle = rateLimited ? "feed.rateLimitedTitle" : recovery.offline ? "feed.offlineTitle" : "feed.unavailableTitle";
  const unavailableDescription = rateLimited ? "feed.rateLimited" : recovery.offline ? "feed.offlineHint" : "feed.recoveryHint";
  const announcement = pending || searchPending || recovery.initialRetryPending ? messages.text("feed.filters.loading") : recovery.foreground ? messages.text("feed.retrying")
    : navigationFailure ?? searchFailure ?? (result.error
    ? messages.text(unavailableDescription)
    : paginationStatus?.href === displayedHref ? paginationStatus.message
    : displayed ? searchAnnouncement(displayed.data, displayed.query) : messages.text("feed.state.data-unavailable"));
  return <FeedStack $gap="sm" data-matches-feed>
    <StableFeedHeader query={query} today={today} showAccount={showAccount} />
    <LoadingTheme><FeedFilters scope={`${href}:${today}`} premiumOnly={premiumOnly} providerOdds={providerOdds} query={query} today={today}
      dateQuery={displayed?.query ?? query} dateToday={displayed?.today ?? today} leagues={leagues} onApply={apply} pending={pending} {...markets}
      searchText={text} onSearchChange={onSearchChange} onSearchSubmit={onSearchSubmit}
      performance={displayed && performanceData && <PerformanceSection data-feed-performance-section>
        <Suspense fallback={<FeedPerformancePlaceholder query={displayed.query} data={performanceData} />}>
          <ServerThemeUntilHydrated><FeedPerformanceSummary query={displayed.query} today={displayed.today} data={performanceData}
            enabled={enabled} onApply={applyPerformance} initial={accepted ? undefined : summary} confirmed={confirmed} onConfirmed={setConfirmed}
            onAccessChanged={refresh} onGenerationChanged={refreshSummaryGeneration} /></ServerThemeUntilHydrated>
        </Suspense>
      </PerformanceSection>} /></LoadingTheme>
    {controls}
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    <Results $gap="md" aria-busy={pending || recovery.initialRetryPending} data-feed-results
      data-feed-initial-retry={recovery.initialRetryPending ? true : undefined}
      data-navigation-passive={!pending && recovery.initialRetryPending ? true : undefined}>
      {retryHref && <FeedNote data-feed-navigation-retry>{navigationFailure}{" "}
        <TextLink href={retryHref} prefetch={false} onClick={event => plainClick(event, () => window.location.assign(retryHref))}>
          {messages.text("feed.retry")}</TextLink></FeedNote>}
      {!visible && <MatchResults><ResultsToolbar query={query} today={today} total={null} first={0} last={0} /></MatchResults>}
      {recovery.initialRetryPending && <noscript><DocumentButtonLink href={href} variant="secondary">{messages.text("feed.retry")}</DocumentButtonLink></noscript>}
      {result.error && !recovery.initialRetryPending && <EmptyState data-feed-list-recovery title={messages.text(unavailableTitle)}
        description={messages.text(unavailableDescription)} aria-busy={recovery.pending}
        data-navigation-passive={recovery.pending && !recovery.foreground ? true : undefined}
        action={<DocumentButtonLink href={href} variant="secondary" aria-disabled={recovery.pending || transitionPending}
          onClick={(event) => plainClick(event, () => { void recovery.retry(); })}>
          {messages.text(recovery.pending ? "feed.retrying" : "feed.retry")}</DocumentButtonLink>} />}
      {result.error && visible && <Stack $gap="sm">
        <PreviousNote>{messages.text("feed.filters.previous")}</PreviousNote>
        <FeedAppliedSummary query={visible.query} leagues={visible.data.leagues} />
      </Stack>}
      {searchFailure && <FeedNote>{searchFailure}{" "}<TextButton onClick={() => onSearchSubmit(text)}>{messages.text("feed.retry")}</TextButton></FeedNote>}
      {displayed && visible && <FeedResults key={feedQueryHref(visible.query, visible.today) + ":" + resolveFeedDates(visible.query, visible.today).startDate + ":" + visible.data.access.tier + ":" + visible.data.access.signedIn}
        data={displayed.data} query={displayed.query} today={displayed.today} enabled={enabled} onStatus={onPaginationStatus}
        searchPending={searchPending} onRollover={cancel} onObservation={setObservation} bindSummaryRefresh={bindSummaryRefresh} />}
      {!result.error && pagination}
    </Results>
  </FeedStack>;
}

export function FeedSurface(props: Parameters<typeof FeedSurfaceContent>[0]) {
  // Cards render from server props and the store reads only the draft, so the bootstrap skips
  // validating the page's records again during hydration.
  return <FeedStateProvider key={`${props.access.tier}:${props.access.signedIn}:${props.query.locale}:${props.query.zone ?? props.query.time?.zone ?? "reporting"}`} initial={{ query: props.query, today: props.today, data: null }}>
    <FeedSurfaceContent {...props} />
  </FeedStateProvider>;
}
