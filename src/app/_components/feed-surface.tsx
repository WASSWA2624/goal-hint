"use client";

import { memo, useCallback, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { FeedAppliedSummary, FeedNote } from "@/components/match/feed-controls";
import { FeedFilters } from "@/components/match/feed-filters";
import { FeedHeader, ResultsToolbar } from "@/components/match/feed-header";
import { RefreshStatus } from "@/components/match/refresh-status";
import { useLiveRefresh } from "@/components/match/use-live-refresh";
import { feedRefreshInterval } from "@/domain/live-refresh";
import { FeedPagination } from "@/components/match/feed-pagination";
import { useFeedPagination } from "@/components/match/use-feed-pagination";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createPredictionWindow, type ReportingDate } from "@/domain/calendar";
import { feedQueryHref, isFeedDatePreset, panelFilterCount, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { feedRowNumber } from "@/domain/feed-presentation";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { feedReturnStorageKey, performanceHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedStateProvider } from "@/state/provider";
import { media } from "@/styles/theme";

const noLeagues: MatchFeedResponse["leagues"] = [];
/** Pending navigations dim the list in place instead of inserting a line that shifts it. */
const Results = styled(Stack)`
  transition: opacity 150ms ease;
  &[aria-busy="true"] { opacity: 0.6; }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;
/** The retained-result label keeps body colour on desktop. */
const PreviousNote = styled(FeedNote)`${media.desktop} { color: inherit; }`;

/** Memoized with stable callbacks, so header and filter state changes skip the list. */
const FeedResults = memo(function FeedResults({ data: initial, query, today, enabled, onStatus, onApply }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean;
  onStatus: (href: string, message: string) => void; onApply: (next: FeedQuery) => void;
}) {
  const messages = createMessages(query.locale);
  const router = useRouter();
  const { view, phase, error, refreshError, root, retry, refresh } = useFeedPagination({ data: initial, query, today, enabled, onStatus });
  const { data, records } = view;
  // Read when each wait is armed, so the kickoff window always uses the current clock.
  useLiveRefresh({ today, enabled, interval: () => feedRefreshInterval(data, records, Date.now()), refresh,
    rollover: (day) => {
      if (isFeedDatePreset(query.dates.kind) && query.page !== 1) {
        router.replace(feedQueryHref({ ...query, page: 1 }, day), { scroll: false });
      } else router.refresh();
    } });
  const first = feedRowNumber(view.firstPage, data.pageSize, 0);
  return <Stack $gap="sm" ref={root} tabIndex={-1} role="region" aria-label={messages.text("feed.matchList")}
    aria-busy={phase !== null} data-feed-pages data-first-page={view.firstPage} data-last-page={view.lastPage}>
    <RefreshStatus error={refreshError} asOf={data.asOf} locale={query.locale} retry={() => { void refresh(); }} />
    {/* Fixtures without the selected market still list; each row states why it has no pick. */}
    {data.state !== "ready" && data.state !== "insufficient-data" && <EmptyState title={messages.text(`feed.state.${data.state}`)} description={data.message} />}
    {(records.length > 0 || data.total > 0) && <ResultsToolbar query={query} total={data.total} first={first}
      last={first + records.length - 1} onApply={onApply} />}
    {/* Logos stay lazy: an eager image would be hoisted as a third-party preload ahead of the page's own assets. */}
    {records.length > 0 && <MatchCardList aria-label={messages.text("feed.matchList")} locale={query.locale}>
      {records.map((fixture, index) => <li key={fixture.fixtureId}>
        <MatchCard fixture={fixture} analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)}
          markets={query.markets} locale={query.locale} position={first + index} />
      </li>)}
    </MatchCardList>}
    {enabled && <FeedPagination query={query} today={today} data={data} busy={phase !== null} error={error} onRetry={retry} />}
  </Stack>;
});

/** Successful server projections remain visible if a later navigation fails. */
function FeedSurfaceContent({ query, today, result, controls, pagination }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  // Phone filters start collapsed behind the header toggle; desktops always show them.
  const [filtersOpen, setFiltersOpen] = useState(false), filtersId = useId();
  const [paginationStatus, setPaginationStatus] = useState<{ href: string; message: string } | null>(null);
  const onPaginationStatus = useCallback((href: string, message: string) => { setPaginationStatus({ href, message }); }, []);
  const [previous, setPrevious] = useState(result.data ? { query, today, data: result.data } : null);
  if (result.data && previous?.data !== result.data) setPrevious({ query, today, data: result.data });
  const visible = result.data ? { query, today, data: result.data } : previous;
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const href = feedQueryHref(query, today), leagues = result.data?.leagues ?? previous?.data.leagues ?? noLeagues;
  useEffect(() => {
    // Match pages link back to this exact list, filters included.
    try { window.sessionStorage.setItem(feedReturnStorageKey, href); } catch { /* Storage can be blocked. */ }
  }, [href]);
  const failed = result.error !== null;
  const apply = useCallback((next: FeedQuery) => {
    const nextHref = feedQueryHref(next, today);
    // The visible list already matches; only a failed read is worth refreshing.
    if (nextHref === href && !pending && !failed) return;
    // App Router discards superseded navigations. No per-keystroke requests.
    startTransition(() => {
      // Reset to the visible URL must also supersede an unfinished navigation.
      if (nextHref === href && !pending) router.refresh();
      else router.push(nextHref, { scroll: false });
    });
  }, [failed, href, pending, router, today]);
  const toggleFilters = useCallback(() => setFiltersOpen((open) => !open), []);
  const announcement = pending ? messages.text("feed.filters.loading") : result.error
    ? messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")
    : paginationStatus?.href === href ? paginationStatus.message
    : result.data.state === "ready" || result.data.state === "insufficient-data" ? messages.plural("feed.matchCount", result.data.total)
    : messages.text(`feed.state.${result.data.state}`);
  return <Stack $gap="sm">
    <FeedHeader query={query} today={today} onApply={apply}
      filters={{ open: filtersOpen, count: panelFilterCount(query), controls: filtersId, onToggle: toggleFilters }} />
    <FeedFilters query={query} today={today} leagues={leagues} total={result.data?.total ?? null} onApply={apply}
      phoneOpen={filtersOpen} phoneId={filtersId} />
    {query.status === "finished" && <TextLink href={performanceHref(query.locale)} prefetch={false}>{messages.text("performance.resultsLink")}</TextLink>}
    {controls}
    {range.endDate > createPredictionWindow(today).lastDate && <FeedNote>{messages.text("feed.sevenDayAvailability")}</FeedNote>}
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    <Results $gap="md" aria-busy={pending} data-feed-results>
      {result.error && <EmptyState title={messages.text(result.error === "rate-limited" ? "feed.rateLimitedTitle" : "feed.unavailableTitle")}
        description={messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")}
        action={<ButtonLink href={href} prefetch={false} variant="secondary" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); apply(query);
        }}>{messages.text("feed.retry")}</ButtonLink>} />}
      {result.error && visible && <Stack $gap="sm">
        <PreviousNote>{messages.text("feed.filters.previous")}</PreviousNote>
        <FeedAppliedSummary query={visible.query} leagues={visible.data.leagues} />
      </Stack>}
      {visible && <FeedResults key={feedQueryHref(visible.query, visible.today) + ":" + resolveFeedDates(visible.query, visible.today).startDate}
        data={visible.data} query={visible.query} today={visible.today} enabled={!pending && !result.error} onStatus={onPaginationStatus} onApply={apply} />}
      {!result.error && pagination}
    </Results>
  </Stack>;
}

export function FeedSurface(props: Parameters<typeof FeedSurfaceContent>[0]) {
  // Cards render from server props and the store reads only the draft, so the bootstrap skips
  // validating the page's records again during hydration.
  return <FeedStateProvider key={props.query.locale} initial={{ query: props.query, today: props.today, data: null }}>
    <FeedSurfaceContent {...props} />
  </FeedStateProvider>;
}
