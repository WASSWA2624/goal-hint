"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { FloatingField } from "@/components/ui/floating-field";
import { SearchBar } from "@/components/ui/search-bar";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { countryFlagAsset } from "@/domain/country-flag";
import { searchFilterOptions } from "@/domain/filter-option-search";
import { applyFeedDraft, parseProbabilityInputs, resetFeedFilters, selectFeedDates, selectFeedStatus } from "@/domain/feed-controls";
import { countryOptions, leagueOptions, type FilterOption } from "@/domain/feed-presentation";
import { defaultPagePicks, feedDatePresets, feedQueryHref, feedQueryRules, formatProbabilityValue, matchFeedPageDefaults, panelFilterCount, resolveFeedDates, serializeFeedQuery, type FeedQuery } from "@/domain/feed-query";
import { fullDayKickoffTime, isAnyKickoffTime, validKickoffTime } from "@/domain/kickoff-time";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { matchesHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { PicksOnlyFilter } from "./feed-controls";
import { FeedPeriodSelect, FeedStatusSelect } from "./feed-query-selects";
import { feedSortOptions } from "./feed-header";
import { OptionLogo } from "./filter-parts";
import { DialogContent, FilterError, Muted, Panel } from "./feed-filter-styles";

type Messages = ReturnType<typeof createMessages>;
type Draft = {
  query: FeedQuery;
  dates: { from: string; to: string };
  times: { from: string; to: string };
  probability: { min: string; max: string };
};
function fromQuery(query: FeedQuery, today: ReportingDate): Draft {
  const range = resolveFeedDates(query, today);
  return { query, dates: { from: range.startDate, to: range.endDate },
    times: { from: query.time?.from ?? fullDayKickoffTime.from, to: query.time?.to ?? fullDayKickoffTime.to },
    probability: { min: query.probability.min === 0 ? "" : formatProbabilityValue(query.probability.min),
      max: query.probability.max === 100 ? "" : formatProbabilityValue(query.probability.max) } };
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
    <SearchBar label={messages.text("feed.filters.findOption", { label })} data-option-search value={search}
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

/** One form, draft and dialog field tree serves every viewport. */
export function FeedFilters({ query, today, leagues, onApply, subscriberOnly = false, pending = false }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (next: FeedQuery) => void;
  subscriberOnly?: boolean; pending?: boolean;
}) {
  const messages = createMessages(query.locale), prefix = useId(), dispatch = useAppDispatch();
  const stored = useAppSelector((state) => state.feed.draft), applied = useAppSelector((state) => state.feed.query);
  const [draft, setDraft] = useState(() => fromQuery(feedQueryHref(applied, today) === feedQueryHref(query, today) ? stored : query, today));
  const [open, setOpen] = useState(false), [version, setVersion] = useState(0), [issue, setIssue] = useState<string | null>(null);
  const snapshot = useRef<Draft | null>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const deviceZone = useDeviceTimeZone(), zone = draft.query.zone ?? draft.query.time?.zone ?? deviceZone;
  const complete = useMemo(() => compile(draft, today, zone), [draft, today, zone]);
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  useEffect(() => { if (complete) dispatch(draftChanged(complete)); }, [complete, dispatch]);
  useEffect(() => { if (issue) errorRef.current?.focus(); }, [issue]);
  const leagueList = useMemo(() => leagueOptions(leagues, messages.text("match.competitionUnknown")), [leagues, messages]);
  const countryList = useMemo(() => countryOptions(leagues), [leagues]);
  const changeLeagues = useCallback((values: string[]) => setDraft((current) => ({ ...current, query: { ...current.query, leagues: values } })), []);
  const changeCountries = useCallback((values: string[]) => setDraft((current) => ({ ...current, query: { ...current.query, countries: values } })), []);
  const currentRange = resolveFeedDates(draft.query, today);
  const period = (feedDatePresets as readonly string[]).includes(draft.query.dates.kind)
    && draft.dates.from === currentRange.startDate && draft.dates.to === currentRange.endDate ? draft.query.dates.kind : "custom";
  const count = panelFilterCount(query) + Number(query.status !== "all") + Number(!!query.result)
    + Number(query.dates.kind !== matchFeedPageDefaults.dates.kind)
    + Number(query.picks !== defaultPagePicks(query.status, subscriberOnly))
    + Number(query.sort.by !== matchFeedPageDefaults.sort.by || query.sort.direction !== matchFeedPageDefaults.sort.direction);
  const locked = subscriberOnly && draft.query.status !== "finished", live = draft.query.status === "live";
  const errorId = `${prefix}-error`;
  function cancel() {
    if (snapshot.current) setDraft(snapshot.current);
    snapshot.current = null; setIssue(null); setOpen(false);
  }
  function apply() {
    if (!complete) { setIssue(messages.text("feed.invalidQuery")); return; }
    snapshot.current = null; setIssue(null); setOpen(false); onApply(complete);
  }
  function reset() {
    setDraft(fromQuery(resetFeedFilters(draft.query, subscriberOnly), today));
    setIssue(null); setVersion((value) => value + 1);
  }
  const input = (label: string, name: string | undefined, value: string, change: (value: string) => void, type = "text", disabled = false) =>
    <FloatingField label={label}><input type={type} name={name} value={value} disabled={disabled}
      placeholder={messages.text("feed.filters.any")} inputMode={type === "text" ? "decimal" : undefined} autoComplete="off"
      step={type === "time" ? 60 : undefined} aria-invalid={!!issue || undefined} aria-describedby={issue ? errorId : undefined}
      onChange={(event) => change(event.target.value)} /></FloatingField>;
  // Retain native GET navigation. Actual fields own their names; hidden values preserve the remaining query choices.
  const native = useMemo(() => {
    const parameters = serializeFeedQuery({ ...query, search: "", page: 1 }, today);
    for (const key of ["q", "date", "from", "to", "when", "timeFrom", "timeTo", "tz", "status", "result", "league", "country", "market"]) parameters.delete(key);
    if (query.result) parameters.set("status", query.status);
    parameters.set("picks", query.picks);
    parameters.set("sort", query.sort.by); parameters.set("dir", query.sort.direction);
    return [...parameters];
  }, [query, today]);
  return <Panel data-feed-filters action={matchesHref(query.locale)} method="get" aria-label={messages.text("feed.filters.form")} aria-busy={pending}
    onReset={(event) => { event.preventDefault(); reset(); }} onSubmit={(event) => { event.preventDefault(); apply(); }}>
    {native.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <SearchBar name="q" maxLength={feedQueryRules.maximumSearchLength} value={draft.query.search} autoComplete="off"
      label={messages.text("feed.filters.search")} submitLabel={messages.text("feed.search.submit")}
      filters={{ label: messages.text("feed.filters.toggle"), accessibleLabel: count ? messages.plural("feed.filters.toggleCount", count) : messages.text("feed.filters.toggle"),
        count, dialogId: `${prefix}-filters`, open, onOpen: () => { snapshot.current = draft; setIssue(null); setOpen(true); } }}
      onChange={(event) => { const search = event.target.value; setDraft((current) => ({ ...current, query: { ...current.query, search } })); }} />
    <AdvancedFilterDialog id={`${prefix}-filters`} open={open} locale={query.locale} onCancel={cancel}
      closeLabel={messages.text("feed.filters.close")} onApply={apply} onReset={reset} applyDisabled={!complete}>
      <DialogContent data-feed-dialog>
        {!complete && <FilterError id={errorId} ref={errorRef}>{issue ?? messages.text("feed.invalidQuery")}</FilterError>}
        <fieldset><legend>{messages.text("feed.filters.matchDateTime")}</legend><div data-fields>
          <FeedStatusSelect name="status" locale={query.locale} value={draft.query.status} result={draft.query.result}
            onResultChange={(result) => setDraft((current) => ({ ...current, query: { ...current.query, result, page: 1 } }))}
            onChange={(status) => { setDraft((current) => {
              const next = fromQuery(selectFeedStatus(current.query, status, today), today);
              return { ...current, query: next.query, dates: next.dates, times: next.times };
            }); setIssue(null); }} />
          <FeedPeriodSelect name="period" locale={query.locale} value={period} disabled={live} onChange={(value) => {
            if (value === "custom") { setDraft((current) => ({ ...current, query: { ...current.query, dates: { kind: "range", from: currentRange.startDate, to: currentRange.endDate } } })); return; }
            const kind = feedDatePresets.find((preset) => preset === value);
            if (kind) setDraft((current) => {
              const next = selectFeedDates(current.query, { kind }, today), range = resolveFeedDates(next, today);
              return { ...current, query: next, dates: { from: range.startDate, to: range.endDate } };
            });
          }} />
          {input(messages.text("feed.date.from"), "from", draft.dates.from, (from) => setDraft((current) => ({ ...current, dates: { ...current.dates, from } })), "date", live)}
          {input(messages.text("feed.date.to"), "to", draft.dates.to, (to) => setDraft((current) => ({ ...current, dates: { ...current.dates, to } })), "date", live)}
          {input(messages.text("feed.time.from"), "timeFrom", draft.times.from, (from) => setDraft((current) => ({ ...current, times: { ...current.times, from: from || fullDayKickoffTime.from } })), "time", live)}
          {input(messages.text("feed.time.to"), "timeTo", draft.times.to, (to) => setDraft((current) => ({ ...current, times: { ...current.times, to: to || fullDayKickoffTime.to } })), "time", live)}
          <FloatingField data-full label={messages.text("feed.filters.timezone")}><select name="tz" value={zone} onChange={(event) => {
            const zone = event.target.value; setDraft((current) => ({ ...current, query: { ...current.query, zone } }));
          }}>{[...new Set([publicPolicy.reportingTimeZone, deviceZone, zone])].map((value) => <option key={value} value={value}>{value}</option>)}</select></FloatingField>
        </div>{live && <Muted data-help>{messages.text("feed.filters.liveToday")}</Muted>}</fieldset>
        <fieldset><legend>{messages.text("feed.sort.label")}</legend><div data-fields>
          <FloatingField data-full label={messages.text("feed.sort.label")}><select value={`${draft.query.sort.by}-${draft.query.sort.direction}`} onChange={(event) => {
            const sort = feedSortOptions.find((value) => `${value.by}-${value.direction}` === event.target.value);
            if (sort) setDraft((current) => ({ ...current, query: { ...current.query, sort } }));
          }}>{feedSortOptions.map((sort) => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
            {messages.text(`feed.sort.${sort.by}-${sort.direction}`)}
          </option>)}</select></FloatingField>
        </div><PicksOnlyFilter locale={query.locale} checked={draft.query.picks === "only"} disabled={locked}
          onChange={(checked) => setDraft((current) => ({ ...current, query: { ...current.query, picks: checked ? "only" : "all" } }))} /></fieldset>
        <fieldset><legend>{messages.text("feed.filters.markets")}</legend>{publicPolicy.markets.map((family) => {
          const selected = draft.query.markets.includes(family), last = selected && draft.query.markets.length === 1;
          return <label data-choice key={family}>
            {last && <input type="hidden" name="market" value={family} />}
            <input type="checkbox" name="market" value={family} checked={selected} disabled={last}
              title={last ? messages.text("feed.filters.oneMarket") : undefined}
              onChange={() => setDraft((current) => ({ ...current, query: { ...current.query, markets: selected
                ? current.query.markets.filter((market) => market !== family) : [...current.query.markets, family] } }))} />{messages.text(`market.family.${family}`)}
          </label>;
        })}</fieldset>
        <OptionChecklist key={`leagues-${version}`} kind="leagues" options={leagueList} selected={draft.query.leagues} onChange={changeLeagues} messages={messages} />
        <OptionChecklist key={`countries-${version}`} kind="countries" options={countryList} selected={draft.query.countries} onChange={changeCountries} messages={messages} />
        <fieldset disabled={locked}><legend>{messages.text("feed.filters.probabilityLabel")} %</legend><div data-fields>
          {input(messages.text("feed.filters.min"), undefined, draft.probability.min, (min) => setDraft((current) => ({ ...current, probability: { ...current.probability, min } })))}
          {input(messages.text("feed.filters.max"), undefined, draft.probability.max, (max) => setDraft((current) => ({ ...current, probability: { ...current.probability, max } })))}
        </div><Muted data-help>{messages.text("feed.filters.probabilityExplanation")}</Muted></fieldset>
        <fieldset disabled><legend>{messages.text("feed.filters.oddsUnavailable")}</legend><div data-fields>
          <FloatingField label={messages.text("feed.filters.min")}><input placeholder={messages.text("feed.filters.any")} disabled /></FloatingField>
          <FloatingField label={messages.text("feed.filters.max")}><input placeholder={messages.text("feed.filters.any")} disabled /></FloatingField>
        </div></fieldset>
      </DialogContent>
    </AdvancedFilterDialog>
  </Panel>;
}
