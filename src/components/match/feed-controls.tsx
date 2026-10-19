"use client";

import Link from "@/components/navigation/navigation-link";
import styled from "styled-components";
import { MutedText } from "@/components/ui/layout";
import { formatProbabilityValue, isAnyMarkets, panelFilterCount, resolveFeedDates, type FeedQuery } from "@/domain/feed-query";
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

export function SubscriberFeedBanner({ locale }: { locale: string }) {
  const messages = createMessages(locale);
  return <FeedNote data-subscriber-banner>{messages.text("paywall.banner")} · <Link href="/en/subscribe" prefetch={false}>{messages.text("paywall.getAccess")}</Link></FeedNote>;
}

const PicksLabel = styled.label`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-block-size: 2.25rem;
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
  font-size: 0.75rem;
  line-height: 1.4;
  > li {
    display: inline;
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    &:not(:last-child)::after { content: " · "; }
  }
  ${media.desktop} {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    font-size: 0.8125rem;
    > li {
      display: block;
      padding: 2px 6px;
      background: ${({ theme }) => theme.color.brandSoft};
      border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
      line-height: 1.4;
      &:not(:last-child)::after { content: none; }
    }
  }
`;
const AppliedSummary = styled.div`
  min-inline-size: 0;
  margin: 0;
  padding-block-start: 6px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${media.desktop} { margin: 0; padding: 0; border: 0; }
`;
const SummaryLabel = styled.strong`
  display: block;
  margin-block-end: 2px;
  font-size: 0.75rem;
  ${media.desktop} { display: none; }
`;
const PendingChanges = styled.p`
  flex: 1 0 100%;
  margin: 0;
  color: ${({ theme }) => theme.color.brand};
  font-size: 0.75rem;
  line-height: 1.4;
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
    selection(messages.text("feed.filters.markets"), isAnyMarkets(query.markets) ? [] : marketNames, messages.text("feed.filters.any")),
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
  return <AppliedSummary data-active-filter-summary data-quiet={panelFilterCount(query) === 0 && !query.search || undefined}>
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
    {messages.text("feed.filters.applied")}: {isAnyMarkets(query.markets) ? messages.text("feed.filters.any")
      : query.markets.map((family) => messages.text(`market.family.${family}`)).join(", ")}
    {" · "}{messages.text(`feed.status.${query.status}`)}
    {" · "}{messages.text(`feed.sort.${query.sort.by}-${query.sort.direction}`)}
    {leagueNames.length > 0 && <> · {leagueNames.join(", ")}</>}
    {query.countries.length > 0 && <> · {query.countries.join(", ")}</>}
    {(query.probability.min !== 0 || query.probability.max !== 100) && <> · {messages.text("feed.filters.percentRange",
      { min: formatProbabilityValue(query.probability.min), max: formatProbabilityValue(query.probability.max) })}</>}
    {query.search && <> · {messages.text("feed.filters.search")}: “{query.search}”</>}
  </FeedNote>;
}
