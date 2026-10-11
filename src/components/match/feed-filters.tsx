"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ResetIcon, FilterIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { ReportingDate } from "@/domain/calendar";
import { applyFeedDraft, resetFeedFilters } from "@/domain/feed-controls";
import { pinnedFeedQuery } from "@/domain/feed-pagination";
import { countryOptions, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import {
  anyProbability, canonicalMarkets, feedQueryHref, feedQueryKey, feedQueryRules, serializeFeedQuery, type FeedQuery,
} from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import { media, type AccentName } from "@/styles/theme";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { FeedTimeFilter } from "./feed-time";
import { DateRangePicker, DateStepper } from "./feed-dates";
import { ChipText, CompactSelect, FilterChip, focusRing, OptionPicker, plainClick, RangeSlider } from "./filter-parts";

type Messages = ReturnType<typeof createMessages>;
const desktop = media.desktop;
/** The draft count belongs to the desktop Apply button; phones apply selections directly. */
const desktopQuery = media.desktop.replace("@media ", "");
const probabilityPresets = [anyProbability, { min: 50, max: 100 }, { min: 60, max: 100 }, { min: 70, max: 100 }, { min: 80, max: 100 }, { min: 90, max: 100 }];
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
  padding: 8px;
  background: ${({ theme }) => theme.gradient.edge} top / 100% 3px no-repeat, ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.cardRadius};
  box-shadow: ${({ theme }) => theme.shadow.card};
  ${media.belowDesktop} {
    padding: 0;
    background: none;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
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
  padding: 6px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  &[hidden] { display: none; }
`;
const DesktopOnly = styled.div`display: none; ${desktop} { display: block; }`;

/** One date control for days and ranges; its popover stays within the page gutters. */
const DateRow = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 6px;
`;
/** One labelled trigger per filter replaces clipped suggestion chips and their duplicate menus. */
const PhonePicker = styled(OptionPicker)`
  min-inline-size: 0;
  > [role="group"] {
    grid-template-columns: minmax(0, 1fr);
    max-inline-size: 100%;
    border-radius: 0;
    box-shadow: none;
    > input { min-inline-size: 0; border-radius: 0; }
    label { border-radius: 0; }
  }
`;
/** Probability and a quiet reset action share one row, growing naturally with larger text. */
const BottomRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 8px;
  @container phone-filters (max-width: 16rem) { grid-template-columns: minmax(0, 1fr); }
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
const SelectBox = styled(CompactSelect)`flex: 1; border-radius: 0; font-size: 0.75rem;`;
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
const PhoneReset = styled(QuietLink)`
  justify-self: end;
  padding-inline: 6px;
  color: ${({ theme }) => theme.color.mutedText};
  background: none;
  border-radius: 0;
  font-size: 0.75rem;
  ${media.hover} { &:hover { color: ${({ theme }) => theme.color.accent.red.text}; background: ${({ theme }) => theme.color.accent.red.soft}; } }
`;
const OddsNote = styled.p`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.25;
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
  const messages = createMessages(query.locale);
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
    const applied = { ...next, page: 1 };
    dispatch(draftChanged(applied));
    onApply(applied);
  };
  /** Phone choices accumulate in the draft, so several options can be picked before one navigation applies them. */
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

  function phonePicker(kind: "leagues" | "countries" | "markets", options: FilterOption[]) {
    const label = messages.text(`feed.filters.${kind}`), selected: readonly string[] = phone[kind];
    // Selections absent from a refreshed option list remain available to remove.
    const missing = selected.filter((value) => !options.some((option) => option.value === value))
      .map((value): FilterOption => ({ value, label: value, detail: null, logoUrl: null, fixtures: 0 }));
    const summary = selected.length === 0 ? messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.any")
      : selected.length === 1 ? options.find((option) => option.value === selected[0])?.label ?? selected[0]!
      : messages.text("feed.filters.selectedCount", { count: messages.number(selected.length) });
    return <PhonePicker title={`${label}: ${summary}`} options={[...options, ...missing]} selected={selected}
      summary={<><span data-picker-label>{label}</span><span data-picker-value>{summary}</span></>}
      searchable={kind !== "markets"} onToggle={(value) => {
        const next = kind === "markets" ? toggledMarkets(phone, value as MarketFamily)
          : { ...phone, [kind]: toggled(selected, value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) };
        if (next) choose(next);
      }} findLabel={messages.text("feed.filters.findOption", { label })} emptyLabel={messages.text("feed.filters.noOptions")} />;
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
        <DateStepper query={phone} today={today} onApply={apply}>
          <DateRangePicker query={phone} today={today} onApply={apply} compact />
        </DateStepper>
      </DateRow>
      <FeedTimeFilter query={phone} onApply={apply} />
      <PhoneMore id={phoneId} hidden={!phoneOpen}>
        {phonePicker("markets", marketList)}
        {phonePicker("leagues", leagueList)}
        {phonePicker("countries", countryList)}
        <BottomRow>
          <SelectGroup $accent="teal">
            {probabilityLabel}
            <SelectBox aria-label={messages.text("feed.filters.probability")} value={`${phone.probability.min}-${phone.probability.max}`}
              options={probabilityOptions.map((preset) => ({ value: `${preset.min}-${preset.max}`, label: rangeText(messages, preset) }))}
              onChange={(event) => {
                const [min, max] = event.target.value.split("-").map(Number);
                choose({ ...phone, probability: { min: min!, max: max! } });
              }} />
          </SelectGroup>
          <PhoneReset href={href(reset)} prefetch={false} onClick={(event) => plainClick(event, () => apply(reset))}><ResetIcon />{messages.text("feed.filters.reset")}</PhoneReset>
        </BottomRow>
        <OddsNote title={messages.text("feed.filters.oddsPending")}>{messages.text("feed.filters.oddsUnavailable")}<VisuallyHidden>. {messages.text("feed.filters.oddsPending")}</VisuallyHidden></OddsNote>
      </PhoneMore>
    </PhoneOnly>

    <DesktopOnly>
      <FeedTimeFilter query={draft} onApply={apply} />
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
          <RangeSlider min={101} max={2000} step={1} low={101} high={2000} disabled accent="amber" format={odds} onCommit={() => {}}
            lowLabel={messages.text("feed.filters.minimum", { label: oddsLabel })} highLabel={messages.text("feed.filters.maximum", { label: oddsLabel })} />
          <NumberPair $disabled>
            <input disabled value="1.01" readOnly aria-label={messages.text("feed.filters.minimum", { label: oddsLabel })} />–
            <input disabled value="20.00" readOnly aria-label={messages.text("feed.filters.maximum", { label: oddsLabel })} />
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
