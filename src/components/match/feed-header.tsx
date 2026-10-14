"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { ChevronDownIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { ReportingDate } from "@/domain/calendar";
import { resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { DatePresets } from "./feed-dates";
import { focusRing } from "./filter-parts";

const desktop = media.desktop;
const HeaderContent = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  ${media.belowDesktop} { display: contents; }
`;
const BrandContainer = styled.div`
  position: sticky;
  inset-block-start: 8px;
  z-index: 30;
  ${desktop} { display: contents; }
`;
/** One semantic title remains accessible on mobile and visible on desktop. */
const PageHeading = styled(VisuallyHidden)`
  ${desktop} {
    position: static;
    inline-size: auto;
    block-size: auto;
    margin: 0;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    font-size: ${({ theme }) => theme.typography.size.h1};
  }
`;

/** Phones show the brand bar; desktops align quick date presets beneath the shell header. */
const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  ${media.belowDesktop} { display: contents; }
`;
const DesktopActions = styled.div`
  display: none;
  ${desktop} { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-inline-start: auto; }
`;

export function feedHeading(query: FeedQuery, today: ReportingDate, messages: ReturnType<typeof createMessages>) {
  const range = resolveFeedDates(query, today);
  if (query.status === "live") return messages.text("feed.heading.live");
  if (query.status === "finished") return messages.text("feed.heading.results");
  if (range.dayCount === 1 && range.startDate === today) return messages.text("feed.heading.today");
  if (query.dates.kind === "tomorrow") return messages.text("feed.heading.tomorrow");
  return messages.text("feed.heading.other");
}

/** The brand bar carries page-level controls; search and filters belong in the body. */
export function FeedHeader({ query, today, onApply }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void;
}) {
  const messages = createMessages(query.locale);
  const heading = feedHeading(query, today, messages);
  return <HeaderContent>
    <Row>
      <BrandContainer><AppBrandBar locale={query.locale} /></BrandContainer>
      <PageHeading as="h1">{heading}</PageHeading>
      <DesktopActions>
        <DatePresets query={query} today={today} onApply={onApply} />
      </DesktopActions>
    </Row>
  </HeaderContent>;
}

/** Sorting and filter actions stay outside the collapsible fields. */
const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
  ${media.belowDesktop} {
    display: block;
  }
`;
/** Desktop shares one row; phones show only an active-filter summary here, and nothing by default. */
const FilterToolbar = styled(Toolbar)`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  ${media.belowDesktop} { &:has(> [data-quiet]) { display: none; } }
  ${desktop} {
    grid-template-columns: minmax(0, 1fr) auto;
    > [data-active-filter-summary] { grid-column: 1; grid-row: 1; }
    > div { grid-column: 2; grid-row: 1; }
  }
`;
const Count = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  > h2 { font-size: 0.75rem; ${desktop} { font-size: 1.25rem; } }
  > p { display: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; ${desktop} { display: block; } }
  ${media.belowDesktop} {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;
const SortGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  min-inline-size: 0;
  align-items: center;
  gap: 8px;
  ${desktop} { margin-inline-start: auto; justify-content: flex-end; }
  ${media.belowDesktop} { display: none; }
`;
const DesktopSortLabel = styled.label`
  display: none;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.875rem;
  ${desktop} { display: inline; }
`;
const ResultCount = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  line-height: 1.2;
  text-align: end;
  font-variant-numeric: tabular-nums;
  > [data-phone-count] { display: none; }
  ${media.belowDesktop} {
    font-size: 0.75rem;
    > [data-desktop-count] { display: none; }
    > [data-phone-count] { display: inline; }
  }
`;
const SelectWrap = styled.span`
  position: relative;
  display: none;
  ${desktop} { display: inline-flex; }
  > select {
    min-block-size: 2rem;
    padding-inline: 7px 22px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 0;
    font: inherit;
    font-size: 0.8125rem;
    appearance: none;
    cursor: pointer;
    ${focusRing}
  }
  > svg { position: absolute; inset-inline-end: 7px; inset-block-start: 50%; transform: translateY(-50%); pointer-events: none; }
`;
export const feedSortOptions: readonly FeedSort[] = [
  { by: "probability", direction: "desc" }, { by: "probability", direction: "asc" },
  { by: "kickoff", direction: "asc" }, { by: "kickoff", direction: "desc" },
];

/** One independent sort menu retains the established immediate sort behavior. */
export function FeedFilterToolbar({ query, onApply, actions, summary }: {
  query: FeedQuery; onApply: (next: FeedQuery) => void; actions: ReactNode; summary: ReactNode;
}) {
  const messages = createMessages(query.locale);
  const sortKey = `${query.sort.by}-${query.sort.direction}`;
  const choose = (sort: FeedSort) => onApply({ ...query, sort, page: 1 });
  const chooseKey = (key: string) => {
    const selected = feedSortOptions.find((sort) => `${sort.by}-${sort.direction}` === key);
    if (selected) choose(selected);
  };
  return <FilterToolbar>
    {summary}
    <SortGroup>
      <DesktopSortLabel htmlFor="feed-sort-desktop">{messages.text("feed.sort.label")}</DesktopSortLabel>
      <SelectWrap>
        <select id="feed-sort-desktop" value={sortKey} onChange={(event) => chooseKey(event.target.value)}>
          {feedSortOptions.map((sort) => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
            {messages.text(`feed.sort.${sort.by}-${sort.direction}`)}
          </option>)}
        </select>
        <ChevronDownIcon />
      </SelectWrap>
      {actions}
    </SortGroup>
  </FilterToolbar>;
}

/** The mobile count follows the filters and aligns with their right edge. */
const ResultsBar = styled(Toolbar)`
  ${media.belowDesktop} { display: flex; justify-content: flex-end; padding-inline: 6px; }
`;

/** Counts follow the successful result projection, including pagination and live refresh. */
export function ResultsToolbar({ query, total, first, last }: {
  query: FeedQuery; total: number | null; first: number; last: number;
}) {
  const messages = createMessages(query.locale);
  return <ResultsBar>
    <Count>
      <h2>{messages.text("feed.results.title")}</h2>
      {total !== null && <p>{messages.text("feed.results.showing", { shown: total === 0 ? "0"
        : `${messages.number(first)}–${messages.number(last)}`, total: messages.number(total) })}</p>}
    </Count>
    {total !== null && <ResultCount data-match-count>
      <span data-desktop-count>{messages.plural("feed.results.count", total)}</span>
      <span data-phone-count>{messages.text("feed.results.showingCount", { count: messages.plural("feed.results.count", total) })}</span>
    </ResultCount>}
  </ResultsBar>;
}
