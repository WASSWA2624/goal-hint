"use client";

import styled from "styled-components";
import { MutedText } from "@/components/ui/layout";
import { feedSortLabelKey, formatProbabilityValue, isAnyProbability, panelFilterCount, resolveFeedDates, type FeedQuery, type ProbabilityRange } from "@/domain/feed-query";
import type { ReportingDate } from "@/domain/calendar";
import { formatOddsRange } from "@/domain/odds";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages, type Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { feedMarketLabels } from "./feed-market-filters";

/** Secondary feed notes: 12px on phones and tablets so they never outrank cards and controls. */
export const FeedNote = styled(MutedText)`
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
  ${media.desktop} { font-size: inherit; line-height: inherit; }
`;
function probabilityFilterLabel(probability: ProbabilityRange, messages: Messages) {
  const min = formatProbabilityValue(probability.min);
  return probability.minExclusive ? messages.text("feed.filters.abovePercent", { min })
    : messages.text("feed.filters.percentRange", { min, max: formatProbabilityValue(probability.max) });
}
const PicksLabel = styled.label`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  min-block-size: var(--form-control-height);
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.typography.scale.secondary};
  &:has(input:disabled) { color: ${({ theme }) => theme.color.mutedText}; }
`;
export function PicksOnlyFilter({ locale, checked, disabled, onChange }: {
  locale: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  const messages = createMessages(locale);
  return <PicksLabel><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    {messages.text("paywall.picksOnly")}{disabled && <span>· {messages.text("paywall.subscribersOnly")}</span>}
  </PicksLabel>;
}

const SummaryList = styled.ul`
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
  > li {
    display: inline;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    &:not(:last-child)::after { content: " · "; }
  }
  ${media.desktop} {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gh-spacing-1);
    font-size: var(--gh-font-body);
    > li {
      display: block;
      padding: var(--gh-spacing-0_5) var(--gh-spacing-1_5);
      border-radius: ${({ theme }) => theme.radius.small};
      background: ${({ theme }) => theme.color.brandSoft};
      border: 0;
      line-height: var(--gh-leading-compact);
      &:not(:last-child)::after { content: none; }
    }
  }
`;
const AppliedSummary = styled.div`
  min-inline-size: 0;
  margin: 0;
  padding-block-start: var(--gh-spacing-1_5);
  border-block-start: 0;
  ${media.desktop} { margin: 0; padding: 0; border: 0; }
`;
const SummaryLabel = styled.strong`
  display: block;
  margin-block-end: var(--gh-spacing-0_5);
  font-size: var(--gh-font-secondary);
  ${media.desktop} { display: none; }
`;
const PendingChanges = styled.p`
  flex: 1 0 100%;
  margin: 0;
  color: ${({ theme }) => theme.color.brand};
  font-size: var(--gh-font-secondary);
  line-height: var(--gh-leading-compact);
  ${media.desktop} { display: none; }
`;

/** A visible draft notice distinguishes unapplied edits from the displayed matches. */
export function FeedDraftStatus({ locale, changed }: { locale: FeedQuery["locale"]; changed: boolean }) {
  return <PendingChanges role="status" aria-live="polite" hidden={!changed}>
    {changed && createMessages(locale).text("feed.filters.changesReady")}
  </PendingChanges>;
}

/** Applied choices remain readable when the editable filter fields are closed; phones show them only when filters are active. */
export function FeedActiveFilterSummary({ query, today, leagues }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"];
}) {
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const marketNames = feedMarketLabels(messages, query);
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
    selection(messages.text("feed.filters.markets"), marketNames, messages.text("feed.filters.any")),
    selection(messages.text("feed.filters.leagues"), leagueNames, messages.text("feed.filters.allLeagues")),
    selection(messages.text("feed.filters.countries"), query.countries, messages.text("feed.filters.anyCountry")),
  ];
  if (query.result) entries.push({ label: `${messages.text("feed.filters.result")}: ${messages.text(`performance.${query.result}`)}`, title: messages.text("feed.filters.result") });
  if (query.time) entries.push({ label: `${query.time.from}–${query.time.to}`, title: query.time.zone });
  if (!isAnyProbability(query.probability)) entries.push({ label: probabilityFilterLabel(query.probability, messages), title: messages.text("feed.filters.probabilityLabel") });
  if (query.odds) entries.push({ label: `${messages.text("feed.filters.oddsLabel")}: ${formatOddsRange(query.odds)}`, title: messages.text("feed.filters.oddsLabel") });
  if (query.search) entries.push({ label: `${messages.text("feed.search.submit")}: ${query.search}`, title: query.search });
  return <AppliedSummary data-active-filter-summary data-quiet={panelFilterCount(query) === 0 && !query.search && !query.result || undefined}>
    <SummaryLabel>{messages.text("feed.filters.showing")}</SummaryLabel>
    <SummaryList aria-label={messages.text("feed.filters.activeSummary")}>
      {entries.map((entry, index) => <li key={index} title={entry.title}>{entry.label}</li>)}
    </SummaryList>
  </AppliedSummary>;
}

/** Plain-text summary of an applied query, shown beside a retained earlier result. */
export function FeedAppliedSummary({ query, leagues }: { query: FeedQuery; leagues: MatchFeedResponse["leagues"] }) {
  const messages = createMessages(query.locale);
  const leagueNames = query.leagues.map((id) => leagues.find((item) => item.id === id)?.name ?? id);
  return <FeedNote data-applied-filters>
    {messages.text("feed.filters.applied")}: {feedMarketLabels(messages, query).join(", ") || messages.text("feed.filters.any")}
    {" · "}{messages.text(`feed.status.${query.status}`)}
    {" · "}{messages.text(feedSortLabelKey(query.sort))}
    {leagueNames.length > 0 && <> · {leagueNames.join(", ")}</>}
    {query.countries.length > 0 && <> · {query.countries.join(", ")}</>}
    {!isAnyProbability(query.probability) && <> · {probabilityFilterLabel(query.probability, messages)}</>}
    {query.result && <> · {messages.text("feed.filters.result")}: {messages.text(`performance.${query.result}`)}</>}
    {query.search && <> · {messages.text("feed.filters.search")}: “{query.search}”</>}
  </FeedNote>;
}
