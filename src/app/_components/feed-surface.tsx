"use client";

import { useCallback, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FeedAppliedSummary, FeedControls } from "@/components/match/feed-controls";
import { RefreshStatus } from "@/components/match/refresh-status";
import { useLiveRefresh } from "@/components/match/use-live-refresh";
import { liveRefreshRules } from "@/domain/live-refresh";
import { FeedPagination } from "@/components/match/feed-pagination";
import { useFeedPagination } from "@/components/match/use-feed-pagination";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, MutedText, PageHeading, Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createPredictionWindow, parseReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { feedQueryHref, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { createMessages } from "@/i18n/messages";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedStateProvider } from "@/state/provider";
import { FeedDateLinks } from "./feed-date-links";
import { FeedRunStatus } from "./feed-run-status";

function FeedRange({ query, today }: { query: FeedQuery; today: ReportingDate }) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  return <BodyText>
    <time dateTime={range.startDate}>{messages.reportingDate(range.startDate)}</time>
    {range.dayCount > 1 && <> – <time dateTime={range.endDate}>{messages.reportingDate(range.endDate)}</time></>}
    {" · "}{messages.text("feed.reportingTimeZone")}
  </BodyText>;
}

function FeedResults({ data: initial, query, today, enabled, onStatus }: {
  data: MatchFeedResponse; query: FeedQuery; today: ReportingDate; enabled: boolean; onStatus: (href: string, message: string) => void;
}) {
  const messages = createMessages(query.locale);
  const router = useRouter();
  const { view, phase, error, refreshError, root, loadMore, retry, refresh } = useFeedPagination({ data: initial, query, today, enabled, onStatus });
  const { data, records } = view;
  const active = ["today", "tomorrow", "next-7-days"].includes(query.dates.kind) || data.run?.phase === "updating" ||
    records.some((record) => record.status === "live" || record.status === "scheduled");
  useLiveRefresh({ today, enabled, interval: active ? liveRefreshRules.activeMs : liveRefreshRules.quietMs, refresh,
    rollover: (day) => {
      if (["today", "tomorrow", "next-7-days"].includes(query.dates.kind) && query.page !== 1) {
        router.replace(feedQueryHref({ ...query, page: 1 }, day), { scroll: false });
      } else router.refresh();
    } });
  return <Stack $gap="lg" ref={root} tabIndex={-1} role="region" aria-label={messages.text("feed.matchList")}
    aria-busy={phase !== null} data-feed-pages data-first-page={view.firstPage} data-last-page={view.lastPage}>
    <RefreshStatus error={refreshError} asOf={data.asOf} locale={query.locale} retry={() => { void refresh(); }} />
    {data.run && <FeedRunStatus run={data.run} asOf={data.asOf} locale={query.locale} />}
    {data.coverage.partial && <EmptyState title={messages.text("feed.partialCoverageTitle")} description={<Stack $gap="sm">
      <BodyText>{messages.text("feed.partialCoverageDescription")}</BodyText>
      {data.coverage.dates.filter((entry) => !entry.authoritative).map((entry) => <MutedText key={entry.date}>
        <time dateTime={entry.date}>{messages.reportingDate(parseReportingDate(entry.date))}</time>: {messages.text(`feed.coverage.${entry.status}`)}
        {entry.observedAt !== null && <> · {messages.text("feed.coverageObserved")}: <time dateTime={toUtcIsoString(utcInstantFromEpochMilliseconds(entry.observedAt))}>
          {messages.reportingInstant(utcInstantFromEpochMilliseconds(entry.observedAt))}
        </time></>}
      </MutedText>)}
    </Stack>} />}
    {data.state !== "ready" && <EmptyState title={messages.text(`feed.state.${data.state}`)} description={data.message} />}
    {records.length > 0 && <>
      <MutedText>{messages.text("feed.showingMatches", { shown: messages.number(records.length), total: messages.number(data.total) })}</MutedText>
      <MatchCardList aria-label={messages.text("feed.matchList")}>
        {records.map((fixture, index) => <li key={fixture.fixtureId}>
          <MatchCard fixture={fixture} analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)}
            selectedFamily={query.market} locale={query.locale} eagerLogos={index < 2} />
        </li>)}
      </MatchCardList>
    </>}
    {enabled && <FeedPagination query={query} today={today} view={view} busy={phase !== null} error={error} onLoadMore={loadMore} onRetry={retry} />}
  </Stack>;
}

/** Successful server projections remain visible if a later navigation fails. */
function FeedSurfaceContent({ query, today, result, controls, pagination }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
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
    : result.data.state === "ready" ? messages.plural("feed.matchCount", result.data.total) : messages.text(`feed.state.${result.data.state}`);
  return <Stack $gap="lg">
    <Stack $gap="sm">
      <PageHeading>{messages.text("feed.title")}</PageHeading>
      <FeedRange query={query} today={today} />
      <MutedText>{messages.text(`feed.status.${query.status}`)}</MutedText>
    </Stack>
    {query.status === "finished" && <TextLink href="/en/how-it-works#performance" prefetch={false}>{messages.text("performance.resultsLink")}</TextLink>}
    <FeedDateLinks query={query} today={today} />
    <FeedControls query={query} today={today} leagues={leagues} onApply={apply} />
    {controls}
    {range.endDate > createPredictionWindow(today).lastDate && <BodyText>{messages.text("feed.sevenDayAvailability")}</BodyText>}
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">{announcement}</VisuallyHidden>
    {pending && <MutedText>{messages.text("feed.filters.loading")}</MutedText>}
    <Stack $gap="lg" aria-busy={pending} data-feed-results>
      {result.error && <EmptyState title={messages.text(result.error === "rate-limited" ? "feed.rateLimitedTitle" : "feed.unavailableTitle")}
        description={messages.text(result.error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")}
        action={<ButtonLink href={href} prefetch={false} variant="secondary" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); apply(query);
        }}>{messages.text("feed.retry")}</ButtonLink>} />}
      {result.error && visible && <Stack $gap="sm">
        <BodyText>{messages.text("feed.filters.previous")}</BodyText>
        <FeedRange query={visible.query} today={visible.today} />
        <FeedAppliedSummary query={visible.query} leagues={visible.data.leagues} />
      </Stack>}
      {visible && <FeedResults key={feedQueryHref(visible.query, visible.today) + ":" + resolveFeedDates(visible.query, visible.today).startDate}
        data={visible.data} query={visible.query} today={visible.today} enabled={!pending && !result.error} onStatus={onPaginationStatus} />}
      {!result.error && pagination}
    </Stack>
  </Stack>;
}

export function FeedSurface(props: Parameters<typeof FeedSurfaceContent>[0]) {
  return <FeedStateProvider key={props.query.locale} initial={{ query: props.query, today: props.today, data: props.result.data }}>
    <FeedSurfaceContent {...props} />
  </FeedStateProvider>;
}
