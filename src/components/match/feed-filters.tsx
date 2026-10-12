"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { ResetIcon, FilterIcon } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { validKickoffTime } from "@/domain/kickoff-time";
import { countryFlagAsset } from "@/domain/country-flag";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { applyFeedDraft, resetFeedFilters } from "@/domain/feed-controls";
import { countryOptions, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import {
  canonicalMarkets, feedQueryHref, feedQueryRules, formatProbabilityValue, parseProbabilityValue, resolveFeedDates,
  serializeFeedQuery, validProbabilityRange, type FeedQuery,
} from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import { media, type AccentName } from "@/styles/theme";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { FeedTimeFilter } from "./feed-time";
import { DateRangePicker } from "./feed-dates";
import { ChipText, FilterChip, focusRing, OptionLogo, OptionPicker } from "./filter-parts";

type Messages = ReturnType<typeof createMessages>;
const desktop = media.desktop;

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

/** A thin brand edge tops the desktop panel. */
const Panel = styled.form`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  padding: 8px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-block-start: 3px solid ${({ theme }) => theme.color.brand};
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

/** One responsive group keeps all phone fields behind the header's filter toggle. */
const FilterFieldsGroup = styled.div<{ $open: boolean }>`
  display: grid;
  gap: 6px;
  min-inline-size: 0;
  ${media.belowDesktop} {
    display: ${({ $open }) => $open ? "grid" : "none"};
    scroll-margin-block-start: 3rem;
  }
`;
/** Date and time inputs remain direct controls within the expanded filter group. */
const RangeRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 6px;
  ${desktop} { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-block-end: 8px; }
`;
/** One labelled trigger per filter replaces clipped suggestion chips and their duplicate menus. */
const PhonePicker = styled(OptionPicker)`
  min-inline-size: 0;
  [data-picker-value] { display: inline-flex; justify-content: flex-end; align-items: center; gap: 5px; }
  > [role="group"] {
    grid-template-columns: minmax(0, 1fr);
    max-inline-size: 100%;
    border-radius: 0;
    box-shadow: none;
    > input { min-inline-size: 0; border-radius: 0; }
    label { border-radius: 0; }
  }
`;
/** The phone probability control grows naturally with larger text. */
const BottomRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 6px 8px;
  @container phone-filters (max-width: 16rem) { grid-template-columns: minmax(0, 1fr); }
`;
const ProbabilityGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-inline-size: 0;
  font-size: 0.75rem;
  > span { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
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
    font-size: 0.6875rem;
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
  ${desktop} {
    [data-bound-label] { display: none; }
    input { inline-size: 2.75rem; font-size: 0.8125rem; }
  }
`;
const ProbabilityError = styled.p`
  color: ${({ theme }) => theme.color.accent.red.text};
  font-size: 0.75rem;
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
  color: ${({ theme }) => theme.color.mutedText};
  font-size: 0.75rem;
  line-height: 1.25;
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
`;
const FilterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  ${media.belowDesktop} {
    flex-wrap: nowrap;
    gap: 4px;
    > button { min-block-size: 1.75rem; gap: 4px; padding-inline: 6px; font-size: 0.6875rem; }
    > button > svg { font-size: 0.875rem; }
  }
`;

export type FeedFilterDraftStatus = Readonly<{ valid: boolean }>;
/** Native form association keeps one action row beside sorting, outside the filter fields. */
export function FeedFilterActions({ formId, locale, status }: {
  formId: string; locale: FeedQuery["locale"]; status: FeedFilterDraftStatus;
}) {
  const messages = createMessages(locale);
  return <FilterActions data-filter-actions>
    <OutlineButton type="reset" form={formId}><ResetIcon />{messages.text("feed.filters.clearAll")}</OutlineButton>
    <ApplyButton type="submit" form={formId} disabled={!status.valid}>
      <FilterIcon />{messages.text("feed.filters.applyPlain")}
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
      <span data-bound-label>{messages.text(`feed.filters.${bound}`)}</span>
      <input type="text" inputMode="decimal" autoComplete="off" value={values[bound]}
        aria-label={messages.text(bound === "min" ? "feed.filters.minimum" : "feed.filters.maximum", { label: messages.text("feed.filters.probabilityLabel") })}
        aria-invalid={invalid} aria-describedby={invalid ? descriptionId : undefined}
        onChange={(event) => { if (/^\d*(?:\.\d*)?$/u.test(event.target.value)) onChange(bound, event.target.value); }} />
    </label>{bound === "min" && <span aria-hidden="true">–</span>}</Fragment>)}
  </ProbabilityInputs>;
}

type FeedFiltersProps = {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (query: FeedQuery) => void;
  formId: string; onDraftStatus: (status: FeedFilterDraftStatus) => void;
  /** The header toggle opens all filter fields on phones and tablets. */
  phoneOpen?: boolean; phoneId?: string;
};
export function FeedFilters(props: FeedFiltersProps) {
  return <FilterFields key={feedQueryHref(props.query, props.today)} {...props} />;
}
function FilterFields({ query, today, leagues, onApply, formId, onDraftStatus, phoneOpen = true, phoneId }: FeedFiltersProps) {
  const storedDraft = useAppSelector((state) => state.feed.draft), dispatch = useAppDispatch();
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  const draft = valid(storedDraft, today) ? storedDraft : query;
  const range = resolveFeedDates(query, today), deviceZone = useDeviceTimeZone();
  const [dateInputs, setDateInputs] = useState({ from: String(range.startDate), to: String(range.endDate) });
  const [timeInputs, setTimeInputs] = useState({ from: query.time?.from ?? "", to: query.time?.to ?? "" });
  const [probabilityInputs, setProbabilityInputs] = useState({ min: formatProbabilityValue(query.probability.min), max: formatProbabilityValue(query.probability.max) });
  const minimum = parseProbabilityValue(probabilityInputs.min), maximum = parseProbabilityValue(probabilityInputs.max);
  const probability = useMemo(() => minimum !== null && maximum !== null && validProbabilityRange({ min: minimum, max: maximum })
    ? { min: minimum, max: maximum } : null, [minimum, maximum]);
  const zone = query.time?.zone ?? deviceZone;
  const completeDraft = useMemo(() => {
    try {
      if (!probability) return null;
      const from = parseReportingDate(dateInputs.from), to = parseReportingDate(dateInputs.to);
      const dates: FeedQuery["dates"] = from === range.startDate && to === range.endDate ? query.dates
        : from === to ? { kind: "date", date: from } : { kind: "range", from, to };
      resolveFeedDates({ dates }, today);
      const time = timeInputs.from || timeInputs.to ? { ...timeInputs, zone } : null;
      if (time && !validKickoffTime(time)) return null;
      return { ...draft, dates, time, probability, page: 1 };
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
  const phone = draft;
  const reset = resetFeedFilters(query);
  const draftValid = completeDraft !== null;
  useEffect(() => { onDraftStatus({ valid: draftValid }); }, [draftValid, onDraftStatus]);

  function phonePicker(kind: "leagues" | "countries" | "markets", options: FilterOption[]) {
    const label = messages.text(`feed.filters.${kind}`), selected: readonly string[] = phone[kind];
    // Selections absent from a refreshed option list remain available to remove.
    const missing = selected.filter((value) => !options.some((option) => option.value === value))
      .map((value): FilterOption => ({ value, label: value, detail: null, logoUrl: kind === "countries" ? countryFlagAsset(value) : null, fixtures: 0 }));
    const summary = selected.length === 0 ? messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.any")
      : selected.length === 1 ? options.find((option) => option.value === selected[0])?.label ?? selected[0]!
      : messages.text("feed.filters.selectedCount", { count: messages.number(selected.length) });
    return <PhonePicker title={`${label}: ${summary}`} options={[...options, ...missing]} selected={selected}
      summary={<><span data-picker-label>{label}</span><span data-picker-value>
        {kind === "countries" && selected.length === 1 && <OptionLogo key={selected[0]} url={countryFlagAsset(selected[0])} />}
        {summary}
      </span></>}
      searchable={kind !== "markets"} onToggle={(value) => {
        const next = kind === "markets" ? toggledMarkets(phone, value as MarketFamily)
          : { ...phone, [kind]: toggled(selected, value, kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries) };
        if (next) edit(next);
      }} findLabel={messages.text("feed.filters.findOption", { label })} emptyLabel={messages.text("feed.filters.noOptions")} />;
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
  const probabilityErrorId = `${formId}-probability-error`;
  const probabilityFields = <ProbabilityRangeInputs values={probabilityInputs} invalid={probability === null} descriptionId={probabilityErrorId} messages={messages}
    onChange={(bound, value) => setProbabilityInputs((previous) => ({ ...previous, [bound]: value }))} />;

  return <Panel id={formId} aria-label={messages.text("feed.filters.form")} onReset={(event) => {
    event.preventDefault();
    setDateInputs({ from: range.startDate, to: range.endDate });
    setTimeInputs({ from: "", to: "" });
    setProbabilityInputs({ min: formatProbabilityValue(reset.probability.min), max: formatProbabilityValue(reset.probability.max) });
    apply(reset);
  }} onSubmit={(event) => {
    event.preventDefault();
    if (completeDraft) apply(applyFeedDraft(completeDraft, today));
  }}>
    <FilterFieldsGroup id={phoneId} $open={phoneOpen}>
    <RangeRow>
      <DateRangePicker query={query} today={today} {...dateInputs} onChange={(from, to) => setDateInputs({ from, to })} />
      <FeedTimeFilter query={query} {...timeInputs} onChange={(from, to) => setTimeInputs({ from, to })} />
    </RangeRow>
    <PhoneOnly>
      <PhoneMore>
        {phonePicker("markets", marketList)}
        {phonePicker("leagues", leagueList)}
        {phonePicker("countries", countryList)}
        <BottomRow>
          <ProbabilityGroup role="group" aria-label={probabilityLabel}>
            <span>{messages.text("match.columns.probabilityShort")}</span>{probabilityFields}%
          </ProbabilityGroup>
        </BottomRow>
        <OddsNote title={messages.text("feed.filters.oddsPending")}>{messages.text("feed.filters.oddsUnavailable")}<VisuallyHidden>. {messages.text("feed.filters.oddsPending")}</VisuallyHidden></OddsNote>
      </PhoneMore>
    </PhoneOnly>

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
    {probability === null && <ProbabilityError id={probabilityErrorId}>{messages.text("feed.filters.probabilityInvalid")}</ProbabilityError>}
    </FilterFieldsGroup>
  </Panel>;
}
