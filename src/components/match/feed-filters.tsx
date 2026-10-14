"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { CheckIcon, CloseIcon, InfoIcon, ResetIcon, FilterIcon, SearchIcon, SlidersIcon, SortIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { validKickoffTime } from "@/domain/kickoff-time";
import { countryFlagAsset } from "@/domain/country-flag";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { applyFeedDraft, resetFeedFilters } from "@/domain/feed-controls";
import { countryOptions, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import {
  canonicalMarkets, feedQueryHref, feedQueryRules, formatProbabilityValue, panelFilterCount, parseProbabilityValue, resolveFeedDates,
  serializeFeedQuery, validProbabilityRange, type FeedQuery,
} from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import { media, type AccentName } from "@/styles/theme";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { FeedDraftStatus } from "./feed-controls";
import { feedSortOptions } from "./feed-header";
import { FeedTimeFilter } from "./feed-time";
import { DateRangePicker, DayStrip } from "./feed-dates";
import { ChipText, CompactSelect, controlFeedback, FilterChip, focusRing, OptionLogo, OptionPicker } from "./filter-parts";
import { keepFocusInSheet, SheetClose, SheetHeader, SheetScrim, sheetFrame, usePhoneSheet } from "./sheet-parts";

type Messages = ReturnType<typeof createMessages>;
const desktop = media.desktop;
const buttonBorder = css`
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
`;

function valid(query: FeedQuery, today: ReportingDate): boolean {
  try { serializeFeedQuery({ ...query, search: "" }, today); return true; } catch { return false; }
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

/**
 * One form owns search and the entire draft; persistent actions use native form association.
 * It is not a size container: that would make it the containing block of the fixed phone sheet.
 */
const Panel = styled.form`
  display: grid;
  gap: 4px;
  min-inline-size: 0;
  ${media.belowDesktop} { gap: 8px; padding-inline: 6px; }
`;
const SearchRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  gap: 6px;
  min-inline-size: 0;
`;
const SearchField = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: 2.75rem;
  padding-inline: 10px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  ${controlFeedback}
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; font-size: 1rem; }
  > input {
    inline-size: 100%; min-inline-size: 0; min-block-size: 2.5rem; padding: 0;
    border: 0; background: transparent; color: inherit; font: inherit; font-size: 1rem;
    &::placeholder { color: ${({ theme }) => theme.color.mutedText}; opacity: 1; }
    ${focusRing}
  }
  ${media.belowDesktop} {
    min-block-size: 2.75rem;
    padding-inline: 10px;
    > input { min-block-size: 2.625rem; font-size: 16px; }
  }
`;
/** The match count, sort menu and Filters button share one phone row; the sort label shortens before anything wraps. */
const PhoneToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-inline-size: 0;
  ${desktop} { display: none; }
`;
const PhoneCount = styled.p`
  flex: none;
  margin: 0;
  margin-inline-end: auto;
  white-space: nowrap;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  font-variant-numeric: tabular-nums;
`;
const SortField = styled.span`
  position: relative;
  display: inline-flex;
  flex: 0 1 auto;
  min-inline-size: 5.5rem;
  > svg {
    position: absolute;
    z-index: 1;
    inset-inline-start: 8px;
    inset-block-start: 50%;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.9375rem;
    pointer-events: none;
  }
`;
const PhoneSort = styled(CompactSelect)`
  flex: 1;
  min-block-size: 2.75rem;
  padding-inline: 28px 24px;
  border-color: ${({ theme }) => theme.color.controlBorder};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  > svg { inset-inline-end: 7px; }
`;
/** Opens the filter sheet; the badge counts applied filters. */
const FilterToggle = styled.button`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 2.75rem;
  padding-inline: 8px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  ${buttonBorder}
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  cursor: pointer;
  > svg { flex: none; font-size: 1rem; }
  > b {
    min-inline-size: 1.25rem;
    padding: 1px 5px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.brand};
    font-size: 0.6875rem;
    line-height: 1.4;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  &[aria-expanded="true"] {
    color: ${({ theme }) => theme.color.accent.teal.text};
    background: ${({ theme }) => theme.color.brandSoft};
    border-color: ${({ theme }) => theme.color.brand};
  }
  ${controlFeedback}
  ${focusRing}
`;
const DesktopOnly = styled.div`display: none; ${desktop} { display: block; grid-column: 1 / -1; order: 1; }`;

/**
 * Desktop fields stay in the page. Phones show the same fields, rendered once, in a bottom sheet
 * above the tab bar; closing it without Apply discards the unapplied edits.
 */
const FilterFieldsGroup = styled.div<{ $open: boolean }>`
  min-inline-size: 0;
  container: feed-filter-fields / inline-size;
  background: ${({ theme }) => theme.color.surface};
  ${media.belowDesktop} {
    ${sheetFrame}
    display: ${({ $open }) => $open ? "flex" : "none"};
  }
  ${desktop} {
    position: relative;
    z-index: 2;
    display: grid;
    padding: 4px 8px;
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-block-start: 3px solid ${({ theme }) => theme.color.brand};
  }
`;
/** Desktop keeps dates and times side by side above the filter row; phones stack sections and scroll. */
const SheetBody = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 2px 10px;
  min-inline-size: 0;
  ${media.belowDesktop} {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
    min-block-size: 0;
    padding: 14px 16px 18px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
`;
const SheetFooter = styled.div`
  display: none;
  ${media.belowDesktop} {
    display: grid;
    flex: none;
    gap: 6px;
    padding: 10px 16px;
    background: ${({ theme }) => theme.color.surface};
    border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  }
`;
const PhoneSection = styled.div`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  ${desktop} { display: none; }
`;
const SectionLabel = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.heavy};
  line-height: 1.35;
  > small { color: ${({ theme }) => theme.color.mutedText}; font-size: 0.6875rem; font-weight: ${({ theme }) => theme.typography.weight.body}; }
`;
/** Market toggles carry each family's card colour, so a choice matches the picks it produces. */
const MarketToggles = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  @container feed-filter-fields (max-width: 18rem) { grid-template-columns: minmax(0, 1fr); }
`;
const MarketToggle = styled.button<{ $family: MarketFamily }>`
  display: flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
  min-block-size: 2.75rem;
  padding: 6px 10px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  ${buttonBorder}
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  line-height: 1.25;
  text-align: start;
  cursor: pointer;
  &::before {
    content: "";
    flex: none;
    inline-size: 0.75rem;
    block-size: 0.75rem;
    border: 2px solid ${({ theme, $family }) => theme.color.market[$family].solid};
  }
  > span { flex: 1; min-inline-size: 0; overflow-wrap: anywhere; }
  > svg { flex: none; font-size: 1rem; }
  &[aria-pressed="true"] {
    color: ${({ theme, $family }) => theme.color.market[$family].text};
    background: ${({ theme, $family }) => theme.color.market[$family].soft};
    border-color: ${({ theme, $family }) => theme.color.market[$family].solid};
    &::before { background: ${({ theme, $family }) => theme.color.market[$family].solid}; }
  }
  &[aria-disabled="true"] { cursor: not-allowed; }
  ${focusRing}
`;
/** One labelled trigger per list; its checklist opens in place inside the sheet. */
const PhonePicker = styled(OptionPicker)`
  min-inline-size: 0;
  > button { min-block-size: 2.75rem; padding: 6px 10px; border-color: ${({ theme }) => theme.color.controlBorder}; font-size: 0.8125rem; }
  [data-picker-label] { flex: 0 1 auto; min-inline-size: 0; overflow-wrap: anywhere; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-picker-value] { display: inline-flex; justify-content: flex-end; align-items: center; gap: 5px; overflow-wrap: anywhere; }
  @container feed-filter-fields (max-width: 14rem) {
    > button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 6px; }
    [data-picker-label] { grid-column: 1; grid-row: 1; }
    [data-picker-value] { grid-column: 1; grid-row: 2; justify-content: flex-start; text-align: start; }
    > button > svg { grid-column: 2; grid-row: 1 / span 2; }
  }
  > [role="group"] {
    position: static;
    grid-template-columns: minmax(0, 1fr);
    max-inline-size: 100%;
    inline-size: 100%;
    margin-block-start: 6px;
    border-radius: 0;
    box-shadow: none;
    padding: 8px;
    gap: 8px;
    > input { min-inline-size: 0; min-block-size: 2.75rem; border-radius: 0; font-size: 16px; }
    label { min-block-size: 2.75rem; border-radius: 0; font-size: 0.875rem; }
    label > span { overflow-wrap: anywhere; }
  }
`;
const ProbabilityGroup = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-inline-size: 0;
  font-size: 0.8125rem;
  > span { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
`;
const ProbabilityInputs = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  min-inline-size: 0;
  > label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-inline-size: 0;
    padding-inline: 5px;
    border: 1px solid ${({ theme }) => theme.color.controlBorder};
    background: ${({ theme }) => theme.color.surface};
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  input {
    inline-size: 3.25rem;
    min-inline-size: 0;
    min-block-size: 1.75rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.color.text};
    font: inherit;
    font-variant-numeric: tabular-nums;
    ${focusRing}
  }
  > label:has([aria-invalid="true"]) { border-color: ${({ theme }) => theme.color.accent.red.text}; }
  ${media.belowDesktop} {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    @container feed-filter-fields (max-width: 13rem) { grid-template-columns: minmax(0, 1fr); }
    > label { display: grid; gap: 2px; padding: 0; border: 0; white-space: normal; font-size: 0.75rem; }
    > [data-range-separator] { display: none; }
    input {
      inline-size: 100%;
      min-block-size: 2.75rem;
      padding: 4px 8px;
      border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
      font-size: 16px;
      &[aria-invalid="true"] { border-color: ${({ theme }) => theme.color.accent.red.text}; }
    }
  }
  ${desktop} {
    [data-bound-label] { display: none; }
    input { inline-size: 2.75rem; font-size: 0.8125rem; }
  }
`;
const ProbabilityError = styled.p`
  color: ${({ theme }) => theme.color.accent.red.text};
  font-size: 0.75rem;
  ${desktop} { grid-column: 1 / -1; order: 2; }
`;
const QuietButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 1.875rem;
  padding-inline: 10px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.controlBorder};
  border-radius: 0;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  font: inherit;
  cursor: pointer;
  > svg { font-size: 1rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  ${focusRing}
`;
const OddsNote = styled.p`
  display: flex;
  align-items: start;
  gap: 7px;
  margin-block-start: 4px;
  padding-block-start: 6px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.5;
  > svg { flex: none; margin-block-start: 2px; font-size: 0.875rem; }
`;
const ProbabilityHelp = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.5;
`;

/** Five compact desktop fields share one row; numeric bounds need no sliders. */
const DesktopGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto auto;
  align-items: center;
  gap: 8px 10px;
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
  border-radius: 0;
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
const ApplyButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-block-size: 2rem;
  padding-inline: 10px;
  color: ${({ theme }) => theme.color.onBrand};
  background: ${({ theme }) => theme.gradient.action};
  border: 0;
  ${media.belowDesktop} { ${buttonBorder} }
  border-radius: 0;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  white-space: nowrap;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
  > svg { flex: none; font-size: 0.875rem; }
  ${media.hover} { &:hover { filter: brightness(0.95); } }
  ${focusRing}
`;
const OutlineButton = styled(QuietButton)`
  min-block-size: 2rem;
  border-radius: 0;
  font-size: 0.8125rem;
  border-color: transparent;
  background: transparent;
  ${media.belowDesktop} {
    background: ${({ theme }) => theme.color.surface};
    ${buttonBorder}
  }
`;
const FilterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  [data-desktop-icon] { display: inline-flex; }
  [data-phone-label] { display: none; }
  ${media.belowDesktop} {
    flex-wrap: wrap;
    inline-size: auto;
    max-inline-size: 100%;
    min-inline-size: 0;
    flex: 1 1 auto;
    gap: 6px;
    > button { min-block-size: 2.75rem; padding-inline: 8px; font-size: 0.8125rem; white-space: normal; }
    > button[type="submit"] { flex: 1; min-inline-size: min(100%, 5rem); }
    > button > svg { font-size: 0.875rem; }
    [data-desktop-icon], [data-desktop-label] { display: none; }
    [data-phone-label] { display: inline-flex; }
  }
`;

export type FeedFilterDraftStatus = Readonly<{ valid: boolean; changed: boolean }>;
/** Native form association keeps one action row beside sorting, outside the filter fields. */
export function FeedFilterActions({ formId, locale, status }: {
  formId: string; locale: FeedQuery["locale"]; status: FeedFilterDraftStatus;
}) {
  const messages = createMessages(locale);
  return <FilterActions data-filter-actions>
    <OutlineButton type="reset" form={formId}><span data-desktop-icon><ResetIcon /></span>{messages.text("feed.filters.clearAll")}</OutlineButton>
    <ApplyButton type="submit" form={formId} disabled={!status.valid} aria-label={messages.text("feed.filters.applyPlain")}>
      <span data-desktop-icon><FilterIcon /></span><span data-desktop-label>{messages.text("feed.filters.apply")}</span>
      <span data-phone-label>{messages.text("feed.filters.applyPlain")}</span>
    </ApplyButton>
  </FilterActions>;
}

/** Shared decimal entry on every screen; incomplete drafts never become an applied filter. */
function ProbabilityRangeInputs({ values, onChange, invalid, descriptionId, messages }: {
  values: { min: string; max: string }; onChange: (bound: "min" | "max", value: string) => void;
  invalid: boolean; descriptionId: string; messages: Messages;
}) {
  return <ProbabilityInputs>
    {(["min", "max"] as const).map((bound) => <Fragment key={bound}><label>
      <span data-bound-label>{messages.text(bound === "min" ? "feed.filters.minimumPercent" : "feed.filters.maximumPercent")}</span>
      <input type="text" inputMode="decimal" autoComplete="off" value={values[bound]}
        aria-label={messages.text(bound === "min" ? "feed.filters.minimum" : "feed.filters.maximum", { label: messages.text("feed.filters.probabilityLabel") })}
        aria-invalid={invalid} aria-describedby={invalid ? descriptionId : undefined}
        onChange={(event) => { if (/^\d*(?:\.\d*)?$/u.test(event.target.value)) onChange(bound, event.target.value); }} />
    </label>{bound === "min" && <span data-range-separator aria-hidden="true">–</span>}</Fragment>)}
  </ProbabilityInputs>;
}

type FeedFiltersProps = {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (query: FeedQuery) => void;
  formId: string; onDraftStatus: (status: FeedFilterDraftStatus) => void; total: number | null;
  open: boolean; panelId: string; onOpenChange: (open: boolean) => void; controls: ReactNode;
};
export function FeedFilters(props: FeedFiltersProps) {
  const range = resolveFeedDates(props.query, props.today);
  return <FilterFields key={`${feedQueryHref(props.query, props.today)}:${range.startDate}:${range.endDate}`} {...props} />;
}
function FilterFields({ query, today, leagues, onApply, formId, onDraftStatus, total, open, panelId, onOpenChange, controls }: FeedFiltersProps) {
  const storedDraft = useAppSelector((state) => state.feed.draft), dispatch = useAppDispatch();
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  const draft = valid(storedDraft, today) ? storedDraft : query;
  const range = resolveFeedDates(query, today), deviceZone = useDeviceTimeZone();
  const filterToggle = useRef<HTMLButtonElement>(null), sheet = useRef<HTMLDivElement>(null);
  // Desktop always shows the fields in the page, so the sheet only exists below the desktop width.
  usePhoneSheet(open, sheet, () => onOpenChange(false));
  const [dateInputs, setDateInputs] = useState({ from: String(range.startDate), to: String(range.endDate) });
  const [timeInputs, setTimeInputs] = useState({ from: query.time?.from ?? "", to: query.time?.to ?? "" });
  const [probabilityInputs, setProbabilityInputs] = useState({ min: formatProbabilityValue(query.probability.min), max: formatProbabilityValue(query.probability.max) });
  const minimum = parseProbabilityValue(probabilityInputs.min), maximum = parseProbabilityValue(probabilityInputs.max);
  const probability = useMemo(() => minimum !== null && maximum !== null && validProbabilityRange({ min: minimum, max: maximum })
    ? { min: minimum, max: maximum } : null, [minimum, maximum]);
  const zone = query.zone ?? query.time?.zone ?? deviceZone;
  const completeDraft = useMemo(() => {
    try {
      if (!probability) return null;
      const from = parseReportingDate(dateInputs.from), to = parseReportingDate(dateInputs.to);
      const dates: FeedQuery["dates"] = from === range.startDate && to === range.endDate ? query.dates
        : from === to ? { kind: "date", date: from } : { kind: "range", from, to };
      resolveFeedDates({ dates }, today);
      const time = timeInputs.from || timeInputs.to ? { ...timeInputs, zone } : null;
      if (time && !validKickoffTime(time)) return null;
      const next = { ...draft, dates, time, probability, page: 1 };
      applyFeedDraft(next, today);
      return next;
    } catch { return null; }
  }, [dateInputs, draft, probability, query.dates, range.endDate, range.startDate, timeInputs, today, zone]);
  const messages = createMessages(query.locale);
  // Hundreds of leagues are sorted once per cohort, not on every chip tap.
  const leagueList = useMemo(() => leagueOptions(leagues, createMessages(query.locale).text("match.competitionUnknown")), [leagues, query.locale]);
  const countryList = useMemo(() => countryOptions(leagues), [leagues]);
  const marketList = useMemo((): FilterOption[] => publicPolicy.markets.map((family) => ({ value: family,
    label: createMessages(query.locale).text(`market.family.${family}`), detail: null, logoUrl: null, fixtures: 0 })), [query.locale]);
  const href = (next: FeedQuery) => feedQueryHref({ ...next, page: 1 }, today);
  const edit = (next: FeedQuery) => { if (valid(next, today)) dispatch(draftChanged({ ...next, page: 1 })); };
  /** One application step for the complete draft. */
  const apply = (next: FeedQuery) => {
    const applied = { ...next, page: 1 };
    dispatch(draftChanged(applied));
    onApply(applied);
  };
  /** Closing without Apply restores the applied filters; typed search text stays in the field. */
  const closeSheet = () => {
    setDateInputs({ from: range.startDate, to: range.endDate });
    setTimeInputs({ from: query.time?.from ?? "", to: query.time?.to ?? "" });
    setProbabilityInputs({ min: formatProbabilityValue(query.probability.min), max: formatProbabilityValue(query.probability.max) });
    dispatch(draftChanged({ ...query, search: draft.search, page: 1 }));
    onOpenChange(false);
    filterToggle.current?.focus();
  };
  const phone = draft;
  const reset = resetFeedFilters(query);
  const draftValid = completeDraft !== null;
  const changed = completeDraft === null || draft.search !== query.search
    || serializeFeedQuery({ ...completeDraft, search: "", page: 1 }, today).toString()
      !== serializeFeedQuery({ ...query, search: "", page: 1 }, today).toString();
  useEffect(() => { onDraftStatus({ valid: draftValid, changed }); }, [changed, draftValid, onDraftStatus]);

  function phonePicker(kind: "leagues" | "countries", options: FilterOption[]) {
    const label = messages.text(`feed.filters.${kind}`), selected: readonly string[] = phone[kind];
    // Selections absent from a refreshed option list remain available to remove.
    const missing = selected.filter((value) => !options.some((option) => option.value === value))
      .map((value): FilterOption => ({ value, label: value, detail: null, logoUrl: kind === "countries" ? countryFlagAsset(value) : null, fixtures: 0 }));
    const summary = selected.length === 0 ? messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.anyCountry")
      : selected.length === 1 ? options.find((option) => option.value === selected[0])?.label ?? selected[0]!
      : messages.text("feed.filters.selectedCount", { count: messages.number(selected.length) });
    return <PhonePicker title={`${label}: ${summary}`} options={[...options, ...missing]} selected={selected}
      summary={<><span data-picker-label>{label}</span><span data-picker-value>
        {kind === "countries" && selected.length === 1 && <OptionLogo key={selected[0]} url={countryFlagAsset(selected[0])} />}
        {summary}
      </span></>}
      onToggle={(value) => edit({ ...phone, [kind]: toggled(selected, value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) })}
      findLabel={messages.text("feed.filters.findOption", { label })} emptyLabel={messages.text("feed.filters.noOptions")} />;
  }

  function multiField(kind: "leagues" | "countries" | "markets", options: FilterOption[]) {
    const label = messages.text(`feed.filters.${kind}`);
    const accent: AccentName = kind === "leagues" ? "blue" : kind === "countries" ? "orange" : "violet";
    const selected: readonly string[] = draft[kind];
    const chosen = selected.map((value) => options.find((option) => option.value === value)
      ?? { value, label: value, detail: null, logoUrl: kind === "countries" ? countryFlagAsset(value) : null, fixtures: 0 });
    const visible = chosen.slice(0, 2), extra = chosen.length - visible.length;
    const toggle = (value: string): FeedQuery | null => kind === "markets" ? toggledMarkets(draft, value as MarketFamily)
      : { ...draft, [kind]: toggled(draft[kind], value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) };
    const appliedToggle = (value: string): FeedQuery => (kind === "markets" ? toggledMarkets(query, value as MarketFamily)
      : { ...query, [kind]: toggled(query[kind], value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) }) ?? query;
    return <Field $accent={accent} role="group" aria-labelledby={`filters-${kind}`}>
      <FieldName id={`filters-${kind}`} $accent={accent}>{label}</FieldName>
      <ChipLine>
        {visible.length === 0 && <span data-placeholder>{messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.any")}</span>}
        {visible.map((option) => {
          const next = toggle(option.value);
          return next ? <FilterChip key={option.value} label={option.label} selected accent={accent} href={href(appliedToggle(option.value))}
            logoUrl={kind !== "markets" ? option.logoUrl : null} onSelect={() => edit(next)}
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

  const oddsLabel = messages.text("feed.filters.oddsLabel"), probabilityLabel = messages.text("feed.filters.probabilityLabel");
  const probabilityErrorId = `${formId}-probability-error`, titleId = `${panelId}-title`, marketsId = `${panelId}-markets`;
  const probabilityFields = <ProbabilityRangeInputs values={probabilityInputs} invalid={probability === null} descriptionId={probabilityErrorId} messages={messages}
    onChange={(bound, value) => setProbabilityInputs((previous) => ({ ...previous, [bound]: value }))} />;

  const count = panelFilterCount(query), filtersLabel = messages.text("feed.filters.toggle");
  const sortKey = `${query.sort.by}-${query.sort.direction}`;
  const [action, parameters = ""] = feedQueryHref({ ...query, search: "", page: 1 }, today).split("?");
  return <Panel id={formId} action={action} method="get" aria-label={messages.text("feed.filters.form")} onKeyDown={(event) => {
    if (event.key === "Escape" && open && !event.defaultPrevented) { event.preventDefault(); closeSheet(); }
  }} onReset={(event) => {
    event.preventDefault();
    setDateInputs({ from: range.startDate, to: range.endDate });
    setTimeInputs({ from: "", to: "" });
    setProbabilityInputs({ min: formatProbabilityValue(reset.probability.min), max: formatProbabilityValue(reset.probability.max) });
    onOpenChange(false);
    apply(reset);
  }} onSubmit={(event) => {
    event.preventDefault();
    if (!completeDraft) return;
    onOpenChange(false);
    apply(applyFeedDraft(completeDraft, today));
  }}>
    {[...new URLSearchParams(parameters)].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <SearchRow data-feed-search>
      <SearchField>
        <SearchIcon aria-hidden="true" />
        <input type="search" name="q" value={draft.search} maxLength={feedQueryRules.maximumSearchLength} autoComplete="off"
          placeholder={messages.text("feed.search.placeholder")} aria-label={messages.text("feed.filters.search")}
          onChange={(event) => edit({ ...draft, search: event.target.value })} />
      </SearchField>
    </SearchRow>
    {query.status !== "live" && <DayStrip query={query} today={today} onApply={onApply} />}
    <PhoneToolbar data-phone-filter-toolbar>
      {total !== null && <PhoneCount>{messages.plural("feed.results.count", total)}</PhoneCount>}
      <SortField>
        <SortIcon />
        <PhoneSort aria-label={messages.text("feed.sort.label")} value={sortKey} onChange={(event) => {
          const sort = feedSortOptions.find((option) => `${option.by}-${option.direction}` === event.target.value);
          if (sort) onApply({ ...query, sort, page: 1 });
        }} options={feedSortOptions.map((sort) => ({ value: `${sort.by}-${sort.direction}`, label: messages.text(`feed.sort.compact.${sort.by}-${sort.direction}`) }))} />
      </SortField>
      <FilterToggle ref={filterToggle} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId}
        aria-label={count > 0 ? messages.plural("feed.filters.toggleCount", count) : filtersLabel}
        onClick={() => onOpenChange(true)}>
        <SlidersIcon /><span>{filtersLabel}</span>{count > 0 && <b aria-hidden="true">{messages.number(count)}</b>}
      </FilterToggle>
    </PhoneToolbar>
    {open && <SheetScrim aria-hidden="true" onClick={closeSheet} />}
    <FilterFieldsGroup ref={sheet} id={panelId} $open={open} onKeyDown={(event) => { if (open) keepFocusInSheet(event); }} tabIndex={open ? -1 : undefined}
      role={open ? "dialog" : undefined} aria-modal={open || undefined} aria-labelledby={open ? titleId : undefined}>
      <SheetHeader>
        <h2 id={titleId}>{filtersLabel}</h2>
        <SheetClose type="button" aria-label={messages.text("feed.filters.close")} title={messages.text("feed.filters.close")} onClick={closeSheet}>
          <CloseIcon />
        </SheetClose>
      </SheetHeader>
      <SheetBody>
        <DateRangePicker query={query} today={today} {...dateInputs} onChange={(from, to) => setDateInputs({ from, to })} />
        <FeedTimeFilter query={query} {...timeInputs} onChange={(from, to) => setTimeInputs({ from, to })} />
        <PhoneSection role="group" aria-labelledby={marketsId}>
          <SectionLabel><span id={marketsId}>{messages.text("feed.filters.markets")}</span><small>{messages.text("feed.filters.marketsHint")}</small></SectionLabel>
          <MarketToggles>
            {publicPolicy.markets.map((family) => {
              const pressed = draft.markets.includes(family), next = toggledMarkets(draft, family);
              return <MarketToggle key={family} type="button" $family={family} aria-pressed={pressed} aria-disabled={next === null || undefined}
                title={next === null ? messages.text("feed.filters.oneMarket") : undefined} onClick={() => { if (next) edit(next); }}>
                <span>{messages.text(`market.family.${family}`)}</span>{pressed && <CheckIcon />}
              </MarketToggle>;
            })}
          </MarketToggles>
        </PhoneSection>
        <PhoneSection>
          {phonePicker("leagues", leagueList)}
          {phonePicker("countries", countryList)}
        </PhoneSection>
        <PhoneSection>
          <ProbabilityGroup role="group" aria-label={probabilityLabel}>
            <span>{messages.text("feed.filters.predictionProbability")}</span>{probabilityFields}
          </ProbabilityGroup>
          <ProbabilityHelp>{messages.text("feed.filters.probabilityExplanation")}</ProbabilityHelp>
        </PhoneSection>
        {probability === null && <ProbabilityError id={probabilityErrorId}>{messages.text("feed.filters.probabilityInvalid")}</ProbabilityError>}
        <PhoneSection>
          <OddsNote><InfoIcon /><span>{messages.text("feed.filters.oddsUnavailable")}<br />{messages.text("feed.filters.oddsPending")}</span></OddsNote>
        </PhoneSection>
        <DesktopOnly>
          <DesktopGrid>
            {multiField("leagues", leagueList)}
            {multiField("countries", countryList)}
            {multiField("markets", marketList)}
            <Field $accent="amber" $disabled role="group" aria-labelledby="filters-odds" title={messages.text("feed.filters.oddsPending")}>
              <FieldName id="filters-odds" $accent="amber">{oddsLabel}</FieldName>
              <NumberPair $disabled>
                <input disabled value="1.01" readOnly aria-label={messages.text("feed.filters.minimum", { label: oddsLabel })} />–
                <input disabled value="20.00" readOnly aria-label={messages.text("feed.filters.maximum", { label: oddsLabel })} />
              </NumberPair>
              <VisuallyHidden>{messages.text("feed.filters.oddsPending")}</VisuallyHidden>
            </Field>
            <Field $accent="pink" role="group" aria-labelledby="filters-probability" title={messages.text("feed.filters.probabilityHelp")}>
              <FieldName id="filters-probability" $accent="pink">{probabilityLabel}</FieldName>
              {probabilityFields}%
              <VisuallyHidden>{messages.text("feed.filters.probabilityHelp")}</VisuallyHidden>
            </Field>
          </DesktopGrid>
        </DesktopOnly>
      </SheetBody>
      <SheetFooter>
        <FeedDraftStatus locale={query.locale} changed={changed && draftValid} />
        <FeedFilterActions formId={formId} locale={query.locale} status={{ valid: draftValid, changed }} />
      </SheetFooter>
    </FilterFieldsGroup>
    {controls}
  </Panel>;
}
