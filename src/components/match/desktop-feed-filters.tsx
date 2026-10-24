"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType } from "react";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { CalendarIcon, ChevronDownIcon, FilterIcon, GlobeIcon, ResetIcon, SearchIcon, SlidersIcon, type IconProps } from "@/components/ui/icons";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { countryFlagAsset } from "@/domain/country-flag";
import { searchFilterOptions } from "@/domain/filter-option-search";
import { applyFeedDraft, parseProbabilityInputs, resetFeedFilters, resetFeedFilterSection, type FeedFilterSection } from "@/domain/feed-controls";
import { countryOptions, feedHeading, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import { defaultMarkets, feedQueryHref, feedQueryRules, formatProbabilityValue, resolveFeedDates, type FeedDatePreset, type FeedQuery } from "@/domain/feed-query";
import { fullDayKickoffTime, isAnyKickoffTime, validKickoffTime } from "@/domain/kickoff-time";
import type { MatchFeedResponse } from "@/domain/match-feed";
import type { MarketFamily } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { PicksOnlyFilter } from "./feed-controls";
import { feedSortOptions } from "./feed-header";
import { OptionLogo } from "./filter-parts";
import { ActionButton, ActionRow, Count, DialogContent, Error as FilterError, Heading, HeadingRow, Muted, OptionsRow, Panel, PeriodField, SearchField, SectionButton, SortField } from "./desktop-feed-filter-styles";

type Messages = ReturnType<typeof createMessages>;
type Draft = {
  query: FeedQuery;
  dates: { from: string; to: string };
  times: { from: string; to: string };
  probability: { min: string; max: string };
};
const periods: readonly FeedDatePreset[] = ["last-30-days", "last-7-days", "last-3-days", "yesterday", "today", "tomorrow"];
const sections: readonly FeedFilterSection[] = ["dates", "competitions", "limits"];
const sectionIcons: Record<FeedFilterSection, ComponentType<IconProps>> = { dates: CalendarIcon, competitions: GlobeIcon, limits: SlidersIcon };

function probabilityInputs(query: FeedQuery) {
  return { min: query.probability.min === 0 ? "" : formatProbabilityValue(query.probability.min),
    max: query.probability.max === 100 ? "" : formatProbabilityValue(query.probability.max) };
}
function fromQuery(query: FeedQuery, today: ReportingDate): Draft {
  const range = resolveFeedDates(query, today);
  return { query, dates: { from: range.startDate, to: range.endDate },
    times: { from: query.time?.from ?? fullDayKickoffTime.from, to: query.time?.to ?? fullDayKickoffTime.to }, probability: probabilityInputs(query) };
}
function compile(draft: Draft, today: ReportingDate, zone: string): FeedQuery | null {
  try {
    const probability = parseProbabilityInputs(draft.probability);
    if (!probability) return null;
    const from = parseReportingDate(draft.dates.from), to = parseReportingDate(draft.dates.to), original = resolveFeedDates(draft.query, today);
    const dates: FeedQuery["dates"] = from === original.startDate && to === original.endDate ? draft.query.dates
      : from === to ? { kind: "date", date: from } : { kind: "range", from, to };
    const time = isAnyKickoffTime(draft.times) ? null : { ...draft.times, zone };
    if (time && !validKickoffTime(time)) return null;
    return applyFeedDraft({ ...draft.query, dates, time, probability, page: 1 }, today);
  } catch { return null; }
}
/** A dialog transaction cannot replace edits owned by another section. */
function copySection(current: Draft, source: Draft, section: FeedFilterSection): Draft {
  switch (section) {
    case "dates": return { ...current, dates: source.dates, times: source.times,
      query: { ...current.query, dates: source.query.dates, time: source.query.time ?? null, zone: source.query.zone ?? null } };
    case "competitions": return { ...current, query: { ...current.query, leagues: source.query.leagues, countries: source.query.countries } };
    case "limits": return { ...current, probability: source.probability,
      query: { ...current.query, markets: source.query.markets, probability: source.query.probability, odds: source.query.odds } };
  }
}

/** The same searchable checklist handles leagues and countries, including retained missing choices. */
const OptionChecklist = memo(function OptionChecklist({ kind, options, selected, onChange, messages }: {
  kind: "leagues" | "countries"; options: readonly FilterOption[]; selected: readonly string[];
  onChange: (values: string[]) => void; messages: Messages;
}) {
  const [search, setSearch] = useState(""), similarId = useId();
  const label = messages.text(`feed.filters.${kind}`), maximum = kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries;
  const available = useMemo(() => [...options, ...selected.filter((value) => !options.some((option) => option.value === value)).map((value) => ({
    value, label: value, detail: null, logoUrl: kind === "countries" ? countryFlagAsset(value) : null, fixtures: 0,
  }))], [kind, options, selected]);
  const { exact, similar } = useMemo(() => searchFilterOptions(available, search), [available, search]);
  const optionRow = (option: FilterOption, isSimilar = false) => <label data-choice key={option.value}>
    <input type="checkbox" name={kind === "leagues" ? "league" : "country"} value={option.value} checked={selected.includes(option.value)}
      disabled={!selected.includes(option.value) && selected.length >= maximum} aria-describedby={isSimilar ? similarId : undefined}
      onChange={() => onChange(selected.includes(option.value) ? selected.filter((value) => value !== option.value) : [...selected, option.value].sort())} />
    <OptionLogo url={option.logoUrl} /><span>{option.label}{option.detail && <small> · {option.detail}</small>}</span>
  </label>;
  return <fieldset><legend>{label}</legend>
    <input data-option-search type="search" value={search} aria-label={messages.text("feed.filters.findOption", { label })}
      placeholder={messages.text("feed.filters.findOption", { label })} onChange={(event) => setSearch(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
    <label data-choice><input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
      {messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.allCountries")}</label>
    <div data-options>{exact.map((option) => optionRow(option))}
      {similar.length > 0 && <><Muted id={similarId}>{messages.text("feed.search.similar")}</Muted>{similar.map((option) => optionRow(option, true))}</>}
    </div>
    {exact.length === 0 && similar.length === 0 && <Muted>{messages.text(options.length === 0 ? "feed.filters.noOptions" : "feed.filters.noOptionMatches")}</Muted>}
  </fieldset>;
});

/** One enhanced desktop interface; the original server/phone form remains the responsive fallback. */
export function DesktopFeedFilters({ query, today, leagues, onApply, subscriberOnly = false, pending = false }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (next: FeedQuery) => void;
  subscriberOnly?: boolean; pending?: boolean;
}) {
  const messages = useMemo(() => createMessages(query.locale), [query.locale]), prefix = useId(), dispatch = useAppDispatch();
  const stored = useAppSelector((state) => state.feed.draft), applied = useAppSelector((state) => state.feed.query);
  const deviceZone = useDeviceTimeZone();
  const [draft, setDraft] = useState(() => fromQuery(feedQueryHref(applied, today) === feedQueryHref(query, today) ? stored : query, today));
  const [active, setActive] = useState<FeedFilterSection | null>(null), [dialogVersion, setDialogVersion] = useState(0);
  const [issue, setIssue] = useState<{ section: FeedFilterSection | null; message: string } | null>(null);
  const snapshot = useRef<Draft | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const zone = draft.query.zone ?? draft.query.time?.zone ?? deviceZone;
  const complete = useMemo(() => compile(draft, today, zone), [draft, today, zone]);
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  useEffect(() => { if (complete) dispatch(draftChanged({ ...complete, search: draft.query.search })); }, [complete, dispatch, draft.query.search, query]);
  useEffect(() => {
    if (!issue) return;
    const frame = requestAnimationFrame(() => errorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [issue]);
  const leagueList = useMemo(() => leagueOptions(leagues, messages.text("match.competitionUnknown")), [leagues, messages]);
  const countryList = useMemo(() => countryOptions(leagues), [leagues]);
  const changeLeagues = useCallback((values: string[]) => setDraft((current) => ({ ...current, query: { ...current.query, leagues: values } })), []);
  const changeCountries = useCallback((values: string[]) => setDraft((current) => ({ ...current, query: { ...current.query, countries: values } })), []);
  const reset = resetFeedFilters(draft.query), resetRange = resolveFeedDates(reset, today), currentRange = resolveFeedDates(draft.query, today);
  const probability = parseProbabilityInputs(draft.probability);
  const restrictedProbability = probability === null || probability.min !== 0 || probability.max !== 100;
  const datesChanged = draft.dates.from !== resetRange.startDate || draft.dates.to !== resetRange.endDate;
  const counts = { dates: Number(datesChanged) + Number(!isAnyKickoffTime(draft.times)),
    competitions: draft.query.leagues.length + draft.query.countries.length, limits: draft.query.markets.length + Number(restrictedProbability) };
  const modified = { dates: counts.dates > 0, competitions: counts.competitions > 0,
    limits: draft.query.markets.length !== defaultMarkets.length || restrictedProbability };
  const titles = { dates: messages.text("feed.filters.matchDateTime"), competitions: messages.text("feed.filters.competitions"), limits: messages.text("feed.filters.limits") };
  const period = (periods as readonly string[]).includes(draft.query.dates.kind)
    && draft.dates.from === currentRange.startDate && draft.dates.to === currentRange.endDate ? draft.query.dates.kind : "custom";
  const errorId = `${prefix}-error`;
  function open(section: FeedFilterSection) {
    snapshot.current = draft; setActive(section); setIssue(null); setDialogVersion((current) => current + 1);
  }
  function cancel() {
    if (active && snapshot.current) {
      const previous = snapshot.current;
      setDraft((current) => copySection(current, previous, active));
    }
    setIssue(null); snapshot.current = null; setActive(null);
  }
  function localReset(section: FeedFilterSection) {
    setDraft((current) => copySection(current, fromQuery(resetFeedFilterSection(current.query, section), today), section));
    setIssue(null); setDialogVersion((current) => current + 1);
  }
  function save(section: FeedFilterSection) {
    const candidate = copySection(fromQuery(resetFeedFilters(draft.query), today), draft, section);
    const checked = compile(candidate, today, zone);
    if (!checked) {
      const message = section === "dates" ? messages.text(validKickoffTime({ ...draft.times, zone }) ? "feed.date.tooLong" : "feed.time.invalid")
        : messages.text(section === "limits" ? "feed.filters.probabilityInvalid" : "feed.invalidQuery");
      setIssue({ section, message }); return;
    }
    setDraft((current) => copySection(current, fromQuery(checked, today), section));
    setIssue(null); snapshot.current = null; setActive(null);
  }
  function resetAll() {
    const next = resetFeedFilters(draft.query);
    setDraft(fromQuery(next, today)); setIssue(null); snapshot.current = null; setActive(null); onApply(next);
  }
  function changePeriod(value: string) {
    if (value === "custom") { open("dates"); return; }
    const selected = periods.find((kind) => kind === value);
    if (!selected) return;
    setDraft((current) => {
      const next = { ...current.query, dates: { kind: selected }, page: 1 }, range = resolveFeedDates(next, today);
      return { ...current, query: next, dates: { from: range.startDate, to: range.endDate } };
    });
  }
  const error = (section: FeedFilterSection | null) => issue?.section === section
    ? <FilterError id={errorId} ref={errorRef} tabIndex={-1}>{issue.message}</FilterError> : null;
  const input = (label: string, name: string, value: string, change: (value: string) => void, type = "text") => <label data-input>
    <span>{label}</span><input type={type} name={name} value={value} placeholder={messages.text("feed.filters.any")}
      inputMode={type === "text" ? "decimal" : undefined} autoComplete="off" step={type === "time" ? 60 : undefined}
      aria-invalid={issue?.section === active || undefined} aria-describedby={issue?.section === active ? errorId : undefined}
      onChange={(event) => change(event.target.value)} />
  </label>;
  return <Panel data-desktop-feed-filters aria-label={messages.text("feed.filters.form")} aria-busy={pending} noValidate
    onReset={(event) => { event.preventDefault(); resetAll(); }} onSubmit={(event) => {
      event.preventDefault();
      if (complete) { setIssue(null); onApply(complete); }
      else setIssue({ section: null, message: messages.text("feed.invalidQuery") });
    }}>
    <HeadingRow><Heading>{feedHeading(query, today, messages)}</Heading>
      <PeriodField><span>{messages.text("feed.filters.period")}</span><select name="when" aria-label={messages.text("feed.filters.period")}
        value={period} onChange={(event) => changePeriod(event.target.value)}>
        {periods.map((kind) => <option key={kind} value={kind}>{messages.text(`feed.date.${kind}`)}</option>)}
        <option value="custom">{messages.text("feed.filters.customDates")}</option>
      </select></PeriodField>
    </HeadingRow>
    <SearchField><SearchIcon /><VisuallyHidden>{messages.text("feed.filters.search")}</VisuallyHidden>
      <input type="search" name="q" maxLength={feedQueryRules.maximumSearchLength} value={draft.query.search}
        placeholder={messages.text("feed.search.placeholder")} aria-label={messages.text("feed.filters.search")}
        onChange={(event) => { const search = event.target.value; setDraft((current) => ({ ...current, query: { ...current.query, search } })); }} />
    </SearchField>
    <OptionsRow>{sections.map((section) => {
      const Icon = sectionIcons[section];
      return <SectionButton key={section} type="button" data-filter-section={section} data-active={modified[section]}
        aria-haspopup="dialog" aria-controls={`${prefix}-${section}`} aria-expanded={active === section}
        aria-describedby={`${prefix}-${section}-summary`} onClick={() => open(section)}>
        <Icon /><span data-section-label>{titles[section]}</span>{counts[section] > 0 && <Count aria-hidden="true">{messages.number(counts[section])}</Count>}<ChevronDownIcon />
      </SectionButton>;
    })}</OptionsRow>
    {sections.map((section) => <VisuallyHidden id={`${prefix}-${section}-summary`} key={section}>
      {messages.text("feed.filters.selectedCount", { count: messages.number(counts[section]) })}
    </VisuallyHidden>)}
    <ActionRow data-desktop-filter-actions>
      <div data-picks><PicksOnlyFilter locale={query.locale} checked={draft.query.picks === "only"} disabled={subscriberOnly && query.status !== "finished"}
        onChange={(checked) => setDraft((current) => ({ ...current, query: { ...current.query, picks: checked ? "only" : "all" } }))} /></div>
      <SortField><span>{messages.text("feed.sort.label")} ·</span><select name="sort" aria-label={messages.text("feed.sort.label")}
        value={`${draft.query.sort.by}-${draft.query.sort.direction}`} onChange={(event) => {
          const selected = feedSortOptions.find((sort) => `${sort.by}-${sort.direction}` === event.target.value);
          if (selected) setDraft((current) => ({ ...current, query: { ...current.query, sort: selected } }));
        }}>
        {feedSortOptions.map((sort) => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
          {messages.text(`feed.sort.compact.${sort.by}-${sort.direction}`)}
        </option>)}
      </select></SortField>
      <ActionButton type="reset" variant="quiet" aria-label={messages.text("feed.filters.clear")}><ResetIcon />{messages.text("feed.filters.reset")}</ActionButton>
      <ActionButton type="submit" disabled={!complete}><FilterIcon />{messages.text("feed.filters.applyPlain")}</ActionButton>
    </ActionRow>
    {error(null)}
    {sections.map((section) => <CriteriaDialog key={section} id={`${prefix}-${section}`} title={titles[section]} open={active === section}
      onCancel={cancel} onApply={() => save(section)} onReset={() => localReset(section)} resetLabel={messages.text("feed.filters.reset")}
      applyLabel={messages.text("feed.filters.done")} cancelLabel={messages.text("feed.filters.cancel")}
      closeLabel={messages.text("feed.filters.closeSection", { section: titles[section] })}>
      <DialogContent data-feed-dialog={section}>{error(section)}
        {active === section && <>
        {section === "dates" && <div data-fields>
          {input(messages.text("feed.date.from"), "from", draft.dates.from, (from) => setDraft((current) => ({ ...current, dates: { ...current.dates, from } })), "date")}
          {input(messages.text("feed.date.to"), "to", draft.dates.to, (to) => setDraft((current) => ({ ...current, dates: { ...current.dates, to } })), "date")}
          {input(messages.text("feed.time.from"), "timeFrom", draft.times.from, (from) => setDraft((current) => ({ ...current, times: { ...current.times, from: from || fullDayKickoffTime.from } })), "time")}
          {input(messages.text("feed.time.to"), "timeTo", draft.times.to, (to) => setDraft((current) => ({ ...current, times: { ...current.times, to: to || fullDayKickoffTime.to } })), "time")}
          <label data-input data-full><span>{messages.text("feed.filters.timezone")}</span><select name="tz" value={zone} onChange={(event) => {
            const zone = event.target.value; setDraft((current) => ({ ...current, query: { ...current.query, zone } }));
          }}>{[...new Set([publicPolicy.reportingTimeZone, deviceZone, zone])].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>}
        {section === "competitions" && <>
          <OptionChecklist key={`leagues-${dialogVersion}`} kind="leagues" options={leagueList} selected={draft.query.leagues} onChange={changeLeagues} messages={messages} />
          <OptionChecklist key={`countries-${dialogVersion}`} kind="countries" options={countryList} selected={draft.query.countries} onChange={changeCountries} messages={messages} />
        </>}
        {section === "limits" && <>
          <fieldset><legend>{messages.text("feed.filters.markets")}</legend>{publicPolicy.markets.map((family: MarketFamily) => <label data-choice key={family}>
            <input type="checkbox" name="market" value={family} checked={draft.query.markets.includes(family)}
              disabled={draft.query.markets.length === 1 && draft.query.markets.includes(family)}
              title={draft.query.markets.length === 1 ? messages.text("feed.filters.oneMarket") : undefined}
              onChange={() => setDraft((current) => ({ ...current, query: { ...current.query, markets: current.query.markets.includes(family)
                ? current.query.markets.filter((market) => market !== family) : [...current.query.markets, family] } }))} />{messages.text(`market.family.${family}`)}
          </label>)}</fieldset>
          <fieldset><legend>{messages.text("feed.filters.probabilityLabel")} %</legend><div data-fields>
            {input(messages.text("feed.filters.min"), "probMin", draft.probability.min, (min) => setDraft((current) => ({ ...current, probability: { ...current.probability, min } })))}
            {input(messages.text("feed.filters.max"), "probMax", draft.probability.max, (max) => setDraft((current) => ({ ...current, probability: { ...current.probability, max } })))}
          </div></fieldset>
          <fieldset disabled><legend>{messages.text("feed.filters.oddsUnavailable")}</legend><div data-fields>
            <label data-input><span>{messages.text("feed.filters.min")}</span><input placeholder={messages.text("feed.filters.any")} disabled /></label>
            <label data-input><span>{messages.text("feed.filters.max")}</span><input placeholder={messages.text("feed.filters.any")} disabled /></label>
          </div></fieldset>
        </>}
        </>}
      </DialogContent>
    </CriteriaDialog>)}
  </Panel>;
}
