"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FeedAppliedSummary, FeedControls } from "@/components/match/feed-controls";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { ButtonLink } from "@/components/ui/controls";
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

function FeedResults({ data, query }: { data: MatchFeedResponse; query: FeedQuery }) {
  const messages = createMessages(query.locale);
  return <>
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
    {data.records.length > 0 && <>
      <MutedText>{messages.text("feed.showingMatches", { shown: messages.number(data.records.length), total: messages.number(data.total) })}</MutedText>
      <MatchCardList aria-label={messages.text("feed.matchList")}>
        {data.records.map((fixture, index) => <li key={fixture.fixtureId}>
          <MatchCard fixture={fixture} analysisSlug={canonicalMatchSlug(fixture.homeTeam.name, fixture.awayTeam.name)}
            selectedFamily={query.market} locale={query.locale} eagerLogos={index < 2} />
        </li>)}
      </MatchCardList>
    </>}
  </>;
}

/** Successful server projections remain visible if a later navigation fails. */
export function FeedSurface({ query, today, result, controls, pagination }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
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
    : result.data.state === "ready" ? messages.plural("feed.matchCount", result.data.total) : messages.text(`feed.state.${result.data.state}`);
  return <Stack $gap="lg">
    <Stack $gap="sm">
      <PageHeading>{messages.text("feed.title")}</PageHeading>
      <FeedRange query={query} today={today} />
      <MutedText>{messages.text(`feed.status.${query.status}`)}</MutedText>
    </Stack>
    <FeedDateLinks query={query} today={today} />
    <FeedStateProvider key={`${today}:${query.locale}`} initial={{ query, today, data: result.data }}>
      <FeedControls query={query} today={today} leagues={leagues} onApply={apply} />
      {controls}
    </FeedStateProvider>
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
      {visible && <FeedResults data={visible.data} query={visible.query} />}
      {!result.error && pagination}
    </Stack>
  </Stack>;
}
