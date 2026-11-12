"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FilterDateTimeRow, FilterDialogContent, FilterDialogSection, FilterFieldRow, FiltersDialog, FilterSection } from "@/components/ui/advanced-filter-dialog";
import { SelectInput } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import { FloatingField } from "@/components/ui/floating-field";
import { MarketFilterControl, MarketFilterDialog } from "@/components/ui/market-filter-dialog";
import { SearchBar } from "@/components/ui/search-bar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UnavailableField } from "@/components/ui/unavailable-field";
import { utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { getDateInTimeZone } from "@/domain/device-calendar";
import { resetFeedFilters, selectFeedStatus } from "@/domain/feed-controls";
import { compileFeedFilterDraft, feedFilterDraft, feedFilterDraftIssues, type FeedFilterDraft } from "@/domain/feed-filter-draft";
import { countryOptions, leagueOptions } from "@/domain/feed-presentation";
import { defaultPageSort, feedQueryRules, feedSortLabelKey, matchFeedPageDefaults, panelFilterCount, serializeFeedQuery, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { matchesHref } from "@/domain/navigation";
import { formatOddsHundredths, oddsRules } from "@/domain/odds";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch } from "@/state/hooks";
import { PicksOnlyFilter } from "./feed-controls";
import { FeedMarketFields, feedMarketLabels, type FeedMarketDraft } from "./feed-market-filters";
import { FeedStatusSelect } from "./feed-query-selects";
import { feedSortOptions } from "./feed-header";
import { OptionLogo } from "./filter-parts";
import { DialogContent, Muted, Panel } from "./feed-filter-styles";

/** One applied draft and shared field tree serve every viewport. */
export function FeedFilters({ query, today, leagues, onApply, searchText, onSearchChange, onSearchSubmit, subscriberOnly = false, pending = false }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (next: FeedQuery) => void;
  searchText: string; onSearchChange: (text: string, composing: boolean) => void; onSearchSubmit: (text: string) => void;
  subscriberOnly?: boolean; pending?: boolean;
}) {
  const messages = createMessages(query.locale), prefix = useId(), dispatch = useAppDispatch();
  const deviceZone = useDeviceTimeZone();
  const [draft, setDraft] = useState(() => feedFilterDraft(query, today, deviceZone));
  const [open, setOpen] = useState(false);
  const [marketDraft, setMarketDraft] = useState<FeedMarketDraft | null>(null);
  const marketsId = `${prefix}-markets`;
  const [lastDate, setLastDate] = useState<"from" | "to">("to"), [lastProbability, setLastProbability] = useState<"min" | "max">("max");
  const [probabilityFocus, setProbabilityFocus] = useState<"min" | "max" | null>(null);
  const [lastOdds, setLastOdds] = useState<"min" | "max">("max"), [oddsFocus, setOddsFocus] = useState<"min" | "max" | null>(null);
  const snapshot = useRef<FeedFilterDraft | null>(null), form = useRef<HTMLFormElement>(null), composing = useRef(false);
  const locked = subscriberOnly && draft.query.status !== "finished", live = draft.query.status === "live";
  const oddsEnabled = publicPolicy.features.providerOdds && !locked;
  const complete = useMemo(() => compileFeedFilterDraft(draft, today, oddsEnabled), [draft, today, oddsEnabled]);
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  useEffect(() => { if (complete) dispatch(draftChanged(complete)); }, [complete, dispatch]);
  if (draft.zone !== deviceZone) setDraft({ ...feedFilterDraft(complete ?? draft.query, today, deviceZone), probability: draft.probability, odds: draft.odds });
  const leagueList = useMemo(() => leagueOptions(leagues, createMessages(query.locale).text("match.competitionUnknown")), [leagues, query.locale]);
  const countryList = useMemo(() => countryOptions(leagues), [leagues]);
  const defaultSort = defaultPageSort(query.dates);
  const count = panelFilterCount(query) + Number(query.status !== "all") + Number(!!query.result)
    + Number(query.dates.kind !== matchFeedPageDefaults.dates.kind)
    + Number(query.picks !== matchFeedPageDefaults.picks)
    + Number(query.sort.by !== defaultSort.by || query.sort.direction !== defaultSort.direction);
  const marketSummary = feedMarketLabels(messages, draft.query).join(", ") || messages.text("feed.filters.any");
  const issues = feedFilterDraftIssues(draft);
  const dateError = issues.range === "order" ? messages.text(lastDate === "from" ? "feed.filters.fromAfterTo" : "feed.filters.toBeforeFrom")
    : issues.range === "maximum" ? messages.text("feed.filters.rangeLimit", { days: messages.number(feedQueryRules.maximumDays) }) : undefined;
  function probabilityError(field: "min" | "max") {
    if (field === "min" ? issues.minInvalid : issues.maxInvalid) {
      if (probabilityFocus === field && /^\d*\.$/u.test(draft.probability[field])) return undefined;
      return messages.text("feed.filters.invalidProbability");
    }
    return issues.probabilityOrder && lastProbability === field ? messages.text(field === "min" ? "feed.filters.minAboveMax" : "feed.filters.maxBelowMin") : undefined;
  }
  function openFilters() {
    snapshot.current = draft;
    setDraft(feedFilterDraft({ ...query, search: searchText }, today, deviceZone));
    setOpen(true);
  }
  function cancel() {
    if (snapshot.current) setDraft(snapshot.current);
    snapshot.current = null; setMarketDraft(null); setOpen(false);
  }
  function apply() {
    const valid = form.current?.checkValidity();
    if (!complete || !valid) return;
    snapshot.current = null; setOpen(false); onApply(complete);
  }
  function reset() {
    const day = getDateInTimeZone(utcInstantFromEpochMilliseconds(Date.now()), deviceZone);
    setMarketDraft(null);
    setDraft(feedFilterDraft(resetFeedFilters({ ...draft.query, zone: deviceZone }, !subscriberOnly), day, deviceZone));
  }
  const probabilityInput = (field: "min" | "max") => <FloatingField label={messages.text(field === "min" ? "filters.minimum" : "filters.maximum")}
    error={probabilityError(field)}><input value={draft.probability[field]} inputMode="decimal" autoComplete="off"
      aria-label={messages.text(field === "min" ? "feed.filters.minProbability" : "feed.filters.maxProbability")}
      onFocus={() => setProbabilityFocus(field)} onBlur={() => setProbabilityFocus(null)}
      onChange={event => { const value = event.target.value; setLastProbability(field); setDraft(current => ({ ...current, probabilityEdited: true, probability: { ...current.probability, [field]: value } })); }} /></FloatingField>;
  function oddsInput(field: "min" | "max") {
    const label = messages.text(field === "min" ? "filters.minimum" : "filters.maximum");
    const accessibleLabel = messages.text(field === "min" ? "feed.filters.minOdds" : "feed.filters.maxOdds");
    if (!oddsEnabled) return <UnavailableField label={label} accessibleLabel={accessibleLabel}
      reason={messages.text(publicPolicy.features.providerOdds ? "feed.filters.oddsLocked" : "feed.filters.oddsUnavailable")} />;
    const invalid = field === "min" ? issues.oddsMinInvalid : issues.oddsMaxInvalid;
    const typingDecimal = oddsFocus === field && /^\d*\.$/u.test(draft.odds[field]);
    const error = invalid && !typingDecimal ? messages.text("feed.filters.invalidOdds", {
      min: formatOddsHundredths(oddsRules.minimumHundredths), max: formatOddsHundredths(oddsRules.maximumHundredths),
    }) : issues.oddsOrder && lastOdds === field ? messages.text("feed.filters.oddsOrder") : undefined;
    return <FloatingField label={label} error={error}><input value={draft.odds[field]} inputMode="decimal" autoComplete="off" aria-label={accessibleLabel}
      onFocus={() => setOddsFocus(field)} onBlur={() => setOddsFocus(null)}
      onChange={event => {
        const value = event.target.value;
        setLastOdds(field); setDraft(current => ({ ...current, odds: { ...current.odds, [field]: value } }));
      }} /></FloatingField>;
  }
  const native = useMemo(() => {
    const parameters = serializeFeedQuery({ ...(complete ?? query), search: "", page: 1 }, today);
    for (const key of ["q", "date", "from", "to", "when", "start", "end", "timeFrom", "timeTo", "tz", "status", "result", "league", "country", "market", "marketPick"]) parameters.delete(key);
    if (draft.query.result) parameters.set("status", draft.query.status);
    if (!parameters.has("prob")) parameters.set("prob", "0-100");
    parameters.set("picks", draft.query.picks);
    parameters.set("sort", draft.query.sort.by); parameters.set("dir", draft.query.sort.direction);
    return [...parameters];
  }, [complete, draft.query, query, today]);
  return <Panel ref={form} data-feed-filters action={matchesHref(query.locale)} method="get" aria-label={messages.text("feed.filters.form")} aria-busy={pending}
    onReset={event => { event.preventDefault(); reset(); }} onSubmit={event => {
      event.preventDefault();
      if (open) apply();
      else if (!composing.current) onSearchSubmit(searchText);
    }}>
    {native.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <input type="hidden" name="tz" value={draft.zone} />
    <SearchBar name="q" maxLength={feedQueryRules.maximumSearchLength} value={searchText} autoComplete="off"
      label={messages.text("feed.filters.search")} submitLabel={messages.text("feed.search.submit")}
      filters={{ label: messages.text("filters.title"), accessibleLabel: count ? messages.plural("filters.active", count) : messages.text("filters.title"),
        count, showLabel: true, dialogId: `${prefix}-filters`, open, onOpen: openFilters }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={event => { composing.current = false; onSearchChange(event.currentTarget.value, false); }}
      onChange={event => onSearchChange(event.currentTarget.value, composing.current)} />
    <FiltersDialog id={`${prefix}-filters`} open={open} locale={query.locale} onCancel={cancel}
      closeLabel={messages.text("filters.close")} onApply={apply} onReset={reset} applyDisabled={!complete || pending}>
      <DialogContent data-feed-dialog>
        <FilterDialogSection><FilterFieldRow data-fields data-status-sort-fields>
          <FeedStatusSelect name="status" locale={query.locale} value={draft.query.status} result={draft.query.result}
            onResultChange={result => setDraft(current => ({ ...current, query: { ...current.query, result, page: 1 } }))}
            onChange={status => { setDraft(current => {
              const compiled = compileFeedFilterDraft(current, today, oddsEnabled) ?? current.query;
              const base = status === "live" ? { ...compiled, interval: undefined, time: null, zone: deviceZone } : compiled;
              const day = getDateInTimeZone(utcInstantFromEpochMilliseconds(Date.now()), base.zone ?? deviceZone);
              const next = selectFeedStatus(base, status, day);
              return feedFilterDraft(subscriberOnly && status !== "finished" ? { ...next, odds: null, marketPicks: undefined } : next, day, deviceZone);
            }); }} />
          <SelectInput label={messages.text("feed.sort.label")} value={`${draft.query.sort.by}-${draft.query.sort.direction}`} onChange={event => {
            const sort = feedSortOptions.find(value => `${value.by}-${value.direction}` === event.currentTarget.value);
            if (sort) setDraft(current => ({ ...current, query: { ...current.query, sort } }));
          }}>{feedSortOptions.map(sort => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
            {messages.text(feedSortLabelKey(sort))}
          </option>)}</SelectInput>
        </FilterFieldRow></FilterDialogSection>
        <FilterDialogSection><FilterSection>
          <legend>{messages.text("filters.dateTimeWindow")}</legend>
          <FilterDateTimeRow data-date-time-fields>
            <DateTimeField mode="datetime" locale={query.locale} name="start" label={messages.text("feed.filters.from")} required value={draft.dateTimes.from}
              min="1000-01-01T00:00" error={lastDate === "from" ? dateError : undefined}
              onValueChange={from => { setLastDate("from"); setDraft(current => ({ ...current, dateTimes: { ...current.dateTimes, from } })); }} />
            <DateTimeField mode="datetime" locale={query.locale} name="end" label={messages.text("feed.filters.to")} required value={draft.dateTimes.to}
              min="1000-01-01T00:00" error={lastDate === "to" ? dateError : undefined}
              onValueChange={to => { setLastDate("to"); setDraft(current => ({ ...current, dateTimes: { ...current.dateTimes, to } })); }} />
          </FilterDateTimeRow>
          {live && <Muted data-help>{messages.text("feed.filters.liveToday")}</Muted>}
        </FilterSection></FilterDialogSection>
        <FilterDialogSection><FilterDialogContent data-location-fields>{(["leagues", "countries"] as const).map(kind => <SearchableSelect key={kind} label={messages.text(`feed.filters.${kind}`)} name={kind === "leagues" ? "league" : "country"}
          values={draft.query[kind]} options={(kind === "leagues" ? leagueList : countryList).map(option => ({ ...option, icon: <OptionLogo url={option.logoUrl} /> }))}
          maximum={kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries}
          allLabel={messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.allCountries")}
          searchLabel={messages.text("feed.filters.findOption", { label: messages.text(`feed.filters.${kind}`) })}
          emptyLabel={messages.text("feed.filters.noOptionMatches")}
          onValuesChange={values => setDraft(current => ({ ...current, query: { ...current.query, [kind]: values } }))} />)}</FilterDialogContent></FilterDialogSection>
        <FilterDialogSection><FilterSection disabled={locked} data-probability-fields>
          <legend>{messages.text("feed.filters.probabilityLabel")}</legend>
          <FilterFieldRow data-fields>{probabilityInput("min")}{probabilityInput("max")}</FilterFieldRow>
        </FilterSection></FilterDialogSection>
        <FilterDialogSection><FilterSection data-odds-fields>
          <legend>{messages.text("feed.filters.oddsLabel")}</legend>
          <FilterFieldRow data-fields>{oddsInput("min")}{oddsInput("max")}</FilterFieldRow>
        </FilterSection></FilterDialogSection>
        <FilterDialogSection>
          <PicksOnlyFilter locale={query.locale} checked={draft.query.picks === "only"} disabled={locked}
            onChange={checked => setDraft(current => ({ ...current, query: { ...current.query, picks: checked ? "only" : "all" } }))} />
        </FilterDialogSection>
        <FilterDialogSection>
          <MarketFilterControl dialogId={marketsId} open={marketDraft !== null} summary={marketSummary}
            onClick={() => setMarketDraft({ markets: draft.query.markets, marketPicks: draft.query.marketPicks })}>{messages.text("feed.filters.markets")}</MarketFilterControl>
          <MarketFilterDialog id={marketsId} locale={query.locale} open={marketDraft !== null} onCancel={() => setMarketDraft(null)}
            onApply={() => {
              if (marketDraft) setDraft(current => ({ ...current, query: { ...current.query,
                markets: marketDraft.markets, marketPicks: locked ? undefined : marketDraft.marketPicks } }));
              setMarketDraft(null);
            }}>
            {matches => <FeedMarketFields value={marketDraft ?? draft.query} locked={locked} messages={messages} matches={matches} onChange={setMarketDraft} />}
          </MarketFilterDialog>
        </FilterDialogSection>
      </DialogContent>
    </FiltersDialog>
  </Panel>;
}
