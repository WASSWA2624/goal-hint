"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ResetIcon, FilterIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { addReportingDays, type ReportingDate } from "@/domain/calendar";
import { applyFeedDraft, resetFeedFilters } from "@/domain/feed-controls";
import { pinnedFeedQuery } from "@/domain/feed-pagination";
import { countryOptions, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import {
  anyProbability, canonicalMarkets, feedQueryHref, feedQueryKey, feedQueryRules, resolveFeedDates, serializeFeedQuery,
  type DateSelection, type FeedQuery,
} from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import { media, type AccentName } from "@/styles/theme";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { DateRangePicker, DateStepper, SingleDatePicker } from "./feed-dates";
import { ChipText, CompactSelect, FilterChip, focusRing, OptionPicker, plainClick, RangeSlider, Segmented } from "./filter-parts";

type Messages = ReturnType<typeof createMessages>;
const desktop = media.desktop;
/** The draft count belongs to the desktop Apply button; phones apply selections directly. */
const desktopQuery = media.desktop.replace("@media ", "");
const probabilityPresets = [anyProbability, { min: 50, max: 100 }, { min: 60, max: 100 }, { min: 70, max: 100 }, { min: 80, max: 100 }, { min: 90, max: 100 }];
const suggestionCount = 6;
/** Phone selections settle for this long before one navigation applies them all. */
const phoneApplyDelayMs = 700;

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
/** Presets read "50%+"; the narrow phone select has no room for "50% - 100%". */
function rangeText(messages: Messages, range: FeedQuery["probability"]) {
  return range.min === 0 && range.max === 100 ? messages.text("feed.filters.any")
    : range.max === 100 ? messages.text("feed.filters.percentMin", { min: messages.number(range.min) })
    : messages.text("feed.filters.percentRange", { min: messages.number(range.min), max: messages.number(range.max) });
}

/** Debounced desktop draft count, from the public feed endpoint with a one-row page and no league options. */
function useDraftTotal(draft: FeedQuery, query: FeedQuery, today: ReportingDate, appliedTotal: number | null) {
  const key = (() => { try { return feedQueryKey(draft, today); } catch { return null; } })(), appliedKey = feedQueryKey(query, today);
  const [counted, setCounted] = useState<{ key: string; total: number } | null>(null);
  useEffect(() => {
    if (key === null || key === appliedKey || !window.matchMedia(desktopQuery).matches) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const parameters = serializeFeedQuery({ ...pinnedFeedQuery(draft, today), page: 1, pageSize: 1 }, today);
        const response = await fetch(`/api/matches?${parameters}&leagues=0`, { signal: controller.signal, headers: { accept: "application/json" } });
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
  gap: 6px;
  min-inline-size: 0;
  padding: 8px 10px;
  background: ${({ theme }) => theme.gradient.edge} top / 100% 3px no-repeat, ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme }) => theme.shadow.card};
  ${desktop} { padding: 12px 14px 10px; }
`;
/** Raised above the cards' full-row links, so the date and option popovers that overlap them stay usable. */
const PhoneOnly = styled.div`
  position: relative;
  z-index: 2;
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  container: phone-filters / inline-size;
  ${desktop} { display: none; }
`;
/** Collapsed by default on phones; the header toggle reveals the rows below the dates. */
const PhoneMore = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  padding-block-start: 6px;
  border-block-start: ${({ theme }) => theme.border.width} dashed ${({ theme }) => theme.color.border};
  &[hidden] { display: none; }
`;
const DesktopOnly = styled.div`display: none; ${desktop} { display: block; }`;

/** The range popover spans this whole row, so it never runs past the screen's left edge. */
const DateRow = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  > div:nth-child(2), > label { min-inline-size: 0; }
  > label > span { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
`;
const ChipRow = styled.div`
  display: grid;
  grid-template-columns: 3.75rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
`;
const RowLabel = styled.span<{ $accent: AccentName }>`
  color: ${({ theme, $accent }) => theme.color.accent[$accent].text};
  font-size: 0.6875rem;
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
/** Odds, probability and Reset share one line from 360px phones; narrower ones move Reset below. */
const BottomRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 6px 8px;
  @container phone-filters (min-width: 18.5rem) { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) auto; }
`;
const SelectGroup = styled.label<{ $accent: AccentName }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  color: ${({ theme, $accent }) => theme.color.accent[$accent].text};
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const SelectBox = styled(CompactSelect)`flex: 1;`;
const QuietLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 1.875rem;
  padding-inline: 10px;
  color: ${({ theme }) => theme.color.accent.red.text};
  background: ${({ theme }) => theme.color.accent.red.soft};
  border: ${({ theme }) => theme.border.width} solid transparent;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  text-decoration: none;
  > svg { font-size: 1rem; }
  ${media.hover} { &:hover { border-color: ${({ theme }) => theme.color.accent.red.solid}; } }
  ${focusRing}
`;

/**
 * Desktop: two dense rows of inline-labelled fields. Leagues, countries and markets fill the first,
 * odds and probability the second; Apply and Clear All share a trailing column.
 * Dates live in the header's range picker and presets directly above.
 */
const DesktopGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr)) minmax(12.5rem, auto);
  align-items: center;
  gap: 8px 10px;
  > [data-span="2"] { grid-column: span 2; }
  > [data-span="3"] { grid-column: span 3; }
`;
const Field = styled.div<{ $accent: AccentName; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: 2.375rem;
  padding-inline: 10px 4px;
  background: ${({ theme, $disabled }) => $disabled ? theme.color.cardHeader : theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 6px;
  &:focus-within { border-color: ${({ theme, $accent, $disabled }) => $disabled ? theme.color.border : theme.color.accent[$accent].solid}; }
  ${media.hover} { &:hover { border-color: ${({ theme, $accent, $disabled }) => $disabled ? theme.color.border : theme.color.accent[$accent].solid}; } }
`;
const FieldName = styled.span<{ $accent: AccentName }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: ${({ theme, $accent }) => theme.color.accent[$accent].text};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  &::before { content: ""; inline-size: 7px; block-size: 7px; border-radius: 50%; background: ${({ theme, $accent }) => theme.color.accent[$accent].gradient}; }
`;
/** Selected values on one line: chips shrink with an ellipsis and the remainder becomes "+N". */
const ChipLine = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-inline-size: 0;
  overflow: hidden;
  > a, > span { flex: 0 1 auto; min-inline-size: 0; }
  > [data-more] { flex: none; }
  > span[data-placeholder] { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.8125rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
const NumberPair = styled.div<{ $disabled?: boolean }>`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 3px;
  padding-inline-end: 6px;
  color: ${({ theme, $disabled }) => $disabled ? theme.color.disabledText : theme.color.mutedText};
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  > input {
    inline-size: 2.75rem;
    min-block-size: 1.75rem;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.cardHeader};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 4px;
    font: inherit;
    text-align: center;
    ${focusRing}
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; }
  }
`;
const ApplyLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-block-size: 2.375rem;
  padding-inline: 14px;
  color: ${({ theme }) => theme.color.onBrand};
  background: ${({ theme }) => theme.gradient.action};
  border-radius: 6px;
  box-shadow: 0 3px 10px rgb(37 99 235 / 22%);
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  text-decoration: none;
  > svg { flex: none; font-size: 1rem; }
  ${media.hover} { &:hover { filter: brightness(0.95); } }
  ${focusRing}
`;
const OutlineLink = styled(QuietLink)`
  min-block-size: 2.375rem;
  font-size: 0.8125rem;
`;

/** Whole-number entry that commits on Enter or blur, never per keystroke; arrow keys step by one. */
function WholeNumberInput({ value, min, max, label, onCommit }: {
  value: number; min: number; max: number; label: string; onCommit: (value: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const settle = (raw: string) => {
    setText(null);
    const trimmed = raw.trim().replace(/%$/u, ""), parsed = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(parsed)) return;
    const next = Math.round(Math.min(max, Math.max(min, parsed)));
    if (next !== value) onCommit(next);
  };
  const step = (delta: number) => {
    setText(null);
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onCommit(next);
  };
  return <input type="text" inputMode="numeric" value={text ?? String(value)} aria-label={label} autoComplete="off"
    onFocus={(event) => event.currentTarget.select()} onChange={(event) => setText(event.target.value)}
    onBlur={(event) => settle(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); settle(event.currentTarget.value); }
      else if (event.key === "Escape") setText(null);
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); step(event.key === "ArrowUp" ? 1 : -1); }
    }} />;
}

export function FeedFilters({ query, today, leagues, total, onApply, phoneOpen = true, phoneId }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; total: number | null; onApply: (query: FeedQuery) => void;
  /** Phones show only the dates until the header toggle opens the remaining rows. */
  phoneOpen?: boolean; phoneId?: string;
}) {
  const storedDraft = useAppSelector((state) => state.feed.draft), dispatch = useAppDispatch();
  const pending = useRef<number | null>(null), latest = useRef<FeedQuery | null>(null), applyRef = useRef(onApply);
  useEffect(() => { applyRef.current = onApply; });
  // Keep the shared draft aligned with each applied server navigation; phone
  // selections made while a navigation was in flight survive its arrival.
  useEffect(() => {
    dispatch(queryApplied(query));
    if (pending.current !== null && latest.current) dispatch(draftChanged(latest.current));
  }, [dispatch, query]);
  useEffect(() => () => { if (pending.current !== null) window.clearTimeout(pending.current); }, []);
  const draft = valid(storedDraft, today) ? storedDraft : query;
  const messages = createMessages(query.locale), range = resolveFeedDates(query, today);
  // Hundreds of leagues are sorted once per cohort, not on every chip tap.
  const leagueList = useMemo(() => leagueOptions(leagues, createMessages(query.locale).text("match.competitionUnknown")), [leagues, query.locale]);
  const countryList = useMemo(() => countryOptions(leagues), [leagues]);
  const marketList = useMemo((): FilterOption[] => publicPolicy.markets.map((family) => ({ value: family,
    label: createMessages(query.locale).text(`market.family.${family}`), detail: null, logoUrl: null, fixtures: 0 })), [query.locale]);
  const href = (next: FeedQuery) => feedQueryHref({ ...next, page: 1 }, today);
  const edit = (next: FeedQuery) => { if (valid(next, today)) dispatch(draftChanged({ ...next, page: 1 })); };
  /** Immediate navigation (dates, Reset, Clear All); any pending phone selection is folded in or discarded by the caller. */
  const apply = (next: FeedQuery) => {
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = null; latest.current = null;
    onApply({ ...next, page: 1 });
  };
  /** Phone choices accumulate in the draft, so several chips can be picked before one navigation applies them. */
  const choose = (next: FeedQuery) => {
    if (!valid(next, today)) return;
    const checked = { ...next, page: 1 };
    latest.current = checked;
    dispatch(draftChanged(checked));
    if (pending.current !== null) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      const value = latest.current;
      pending.current = null; latest.current = null;
      if (value) applyRef.current(value);
    }, phoneApplyDelayMs);
  };
  /** Phone controls start from the draft so pending selections are never lost. */
  const phone: FeedQuery = { ...draft, dates: query.dates };
  const draftTotal = useDraftTotal(draft, query, today, total);
  const reset = resetFeedFilters(query);

  const single = range.dayCount === 1;
  const singleDates: DateSelection = { kind: "date", date: range.startDate };
  const rangeDates: DateSelection = { kind: "range", from: range.startDate, to: addReportingDays(range.startDate, 6) };

  function strip(kind: "leagues" | "countries", options: FilterOption[], short: string) {
    const accent: AccentName = kind === "leagues" ? "blue" : "orange";
    const maximum = kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries;
    const selected = phone[kind];
    // Stable order: the most common options plus every selected one, so chips never jump while tapping.
    const shown = options.filter((option, index) => index < suggestionCount || selected.includes(option.value));
    const missing = selected.filter((value) => !options.some((option) => option.value === value))
      .map((value): FilterOption => ({ value, label: value, detail: null, logoUrl: null, fixtures: 0 }));
    const hidden = options.length - shown.length;
    const toggle = (value: string): FeedQuery => ({ ...phone, [kind]: toggled(selected, value, maximum) });
    const linked = (value: string): FeedQuery => ({ ...query, [kind]: toggled(query[kind], value, maximum) });
    return <ChipRow>
      <RowLabel aria-hidden="true" $accent={accent}>{short}</RowLabel>
      <ChipStrip role="group" aria-label={messages.text(kind === "leagues" ? "feed.filters.leagues" : "feed.filters.countries")}>
        {[...shown, ...missing].map((option) => {
          const on = selected.includes(option.value);
          return <FilterChip key={option.value} label={option.label} selected={on} href={href(linked(option.value))} logoUrl={kind === "leagues" ? option.logoUrl : null} accent={accent}
            onSelect={() => choose(toggle(option.value))} actionLabel={messages.text(on ? "feed.filters.remove" : "feed.filters.add", { label: option.label })} />;
        })}
        {hidden > 0 && <ChipText aria-hidden="true">{messages.text("feed.filters.moreCount", { count: messages.number(hidden) })}</ChipText>}
      </ChipStrip>
      <OptionPicker title={messages.text("feed.filters.showAll", { label: messages.text(kind === "leagues" ? "feed.filters.leagues" : "feed.filters.countries") })}
        options={options} selected={selected} onToggle={(value) => choose(toggle(value))}
        findLabel={messages.text("feed.filters.findOption", { label: messages.text(kind === "leagues" ? "feed.filters.leagues" : "feed.filters.countries") })}
        emptyLabel={messages.text("feed.filters.noOptions")} />
    </ChipRow>;
  }

  function multiField(kind: "leagues" | "countries" | "markets", options: FilterOption[]) {
    const label = messages.text(`feed.filters.${kind}`);
    const accent: AccentName = kind === "leagues" ? "blue" : kind === "countries" ? "orange" : "violet";
    const selected: readonly string[] = draft[kind];
    const chosen = selected.map((value) => options.find((option) => option.value === value)
      ?? { value, label: value, detail: null, logoUrl: null, fixtures: 0 });
    const visible = chosen.slice(0, 2), extra = chosen.length - visible.length;
    const toggle = (value: string): FeedQuery | null => kind === "markets" ? toggledMarkets(draft, value as MarketFamily)
      : { ...draft, [kind]: toggled(draft[kind], value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) };
    const appliedToggle = (value: string): FeedQuery => (kind === "markets" ? toggledMarkets(query, value as MarketFamily)
      : { ...query, [kind]: toggled(query[kind], value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) }) ?? query;
    return <Field data-span="2" $accent={accent} role="group" aria-labelledby={`filters-${kind}`}>
      <FieldName id={`filters-${kind}`} $accent={accent}>{label}</FieldName>
      <ChipLine>
        {visible.length === 0 && <span data-placeholder>{messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.any")}</span>}
        {visible.map((option) => {
          const next = toggle(option.value);
          return next ? <FilterChip key={option.value} label={option.label} selected accent={accent} href={href(appliedToggle(option.value))}
            logoUrl={kind === "leagues" ? option.logoUrl : null} onSelect={() => edit(next)}
            actionLabel={messages.text("feed.filters.remove", { label: option.label })} />
            : <ChipText key={option.value} $selected $accent={accent} title={messages.text("feed.filters.oneMarket")}><span>{option.label}</span></ChipText>;
        })}
        {extra > 0 && <ChipText data-more $selected $accent={accent} title={chosen.slice(2).map((option) => option.label).join(", ")}>
          {messages.text("feed.filters.moreCount", { count: messages.number(extra) })}
        </ChipText>}
      </ChipLine>
      <OptionPicker title={messages.text("feed.filters.showAll", { label })} options={options} selected={selected}
        searchable={kind !== "markets"} onToggle={(value) => { const next = toggle(value); if (next) edit(next); }}
        findLabel={messages.text("feed.filters.findOption", { label })} emptyLabel={messages.text("feed.filters.noOptions")} />
    </Field>;
  }

  const probabilityOptions = probabilityPresets.some((preset) => preset.min === draft.probability.min && preset.max === draft.probability.max)
    ? probabilityPresets : [...probabilityPresets, draft.probability];
  const oddsLabel = messages.text("feed.filters.oddsLabel"), probabilityLabel = messages.text("feed.filters.probabilityLabel");
  const percent = (value: number) => `${messages.number(value)}%`, odds = (value: number) => (value / 100).toFixed(2);
  const setProbability = (min: number, max: number) => edit({ ...draft, probability: { min, max } });

  return <Panel aria-label={messages.text("feed.filters.form")}>
    <PhoneOnly>
      <DateRow>
        <Segmented role="group" aria-label={messages.text("feed.date.mode")}>
          <Link href={href({ ...query, dates: singleDates })} prefetch={false} aria-current={single ? "true" : undefined}
            aria-label={messages.text("feed.date.single")} onClick={(event) => plainClick(event, () => apply({ ...phone, dates: singleDates }))}>
            {messages.text("feed.date.dayToggle")}
          </Link>
          <Link href={href({ ...query, dates: single ? rangeDates : query.dates })} prefetch={false} aria-current={single ? undefined : "true"}
            aria-label={messages.text("feed.date.range")} onClick={(event) => plainClick(event, () => apply({ ...phone, dates: single ? rangeDates : query.dates }))}>
            {messages.text("feed.date.rangeToggle")}
          </Link>
        </Segmented>
        {single ? <SingleDatePicker query={phone} today={today} onApply={apply} /> : <DateRangePicker query={phone} today={today} onApply={apply} compact />}
        <DateStepper query={phone} today={today} onApply={apply} />
      </DateRow>
      <PhoneMore id={phoneId} hidden={!phoneOpen}>
        <ChipRow>
          <RowLabel aria-hidden="true" $accent="violet">{messages.text("feed.filters.markets")}</RowLabel>
          <ChipStrip role="group" aria-label={messages.text("feed.filters.markets")}>
            {publicPolicy.markets.map((family) => {
              const on = phone.markets.includes(family), next = toggledMarkets(phone, family), name = messages.text(`market.family.${family}`);
              return next ? <FilterChip key={family} label={name} selected={on} accent="violet" href={href(toggledMarkets(query, family) ?? query)} onSelect={() => choose(next)}
                actionLabel={messages.text(on ? "feed.filters.remove" : "feed.filters.add", { label: name })} />
                : <ChipText key={family} $selected $accent="violet" title={messages.text("feed.filters.oneMarket")}>{name}</ChipText>;
            })}
          </ChipStrip>
          <OptionPicker title={messages.text("feed.filters.showAll", { label: messages.text("feed.filters.markets") })} options={marketList}
            selected={phone.markets} searchable={false} onToggle={(value) => { const next = toggledMarkets(phone, value as MarketFamily); if (next) choose(next); }}
            findLabel={messages.text("feed.filters.markets")} emptyLabel={messages.text("feed.filters.noOptions")} />
        </ChipRow>
        {strip("leagues", leagueList, messages.text("feed.filters.leagues"))}
        {strip("countries", countryList, messages.text("feed.filters.countries"))}
        <BottomRow>
          <SelectGroup title={messages.text("feed.filters.oddsPending")} $accent="amber">
            {oddsLabel}
            <SelectBox disabled aria-label={messages.text("feed.filters.odds")} value="any"
              options={[{ value: "any", label: messages.text("feed.filters.any") }]} />
          </SelectGroup>
          <SelectGroup $accent="pink">
            {probabilityLabel}
            <SelectBox aria-label={messages.text("feed.filters.probability")} value={`${phone.probability.min}-${phone.probability.max}`}
              options={probabilityOptions.map((preset) => ({ value: `${preset.min}-${preset.max}`, label: rangeText(messages, preset) }))}
              onChange={(event) => {
                const [min, max] = event.target.value.split("-").map(Number);
                choose({ ...phone, probability: { min: min!, max: max! } });
              }} />
          </SelectGroup>
          <QuietLink href={href(reset)} prefetch={false} onClick={(event) => plainClick(event, () => apply(reset))}>{messages.text("feed.filters.reset")}</QuietLink>
        </BottomRow>
      </PhoneMore>
    </PhoneOnly>

    <DesktopOnly>
      <DesktopGrid>
        {multiField("leagues", leagueList)}
        {multiField("countries", countryList)}
        {multiField("markets", marketList)}
        <ApplyLink href={href(draft)} prefetch={false} onClick={(event) => plainClick(event, () => {
          try { onApply(applyFeedDraft(draft, today)); } catch { /* An invalid draft is never applied. */ }
        })}>
          <FilterIcon />{draftTotal === null ? messages.text("feed.filters.applyPlain") : messages.plural("feed.filters.applyCount", draftTotal)}
        </ApplyLink>
        <Field data-span="3" $accent="amber" $disabled role="group" aria-labelledby="filters-odds" title={messages.text("feed.filters.oddsPending")}>
          <FieldName id="filters-odds" $accent="amber">{oddsLabel}</FieldName>
          <RangeSlider min={120} max={500} step={5} low={120} high={500} disabled accent="amber" format={odds} onCommit={() => {}}
            lowLabel={messages.text("feed.filters.minimum", { label: oddsLabel })} highLabel={messages.text("feed.filters.maximum", { label: oddsLabel })} />
          <NumberPair $disabled>
            <input disabled value="1.20" readOnly aria-label={messages.text("feed.filters.minimum", { label: oddsLabel })} />–
            <input disabled value="5.00" readOnly aria-label={messages.text("feed.filters.maximum", { label: oddsLabel })} />
          </NumberPair>
          <VisuallyHidden>{messages.text("feed.filters.oddsPending")}</VisuallyHidden>
        </Field>
        <Field data-span="3" $accent="pink" role="group" aria-labelledby="filters-probability" title={messages.text("feed.filters.probabilityHelp")}>
          <FieldName id="filters-probability" $accent="pink">{probabilityLabel}</FieldName>
          <RangeSlider min={0} max={100} step={1} low={draft.probability.min} high={draft.probability.max} accent="pink" format={percent}
            onCommit={setProbability}
            lowLabel={messages.text("feed.filters.minimum", { label: probabilityLabel })} highLabel={messages.text("feed.filters.maximum", { label: probabilityLabel })} />
          <NumberPair>
            <WholeNumberInput value={draft.probability.min} min={0} max={draft.probability.max} label={messages.text("feed.filters.minimum", { label: probabilityLabel })}
              onCommit={(min) => setProbability(min, draft.probability.max)} />–
            <WholeNumberInput value={draft.probability.max} min={draft.probability.min} max={100} label={messages.text("feed.filters.maximum", { label: probabilityLabel })}
              onCommit={(max) => setProbability(draft.probability.min, max)} />%
          </NumberPair>
          <VisuallyHidden>{messages.text("feed.filters.probabilityHelp")}</VisuallyHidden>
        </Field>
        <OutlineLink href={href(reset)} prefetch={false} onClick={(event) => plainClick(event, () => apply(reset))}>
          <ResetIcon />{messages.text("feed.filters.clearAll")}
        </OutlineLink>
      </DesktopGrid>
    </DesktopOnly>
  </Panel>;
}
