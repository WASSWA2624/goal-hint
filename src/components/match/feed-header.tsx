"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import styled, { css } from "styled-components";
import { BrandLogo } from "@/components/ui/brand";
import { ChevronDownIcon, CloseIcon, FilterIcon, SearchIcon, SortIcon } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { DatePresets, DateRangePicker } from "./feed-dates";
import { CompactSelect, focusRing, IconButton } from "./filter-parts";

const desktop = media.desktop;

/**
 * Phones and tablets stack the brand bar and the titles 10px apart; desktop keeps one wrapping row
 * of titles and date controls under the shell header's own logo.
 */
const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  ${media.belowDesktop} { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
`;
/**
 * App pages hide the shell header below desktop, so the feed carries the branded bar: the same navy
 * to teal fill and brand edge as the desktop header, full bleed past the page gutter and up through
 * the app page's 10px top padding to the screen edge. The inverse logo sits at the brand-kit minimum
 * 160px wide beside the filter and search buttons.
 */
const BrandBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  margin-block-start: -10px;
  margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter});
  padding-inline: ${({ theme }) => theme.layout.gutter};
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.gradient.edge} bottom / 100% 2px no-repeat, ${({ theme }) => theme.header.background};
  background-color: ${({ theme }) => theme.color.text};
  ${desktop} { display: none; }
`;
/** Inverse-teal focus rings read on every stop of the bar. */
const barFocus = css`
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;
/** The gutter and the bar's 7.5px above and below the artwork give the logo its clear space. */
const HomeLink = styled(Link)`
  display: inline-flex;
  flex: none;
  text-decoration: none;
  > span { padding: 0; }
  img { inline-size: 160px; block-size: auto; }
  ${barFocus}
`;
/** Below the brand bar, phones set the title and subtitle a little tighter; desktop is unchanged. */
const Titles = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  > h1 { font-size: 1.125rem; line-height: 1.2; ${desktop} { font-size: 1.5rem; } }
  > p { color: ${({ theme }) => theme.color.accent.teal.text}; font-size: 0.6875rem; line-height: 1.3; font-weight: ${({ theme }) => theme.typography.weight.medium}; ${desktop} { font-size: 0.8125rem; } }
  ${media.belowDesktop} { > h1 { line-height: 1.15; } > p { line-height: 1.25; } }
`;
const PhoneActions = styled.div`
  display: flex;
  flex: none;
  gap: 8px;
`;
/** Translucent white rounds on the bar; an open panel or search fills its button with inverse teal. */
const RoundButton = styled(IconButton)`
  inline-size: 2rem;
  block-size: 2rem;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.controlFill};
  border-radius: 50%;
  font-size: 1rem;
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
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.accent.pink.solid};
    border: 1.5px solid ${({ theme }) => theme.header.onAccent};
    border-radius: 999px;
    font-size: 0.625rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
`;
const DesktopActions = styled.div`
  display: none;
  ${desktop} { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
`;
/** Phone search, as tall as the other secondary controls, with 16px icons. */
const SearchForm = styled.form`
  display: flex;
  align-items: center;
  gap: 6px;
  padding-inline: 10px 2px;
  min-block-size: ${({ theme }) => theme.control.compactHeight};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.brand};
  border-radius: 6px;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 1rem; }
  > input { flex: 1; min-inline-size: 0; border: 0; background: none; color: ${({ theme }) => theme.color.text}; font: inherit; outline: none; }
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

/** Title and subtitle; phones add the brand bar with filter and search toggles, desktops a date range and quick presets. */
export type FilterToggleState = Readonly<{ open: boolean; count: number; controls: string; onToggle: () => void }>;

export function FeedHeader({ query, today, onApply, filters }: {
  query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void; filters?: FilterToggleState;
}) {
  const messages = createMessages(query.locale);
  const [searching, setSearching] = useState(query.search !== ""), [value, setValue] = useState(query.search);
  const input = useRef<HTMLInputElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const [action, search = ""] = feedQueryHref({ ...query, search: "", page: 1 }, today).split("?");
  return <>
    <Row>
      <BrandBar>
        <HomeLink href={homeHref(query.locale)} prefetch={false} aria-label={messages.text("navigation.home")}>
          <BrandLogo alt="" variant="inverse" />
        </HomeLink>
        <PhoneActions>
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
      <Titles>
        <PageHeading>{feedHeading(query, today, messages)}</PageHeading>
        <p>{messages.text("feed.subtitle")}</p>
      </Titles>
      <DesktopActions>
        <DateRangePicker query={query} today={today} onApply={onApply} />
        <DatePresets query={query} today={today} onApply={onApply} />
      </DesktopActions>
    </Row>
    {searching && <SearchForm action={action} method="get" role="search" aria-label={messages.text("feed.search.open")} onSubmit={(event) => {
      event.preventDefault();
      onApply({ ...query, search: value.normalize("NFC").trim().replace(/\s+/gu, " "), page: 1 });
    }} onKeyDown={(event) => { if (event.key === "Escape") { setSearching(false); toggle.current?.focus(); } }}>
      {[...new URLSearchParams(search)].map(([name, hidden]) => <input key={name} type="hidden" name={name} value={hidden} />)}
      <SearchIcon />
      <input ref={input} type="search" name="q" value={value} maxLength={feedQueryRules.maximumSearchLength} autoComplete="off"
        placeholder={messages.text("navigation.search")} aria-label={messages.text("feed.filters.search")} onChange={(event) => setValue(event.target.value)} />
      <IconButton type="submit" aria-label={messages.text("feed.search.submit")}><SearchIcon /></IconButton>
    </SearchForm>}
  </>;
}

/**
 * Count and ordering share one line on phones from 320px (two-digit counts); a longer count moves the
 * controls below it, still right-aligned with the date panel above. Phone controls are 28px, white
 * and outlined like the date stepper, 8px apart.
 */
const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 8px;
`;
const Count = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  > h2 { font-size: 0.8125rem; white-space: nowrap; ${desktop} { font-size: 1.25rem; } }
  > p { display: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; ${desktop} { display: block; } }
`;
const PhoneText = styled.span`${desktop} { display: none; }`;
const DesktopText = styled.span`display: none; ${desktop} { display: inline; }`;
const SortGroup = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  > label { display: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; ${desktop} { display: inline; } }
  ${media.belowDesktop} { gap: 8px; margin-inline-start: auto; }
`;
const SelectWrap = styled.span`
  position: relative;
  display: none;
  ${desktop} { display: inline-flex; }
  > select {
    min-block-size: 2.375rem;
    padding-inline: 7px 22px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 6px;
    font: inherit;
    font-size: 0.875rem;
    appearance: none;
    cursor: pointer;
    ${focusRing}
  }
  > svg { position: absolute; inset-inline-end: 7px; inset-block-start: 50%; transform: translateY(-50%); pointer-events: none; }
`;
/** Phone order: the sort field and its reverse button joined as one control. */
const PhoneOrder = styled.div`
  display: inline-flex;
  ${desktop} { display: none; }
`;
const PhoneSort = styled(CompactSelect)`
  min-block-size: 1.75rem;
  padding-inline: 7px 22px;
  border-start-end-radius: 0;
  border-end-end-radius: 0;
  > svg { inset-inline-end: 7px; }
`;
const ReverseButton = styled(IconButton)`
  inline-size: 1.75rem;
  block-size: 1.75rem;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-inline-start: 0;
  border-radius: 0;
  border-start-end-radius: 6px;
  border-end-end-radius: 6px;
  font-size: 0.875rem;
`;
/** Toggle chip: keeps only matches that have a prediction. */
const PicksToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-block-size: 1.75rem;
  padding-inline: 7px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surfaceMuted};
  border: ${({ theme }) => theme.border.width} solid transparent;
  border-radius: 6px;
  font: inherit;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
  cursor: pointer;
  &::before { content: ""; inline-size: 8px; block-size: 8px; border: 1.5px solid currentColor; border-radius: 2px; }
  &[aria-pressed="true"] {
    color: ${({ theme }) => theme.color.accent.emerald.text};
    background: ${({ theme }) => theme.color.accent.emerald.soft};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    &::before { background: currentColor; }
  }
  ${focusRing}
  ${media.belowDesktop} { &:not([aria-pressed="true"]) { background: ${({ theme }) => theme.color.surface}; border-color: ${({ theme }) => theme.color.border}; } }
  ${desktop} { min-block-size: 2.375rem; padding-inline: 12px; font-size: 0.875rem; }
`;

const sortOptions: readonly FeedSort[] = [
  { by: "probability", direction: "desc" }, { by: "probability", direction: "asc" },
  { by: "kickoff", direction: "asc" }, { by: "kickoff", direction: "desc" },
];

/** Result count and order; changes apply at once. */
export function ResultsToolbar({ query, total, first, last, onApply }: {
  query: FeedQuery; total: number; first: number; last: number; onApply: (next: FeedQuery) => void;
}) {
  const messages = createMessages(query.locale);
  const sortKey = `${query.sort.by}-${query.sort.direction}`;
  const choose = (sort: FeedSort) => onApply({ ...query, sort, page: 1 });
  return <Toolbar>
    <Count>
      <h2><PhoneText>{messages.plural("feed.results.count", total)}</PhoneText><DesktopText>{messages.text("feed.results.title")}</DesktopText></h2>
      <p>{total === 0 ? messages.text("feed.results.showing", { shown: "0", total: "0" })
        : messages.text("feed.results.showing", { shown: `${messages.number(first)}–${messages.number(last)}`, total: messages.number(total) })}</p>
    </Count>
    <SortGroup>
      <PicksToggle type="button" aria-pressed={query.picks === "only"} title={messages.text("feed.picks.onlyHelp")}
        onClick={() => onApply({ ...query, picks: query.picks === "only" ? "all" : "only", page: 1 })}>
        <PhoneText>{messages.text("feed.picks.onlyShort")}</PhoneText><DesktopText>{messages.text("feed.picks.only")}</DesktopText>
      </PicksToggle>
      <PhoneOrder>
        <PhoneSort aria-label={messages.text("feed.sort.label")} value={query.sort.by} onChange={(event) => {
          const by = event.target.value as FeedSort["by"];
          choose({ by, direction: by === "probability" ? "desc" : "asc" });
        }} options={[{ value: "kickoff", label: messages.text("feed.sort.short.kickoff") },
          { value: "probability", label: messages.text("feed.sort.short.probability") }]} />
        <ReverseButton type="button" aria-label={`${messages.text("feed.sort.reverse")}: ${messages.text(`feed.sort.${query.sort.by}-${query.sort.direction}`)}`}
          title={messages.text("feed.sort.reverse")}
          onClick={() => choose({ by: query.sort.by, direction: query.sort.direction === "asc" ? "desc" : "asc" })}><SortIcon /></ReverseButton>
      </PhoneOrder>
      <label htmlFor="feed-sort-desktop"><DesktopText>{messages.text("feed.sort.label")}</DesktopText></label>
      <SelectWrap>
        <select id="feed-sort-desktop" value={sortKey} onChange={(event) => {
          const [by, direction] = event.target.value.split("-") as [FeedSort["by"], FeedSort["direction"]];
          choose({ by, direction });
        }}>
          {sortOptions.map((sort) => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
            {messages.text(`feed.sort.${sort.by}-${sort.direction}`)}
          </option>)}
        </select>
        <ChevronDownIcon />
      </SelectWrap>
    </SortGroup>
  </Toolbar>;
}
