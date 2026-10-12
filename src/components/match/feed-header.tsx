"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { BrandLogo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ChevronDownIcon, CloseIcon, FilterIcon, SearchIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import type { ReportingDate } from "@/domain/calendar";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { DatePresets } from "./feed-dates";
import { CompactSelect, controlFeedback, focusRing, IconButton } from "./filter-parts";

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
 * 160px wide beside the filter and search buttons.
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
const PhoneActions = styled.div`
  display: flex;
  flex: none;
  gap: 4px;
`;
/** Borderless title-bar icons; an open panel or search retains a clear active fill. */
const RoundButton = styled(IconButton)`
  inline-size: 1.75rem;
  block-size: 1.75rem;
  color: ${({ theme }) => theme.header.text};
  background: transparent;
  border: 0;
  box-shadow: none;
  border-radius: 0;
  font-size: 0.875rem;
  transition: background-color 120ms ease, color 120ms ease;
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
  &[aria-expanded="true"] { color: ${({ theme }) => theme.header.onAccent}; background: ${({ theme }) => theme.header.accent}; }
  ${barFocus}
`;
/** Phone filter toggle; the badge counts the choices hidden in the collapsed panel. */
const FilterToggle = styled(RoundButton)`
  position: relative;
  > b {
    position: absolute;
    inset-block-start: -3px;
    inset-inline-end: -3px;
    display: grid;
    place-items: center;
    min-inline-size: 1rem;
    block-size: 1rem;
    padding-inline: 3px;
    color: ${({ theme }) => theme.header.onAccent};
    background: ${({ theme }) => theme.header.accent};
    border: 1.5px solid ${({ theme }) => theme.header.onAccent};
    border-radius: 999px;
    font-size: 0.625rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
`;
const DesktopActions = styled.div`
  display: none;
  ${desktop} { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-inline-start: auto; }
`;
/** Phone search, as tall as the other secondary controls, with 16px icons. */
const SearchForm = styled.form`
  display: flex;
  align-items: center;
  gap: 6px;
  padding-inline: 8px 2px;
  min-block-size: 2rem;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 0;
  ${controlFeedback}
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 1rem; }
  > input { flex: 1; min-inline-size: 0; border: 0; background: none; color: ${({ theme }) => theme.color.text}; font: inherit; font-size: 1rem; outline: none; }
  > button { inline-size: 2rem; block-size: 2rem; font-size: 1rem; }
  ${desktop} { display: none; }
`;

export function feedHeading(query: FeedQuery, today: ReportingDate, messages: ReturnType<typeof createMessages>) {
  const range = resolveFeedDates(query, today);
  if (query.status === "live") return messages.text("feed.heading.live");
  if (query.status === "finished") return messages.text("feed.heading.results");
  if (range.dayCount === 1 && range.startDate === today) return messages.text("feed.heading.today");
  if (query.dates.kind === "tomorrow") return messages.text("feed.heading.tomorrow");
  return messages.text("feed.heading.other");
}

/** Phones use filter and search toggles; desktops use quick date presets. */
export type FilterToggleState = Readonly<{ open: boolean; count: number; controls: string; onToggle: () => void }>;

export function FeedHeader({ query, today, onApply, filters }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void; filters?: FilterToggleState;
}) {
  const messages = createMessages(query.locale);
  const [searching, setSearching] = useState(query.search !== ""), [value, setValue] = useState(query.search);
  const input = useRef<HTMLInputElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const searchRoot = useRef<HTMLDivElement>(null);
  const closeSearch = useCallback(() => setSearching(false), []);
  useOutsideDismiss({ enabled: searching, root: searchRoot, onDismiss: closeSearch });
  const [action, search = ""] = feedQueryHref({ ...query, search: "", page: 1 }, today).split("?");
  return <HeaderContent ref={searchRoot}>
    <Row>
      <BrandBar>
        <HomeLink href={homeHref(query.locale)} prefetch={false} aria-label={messages.text("navigation.home")}>
          <BrandLogo alt="" variant="inverse" />
        </HomeLink>
        <PhoneActions>
          <ThemeToggle />
          {filters && <FilterToggle type="button" aria-expanded={filters.open} aria-controls={filters.controls} title={messages.text("feed.filters.toggle")}
            aria-label={filters.count > 0 ? messages.plural("feed.filters.toggleCount", filters.count) : messages.text("feed.filters.toggle")}
            onClick={filters.onToggle}>
            <FilterIcon />{filters.count > 0 && <b aria-hidden="true">{messages.number(filters.count)}</b>}
          </FilterToggle>}
          <RoundButton ref={toggle} type="button" aria-expanded={searching} aria-label={messages.text(searching ? "feed.search.close" : "feed.search.open")}
            onClick={() => { setSearching(!searching); if (!searching) requestAnimationFrame(() => input.current?.focus()); }}>
            {searching ? <CloseIcon /> : <SearchIcon />}
          </RoundButton>
        </PhoneActions>
      </BrandBar>
      <PageHeading as="h1">{feedHeading(query, today, messages)}</PageHeading>
      <DesktopActions>
        <DatePresets query={query} today={today} onApply={onApply} />
      </DesktopActions>
    </Row>
    {searching && <SearchForm action={action} method="get" role="search" aria-label={messages.text("feed.search.open")} onSubmit={(event) => {
      event.preventDefault();
      onApply({ ...query, search: value.normalize("NFC").trim().replace(/\s+/gu, " "), page: 1 });
    }} onKeyDown={(event) => { if (event.key === "Escape") { setSearching(false); toggle.current?.focus(); } }}>
      {[...new URLSearchParams(search)].map(([name, hidden]) => <input key={name} type="hidden" name={name} value={hidden} />)}
      <input ref={input} type="search" name="q" value={value} maxLength={feedQueryRules.maximumSearchLength} autoComplete="off"
        placeholder={messages.text("navigation.search")} aria-label={messages.text("feed.filters.search")} onChange={(event) => setValue(event.target.value)} />
      <IconButton type="submit" aria-label={messages.text("feed.search.submit")}><SearchIcon /></IconButton>
    </SearchForm>}
  </HeaderContent>;
}

/** Desktop keeps its section heading; compact screens start with the action row. */
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
  align-items: start;
  gap: 4px;
  > label { display: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; ${desktop} { display: inline; } }
  ${media.belowDesktop} {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px;
  }
`;
/** The applied count sits directly under the right edge of Apply filters. */
const ActionGroup = styled.div`
  display: grid;
  gap: 3px;
  min-inline-size: 0;
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
  min-block-size: 1.75rem;
  padding-block: 3px;
  padding-inline: 7px 22px;
  border-radius: 0;
  font-size: 0.6875rem;
  inline-size: 100%;
  > span { flex: 1; }
  > span > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.2; }
  > select {
    font-size: inherit;
    > option { font-size: 0.6875rem; }
    /* iOS presents its own picker; keep its input large enough to avoid focus zoom. */
    @supports (-webkit-touch-callout: none) { font-size: 16px; }
  }
  > svg { inset-inline-end: 7px; }
`;
const sortOptions: readonly FeedSort[] = [
  { by: "probability", direction: "desc" }, { by: "probability", direction: "asc" },
  { by: "kickoff", direction: "asc" }, { by: "kickoff", direction: "desc" },
];

/** Result count and order; changes apply at once. */
export function ResultsToolbar({ query, total, first, last, onApply, actions }: {
  query: FeedQuery; total: number | null; first: number; last: number; onApply: (next: FeedQuery) => void; actions?: ReactNode;
}) {
  const messages = createMessages(query.locale);
  const sortKey = `${query.sort.by}-${query.sort.direction}`;
  const choose = (sort: FeedSort) => onApply({ ...query, sort, page: 1 });
  const chooseKey = (key: string) => {
    const selected = sortOptions.find((sort) => `${sort.by}-${sort.direction}` === key);
    if (selected) choose(selected);
  };
  return <Toolbar>
    <Count>
      <h2>{messages.text("feed.results.title")}</h2>
      {total !== null && <p>{total === 0 ? messages.text("feed.results.showing", { shown: "0", total: "0" })
        : messages.text("feed.results.showing", { shown: `${messages.number(first)}–${messages.number(last)}`, total: messages.number(total) })}</p>}
    </Count>
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
      <ActionGroup>
        {actions}
        {total !== null && <ResultCount data-match-count>{messages.plural("feed.results.count", total)}</ResultCount>}
      </ActionGroup>
    </SortGroup>
  </Toolbar>;
}
