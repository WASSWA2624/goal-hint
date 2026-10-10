"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styled, { css } from "styled-components";
import { ChevronDownIcon, InfoIcon, ResetIcon, FilterIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { addReportingDays, parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { applyFeedDraft, resetFeedFilters } from "@/domain/feed-controls";
import { pinnedFeedQuery } from "@/domain/feed-pagination";
import { countryOptions, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import {
  anyProbability, canonicalMarkets, feedQueryHref, feedQueryKey, feedQueryRules, resolveFeedDates, serializeFeedQuery,
  type DateSelection, type FeedQuery,
} from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import type { AccentName } from "@/styles/theme";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { DateRangePicker, DateStepper, SingleDatePicker } from "./feed-dates";
import { ChipText, FilterChip, focusRing, OptionPicker, plainClick, RangeSlider, Segmented } from "./filter-parts";

type Messages = ReturnType<typeof createMessages>;
const desktop = css`@media (min-width: ${({ theme }) => theme.breakpoint.lg})`;
const wide = css`@media (min-width: ${({ theme }) => theme.breakpoint.xl})`;
const probabilityPresets = [anyProbability, { min: 50, max: 100 }, { min: 60, max: 100 }, { min: 70, max: 100 }, { min: 80, max: 100 }, { min: 90, max: 100 }];
const suggestionCount = 6;

function valid(query: FeedQuery, today: ReportingDate): boolean {
  try { serializeFeedQuery(query, today); return true; } catch { return false; }
}
function toggled(list: readonly string[], value: string, maximum: number): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : list.length >= maximum ? [...list] : [...list, value].sort();
}
/** At least one market stays selected; removing the last one is not offered. */
function toggledMarkets(query: FeedQuery, family: MarketFamily): FeedQuery | null {
  const has = query.markets.includes(family);
  if (has && query.markets.length === 1) return null;
  return { ...query, markets: canonicalMarkets(has ? query.markets.filter((item) => item !== family) : [...query.markets, family]), page: 1 };
}
function rangeText(messages: Messages, range: FeedQuery["probability"]) {
  return range.min === 0 && range.max === 100 ? messages.text("feed.filters.any")
    : messages.text("feed.filters.percentRange", { min: messages.number(range.min), max: messages.number(range.max) });
}

/** Debounced count for the desktop draft, using the public feed endpoint with a one-row page. */
function useDraftTotal(draft: FeedQuery, query: FeedQuery, today: ReportingDate, appliedTotal: number | null) {
  const key = (() => { try { return feedQueryKey(draft, today); } catch { return null; } })(), appliedKey = feedQueryKey(query, today);
  const [counted, setCounted] = useState<{ key: string; total: number } | null>(null);
  useEffect(() => {
    if (key === null || key === appliedKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const parameters = serializeFeedQuery({ ...pinnedFeedQuery(draft, today), page: 1, pageSize: 1 }, today);
        const response = await fetch(`/api/matches?${parameters}`, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const total = (body as { total?: unknown } | null)?.total;
        if (typeof total === "number" && Number.isSafeInteger(total) && total >= 0) setCounted({ key, total });
      } catch { /* Counts are advisory; Apply still works. */ }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [appliedKey, draft, key, today]);
  return key === appliedKey ? appliedTotal : counted?.key === key ? counted.total : null;
}

/** A thin multicolour edge tops the panel; filter rows carry their own accent. */
const Panel = styled.section`
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  padding: 12px 12px 10px;
  background: ${({ theme }) => theme.gradient.edge} top / 100% 4px no-repeat, ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme }) => theme.shadow.card};
  ${desktop} { gap: 14px; padding: 16px 20px 14px; }
`;
const PhoneOnly = styled.div`display: grid; gap: 8px; min-inline-size: 0; container: phone-filters / inline-size; ${desktop} { display: none; }`;
const DesktopOnly = styled.div`display: none; ${desktop} { display: grid; gap: 14px; }`;

const DateRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  > div:nth-child(2), > label { min-inline-size: 0; }
  > label > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
`;
const ChipRow = styled.div`
  display: grid;
  grid-template-columns: 4.25rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
`;
const RowLabel = styled.span<{ $accent: AccentName }>`
  color: ${({ theme, $accent }) => theme.color.accent[$accent].text};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
/** One scrolling line per filter, as in the phone layout; focus rings sit inside the scroller. */
const ChipStrip = styled.div`
  display: flex;
  gap: 6px;
  min-inline-size: 0;
  padding: 3px;
  margin: -3px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  a:focus-visible { outline-offset: -3px; }
`;
/** Odds, probability and Reset share one line; very narrow phones move Reset below. */
const BottomRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 6px 8px;
  @container phone-filters (min-width: 19.5rem) { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) auto; }
`;
const SelectGroup = styled.label<{ $accent: AccentName }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  color: ${({ theme, $accent }) => theme.color.accent[$accent].text};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const SelectBox = styled.span`
  position: relative;
  display: flex;
  flex: 1;
  min-inline-size: 0;
  color: ${({ theme }) => theme.color.text};
  > select {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 2rem;
    padding-inline: 8px 24px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 8px;
    font: inherit;
    font-size: 0.75rem;
    font-weight: ${({ theme }) => theme.typography.weight.body};
    appearance: none;
    cursor: pointer;
    ${focusRing}
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  }
  > svg { position: absolute; inset-inline-end: 8px; inset-block-start: 50%; transform: translateY(-50%); pointer-events: none; }
`;
const QuietLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 2rem;
  padding-inline: 12px;
  color: ${({ theme }) => theme.color.accent.red.text};
  background: ${({ theme }) => theme.color.accent.red.soft};
  border: ${({ theme }) => theme.border.width} solid transparent;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  text-decoration: none;
  > svg { font-size: 1rem; }
  &:hover { border-color: ${({ theme }) => theme.color.accent.red.solid}; }
  ${focusRing}
`;

/** Date, leagues, countries and markets share one row at every desktop width. */
const DesktopGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(12rem, 0.9fr) repeat(3, minmax(0, 1fr));
  gap: 12px 18px;
  ${wide} { gap: 12px 24px; }
`;
const Block = styled.div`
  display: grid;
  align-content: start;
  gap: 6px;
  min-inline-size: 0;
`;
const BlockLabel = styled.span<{ $accent: AccentName }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: ${({ theme, $accent }) => theme.color.accent[$accent].text};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  &::before { content: ""; inline-size: 8px; block-size: 8px; border-radius: 50%; background: ${({ theme, $accent }) => theme.color.accent[$accent].gradient}; }
  > svg { color: ${({ theme }) => theme.color.mutedText}; }
`;
const MultiBox = styled.div<{ $accent: AccentName }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  min-block-size: 2.5rem;
  padding: 3px 3px 3px 6px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  &:focus-within, &:hover { border-color: ${({ theme, $accent }) => theme.color.accent[$accent].solid}; }
`;
const ChipWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-inline-size: 0;
  > span[data-placeholder] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.875rem; padding-inline: 4px; }
`;
const DateInputs = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-block-size: 2.5rem;
  padding-inline: 10px;
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 10px;
  &:focus-within, &:hover { border-color: ${({ theme }) => theme.color.accent.teal.solid}; }
  > input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 2.25rem;
    color: ${({ theme }) => theme.color.text};
    background: none;
    border: 0;
    font: inherit;
    font-size: 0.875rem;
    ${focusRing}
  }
  > span { color: ${({ theme }) => theme.color.accent.teal.solid}; }
`;
const WideSegmented = styled(Segmented)`
  display: grid;
  > a { padding-inline: 8px; font-size: 0.8125rem; }
`;
const SecondRow = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 10px 24px;
  > :last-child { grid-column: 1 / -1; justify-self: end; }
  ${wide} { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 32px; > :last-child { grid-column: auto; justify-self: start; } }
`;
const RangeRow = styled.div`
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) auto;
  align-items: center;
  gap: 16px;
`;
const RangeEnds = styled.div`
  display: flex;
  justify-content: space-between;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
`;
const NumberPair = styled.div<{ $disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  background: ${({ theme }) => theme.color.cardHeader};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 9px;
  color: ${({ theme, $disabled }) => $disabled ? theme.color.disabledText : theme.color.mutedText};
  font-size: 0.875rem;
  > input {
    inline-size: 3.25rem;
    min-block-size: 2rem;
    color: ${({ theme }) => theme.color.text};
    background: none;
    border: 0;
    font: inherit;
    text-align: center;
    font-variant-numeric: tabular-nums;
    ${focusRing}
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; }
  }
`;
const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;
const ApplyLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-block-size: 2.625rem;
  padding-inline: 20px;
  color: ${({ theme }) => theme.color.onBrand};
  background: ${({ theme }) => theme.gradient.action};
  border-radius: 10px;
  box-shadow: 0 4px 14px rgb(37 99 235 / 25%);
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  text-decoration: none;
  > svg { font-size: 1.0625rem; }
  &:hover { filter: brightness(0.95); }
  ${focusRing}
`;
const OutlineLink = styled(QuietLink)`
  min-block-size: 2.5rem;
  padding-inline: 16px;
  font-size: 0.875rem;
`;

export function FeedFilters({ query, today, leagues, total, onApply }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; total: number | null; onApply: (query: FeedQuery) => void;
}) {
  const storedDraft = useAppSelector((state) => state.feed.draft), dispatch = useAppDispatch();
  // Keep the shared draft aligned with each applied server navigation.
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  const draft = valid(storedDraft, today) ? storedDraft : query;
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  const leagueList = leagueOptions(leagues, messages.text("match.competitionUnknown")), countryList = countryOptions(leagues);
  const marketList: FilterOption[] = publicPolicy.markets.map((family) => ({ value: family, label: messages.text(`market.family.${family}`),
    detail: null, logoUrl: null, fixtures: 0 }));
  const href = (next: FeedQuery) => feedQueryHref({ ...next, page: 1 }, today);
  const apply = (next: FeedQuery) => onApply({ ...next, page: 1 });
  const edit = (next: FeedQuery) => { if (valid(next, today)) dispatch(draftChanged({ ...next, page: 1 })); };
  const draftTotal = useDraftTotal(draft, query, today, total);
  const reset = resetFeedFilters(query);

  const single = range.dayCount === 1;
  const singleDates: DateSelection = { kind: "date", date: range.startDate };
  const rangeDates: DateSelection = { kind: "range", from: range.startDate, to: addReportingDays(range.startDate, 6) };

  function strip(kind: "leagues" | "countries", options: FilterOption[], short: string) {
    const accent: AccentName = kind === "leagues" ? "blue" : "orange";
    const selected = query[kind], chosen = options.filter((option) => selected.includes(option.value));
    const missing = selected.filter((value) => !options.some((option) => option.value === value))
      .map((value): FilterOption => ({ value, label: value, detail: null, logoUrl: null, fixtures: 0 }));
    const rest = options.filter((option) => !selected.includes(option.value));
    const shown = rest.slice(0, suggestionCount), hidden = rest.length - shown.length;
    const toggle = (value: string) => ({ ...query, [kind]: toggled(selected, value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) });
    return <ChipRow>
      <RowLabel aria-hidden="true" $accent={accent}>{short}</RowLabel>
      <ChipStrip role="group" aria-label={messages.text(kind === "leagues" ? "feed.filters.leagues" : "feed.filters.countries")}>
        {[...chosen, ...missing, ...shown].map((option) => {
          const on = selected.includes(option.value);
          return <FilterChip key={option.value} label={option.label} selected={on} href={href(toggle(option.value))} logoUrl={kind === "leagues" ? option.logoUrl : null} accent={accent}
            onSelect={() => apply(toggle(option.value))} actionLabel={messages.text(on ? "feed.filters.remove" : "feed.filters.add", { label: option.label })} />;
        })}
        {hidden > 0 && <ChipText aria-hidden="true">{messages.text("feed.filters.moreCount", { count: messages.number(hidden) })}</ChipText>}
      </ChipStrip>
      <OptionPicker title={messages.text("feed.filters.showAll", { label: messages.text(kind === "leagues" ? "feed.filters.leagues" : "feed.filters.countries") })}
        options={options} selected={selected} onToggle={(value) => apply(toggle(value))}
        findLabel={messages.text("feed.filters.findOption", { label: messages.text(kind === "leagues" ? "feed.filters.leagues" : "feed.filters.countries") })}
        emptyLabel={messages.text("feed.filters.noOptions")} />
    </ChipRow>;
  }

  function multiBox(kind: "leagues" | "countries" | "markets", options: FilterOption[]) {
    const label = messages.text(`feed.filters.${kind}`);
    const accent: AccentName = kind === "leagues" ? "blue" : kind === "countries" ? "orange" : "violet";
    const selected: readonly string[] = draft[kind];
    const chosen = selected.map((value) => options.find((option) => option.value === value)
      ?? { value, label: value, detail: null, logoUrl: null, fixtures: 0 });
    const visible = chosen.slice(0, 4), extra = chosen.length - visible.length;
    const toggle = (value: string): FeedQuery | null => kind === "markets" ? toggledMarkets(draft, value as MarketFamily)
      : { ...draft, [kind]: toggled(draft[kind], value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) };
    const appliedToggle = (value: string): FeedQuery => (kind === "markets" ? toggledMarkets(query, value as MarketFamily)
      : { ...query, [kind]: toggled(query[kind], value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) }) ?? query;
    return <Block>
      <BlockLabel id={`filters-${kind}`} $accent={accent}>{label}</BlockLabel>
      <MultiBox role="group" aria-labelledby={`filters-${kind}`} $accent={accent}>
        <ChipWrap>
          {visible.length === 0 && <span data-placeholder>{messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.any")}</span>}
          {visible.map((option) => {
            const next = toggle(option.value);
            return next ? <FilterChip key={option.value} label={option.label} selected accent={accent} href={href(appliedToggle(option.value))}
              logoUrl={kind === "leagues" ? option.logoUrl : null} onSelect={() => edit(next)}
              actionLabel={messages.text("feed.filters.remove", { label: option.label })} />
              : <ChipText key={option.value} $selected $accent={accent} title={messages.text("feed.filters.oneMarket")}>{option.label}</ChipText>;
          })}
          {extra > 0 && <ChipText $selected $accent={accent}>{messages.text("feed.filters.moreCount", { count: messages.number(extra) })}</ChipText>}
        </ChipWrap>
        <OptionPicker title={messages.text("feed.filters.showAll", { label })} options={options} selected={selected}
          searchable={kind !== "markets"} onToggle={(value) => { const next = toggle(value); if (next) edit(next); }}
          findLabel={messages.text("feed.filters.findOption", { label })} emptyLabel={messages.text("feed.filters.noOptions")} />
      </MultiBox>
    </Block>;
  }

  const probabilityOptions = probabilityPresets.some((preset) => preset.min === query.probability.min && preset.max === query.probability.max)
    ? probabilityPresets : [...probabilityPresets, query.probability];
  const draftRange = resolveFeedDates(draft, today), draftSingle = draftRange.dayCount === 1;
  const setDraftDates = (dates: DateSelection) => edit({ ...draft, dates });
  const probabilityLabel = messages.text("feed.filters.probability"), oddsLabel = messages.text("feed.filters.odds");

  return <Panel aria-label={messages.text("feed.filters.form")}>
    <PhoneOnly>
      <DateRow>
        <Segmented role="group" aria-label={messages.text("feed.date.mode")}>
          <Link href={href({ ...query, dates: singleDates })} prefetch={false} aria-current={single ? "true" : undefined}
            aria-label={messages.text("feed.date.single")} onClick={(event) => plainClick(event, () => apply({ ...query, dates: singleDates }))}>
            {messages.text("feed.date.dayToggle")}
          </Link>
          <Link href={href({ ...query, dates: single ? rangeDates : query.dates })} prefetch={false} aria-current={single ? undefined : "true"}
            aria-label={messages.text("feed.date.range")} onClick={(event) => plainClick(event, () => apply({ ...query, dates: single ? rangeDates : query.dates }))}>
            {messages.text("feed.date.rangeToggle")}
          </Link>
        </Segmented>
        {single ? <SingleDatePicker query={query} today={today} onApply={apply} /> : <DateRangePicker query={query} today={today} onApply={apply} compact />}
        <DateStepper query={query} today={today} onApply={apply} />
      </DateRow>
      <ChipRow>
        <RowLabel aria-hidden="true" $accent="violet">{messages.text("feed.filters.markets")}</RowLabel>
        <ChipStrip role="group" aria-label={messages.text("feed.filters.markets")}>
          {[...query.markets, ...publicPolicy.markets.filter((family) => !query.markets.includes(family))].map((family) => {
            const on = query.markets.includes(family), next = toggledMarkets(query, family), name = messages.text(`market.family.${family}`);
            return next ? <FilterChip key={family} label={name} selected={on} accent="violet" href={href(next)} onSelect={() => apply(next)}
              actionLabel={messages.text(on ? "feed.filters.remove" : "feed.filters.add", { label: name })} />
              : <ChipText key={family} $selected $accent="violet" title={messages.text("feed.filters.oneMarket")}>{name}</ChipText>;
          })}
        </ChipStrip>
        <OptionPicker title={messages.text("feed.filters.showAll", { label: messages.text("feed.filters.markets") })} options={marketList}
          selected={query.markets} searchable={false} onToggle={(value) => { const next = toggledMarkets(query, value as MarketFamily); if (next) apply(next); }}
          findLabel={messages.text("feed.filters.markets")} emptyLabel={messages.text("feed.filters.noOptions")} />
      </ChipRow>
      {strip("leagues", leagueList, messages.text("feed.filters.leagues"))}
      {strip("countries", countryList, messages.text("feed.filters.countries"))}
      <BottomRow>
        <SelectGroup title={messages.text("feed.filters.oddsPending")} $accent="amber">
          {messages.text("feed.filters.oddsLabel")}
          <SelectBox><select disabled aria-label={oddsLabel}>
            <option>{messages.text("feed.filters.any")}</option>
          </select><ChevronDownIcon /></SelectBox>
        </SelectGroup>
        <SelectGroup $accent="pink">
          {messages.text("feed.filters.probabilityLabel")}
          <SelectBox><select aria-label={probabilityLabel} value={`${query.probability.min}-${query.probability.max}`} onChange={(event) => {
            const [min, max] = event.target.value.split("-").map(Number);
            apply({ ...query, probability: { min: min!, max: max! } });
          }}>
            {probabilityOptions.map((preset) => <option key={`${preset.min}-${preset.max}`} value={`${preset.min}-${preset.max}`}>{rangeText(messages, preset)}</option>)}
          </select><ChevronDownIcon /></SelectBox>
        </SelectGroup>
        <QuietLink href={href(reset)} prefetch={false} onClick={(event) => plainClick(event, () => apply(reset))}>{messages.text("feed.filters.reset")}</QuietLink>
      </BottomRow>
    </PhoneOnly>

    <DesktopOnly>
      <DesktopGrid>
        <Block>
          <BlockLabel $accent="teal">{messages.text("feed.date.mode")}</BlockLabel>
          <WideSegmented role="group" aria-label={messages.text("feed.date.mode")}>
            <Link href={href({ ...query, dates: singleDates })} prefetch={false} aria-current={draftSingle ? "true" : undefined}
              onClick={(event) => plainClick(event, () => setDraftDates({ kind: "date", date: draftRange.startDate }))}>{messages.text("feed.date.single")}</Link>
            <Link href={href({ ...query, dates: single ? rangeDates : query.dates })} prefetch={false} aria-current={draftSingle ? undefined : "true"}
              onClick={(event) => plainClick(event, () => setDraftDates({ kind: "range", from: draftRange.startDate,
                to: draftSingle ? addReportingDays(draftRange.startDate, 6) : draftRange.endDate }))}>{messages.text("feed.date.range")}</Link>
          </WideSegmented>
          <DateInputs>
            <input type="date" value={draftRange.startDate} aria-label={messages.text(draftSingle ? "feed.date.choose" : "feed.date.from")}
              onChange={(event) => {
                try {
                  const start = parseReportingDate(event.target.value);
                  setDraftDates(draftSingle ? { kind: "date", date: start }
                    : { kind: "range", from: start, to: draftRange.endDate < start ? start : draftRange.endDate });
                } catch { /* Incomplete native values keep the draft. */ }
              }} />
            {!draftSingle && <>
              <span aria-hidden="true">→</span>
              <input type="date" value={draftRange.endDate} min={draftRange.startDate} aria-label={messages.text("feed.date.to")}
                max={addReportingDays(draftRange.startDate, feedQueryRules.maximumDays - 1)} onChange={(event) => {
                  try { setDraftDates({ kind: "range", from: draftRange.startDate, to: parseReportingDate(event.target.value) }); }
                  catch { /* Incomplete native values keep the draft. */ }
                }} />
            </>}
          </DateInputs>
        </Block>
        {multiBox("leagues", leagueList)}
        {multiBox("countries", countryList)}
        {multiBox("markets", marketList)}
      </DesktopGrid>
      <SecondRow>
        <Block>
          <BlockLabel title={messages.text("feed.filters.oddsPending")} $accent="amber">{oddsLabel}<InfoIcon aria-hidden="true" /></BlockLabel>
          <RangeRow>
            <div>
              <RangeSlider min={120} max={500} step={5} low={120} high={500} disabled accent="amber" onChange={() => {}}
                lowLabel={messages.text("feed.filters.minimum", { label: oddsLabel })} highLabel={messages.text("feed.filters.maximum", { label: oddsLabel })} />
              <RangeEnds aria-hidden="true"><span>1.20</span><span>5.00</span></RangeEnds>
            </div>
            <NumberPair $disabled><input disabled value="1.20" readOnly aria-label={messages.text("feed.filters.minimum", { label: oddsLabel })} />–
              <input disabled value="5.00" readOnly aria-label={messages.text("feed.filters.maximum", { label: oddsLabel })} /></NumberPair>
          </RangeRow>
          <VisuallyHidden>{messages.text("feed.filters.oddsPending")}</VisuallyHidden>
        </Block>
        <Block>
          <BlockLabel title={messages.text("feed.filters.probabilityHelp")} $accent="pink">{probabilityLabel}<InfoIcon aria-hidden="true" /></BlockLabel>
          <RangeRow>
            <div>
              <RangeSlider min={0} max={100} step={1} low={draft.probability.min} high={draft.probability.max} accent="pink"
                onChange={(min, max) => edit({ ...draft, probability: { min, max } })}
                lowLabel={messages.text("feed.filters.minimum", { label: probabilityLabel })} highLabel={messages.text("feed.filters.maximum", { label: probabilityLabel })} />
              <RangeEnds aria-hidden="true"><span>0%</span><span>100%</span></RangeEnds>
            </div>
            <NumberPair>
              <input type="number" min={0} max={100} value={draft.probability.min} aria-label={messages.text("feed.filters.minimum", { label: probabilityLabel })}
                onChange={(event) => { const min = Math.max(0, Math.min(Number(event.target.value) || 0, draft.probability.max)); edit({ ...draft, probability: { ...draft.probability, min } }); }} />%
              {" – "}
              <input type="number" min={0} max={100} value={draft.probability.max} aria-label={messages.text("feed.filters.maximum", { label: probabilityLabel })}
                onChange={(event) => { const max = Math.min(100, Math.max(Number(event.target.value) || 0, draft.probability.min)); edit({ ...draft, probability: { ...draft.probability, max } }); }} />%
            </NumberPair>
          </RangeRow>
          <VisuallyHidden>{messages.text("feed.filters.probabilityHelp")}</VisuallyHidden>
        </Block>
        <Actions>
          <ApplyLink href={href(draft)} prefetch={false} onClick={(event) => plainClick(event, () => {
            try { onApply(applyFeedDraft(draft, today)); } catch { /* An invalid draft is never applied. */ }
          })}>
            <FilterIcon />{draftTotal === null ? messages.text("feed.filters.applyPlain") : messages.plural("feed.filters.applyCount", draftTotal)}
          </ApplyLink>
          <OutlineLink href={href(reset)} prefetch={false} onClick={(event) => plainClick(event, () => apply(reset))}>
            <ResetIcon />{messages.text("feed.filters.clearAll")}
          </OutlineLink>
        </Actions>
      </SecondRow>
    </DesktopOnly>
  </Panel>;
}
