"use client";

import { useCallback, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FeedAppliedSummary } from "@/components/match/feed-controls";
import { FeedFilters } from "@/components/match/feed-filters";
import { FeedHeader, ResultsToolbar } from "@/components/match/feed-header";
import { RefreshStatus } from "@/components/match/refresh-status";
import { useLiveRefresh } from "@/components/match/use-live-refresh";
import { liveRefreshRules } from "@/domain/live-refresh";
import { FeedPagination } from "@/components/match/feed-pagination";
import { useFeedPagination } from "@/components/match/use-feed-pagination";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, MutedText, Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createPredictionWindow, parseReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { feedQueryHref, isFeedDatePreset, panelFilterCount, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { feedRowNumber } from "@/domain/feed-presentation";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { performanceHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedStateProvider } from "@/state/provider";

function FeedResults({ data: initial, query, today, enabled, onStatus, onApply }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean;
  onStatus: (href: string, message: string) => void; onApply: (next: FeedQuery) => void;
}) {
  const messages = createMessages(query.locale);
  const router = useRouter();
  const { view, phase, error, refreshError, root, retry, refresh } = useFeedPagination({ data: initial, query, today, enabled, onStatus });
  const { data, records } = view;
  const active = isFeedDatePreset(query.dates.kind) || data.run?.phase === "updating" ||
    records.some((record) => record.status === "live" || record.status === "scheduled");
  useLiveRefresh({ today, enabled, interval: active ? liveRefreshRules.activeMs : liveRefreshRules.quietMs, refresh,
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
    {records.length > 0 && <MatchCardList aria-label={messages.text("feed.matchList")} locale={query.locale}>
      {records.map((fixture, index) => <li key={fixture.fixtureId}>
        <MatchCard fixture={fixture} analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)}
          markets={query.markets} locale={query.locale} eagerLogos={index < 2} position={first + index} />
      </li>)}
    </MatchCardList>}
    {enabled && <FeedPagination query={query} today={today} data={data} busy={phase !== null} error={error} onRetry={retry} />}
  </Stack>;
}

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
  const href = feedQueryHref(query, today), leagues = result.data?.leagues ?? previous?.data.leagues ?? [];
  function apply(next: FeedQuery) {
    const nextHref = feedQueryHref(next, today);
    // App Router discards superseded navigations. No per-keystroke requests.
    startTransition(() => {
      // Reset to the visible URL must also supersede an unfinished navigation.
      if (nextHref === href && !pending) router.refresh();
      else router.push(nextHref, { scroll: false });
    });
  }
  const announcement = pending ? messages.text("feed.filters.loading") : result.error
    ? messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")
    : paginationStatus?.href === href ? paginationStatus.message
    : result.data.state === "ready" || result.data.state === "insufficient-data" ? messages.plural("feed.matchCount", result.data.total)
    : messages.text(`feed.state.${result.data.state}`);
  return <Stack $gap="sm">
    <FeedHeader query={query} today={today} onApply={apply}
      filters={{ open: filtersOpen, count: panelFilterCount(query), controls: filtersId, onToggle: () => setFiltersOpen(!filtersOpen) }} />
    <FeedFilters query={query} today={today} leagues={leagues} total={result.data?.total ?? null} onApply={apply}
      phoneOpen={filtersOpen} phoneId={filtersId} />
    {query.status === "finished" && <TextLink href={performanceHref(query.locale)} prefetch={false}>{messages.text("performance.resultsLink")}</TextLink>}
    {controls}
    {range.endDate > createPredictionWindow(today).lastDate && <MutedText>{messages.text("feed.sevenDayAvailability")}</MutedText>}
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    {pending && <MutedText>{messages.text("feed.filters.loading")}</MutedText>}
    <Stack $gap="md" aria-busy={pending} data-feed-results>
      {result.error && <EmptyState title={messages.text(result.error === "rate-limited" ? "feed.rateLimitedTitle" : "feed.unavailableTitle")}
        description={messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")}
        action={<ButtonLink href={href} prefetch={false} variant="secondary" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); apply(query);
        }}>{messages.text("feed.retry")}</ButtonLink>} />}
      {result.error && visible && <Stack $gap="sm">
        <BodyText>{messages.text("feed.filters.previous")}</BodyText>
        <FeedAppliedSummary query={visible.query} leagues={visible.data.leagues} />
      </Stack>}
      {visible && <FeedResults key={feedQueryHref(visible.query, visible.today) + ":" + resolveFeedDates(visible.query, visible.today).startDate}
        data={visible.data} query={visible.query} today={visible.today} enabled={!pending && !result.error} onStatus={onPaginationStatus} onApply={apply} />}
      {!result.error && pagination}
    </Stack>
  </Stack>;
}

export function FeedSurface(props: Parameters<typeof FeedSurfaceContent>[0]) {
  return <FeedStateProvider key={props.query.locale} initial={{ query: props.query, today: props.today, data: props.result.data }}>
    <FeedSurfaceContent {...props} />
  </FeedStateProvider>;
}
