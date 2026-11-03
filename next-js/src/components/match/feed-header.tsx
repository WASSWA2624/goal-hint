"use client";

import styled from "styled-components";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createPredictionWindow, toUtcIsoString, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
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
  { by: "probability", direction: "desc" }, { by: "probability", direction: "asc" },
  { by: "kickoff", direction: "asc" }, { by: "kickoff", direction: "desc" },
];

const ResultsBar = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--gh-spacing-1) var(--gh-spacing-2);
  min-inline-size: 0;
  padding: var(--gh-spacing-2) ${({ theme }) => theme.layout.sectionPadding};
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.brandSoft};
  border-radius: ${({ theme }) => theme.radius.none};
`;
const TitleLine = styled.div`
  min-inline-size: 0;
  line-height: var(--gh-leading-compact);
  > h2 {
    display: inline;
    margin: 0;
    margin-inline-end: var(--gh-spacing-1_5);
    font-size: var(--gh-font-secondary);
    font-weight: var(--gh-weight-medium);
    ${media.desktop} { font-size: var(--gh-font-body); }
  }
`;
const PublishedAt = styled.time`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
  overflow-wrap: anywhere;
`;
const ResultCount = styled.p`
  grid-column: 2;
  grid-row: 1;
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-label);
  text-align: end;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
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

/** One header follows the visible results and their actual stored prediction publication. */
export function ResultsToolbar({ query, today, total, first, last, publishedAt = null }: {
  query: FeedQuery; today: ReportingDate; total: number | null; first: number; last: number; publishedAt?: number | null;
}) {
  const messages = createMessages(query.locale, undefined, query.zone ?? query.time?.zone ?? publicPolicy.reportingTimeZone);
  const outsidePredictionWindow = resolveFeedDates(query, today).endDate > createPredictionWindow(today).lastDate;
  const instant = publishedAt === null ? null : utcInstantFromEpochMilliseconds(publishedAt);
  const publication = instant === null ? null : messages.predictionPublication(instant);
  const values = { shown: total === 0 || last < first ? "0" : `${messages.number(first)}–${messages.number(last)}`, total: total === null ? "" : messages.number(total) };
  return <ResultsBar data-results-header>
    <TitleLine>
      <h2>{messages.text("feed.results.title")}</h2>{" "}
      {instant !== null && <PublishedAt dateTime={toUtcIsoString(instant)} data-prediction-publication
        title={messages.text("feed.results.latestPublication", { time: publication! })}>{publication}</PublishedAt>}
    </TitleLine>
    {total !== null && <ResultCount data-match-count aria-label={messages.text("feed.results.showing", values)}>
      <span data-desktop-count>{messages.text("feed.results.showing", values)}</span>
      <span data-phone-count aria-hidden="true">{messages.text("feed.results.range", values)}</span>
    </ResultCount>}
    {outsidePredictionWindow && <AvailabilityNote>{messages.text("feed.sevenDayAvailability")}</AvailabilityNote>}
  </ResultsBar>;
}
