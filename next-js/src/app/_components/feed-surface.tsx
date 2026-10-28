"use client";

import { Fragment, memo, useCallback, useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { FeedActiveFilterSummary, FeedAppliedSummary, FeedNote, SubscriberFeedBanner } from "@/components/match/feed-controls";
import { FeedFilterActions, FeedFilters, type FeedFilterDraftStatus } from "@/components/match/feed-filters";
import { FeedFilterToolbar, FeedHeader, ResultsToolbar } from "@/components/match/feed-header";
import { DesktopFeedFilters } from "@/components/match/desktop-feed-filters";
import { plainClick } from "@/components/match/filter-parts";
import { useLiveRefresh } from "@/components/match/use-live-refresh";
import { feedRefreshInterval } from "@/domain/live-refresh";
import { FeedPagination } from "@/components/match/feed-pagination";
import { useFeedPagination } from "@/components/match/use-feed-pagination";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList, MatchListDivider } from "@/components/match/match-card-list";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { FeedPerformanceSummary } from "@/components/match/feed-performance-summary";
import { parseReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { feedQueryHref, isFeedDatePreset, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { synchronizeFeedStatusDates } from "@/domain/feed-controls";
import { isAnyKickoffTime } from "@/domain/kickoff-time";
import { publicPolicy } from "@/domain/public-policy";
import { feedRowNumber } from "@/domain/feed-presentation";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { feedReturnStorageKey } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedStateProvider } from "@/state/provider";
import { media } from "@/styles/theme";

const noLeagues: MatchFeedResponse["leagues"] = [];
/** Compact spacing still separates controls and match cards clearly on phones. */
const FeedStack = styled(Stack)`${media.belowDesktop} { gap: 8px; }`;
/** Pending navigations dim the list in place instead of inserting a line that shifts it. */
const Results = styled(FeedStack)`
  transition: opacity 150ms ease;
  &[aria-busy="true"] { opacity: 0.6; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
/** The retained-result label keeps body colour on desktop. */
const PreviousNote = styled(FeedNote)`${media.desktop} { color: inherit; }`;

/** Memoized with stable callbacks, so header and filter state changes skip the list. */
const FeedResults = memo(function FeedResults({ data: initial, query, today, enabled, onStatus, startingPriceUgx }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean;
  startingPriceUgx: number | null;
  onStatus: (href: string, message: string) => void;
}) {
  const messages = createMessages(query.locale, undefined, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone);
  const router = useRouter();
  const { view, phase, error, root, retry, refresh } = useFeedPagination({ data: initial, query, today, enabled, onStatus });
  const { data, records } = view;
  // Read when each wait is armed, so the kickoff window always uses the current clock.
  useLiveRefresh({ today, zone: query.zone ?? query.time?.zone ?? null, enabled, interval: () => feedRefreshInterval(data, records, Date.now()), refresh,
    rollover: (day) => {
      if (isFeedDatePreset(query.dates.kind) && query.page !== 1) {
        router.replace(feedQueryHref({ ...query, page: 1 }, day), { scroll: false });
      } else router.refresh();
    } });
  const first = feedRowNumber(view.firstPage, data.pageSize, 0);
  // Row number of the first similar search result, when this search has any.
  const similarFrom = data.search && data.search.similar > 0 ? data.search.exact + 1 : null;
  const period = [messages.reportingDateSpan(parseReportingDate(data.range.from), parseReportingDate(data.range.to)),
    ...(query.time && !isAnyKickoffTime(query.time) ? [`${query.time.from}–${query.time.to}`] : []),
    messages.timeZone(utcInstantFromEpochMilliseconds(data.asOf))].join(" · ");
  return <FeedStack $gap="sm" ref={root} tabIndex={-1} role="region" aria-label={messages.text("feed.matchList")}
    aria-busy={phase !== null} data-feed-pages data-first-page={view.firstPage} data-last-page={view.lastPage}>
    <FeedPerformanceSummary query={query} today={today} data={data} enabled={enabled} period={period} />
    <ResultsToolbar query={query} today={today} total={data.total} first={first}
      last={first + records.length - 1} />
    {/* Fixtures without the selected market still list; each row states why it has no pick. */}
    {data.state !== "ready" && data.state !== "insufficient-data" && <EmptyState title={messages.text(`feed.state.${data.state}`)} description={data.message} />}
    {/* Logos stay lazy: an eager image would be hoisted as a third-party preload ahead of the page's own assets. */}
    {records.length > 0 && <MatchCardList aria-label={messages.text("feed.matchList")} locale={query.locale} rowNumberMaximum={first + records.length - 1}>
      {records.map((fixture, index) => <Fragment key={fixture.fixtureId}>
        {/* Exact matches come first, so similar results start right after the last exact position. */}
        {similarFrom !== null && first + index === Math.max(first, similarFrom) && <MatchListDivider title={messages.text("feed.search.similar")}
          note={data.search?.exact === 0 ? messages.text("feed.search.noExact", { query: query.search }) : null} />}
        <li>
          <MatchCard fixture={fixture} gated={data.access.tier === "free"} signedIn={data.access.signedIn} analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)}
            markets={query.markets} locale={query.locale} position={first + index} startingPriceUgx={startingPriceUgx}
            titleNote={similarFrom !== null && first + index >= similarFrom ? messages.text("feed.search.similarItem") : undefined} />
        </li>
      </Fragment>)}
    </MatchCardList>}
    {enabled && <FeedPagination query={query} today={today} data={data} busy={phase !== null} error={error} onRetry={retry} />}
  </FeedStack>;
});

/** The count, plus whether a search found only similar results or where they begin. */
function searchAnnouncement(data: MatchFeedResponse, query: FeedQuery, count: string): string {
  const messages = createMessages(query.locale), search = data.search;
  if (!search || search.similar === 0) return count;
  return search.exact === 0 ? `${messages.text("feed.search.noExact", { query: query.search })} ${count}`
    : `${count}. ${messages.text("feed.search.similarFrom", { position: messages.number(search.exact + 1) })}`;
}

/** The server/phone interface keeps its existing controls and owns its sheet lifecycle. */
function FallbackFeedControls({ query, today, leagues, onApply, showAccount, subscriberOnly, signedIn }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (query: FeedQuery) => void;
  showAccount: boolean; subscriberOnly: boolean; signedIn: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false), filtersId = useId(), filtersFormId = useId();
  const [filterStatus, setFilterStatus] = useState<FeedFilterDraftStatus>({ valid: true, changed: false });
  const filterActions = useMemo(() => <FeedFilterActions formId={filtersFormId} locale={query.locale} status={filterStatus} />,
    [filterStatus, filtersFormId, query.locale]);
  return <>
    <FeedHeader query={query} today={today} onApply={onApply} showAccount={showAccount} />
    {subscriberOnly && <SubscriberFeedBanner locale={query.locale} signedIn={signedIn} />}
    <FeedFilters subscriberOnly={subscriberOnly} query={query} today={today} leagues={leagues} onApply={onApply}
      open={filtersOpen} panelId={filtersId} onOpenChange={setFiltersOpen} formId={filtersFormId} onDraftStatus={setFilterStatus}
      controls={<FeedFilterToolbar subscriberOnly={subscriberOnly} query={query} onApply={onApply} actions={filterActions}
        summary={<FeedActiveFilterSummary query={query} today={today} leagues={leagues} />} />} />
  </>;
}

/** Successful server projections remain visible if a later navigation fails. */
function FeedSurfaceContent({ query, today, result, controls, pagination, showAccount = false, subscriberOnly = result.data?.access.tier === "free", startingPriceUgx = null }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode; showAccount?: boolean; subscriberOnly?: boolean;
  startingPriceUgx?: number | null | undefined;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const desktopLayout = useDesktopLayout();
  const [paginationStatus, setPaginationStatus] = useState<{ href: string; message: string } | null>(null);
  const onPaginationStatus = useCallback((href: string, message: string) => { setPaginationStatus({ href, message }); }, []);
  const [previous, setPrevious] = useState(result.data ? { query, today, data: result.data } : null);
  if (result.data && previous?.data !== result.data) setPrevious({ query, today, data: result.data });
  const visible = result.data ? { query, today, data: result.data } : previous;
  const messages = createMessages(query.locale);
  const href = feedQueryHref(query, today), leagues = result.data?.leagues ?? previous?.data.leagues ?? noLeagues;
  useEffect(() => {
    // Match pages link back to this exact list, filters included.
    try { window.sessionStorage.setItem(feedReturnStorageKey, href); } catch { /* Storage can be blocked. */ }
  }, [href]);
  const failed = result.error !== null;
  const apply = useCallback((next: FeedQuery) => {
    const nextHref = feedQueryHref(synchronizeFeedStatusDates(next, today), today);
    // App Router discards superseded navigations. No per-keystroke requests.
    startTransition(() => {
      // Explicit Clear must supersede Apply even before React exposes pending=true.
      if (nextHref === href && failed && !pending) router.refresh();
      else router.push(nextHref, { scroll: false });
    });
  }, [failed, href, pending, router, today]);
  const announcement = pending ? messages.text("feed.filters.loading") : result.error
    ? messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")
    : paginationStatus?.href === href ? paginationStatus.message
    : result.data.state === "ready" || result.data.state === "insufficient-data" ? searchAnnouncement(result.data, query, messages.plural("feed.matchCount", result.data.total))
    : messages.text(`feed.state.${result.data.state}`);
  return <FeedStack $gap="sm">
    {desktopLayout ? <>
      <DesktopFeedFilters key={`${href}:${today}`} subscriberOnly={subscriberOnly} query={query} today={today} leagues={leagues} onApply={apply} pending={pending} />
      {subscriberOnly && <SubscriberFeedBanner locale={query.locale} signedIn={result.data?.access.signedIn ?? false} />}
    </> : <FallbackFeedControls query={query} today={today} leagues={leagues} onApply={apply} showAccount={showAccount}
      subscriberOnly={subscriberOnly} signedIn={result.data?.access.signedIn ?? false} />}
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
      {visible && <FeedResults key={feedQueryHref(visible.query, visible.today) + ":" + resolveFeedDates(visible.query, visible.today).startDate + ":" + visible.data.access.tier + ":" + visible.data.access.signedIn}
        data={visible.data} query={visible.query} today={visible.today} enabled={!pending && !result.error} onStatus={onPaginationStatus}
        startingPriceUgx={startingPriceUgx} />}
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
