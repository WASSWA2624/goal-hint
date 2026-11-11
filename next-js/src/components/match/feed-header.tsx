"use client";

import styled from "styled-components";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { SectionHeader, sectionHeaderMetadata } from "@/components/ui/section-header";
import { createPredictionWindow, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { matchFeedPageDefaults, resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
import { feedHeading } from "@/domain/feed-presentation";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { FeedNote } from "./feed-controls";

/** Page branding stays outside the single search/filter row. */
export function FeedHeader({ query, today, showAccount = false }: {
  query: FeedQuery; today: ReportingDate; showAccount?: boolean;
}) {
  return <>
    <AppBrandBar locale={query.locale} showAccount={showAccount} />
    <VisuallyHidden as="h1">{feedHeading(query, today, createMessages(query.locale))}</VisuallyHidden>
  </>;
}

export const feedSortOptions: readonly FeedSort[] = [
  matchFeedPageDefaults.sort,
  { by: "probability", direction: "desc" }, { by: "probability", direction: "asc" },
  { by: "kickoff", direction: "asc" }, { by: "kickoff", direction: "desc" },
];

const ResultsBar = styled(SectionHeader)`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  background: ${({ theme }) => theme.color.brandSoft};
  border: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid ${({ theme }) => theme.phoneCardFrame.separator};
  border-radius: ${({ theme }) => theme.radius.none};
`;
const TitleLine = styled.div`
  min-inline-size: 0;
  [data-header-desktop] { display: none; }
  ${media.desktop} {
    [data-header-mobile] { display: none; }
    [data-header-desktop] { display: inline; }
  }
  > h2 {
    display: inline;
    margin: 0;
    margin-inline-end: var(--gh-spacing-1_5);
  }
`;
const ResultsPeriod = styled.span`
  ${sectionHeaderMetadata}
`;
const ResultCount = styled.p`
  ${sectionHeaderMetadata}
  grid-column: 2;
  grid-row: 1;
  text-align: end;
  white-space: nowrap;
  > [data-desktop-count] { display: none; }
  ${media.desktop} {
    > [data-desktop-count] { display: inline; }
    > [data-phone-count] { display: none; }
  }
`;
const AvailabilityNote = styled(FeedNote)`
  grid-column: 1 / -1;
  margin: 0;
`;

/** The heading names the applied match dates; publication history stays in the tooltip. */
export function ResultsToolbar({ query, today, total, first, last, publishedAt = null }: {
  query: FeedQuery; today: ReportingDate; total: number | null; first: number; last: number; publishedAt?: number | null;
}) {
  const messages = createMessages(query.locale, undefined, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone);
  const range = resolveFeedDates(query, today);
  const outsidePredictionWindow = range.endDate > createPredictionWindow(today).lastDate;
  const period = messages.reportingDateRangeCompact(range.startDate, range.endDate);
  const weekday = range.dayCount === 1 ? `${messages.reportingDayParts(range.startDate).weekday.toUpperCase()} ` : "";
  const instant = publishedAt === null ? null : utcInstantFromEpochMilliseconds(publishedAt);
  const publication = instant === null ? null : messages.predictionPublication(instant);
  const values = { shown: total === 0 || last < first ? "0" : `${messages.number(first)}–${messages.number(last)}`, total: total === null ? "" : messages.number(total) };
  return <ResultsBar data-results-header>
    <TitleLine>
      <h2><span data-header-mobile>{messages.text("navigation.matches")}</span><span data-header-desktop>{messages.text("feed.results.title")}</span></h2>{" "}
      <ResultsPeriod data-results-period data-from={range.startDate} data-to={range.endDate}
        title={publication === null ? undefined : messages.text("feed.results.latestPublication", { time: publication })}>
        <span data-header-mobile>{messages.reportingDateRangeCompact(range.startDate, range.endDate, "numeric")}</span>
        <span data-header-desktop>{weekday}{period}</span>
      </ResultsPeriod>
    </TitleLine>
    {total !== null && <ResultCount data-match-count aria-label={messages.text("feed.results.showing", values)}>
      <span data-desktop-count>{messages.text("feed.results.showing", values)}</span>
      <span data-phone-count aria-hidden="true">{messages.text("feed.results.range", values)}</span>
    </ResultCount>}
    {outsidePredictionWindow && <AvailabilityNote>{messages.text("feed.sevenDayAvailability")}</AvailabilityNote>}
  </ResultsBar>;
}
