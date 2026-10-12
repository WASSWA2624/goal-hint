"use client";

import styled from "styled-components";
import { MutedText } from "@/components/ui/layout";
import { formatProbabilityValue, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
import type { ReportingDate } from "@/domain/calendar";
import { formatOddsRange } from "@/domain/odds";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

/** Secondary feed notes: 12px on phones and tablets so they never outrank cards and controls. */
export const FeedNote = styled(MutedText)`
  font-size: 0.75rem;
  line-height: 1.4;
  ${media.desktop} { font-size: inherit; line-height: inherit; }
`;

const SummaryList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  > li {
    max-inline-size: 100%;
    padding: 2px 6px;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.brandSoft};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    font-size: 0.8125rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
`;

/** Applied choices remain readable when the editable filter fields are collapsed. */
export function FeedActiveFilterSummary({ query, today, leagues }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"];
}) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const marketNames = query.markets.map((family) => messages.text(`market.family.${family}`));
  const leagueNames = query.leagues.map((id) => leagues.find((league) => league.id === id)?.name ?? id);
  const selection = (label: string, values: readonly string[], fallback: string) => ({
    label: values.length > 1 ? `${label}: ${messages.text("feed.filters.selectedCount", { count: messages.number(values.length) })}`
      : values[0] ?? fallback,
    title: values.join(", ") || fallback,
  });
  const entries = [
    { label: range.dayCount === 1 ? messages.reportingDateShort(range.startDate)
      : `${messages.reportingDateShort(range.startDate)} – ${messages.reportingDateShort(range.endDate)}`,
      title: range.dayCount === 1 ? messages.reportingDate(range.startDate)
        : `${messages.reportingDate(range.startDate)} – ${messages.reportingDate(range.endDate)}` },
    selection(messages.text("feed.filters.markets"), marketNames, ""),
    selection(messages.text("feed.filters.leagues"), leagueNames, messages.text("feed.filters.allLeagues")),
    selection(messages.text("feed.filters.countries"), query.countries, messages.text("feed.filters.anyCountry")),
  ];
  if (query.time) entries.push({ label: `${query.time.from}–${query.time.to}`, title: query.time.zone });
  if (query.probability.min !== 0 || query.probability.max !== 100) {
    const label = messages.text("feed.filters.percentRange", {
      min: formatProbabilityValue(query.probability.min), max: formatProbabilityValue(query.probability.max),
    });
    entries.push({ label, title: messages.text("feed.filters.probabilityLabel") });
  }
  if (query.odds) entries.push({ label: `${messages.text("feed.filters.oddsLabel")}: ${formatOddsRange(query.odds)}`, title: messages.text("feed.filters.oddsLabel") });
  if (query.search) entries.push({ label: `${messages.text("feed.search.submit")}: ${query.search}`, title: query.search });
  return <SummaryList aria-label={messages.text("feed.filters.activeSummary")} data-active-filter-summary>
    {entries.map((entry, index) => <li key={index} title={entry.title}>{entry.label}</li>)}
  </SummaryList>;
}

/** Plain-text summary of an applied query, shown beside a retained earlier result. */
export function FeedAppliedSummary({ query, leagues }: { query: FeedQuery; leagues: MatchFeedResponse["leagues"] }) {
  const messages = createMessages(query.locale);
  const leagueNames = query.leagues.map((id) => leagues.find((item) => item.id === id)?.name ?? id);
  return <FeedNote data-applied-filters>
    {messages.text("feed.filters.applied")}: {query.markets.map((family) => messages.text(`market.family.${family}`)).join(", ")}
    {" · "}{messages.text(`feed.status.${query.status}`)}
    {" · "}{messages.text(`feed.sort.${query.sort.by}-${query.sort.direction}`)}
    {leagueNames.length > 0 && <> · {leagueNames.join(", ")}</>}
    {query.countries.length > 0 && <> · {query.countries.join(", ")}</>}
    {(query.probability.min !== 0 || query.probability.max !== 100) && <> · {messages.text("feed.filters.percentRange",
      { min: formatProbabilityValue(query.probability.min), max: formatProbabilityValue(query.probability.max) })}</>}
    {query.search && <> · {messages.text("feed.filters.search")}: “{query.search}”</>}
  </FeedNote>;
}
