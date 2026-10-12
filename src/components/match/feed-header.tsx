"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styled, { css } from "styled-components";
import { BrandLogo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ChevronDownIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { ReportingDate } from "@/domain/calendar";
import { resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { DatePresets } from "./feed-dates";
import { CompactSelect, focusRing } from "./filter-parts";

const desktop = media.desktop;
const HeaderContent = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  ${media.belowDesktop} {
    position: sticky;
    inset-block-start: 8px;
    z-index: 30;
  }
`;
/** One semantic page title: visible on desktop, visually hidden on smaller screens. */
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
  ${media.belowDesktop} { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
`;
/**
 * App pages hide the shell header below desktop, so the feed carries the branded bar: the same navy
 * to teal fill and brand edge as the desktop header, full bleed past the page gutter and up through
 * the app page's 8px top padding to the screen edge. The inverse logo sits at the brand-kit minimum
 * 160px wide beside the theme control.
 */
const BrandBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-inline-size: 0;
  min-block-size: 3rem;
  margin-block-start: -8px;
  margin-inline: -8px;
  padding-inline: 8px;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.background};
  border-block-end: 2px solid ${({ theme }) => theme.header.accent};
  ${desktop} { display: none; }
`;
/** Inverse-teal focus rings read on every stop of the bar. */
const barFocus = css`
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;
/** The gutter and the bar's 7.5px above and below the artwork give the logo its clear space. */
const HomeLink = styled(Link)`
  display: inline-flex;
  flex: 0 1 160px;
  min-inline-size: 0;
  text-decoration: none;
  > span { padding: 0; }
  img { inline-size: 160px; max-inline-size: 100%; block-size: auto; }
  ${barFocus}
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
  return <HeaderContent>
    <Row>
      <BrandBar>
        <HomeLink href={homeHref(query.locale)} prefetch={false} aria-label={messages.text("navigation.home")}>
          <BrandLogo alt="" variant="inverse" />
        </HomeLink>
        <ThemeToggle />
      </BrandBar>
      <PageHeading as="h1">{feedHeading(query, today, messages)}</PageHeading>
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
/** Desktop shares one row; compact screens keep the summary below the actions. */
const FilterToolbar = styled(Toolbar)`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  > [data-active-filter-summary] { grid-row: 2; }
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
const DesktopText = styled.span`display: none; ${desktop} { display: inline; }`;
const SortGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  min-inline-size: 0;
  align-items: center;
  gap: 8px;
  ${desktop} { margin-inline-start: auto; justify-content: flex-end; }
  > label { display: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; ${desktop} { display: inline; } }
  ${media.belowDesktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px;
  }
`;
const ResultCount = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${({ theme }) => theme.typography.scale.caption};
  line-height: 1.2;
  text-align: end;
  font-variant-numeric: tabular-nums;
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
/** One native sort menu includes both field and direction. */
const PhoneOrder = styled.div`
  display: inline-flex;
  min-inline-size: 0;
  inline-size: 100%;
  ${desktop} { display: none; }
`;
const PhoneSort = styled(CompactSelect)`
  min-block-size: 2.5rem;
  padding-block: 3px;
  padding-inline: 7px 22px;
  border-radius: 0;
  font-size: 0.875rem;
  inline-size: 100%;
  > span { flex: 1; }
  > span > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.2; }
  > select {
    font-size: inherit;
    > option { font-size: inherit; }
    /* iOS presents its own picker; keep its input large enough to avoid focus zoom. */
    @supports (-webkit-touch-callout: none) { font-size: 16px; }
  }
  > svg { inset-inline-end: 7px; }
`;
const sortOptions: readonly FeedSort[] = [
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
    const selected = sortOptions.find((sort) => `${sort.by}-${sort.direction}` === key);
    if (selected) choose(selected);
  };
  return <FilterToolbar>
    {summary}
    <SortGroup>
      <PhoneOrder>
        <PhoneSort aria-label={messages.text("feed.sort.label")} value={sortKey} onChange={(event) => chooseKey(event.target.value)}
          options={sortOptions.map((sort) => ({ value: `${sort.by}-${sort.direction}`, label: messages.text(`feed.sort.compact.${sort.by}-${sort.direction}`) }))} />
      </PhoneOrder>
      <label htmlFor="feed-sort-desktop"><DesktopText>{messages.text("feed.sort.label")}</DesktopText></label>
      <SelectWrap>
        <select id="feed-sort-desktop" value={sortKey} onChange={(event) => chooseKey(event.target.value)}>
          {sortOptions.map((sort) => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
            {messages.text(`feed.sort.${sort.by}-${sort.direction}`)}
          </option>)}
        </select>
        <ChevronDownIcon />
      </SelectWrap>
      {actions}
    </SortGroup>
  </FilterToolbar>;
}

/** Counts follow the successful result projection, including pagination and live refresh. */
export function ResultsToolbar({ query, total, first, last }: {
  query: FeedQuery; total: number | null; first: number; last: number;
}) {
  const messages = createMessages(query.locale);
  return <Toolbar>
    <Count>
      <h2>{messages.text("feed.results.title")}</h2>
      {total !== null && <p>{messages.text("feed.results.showing", { shown: total === 0 ? "0"
        : `${messages.number(first)}–${messages.number(last)}`, total: messages.number(total) })}</p>}
    </Count>
    {total !== null && <ResultCount data-match-count>{messages.plural("feed.results.count", total)}</ResultCount>}
  </Toolbar>;
}
