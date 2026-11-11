"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AdvancedFilterDialog } from "@/components/ui/advanced-filter-dialog";
import { DateTimeField } from "@/components/ui/date-time-field";
import { FloatingField } from "@/components/ui/floating-field";
import { SearchBar } from "@/components/ui/search-bar";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UnavailableField } from "@/components/ui/unavailable-field";
import { ChevronDownIcon } from "@/components/ui/icons";
import { utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { getDateInTimeZone } from "@/domain/device-calendar";
import { resetFeedFilters, selectFeedStatus } from "@/domain/feed-controls";
import { compileFeedFilterDraft, feedFilterDraft, feedFilterDraftIssues, type FeedFilterDraft } from "@/domain/feed-filter-draft";
import { countryOptions, leagueOptions } from "@/domain/feed-presentation";
import { defaultPagePicks, feedQueryRules, matchFeedPageDefaults, panelFilterCount, serializeFeedQuery, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { matchesHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import { draftChanged, queryApplied } from "@/state/feed";
import { useAppDispatch } from "@/state/hooks";
import { PicksOnlyFilter } from "./feed-controls";
import { FeedStatusSelect } from "./feed-query-selects";
import { feedSortOptions } from "./feed-header";
import { OptionLogo } from "./filter-parts";
import { DialogContent, MarketsSection, Muted, Panel } from "./feed-filter-styles";

/** One applied draft and shared field tree serve every viewport. */
export function FeedFilters({ query, today, leagues, onApply, subscriberOnly = false, pending = false }: {
  query: FeedQuery; today: ReportingDate; leagues: MatchFeedResponse["leagues"]; onApply: (next: FeedQuery) => void;
  subscriberOnly?: boolean; pending?: boolean;
}) {
  const messages = createMessages(query.locale), prefix = useId(), dispatch = useAppDispatch();
  const deviceZone = useDeviceTimeZone();
  const [draft, setDraft] = useState(() => feedFilterDraft(query, today, deviceZone));
  const [open, setOpen] = useState(false), [marketsOpen, setMarketsOpen] = useState(true);
  const [lastDate, setLastDate] = useState<"from" | "to">("to"), [lastProbability, setLastProbability] = useState<"min" | "max">("max");
  const [probabilityFocus, setProbabilityFocus] = useState<"min" | "max" | null>(null);
  const snapshot = useRef<FeedFilterDraft | null>(null), form = useRef<HTMLFormElement>(null);
  const complete = useMemo(() => compileFeedFilterDraft(draft, today), [draft, today]);
  useEffect(() => { dispatch(queryApplied(query)); }, [dispatch, query]);
  useEffect(() => { if (complete) dispatch(draftChanged(complete)); }, [complete, dispatch]);
  if (draft.zone !== deviceZone) setDraft({ ...feedFilterDraft(compileFeedFilterDraft(draft, today) ?? draft.query, today, deviceZone), probability: draft.probability });
  const leagueList = useMemo(() => leagueOptions(leagues, createMessages(query.locale).text("match.competitionUnknown")), [leagues, query.locale]);
  const countryList = useMemo(() => countryOptions(leagues), [leagues]);
  const count = panelFilterCount(query) + Number(query.status !== "all") + Number(!!query.result)
    + Number(query.dates.kind !== matchFeedPageDefaults.dates.kind)
    + Number(query.picks !== defaultPagePicks(query.status, subscriberOnly, query.dates))
    + Number(query.sort.by !== matchFeedPageDefaults.sort.by || query.sort.direction !== matchFeedPageDefaults.sort.direction);
  const locked = subscriberOnly && draft.query.status !== "finished", live = draft.query.status === "live";
  const allMarkets = draft.query.markets.length === publicPolicy.markets.length;
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
    setDraft(feedFilterDraft({ ...query, search: draft.query.search }, today, deviceZone));
    setMarketsOpen(true); setOpen(true);
  }
  function cancel() {
    if (snapshot.current) setDraft(snapshot.current);
    snapshot.current = null; setOpen(false);
  }
  function apply() {
    const valid = form.current?.checkValidity();
    if (!complete || !valid) return;
    snapshot.current = null; setOpen(false); onApply(complete);
  }
  function reset() {
    const day = getDateInTimeZone(utcInstantFromEpochMilliseconds(Date.now()), deviceZone);
    setDraft(feedFilterDraft(resetFeedFilters({ ...draft.query, zone: deviceZone }, subscriberOnly), day, deviceZone));
    setMarketsOpen(true);
  }
  const probabilityInput = (field: "min" | "max") => <FloatingField label={messages.text(field === "min" ? "feed.filters.minProbability" : "feed.filters.maxProbability")}
    error={probabilityError(field)}><input value={draft.probability[field]} inputMode="decimal" autoComplete="off"
      onFocus={() => setProbabilityFocus(field)} onBlur={() => setProbabilityFocus(null)}
      onChange={event => { const value = event.target.value; setLastProbability(field); setDraft(current => ({ ...current, probability: { ...current.probability, [field]: value } })); }} /></FloatingField>;
  const native = useMemo(() => {
    const parameters = serializeFeedQuery({ ...(complete ?? query), search: "", page: 1 }, today);
    for (const key of ["q", "date", "from", "to", "when", "start", "end", "timeFrom", "timeTo", "tz", "status", "result", "league", "country", "market"]) parameters.delete(key);
    if (draft.query.result) parameters.set("status", draft.query.status);
    parameters.set("picks", draft.query.picks);
    parameters.set("sort", draft.query.sort.by); parameters.set("dir", draft.query.sort.direction);
    return [...parameters];
  }, [complete, draft.query, query, today]);
  return <Panel ref={form} data-feed-filters action={matchesHref(query.locale)} method="get" aria-label={messages.text("feed.filters.form")} aria-busy={pending}
    onReset={event => { event.preventDefault(); reset(); }} onSubmit={event => { event.preventDefault(); apply(); }}>
    {native.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <input type="hidden" name="tz" value={draft.zone} />
    <SearchBar name="q" maxLength={feedQueryRules.maximumSearchLength} value={draft.query.search} autoComplete="off"
      label={messages.text("feed.filters.search")} submitLabel={messages.text("feed.search.submit")}
      filters={{ label: messages.text("feed.filters.toggle"), accessibleLabel: count ? messages.plural("feed.filters.toggleCount", count) : messages.text("feed.filters.toggle"),
        count, dialogId: `${prefix}-filters`, open, onOpen: openFilters }}
      onChange={event => { const search = event.target.value; setDraft(current => ({ ...current, query: { ...current.query, search } })); }} />
    <AdvancedFilterDialog id={`${prefix}-filters`} open={open} locale={query.locale} onCancel={cancel}
      closeLabel={messages.text("feed.filters.close")} onApply={apply} onReset={reset} applyDisabled={!complete || pending}>
      <DialogContent data-feed-dialog>
        <div data-fields data-status-sort-fields>
          <FeedStatusSelect name="status" locale={query.locale} value={draft.query.status} result={draft.query.result}
            onResultChange={result => setDraft(current => ({ ...current, query: { ...current.query, result, page: 1 } }))}
            onChange={status => { setDraft(current => {
              const compiled = compileFeedFilterDraft(current, today) ?? current.query;
              const base = status === "live" ? { ...compiled, interval: undefined, time: null, zone: deviceZone } : compiled;
              const day = getDateInTimeZone(utcInstantFromEpochMilliseconds(Date.now()), base.zone ?? deviceZone);
              return feedFilterDraft(selectFeedStatus(base, status, day), day, deviceZone);
            }); }} />
          <FloatingField label={messages.text("feed.sort.label")}><select value={`${draft.query.sort.by}-${draft.query.sort.direction}`} onChange={event => {
            const sort = feedSortOptions.find(value => `${value.by}-${value.direction}` === event.target.value);
            if (sort) setDraft(current => ({ ...current, query: { ...current.query, sort } }));
          }}>{feedSortOptions.map(sort => <option key={`${sort.by}-${sort.direction}`} value={`${sort.by}-${sort.direction}`}>
            {messages.text(`feed.sort.${sort.by}-${sort.direction}`)}
          </option>)}</select></FloatingField>
        </div>
        <div>
          <div data-date-time-fields>
            <DateTimeField mode="datetime" locale={query.locale} name="start" label={messages.text("feed.filters.from")} required value={draft.dateTimes.from} disabled={live}
              min="1000-01-01T00:00" error={lastDate === "from" ? dateError : undefined}
              onValueChange={from => { setLastDate("from"); setDraft(current => ({ ...current, dateTimes: { ...current.dateTimes, from } })); }} />
            <DateTimeField mode="datetime" locale={query.locale} name="end" label={messages.text("feed.filters.to")} required value={draft.dateTimes.to} disabled={live}
              min="1000-01-01T00:00" error={lastDate === "to" ? dateError : undefined}
              onValueChange={to => { setLastDate("to"); setDraft(current => ({ ...current, dateTimes: { ...current.dateTimes, to } })); }} />
          </div>
          {live && <Muted data-help>{messages.text("feed.filters.liveToday")}</Muted>}
        </div>
        <div data-fields data-location-fields>{(["leagues", "countries"] as const).map(kind => <SearchableSelect key={kind} label={messages.text(`feed.filters.${kind}`)} name={kind === "leagues" ? "league" : "country"}
          values={draft.query[kind]} options={(kind === "leagues" ? leagueList : countryList).map(option => ({ ...option, icon: <OptionLogo url={option.logoUrl} /> }))}
          maximum={kind === "leagues" ? feedQueryRules.maximumLeagues : feedQueryRules.maximumCountries}
          allLabel={messages.text(kind === "leagues" ? "feed.filters.allLeagues" : "feed.filters.allCountries")}
          searchLabel={messages.text("feed.filters.findOption", { label: messages.text(`feed.filters.${kind}`) })}
          emptyLabel={messages.text("feed.filters.noOptionMatches")}
          onValuesChange={values => setDraft(current => ({ ...current, query: { ...current.query, [kind]: values } }))} />)}</div>
        <fieldset disabled={locked} aria-label={messages.text("feed.filters.probabilityLabel")} data-probability-fields><div data-fields>
          {probabilityInput("min")}{probabilityInput("max")}
        </div></fieldset>
        <fieldset aria-label={messages.text("feed.filters.oddsLabel")} data-odds-fields><div data-fields>
          <UnavailableField label={messages.text("feed.filters.minOdds")} reason={messages.text("feed.filters.oddsUnavailable")} />
          <UnavailableField label={messages.text("feed.filters.maxOdds")} reason={messages.text("feed.filters.oddsUnavailable")} />
        </div></fieldset>
        <PicksOnlyFilter locale={query.locale} checked={draft.query.picks === "only"} disabled={locked}
          onChange={checked => setDraft(current => ({ ...current, query: { ...current.query, picks: checked ? "only" : "all" } }))} />
        <MarketsSection data-market-section open={marketsOpen} onToggle={event => setMarketsOpen(event.currentTarget.open)}>
          <summary><span>{messages.text("feed.filters.markets")}</span><span>{allMarkets
            ? messages.text("feed.filters.any") : messages.text("feed.filters.selectedCount", { count: messages.number(draft.query.markets.length) })}</span><ChevronDownIcon aria-hidden="true" /></summary>
          <fieldset aria-label={messages.text("feed.filters.markets")} data-market-choices>
            <label data-choice data-full><input type="checkbox" checked={allMarkets}
              onChange={() => setDraft(current => ({ ...current, query: { ...current.query, markets: [...publicPolicy.markets] } }))} />{messages.text("feed.filters.any")}</label>
            {publicPolicy.markets.map(family => {
            const selected = draft.query.markets.includes(family), last = selected && draft.query.markets.length === 1;
            return <label data-choice key={family}>
              {last && <input type="hidden" name="market" value={family} />}
              <input type="checkbox" name="market" value={family} checked={selected} disabled={last}
                title={last ? messages.text("feed.filters.oneMarket") : undefined}
                onChange={() => setDraft(current => ({ ...current, query: { ...current.query, markets: selected
                  ? current.query.markets.filter(market => market !== family) : [...current.query.markets, family] } }))} />{messages.text(`market.family.${family}`)}
            </label>;
          })}</fieldset>
        </MarketsSection>
      </DialogContent>
    </AdvancedFilterDialog>
  </Panel>;
}
