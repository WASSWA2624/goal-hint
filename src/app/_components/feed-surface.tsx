"use client";

import { Fragment, memo, useCallback, useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { FeedActiveFilterSummary, FeedAppliedSummary, FeedNote, SubscriberFeedBanner } from "@/components/match/feed-controls";
import { FeedFilterActions, FeedFilters, type FeedFilterDraftStatus } from "@/components/match/feed-filters";
import { FeedFilterToolbar, FeedHeader, ResultsToolbar } from "@/components/match/feed-header";
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
import type { ReportingDate } from "@/domain/calendar";
import { feedQueryHref, isFeedDatePreset, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
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
const FeedResults = memo(function FeedResults({ data: initial, query, today, enabled, onStatus }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean;
  onStatus: (href: string, message: string) => void;
}) {
  const messages = createMessages(query.locale);
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
  return <FeedStack $gap="sm" ref={root} tabIndex={-1} role="region" aria-label={messages.text("feed.matchList")}
    aria-busy={phase !== null} data-feed-pages data-first-page={view.firstPage} data-last-page={view.lastPage}>
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
            markets={query.markets} locale={query.locale} position={first + index}
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

/** Successful server projections remain visible if a later navigation fails. */
function FeedSurfaceContent({ query, today, result, controls, pagination, showAccount = false, subscriberOnly = result.data?.access.tier === "free" }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode; showAccount?: boolean; subscriberOnly?: boolean;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  // Phones edit filters in a sheet; search, days, sort and the applied summary stay in the page.
  const [filtersOpen, setFiltersOpen] = useState(false), filtersId = useId();
  const filtersFormId = useId();
  const [filterStatus, setFilterStatus] = useState<FeedFilterDraftStatus>({ valid: true, changed: false });
  const filterActions = useMemo(() => <FeedFilterActions formId={filtersFormId} locale={query.locale} status={filterStatus} />,
    [filterStatus, filtersFormId, query.locale]);
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
    const nextHref = feedQueryHref(next, today);
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
    <FeedHeader query={query} today={today} onApply={apply} showAccount={showAccount} />
    {subscriberOnly && <SubscriberFeedBanner locale={query.locale} signedIn={result.data?.access.signedIn ?? false} />}
    <FeedFilters subscriberOnly={subscriberOnly} query={query} today={today} leagues={leagues} onApply={apply}
      open={filtersOpen} panelId={filtersId} onOpenChange={setFiltersOpen} formId={filtersFormId} onDraftStatus={setFilterStatus}
      controls={<FeedFilterToolbar subscriberOnly={subscriberOnly} query={query} onApply={apply} actions={filterActions}
        summary={<FeedActiveFilterSummary query={query} today={today} leagues={leagues} />} />} />
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
        data={visible.data} query={visible.query} today={visible.today} enabled={!pending && !result.error} onStatus={onPaginationStatus} />}
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
