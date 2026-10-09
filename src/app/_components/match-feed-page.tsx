import "server-only";
import type { ReactNode } from "react";
import { MatchCard } from "@/components/match/match-card";
import { MatchCardList } from "@/components/match/match-card-list";
import { ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { BodyText, MutedText, PageHeading, Stack } from "@/components/ui/layout";
import { createPredictionWindow, parseReportingDate, toUtcIsoString, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { feedQueryHref, feedQueryKey, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import { canonicalMatchSlug } from "@/domain/match-slug";
import { createMessages } from "@/i18n/messages";
import type { FeedPageResult } from "@/server/matches/feed-page";
import { FeedStateProvider } from "@/state/provider";
import { FeedDateLinks } from "./feed-date-links";
import { FeedRunStatus } from "./feed-run-status";
import { PublicShell } from "./public-shell";

/** Server composition; later controls/pagination use the same validated URL and bootstrap. */
export function MatchFeedPage({ query, today, result, controls, pagination }: {
  query: FeedQuery; today: ReportingDate; result: FeedPageResult; controls?: ReactNode; pagination?: ReactNode;
}) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today), { data, error } = result;
  const providerKey = `${feedQueryKey(query, today)}:${feedQueryHref(query, today)}`;
  const outsideWindow = range.endDate > createPredictionWindow(today).lastDate;
  return <PublicShell locale={query.locale} today={today} current={query.status === "finished" ? "results" : "today"}>
    <FeedStateProvider key={providerKey} initial={{ query, today, data }}>
      <Stack $gap="lg">
        <Stack $gap="sm">
          <PageHeading>{messages.text("feed.title")}</PageHeading>
          <BodyText>
            <time dateTime={range.startDate}>{messages.reportingDate(range.startDate)}</time>
            {range.dayCount > 1 && <> – <time dateTime={range.endDate}>{messages.reportingDate(range.endDate)}</time></>}
            {" · "}{messages.text("feed.reportingTimeZone")}
          </BodyText>
          <MutedText>{messages.text(`feed.status.${query.status}`)}</MutedText>
        </Stack>
        <FeedDateLinks query={query} today={today} />
        {controls}
        {outsideWindow && <BodyText>{messages.text("feed.sevenDayAvailability")}</BodyText>}
        {error ? <EmptyState title={messages.text(error === "rate-limited" ? "feed.rateLimitedTitle" : "feed.unavailableTitle")}
          description={messages.text(error === "rate-limited" ? "feed.rateLimited" : "feed.unavailable")}
          action={<ButtonLink href={feedQueryHref(query, today)} prefetch={false} variant="secondary">{messages.text("feed.retry")}</ButtonLink>} /> : <>
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
          {pagination}
        </>}
      </Stack>
    </FeedStateProvider>
  </PublicShell>;
}
