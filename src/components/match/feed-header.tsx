"use client";

import { useRef, useState } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, CloseIcon, SearchIcon, SortIcon } from "@/components/ui/icons";
import { PageHeading } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import { feedQueryHref, feedQueryRules, resolveFeedDates, type FeedQuery, type FeedSort } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { DatePresets, DateRangePicker } from "./feed-dates";
import { focusRing, IconButton } from "./filter-parts";
import type { AccentName } from "@/styles/theme";

const desktop = css`@media (min-width: ${({ theme }) => theme.breakpoint.lg})`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
`;
const Titles = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  > h1 { font-size: 1.625rem; ${desktop} { font-size: 1.875rem; } }
  > p { color: ${({ theme }) => theme.color.accent.teal.text}; font-size: 0.9375rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
`;
const PhoneActions = styled.div`
  display: flex;
  gap: 8px;
  ${desktop} { display: none; }
`;
const RoundButton = styled(IconButton)`
  inline-size: 2.75rem;
  block-size: 2.75rem;
  color: ${({ theme }) => theme.color.accent.blue.text};
  background: ${({ theme }) => theme.color.accent.blue.soft};
  border-radius: 50%;
  font-size: 1.25rem;
`;
const DesktopActions = styled.div`
  display: none;
  ${desktop} { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
`;
const SearchForm = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-inline: 14px 6px;
  min-block-size: 3rem;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.brand};
  border-radius: 12px;
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 1.125rem; }
  > input { flex: 1; min-inline-size: 0; border: 0; background: none; color: ${({ theme }) => theme.color.text}; font: inherit; outline: none; }
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

/** Title and subtitle; phones add a search toggle, desktops a date range and quick presets. */
export function FeedHeader({ query, today, onApply }: { query: FeedQuery; today: ReportingDate; onApply: (next: FeedQuery) => void }) {
  const messages = createMessages(query.locale);
  const [searching, setSearching] = useState(query.search !== ""), [value, setValue] = useState(query.search);
  const input = useRef<HTMLInputElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const [action, search = ""] = feedQueryHref({ ...query, search: "", page: 1 }, today).split("?");
  return <>
    <Row>
      <Titles>
        <PageHeading>{feedHeading(query, today, messages)}</PageHeading>
        <p>{messages.text("feed.subtitle")}</p>
      </Titles>
      <PhoneActions>
        <RoundButton ref={toggle} type="button" aria-expanded={searching} aria-label={messages.text(searching ? "feed.search.close" : "feed.search.open")}
          onClick={() => { setSearching(!searching); if (!searching) requestAnimationFrame(() => input.current?.focus()); }}>
          {searching ? <CloseIcon /> : <SearchIcon />}
        </RoundButton>
      </PhoneActions>
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

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
`;
const Count = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  > h2 { font-size: 1.1875rem; white-space: nowrap; ${desktop} { font-size: 1.3125rem; } }
  > p { display: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; ${desktop} { display: block; } }
`;
const PhoneText = styled.span`${desktop} { display: none; }`;
const DesktopText = styled.span`display: none; ${desktop} { display: inline; }`;
const SortGroup = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  > label { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; }
`;
const SelectWrap = styled.span<{ $phone?: boolean }>`
  position: relative;
  display: ${({ $phone }) => $phone ? "inline-flex" : "none"};
  ${desktop} { display: ${({ $phone }) => $phone ? "none" : "inline-flex"}; }
  > select {
    min-block-size: 2.375rem;
    padding-inline: 12px 30px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme, $phone }) => $phone ? theme.color.cardHeader : theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 10px;
    font: inherit;
    font-size: 0.875rem;
    appearance: none;
    cursor: pointer;
    ${focusRing}
  }
  > svg { position: absolute; inset-inline-end: 10px; inset-block-start: 50%; transform: translateY(-50%); pointer-events: none; }
`;
const ReverseButton = styled(IconButton)`
  ${desktop} { display: none; }
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
      <SelectWrap $phone>
        <select aria-label={messages.text("feed.sort.label")} value={query.sort.by} onChange={(event) => {
          const by = event.target.value as FeedSort["by"];
          choose({ by, direction: by === "probability" ? "desc" : "asc" });
        }}>
          <option value="kickoff">{messages.text("feed.sort.short.kickoff")}</option>
          <option value="probability">{messages.text("feed.sort.short.probability")}</option>
        </select>
        <ChevronDownIcon />
      </SelectWrap>
      <ReverseButton type="button" aria-label={`${messages.text("feed.sort.reverse")}: ${messages.text(`feed.sort.${query.sort.by}-${query.sort.direction}`)}`}
        title={messages.text("feed.sort.reverse")}
        onClick={() => choose({ by: query.sort.by, direction: query.sort.direction === "asc" ? "desc" : "asc" })}><SortIcon /></ReverseButton>
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

/** Slim status line for the daily run and coverage notices, tinted by meaning. */
export const RunBanner = styled.section<{ $tone?: AccentName }>`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 14px;
  padding: 8px 12px;
  line-height: 1.45;
  color: ${({ theme, $tone = "blue" }) => theme.color.accent[$tone].text};
  background: ${({ theme, $tone = "blue" }) => theme.color.accent[$tone].soft};
  border-inline-start: 4px solid ${({ theme, $tone = "blue" }) => theme.color.accent[$tone].solid};
  border-radius: 10px;
  font-size: 0.8125rem;
`;
