"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/components/analytics/tracker";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { ChartIcon, ChevronRightIcon, LockIcon, ResetIcon, SlipIcon, SlidersIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/feedback";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { PagePaginationSection } from "@/components/ui/pagination-styles";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { parseReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { getDateInTimeZone } from "@/domain/device-calendar";
import type { MarketFamily } from "@/domain/markets";
import { slipsHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { publicPolicy } from "@/domain/public-policy";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipInputFields,
  type SlipCriteria, type SlipInputs } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import { useDeviceTimeZone } from "@/i18n/use-messages";
import type { SlipBuildPageResult } from "@/domain/slip-page";
import { compareSlipDisplayProbability, slipPageSize } from "@/domain/slip-pagination";
import { SlipCard } from "./slip-card";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { allSlipMarketsAutomatic, commitNumericParameters, criteriaDraft, isDateTimeField, isNumericRange, renderSlipCriteriaFields,
  type BuilderIssue, type NumericRangeField, type SlipCriteriaIssue } from "./slip-criteria-fields";
import { slipNumberErrorMessage } from "./slip-numeric-input";
import { SavedSlipConfigurations } from "./saved-slip-configurations";
import { canonicalSlipConfigurationParameters, datedSlipConfiguration, slipConfigurationCriteria, slipConfigurationHref, slipConfigurationIdSchema, type SlipConfiguration } from "@/domain/slip-configurations";
import { UnlockPanel } from "@/components/members/prediction-unlock";
import { ActionControls, Actions, AdvancedCriteria, BuildActionLabel, BuildButton, BuildLink, BuilderCriteriaDialog,
  BuilderFeedback, BuilderHeader, BuilderOptions, BuilderPanel, ClearLink, CriteriaError, CriteriaForm, CriteriaOption, CriteriaOptions,
  CriteriaSummary, CriteriaTitle, CriteriaTrigger, FieldGroup, InlineCriteria, Note, Results, SlipHeading, SlipList, SlipStack } from "./slip-styles";

export type { SlipCriteriaIssue } from "./slip-criteria-fields";

export function SlipAccessRequired({ locale, showAccount = false, signedIn = false }: { locale: string; showAccount?: boolean; signedIn?: boolean }) {
  return <SlipStack><AppBrandBar locale={locale} showAccount={showAccount} />
    <UnlockPanel locale={locale} signedIn={signedIn} returnTo={slipsHref(locale)} guestView="login" />
  </SlipStack>;
}

type CriteriaGroup = "limits" | "kickoff" | "markets";
type BuilderDialog = "advanced" | "markets";
/** Responsive copies keep the action's existing desktop structure and stable dimensions. */
function SlipBuildActionLabel({ locale, restricted }: {
  locale: string; restricted: boolean;
}) {
  const messages = createMessages(locale);
  const build = messages.text("slips.build");
  return <BuildActionLabel>
    <span data-action-label="mobile">{restricted ? messages.text("paywall.unlock") : build}</span>
    <span data-action-label="desktop">{restricted ? messages.text("paywall.unlock") : build}</span>
  </BuildActionLabel>;
}
const groupFields = {
  limits: ["oddsMin", "oddsMax", "probMin", "probMax", "totalProbMin", "totalProbMax"],
  kickoff: ["dateFrom", "dateTo", "timeFrom", "timeTo"],
} as const;
const advancedFields = [...groupFields.limits, ...groupFields.kickoff];
const subscribeNever = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function currentDateInZone(zone: string) {
  return getDateInTimeZone(utcInstantFromEpochMilliseconds(Date.now()), zone);
}

function setExactKickoff(parameters: URLSearchParams, draft: SlipInputs, zone: string) {
  for (const field of groupFields.kickoff) parameters.delete(field);
  parameters.set("start", `${draft.dateFrom}T${draft.timeFrom}`);
  parameters.set("end", `${draft.dateTo}T${draft.timeTo}`);
  parameters.set("tz", zone);
}

function issueGroup(issue: BuilderIssue | null): CriteriaGroup | null {
  if (!issue) return null;
  if (groupFields.limits.some((field) => field === issue.field)) return "limits";
  if (groupFields.kickoff.some((field) => field === issue.field)) return "kickoff";
  return issue.field === "markets" || issue.field === "outcomes" ? "markets" : null;
}

function rangeValue(name: NumericRangeField, value: string | undefined, defaults: SlipCriteria) {
  const probability = name.startsWith("prob") || name.startsWith("totalProb");
  const bound = (defaults[name] ?? (name.endsWith("Min") ? 0 : probability ? 100 : Infinity))
    / (name === "totalMin" || name === "totalMax" || name.startsWith("odds") ? 100 : 1);
  return value === undefined || value === "" ? bound : Number(value);
}

type Props = Readonly<{
  locale: string; today: ReportingDate; criteria: SlipCriteria; result: SlipBuildPageResult | null;
  error?: SlipCriteriaIssue | null; initialInputs?: SlipInputs; initialTimeZone?: string; initialMarkets?: readonly MarketFamily[];
  initialOutcomes?: SlipCriteria["outcomes"];
  initialReuse?: boolean; showAccount?: boolean; subscriberOnly?: boolean; signedIn?: boolean;
  jointEstimates?: boolean;
  configurationId?: string | null; applyDefault?: boolean;
}>;

/** The native GET form and enhanced navigation use the same strict criteria parser. */
export function SlipBuilder({ locale, today, criteria, result: receivedResult, error: initialError = null, initialInputs = {}, initialTimeZone, initialMarkets, initialOutcomes, initialReuse, showAccount = false, subscriberOnly = false, signedIn = false, jointEstimates = false, configurationId = null, applyDefault = false }: Props) {
  const messages = createMessages(locale), router = useRouter(), prefix = useId();
  const [clearedResult, setClearedResult] = useState<SlipBuildPageResult | null>(null);
  const result = clearedResult === receivedResult ? null : receivedResult;
  const [pending, startTransition] = useTransition(), [error, setError] = useState<BuilderIssue | null>(initialError);
  const [pagination, setPagination] = useState({ result, page: 1 });
  if (pagination.result !== result) setPagination({ result, page: 1 });
  const desktop = useDesktopLayout();
  const deviceZone = useDeviceTimeZone();
  const recheckAccess = useCallback(() => { startTransition(() => router.refresh()); }, [router]);
  const enhanced = useSyncExternalStore(subscribeNever, clientReady, serverReady);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null), resultsRef = useRef<HTMLElement>(null);
  const savedFiltersTrigger = useRef<HTMLButtonElement>(null);
  const [savedFiltersOpenedAt, setSavedFiltersOpenedAt] = useState<number | null>(null);
  const savedFiltersOpen = savedFiltersOpenedAt !== null;
  const savedFiltersDay = savedFiltersOpenedAt === null ? today
    : getDateInTimeZone(utcInstantFromEpochMilliseconds(savedFiltersOpenedAt), deviceZone);
  const [selectedConfiguration, setSelectedConfiguration] = useState(configurationId);
  const savedFiltersId = `${prefix}-saved-filters`;
  const defaultAllowed = useRef(true);
  const canApplyDefault = useCallback(() => defaultAllowed.current, []);
  const markInteracted = useCallback(() => { defaultAllowed.current = false; }, []);
  const action = slipsHref(locale), errorId = `${prefix}-error`, formId = `${prefix}-form`;
  const resetCriteria = { ...defaultSlipCriteria(today), timeFrom: fullDayKickoffTime.from, timeTo: fullDayKickoffTime.to };
  const resetDraft = criteriaDraft(resetCriteria);
  const [draft, setDraft] = useState(() => criteriaDraft(criteria, initialInputs));
  const [kickoffZone, setKickoffZone] = useState(criteria.interval?.zone ?? initialTimeZone);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [selectedMarkets, setSelectedMarkets] = useState(initialMarkets ?? criteria.markets);
  const [outcomes, setOutcomes] = useState(initialOutcomes ?? criteria.outcomes ?? {});
  const [reuse, setReuse] = useState(initialReuse ?? criteria.reuse);
  const missingKickoff = groupFields.kickoff.find((name) => !draft[name]?.trim());
  const marketsId = `${prefix}-markets`, advancedId = `${prefix}-advanced`;
  const currentParameters = useMemo(() => {
    if (!signedIn || missingKickoff) return null;
    try {
      const parameters = new URLSearchParams();
      for (const field of slipInputFields) parameters.set(field, draft[field] ?? "");
      if (commitNumericParameters(parameters)) return null;
      if (kickoffZone || draft.dateFrom !== today || draft.dateTo !== today) setExactKickoff(parameters, draft, kickoffZone ?? publicPolicy.reportingTimeZone);
      parameters.set("markets", selectedMarkets.join(",")); parameters.set("reuse", reuse ? "1" : "0");
      for (const market of selectedMarkets) if (outcomes[market]?.length) parameters.set(`picks.${market}`, outcomes[market]!.join(","));
      return canonicalSlipConfigurationParameters(parameters.toString(), today);
    } catch { return null; }
  }, [signedIn, missingKickoff, draft, selectedMarkets, outcomes, reuse, today, kickoffZone]);
  const [dialogState, setDialogState] = useState<BuilderDialog | "mobile-error" | null>(() => {
    const group = issueGroup(initialError);
    return group === "markets" ? "markets" : group ? "mobile-error" : null;
  });
  const activeDialog = dialogState === "mobile-error" ? (desktop ? null : "advanced") : dialogState;
  const advancedInline = desktop && activeDialog !== "advanced";
  const snapshot = useRef<{ draft: SlipInputs; markets: typeof selectedMarkets; outcomes: typeof outcomes; reuse: boolean } | null>(
    dialogState ? { draft, markets: selectedMarkets, outcomes, reuse } : null);
  const clearAppliedConfiguration = useCallback(() => {
    setSelectedConfiguration(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("configuration");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const loadConfiguration = useCallback((configuration: SlipConfiguration) => {
    const day = currentDateInZone(deviceZone);
    let applied: SlipConfiguration, next: SlipCriteria;
    try {
      applied = datedSlipConfiguration(configuration, day, deviceZone);
      next = slipConfigurationCriteria(applied.parameters, day);
    } catch (error) {
      if (error instanceof SlipCriteriaError) return;
      throw error;
    }
    setKickoffZone(next.interval?.zone);
    setDraft(criteriaDraft(next)); setSelectedMarkets(next.markets); setOutcomes(next.outcomes ?? {}); setReuse(next.reuse);
    setError(null); setFeedbackKey(value => value + 1);
    snapshot.current = null; setDialogState(null); setSelectedConfiguration(configuration.id); setClearedResult(receivedResult);
    // Keep the management dialog open and replace the generation URL without a server build/read.
    window.history.replaceState(null, "", slipConfigurationHref(applied, locale, day));
  }, [deviceZone, locale, receivedResult]);
  const closeSavedFilters = useCallback(() => {
    setSavedFiltersOpenedAt(null);
    requestAnimationFrame(() => savedFiltersTrigger.current?.focus());
  }, []);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      if ("message" in error) formRef.current?.querySelector<HTMLInputElement>(`[data-slip-numeric-field="${error.field}"]`)?.focus();
      else errorRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [error, activeDialog]);
  function range(from: typeof slipInputFields[number], to: typeof slipInputFields[number], unit = "") {
    const lower = draft[from]?.trim(), upper = draft[to]?.trim(), any = messages.text("slips.any");
    if (!lower && !upper) return any;
    const minimum = lower ? `${lower}${unit}` : any, maximum = upper ? `${upper}${unit}` : any;
    return minimum === maximum ? minimum : `${minimum}–${maximum}`;
  }
  function dateSummary() {
    try {
      const from = parseReportingDate(draft.dateFrom || today), to = parseReportingDate(draft.dateTo || from);
      if (!kickoffZone && from === today && to === today) return messages.text("slips.today");
      return from === to ? messages.reportingDateShort(from) : `${messages.reportingDateShort(from)}–${messages.reportingDateShort(to)}`;
    } catch { return messages.text("slips.summary.checkDates"); }
  }
  const showJoint = jointEstimates || criteria.totalProbMin !== undefined || criteria.totalProbMax !== undefined
    || initialInputs.totalProbMin !== undefined || initialInputs.totalProbMax !== undefined || Boolean(draft.totalProbMin || draft.totalProbMax);
  const invalidMarkets = error?.field === "markets" || error?.field === "outcomes";
  const manualMarkets = selectedMarkets.filter((family) => outcomes[family]?.length).length;
  const allAutomatic = allSlipMarketsAutomatic(selectedMarkets, outcomes);
  const marketCountSummary = selectedMarkets.length === publicPolicy.markets.length
    ? messages.text("slips.summary.allMarkets", { count: messages.number(selectedMarkets.length) })
    : messages.plural("slips.marketCount", selectedMarkets.length);
  const marketsSummary = messages.text("slips.summary.markets", {
    markets: marketCountSummary,
    results: manualMarkets ? messages.text("slips.summary.chosenResults", { count: messages.number(manualMarkets) })
      : messages.text("slips.summary.automaticResults"),
  });
  const errorGroup = issueGroup(error);
  const marketsTitle = messages.text("slips.dialog.markets"), advancedTitle = messages.text("feed.filters.dialogTitle");
  const issueDialog = (group: CriteriaGroup | null) => group === "markets" ? "markets" : group && !advancedInline ? "advanced" : null;
  function changed(fields: readonly typeof slipInputFields[number][]) {
    return fields.some((name) => isNumericRange(name)
      ? rangeValue(name, draft[name], resetCriteria) !== rangeValue(name, undefined, resetCriteria) : draft[name] !== resetDraft[name]);
  }
  const marketsEdited = !allAutomatic || advancedInline && reuse;
  const advancedCount = Number(changed(["oddsMin", "oddsMax"])) + Number(changed(["probMin", "probMax"]))
    + Number(changed(["totalProbMin", "totalProbMax"])) + Number(changed(groupFields.kickoff)) + Number(reuse);
  function openDialog(group: BuilderDialog) {
    if (group === "advanced") setFeedbackKey((current) => current + 1);
    snapshot.current = { draft, markets: selectedMarkets, outcomes, reuse };
    setDialogState(group);
  }
  function restoreAdvanced(values: SlipInputs) {
    setDraft((current) => ({ ...current, ...Object.fromEntries(advancedFields.map((name) => [name, values[name]])) }));
  }
  function cancelDialog(group: BuilderDialog) {
    const previous = snapshot.current;
    if (group === "advanced") setFeedbackKey((current) => current + 1);
    if (previous) {
      if (group === "advanced") restoreAdvanced(previous.draft);
      else { setSelectedMarkets(previous.markets); setOutcomes(previous.outcomes); }
      setReuse(previous.reuse);
    }
    setError((current) => issueDialog(issueGroup(current)) === group ? null : current);
    snapshot.current = null; setDialogState(null);
  }
  function validateCriteria(parameters: URLSearchParams, requireKickoff: boolean): { criteria: SlipCriteria } | { issue: BuilderIssue } {
    if (requireKickoff && missingKickoff) {
      return { issue: { field: missingKickoff, code: missingKickoff.startsWith("time") ? "invalid-time-range" : "invalid-date-range" } };
    }
    const numeric = commitNumericParameters(parameters);
    if (numeric) return { issue: { field: numeric.field, message: slipNumberErrorMessage(messages, numeric.result) } };
    try {
      return { criteria: parseSlipCriteria(parameters, today) };
    } catch (issue) {
      if (!(issue instanceof SlipCriteriaError)) throw issue;
      return { issue: isNumericRange(issue.field) ? { field: issue.field, message: messages.text("slips.guard.range") }
        : { field: issue.field, code: issue.code } };
    }
  }
  function applyDialog(group: BuilderDialog) {
    const parameters = serializeSlipCriteria(resetCriteria);
    if (group === "advanced") {
      for (const name of advancedFields) parameters.set(name, draft[name] ?? "");
      if (kickoffZone) setExactKickoff(parameters, draft, kickoffZone);
    } else {
      parameters.delete("markets");
      selectedMarkets.forEach((market) => parameters.append("markets", market));
      for (const market of selectedMarkets) outcomes[market]?.forEach((value) => parameters.append(`picks.${market}`, value));
    }
    parameters.set("reuse", reuse ? "1" : "0"); parameters.set("build", "1");
    const validation = validateCriteria(parameters, group === "advanced");
    if ("issue" in validation) { setError(validation.issue); return; }
    setError((current) => issueDialog(issueGroup(current)) === group ? null : current);
    if (group === "advanced") setFeedbackKey((current) => current + 1);
    snapshot.current = null; setDialogState(null);
  }
  function reset() {
    setFeedbackKey((current) => current + 1);
    setKickoffZone(undefined);
    setDraft(resetDraft); setSelectedMarkets(resetCriteria.markets); setOutcomes(resetCriteria.outcomes ?? {}); setReuse(resetCriteria.reuse);
    setError(null); snapshot.current = null; setDialogState(null);
    setSelectedConfiguration(null);
    setClearedResult(receivedResult);
    if (window.location.search) startTransition(() => router.push(`${action}?${serializeSlipCriteria(resetCriteria)}`, { scroll: false }));
  }
  function resetDialog(group: BuilderDialog) {
    if (group === "advanced") {
      setFeedbackKey((current) => current + 1);
      const day = kickoffZone ? currentDateInZone(kickoffZone) : today;
      restoreAdvanced({ ...resetDraft, dateFrom: day, dateTo: day });
    } else { setSelectedMarkets(resetCriteria.markets); setOutcomes(resetCriteria.outcomes ?? {}); }
    if (group === "advanced" || advancedInline) setReuse(resetCriteria.reuse);
    setError((current) => issueDialog(issueGroup(current)) === group ? null : current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parameters = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string") parameters.append(key, value); });
    const configuration = parameters.get("configuration");
    parameters.delete("configuration");
    const validation = validateCriteria(parameters, true);
    if ("issue" in validation) {
      setError(validation.issue);
      const group = issueDialog(issueGroup(validation.issue));
      if (group) openDialog(group);
      else { snapshot.current = null; setDialogState(null); }
      return;
    }
    const next = serializeSlipCriteria(validation.criteria);
    setClearedResult(null);
    if (slipConfigurationIdSchema.safeParse(configuration).success) next.set("configuration", configuration!);
    next.set("build", "1"); setError(null); setFeedbackKey((current) => current + 1); trackEvent("slip_build");
    const href = `${action}?${next}`;
    startTransition(() => {
      if (`${window.location.pathname}${window.location.search}` === href) router.refresh();
      else router.push(href, { scroll: false });
    });
  }

  function updateField(name: typeof slipInputFields[number], value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setError((current) => current && (current.field === name
      || isDateTimeField(name) && current.field.toString().startsWith(name.startsWith("date") ? "date" : "time")
      || isNumericRange(name) && current.field.toString().replace(/(?:Min|Max)$/u, "") === name.replace(/(?:Min|Max)$/u, "")) ? null : current);
  }
  function errorMessage(group: CriteriaGroup | null) {
    return error && "code" in error && errorGroup === group ? <CriteriaError id={errorId} ref={errorRef} tabIndex={-1} role="alert">{messages.text(`slips.error.${error.code}`)}</CriteriaError> : null;
  }
  const data = result?.data, generated = result?.state === "generated" && data !== null && data !== undefined;
  const slips = data?.slips;
  const pageCount = Math.ceil((slips?.length ?? 0) / slipPageSize);
  const page = Math.min(pagination.page, Math.max(1, pageCount)), offset = (page - 1) * slipPageSize;
  const orderedSlips = useMemo(() => slips ? [...slips].sort(compareSlipDisplayProbability) : [], [slips]);
  const shownSlips = useMemo(() => orderedSlips.slice(offset, offset + slipPageSize), [orderedSlips, offset]);
  const emptyState = result?.state === "generated" ? "data-unavailable" : result?.state;
  const timeSummary = kickoffZone ? `${range("timeFrom", "timeTo")} ${kickoffZone.replaceAll("_", " ")}`
    : draft.timeFrom === fullDayKickoffTime.from && draft.timeTo === fullDayKickoffTime.to
    ? messages.text("slips.summary.allDay") : `${range("timeFrom", "timeTo")} EAT`;
  const accessRequired = <UnlockPanel locale={locale} signedIn={signedIn} returnTo={action} guestView="login" />;
  const { targets, limits: limitsFields, kickoff: kickoffFields, markets: marketFields, reuse: reuseField } = renderSlipCriteriaFields({
    locale, prefix, draft, resetDraft, error, errorId, feedbackKey, desktop, enhanced, showJoint, selectedMarkets, outcomes, reuse,
    ...(kickoffZone ? { timeZone: kickoffZone, interval: true } : {}),
    onFieldChange: updateField,
    onKickoffChange: (endpoint, day, minute) => {
      setDraft(current => ({ ...current, [`date${endpoint}`]: day, [`time${endpoint}`]: minute }));
      setError(current => issueGroup(current) === "kickoff" ? null : current);
    },
    onMarketToggle: family => {
      setSelectedMarkets(current => current.includes(family) ? current.filter(value => value !== family) : [...current, family]);
      setOutcomes(current => { const next = { ...current }; delete next[family]; return next; });
    },
    onOutcomesChange: (family, values) => setOutcomes(current => ({ ...current, [family]: values })),
    onAutomaticMarkets: () => { setSelectedMarkets(resetCriteria.markets); setOutcomes({}); },
    onReuseChange: setReuse,
    reuseInMarkets: advancedInline,
    resetKickoffOnFeedback: !advancedInline,
  });
  const kickoffContents = <>{kickoffFields}{errorMessage("kickoff")}</>;
  const savedFiltersButton = signedIn && <CriteriaTrigger ref={savedFiltersTrigger} type="button" variant="secondary" data-saved-filters-trigger
    aria-haspopup="dialog" aria-expanded={savedFiltersOpen} aria-controls={savedFiltersId} disabled={pending || !enhanced}
    onClick={() => setSavedFiltersOpenedAt(Date.now())}><SlidersIcon />{messages.text("slips.customFilters")}</CriteriaTrigger>;
  const dialogLabels = { resetLabel: messages.text("slips.reset"), applyLabel: messages.text("slips.dialog.apply"), cancelLabel: messages.text("slips.dialog.cancel") };

  return <SlipStack data-slip-builder-page aria-busy={pending} onInputCapture={markInteracted} onClickCapture={markInteracted} onKeyDownCapture={markInteracted}>
    <AppBrandBar locale={locale} showAccount={showAccount} />
    <BuilderHeader>
      <SlipHeading>{messages.text("slips.title")}</SlipHeading>
    </BuilderHeader>
    {signedIn && <SavedSlipConfigurations id={savedFiltersId} locale={locale} today={savedFiltersDay} timeZone={deviceZone} currentParameters={currentParameters} appliedId={selectedConfiguration}
      open={savedFiltersOpen} onClose={closeSavedFilters} onAppliedConfigurationRemoved={clearAppliedConfiguration}
      applyDefault={applyDefault} onLoad={loadConfiguration} pending={pending} canApplyDefault={canApplyDefault} jointEstimates={jointEstimates} />}
    <BuilderPanel data-slip-builder-toolbar aria-labelledby={`${prefix}-criteria`}>
      <VisuallyHidden as="h2" id={`${prefix}-criteria`}>{messages.text("slips.criteria")}</VisuallyHidden>
      <CriteriaForm id={formId} data-enhanced={enhanced} action={action} method="get" ref={formRef} onSubmit={submit} noValidate>
        <input type="hidden" name="build" value="1" />
        {selectedConfiguration && <input type="hidden" name="configuration" value={selectedConfiguration} />}
        {targets}
        {advancedInline && <>
          <InlineCriteria data-criteria-field="limits">
            <VisuallyHidden as="legend">{messages.text("slips.dialog.limits")}</VisuallyHidden>
            {limitsFields}
            {errorMessage("limits")}
          </InlineCriteria>
          <InlineCriteria data-criteria-field="kickoff">
            {kickoffContents}
          </InlineCriteria>
        </>}
        {!advancedInline && <BuilderCriteriaDialog id={advancedId} group="advanced" title={advancedTitle} open={activeDialog === "advanced"}
          {...dialogLabels} closeLabel={messages.text("slips.dialog.close", { section: advancedTitle })}
          onReset={() => resetDialog("advanced")} onCancel={() => cancelDialog("advanced")} onApply={() => applyDialog("advanced")}>
          <AdvancedCriteria>
            <FieldGroup data-criteria-field="limits">
              <VisuallyHidden as="legend">{messages.text("slips.dialog.limits")}</VisuallyHidden>
              {limitsFields}
              {errorMessage("limits")}
            </FieldGroup>
            <FieldGroup data-criteria-field="kickoff">
              {kickoffContents}
            </FieldGroup>
            {reuseField}
          </AdvancedCriteria>
        </BuilderCriteriaDialog>}
        <BuilderCriteriaDialog id={marketsId} group="markets" title={marketsTitle} open={activeDialog === "markets"}
          {...dialogLabels} closeLabel={messages.text("slips.dialog.close", { section: marketsTitle })}
          onReset={() => resetDialog("markets")} onCancel={() => cancelDialog("markets")} onApply={() => applyDialog("markets")}>
          {errorMessage("markets")}
          {marketFields}
        </BuilderCriteriaDialog>
        {errorMessage(null)}
        <BuilderOptions data-slip-builder-options>
        <CriteriaOptions data-slip-criteria-options hidden={!enhanced}>
          <CriteriaOption data-criteria-option="markets" data-toolbar-group="markets">
            <VisuallyHidden id={`${marketsId}-summary`}>{marketsSummary}</VisuallyHidden>
            <CriteriaTrigger type="button" variant="secondary" data-criteria-trigger="markets" data-edited={marketsEdited}
              aria-haspopup="dialog" aria-controls={marketsId} aria-expanded={activeDialog === "markets"}
              aria-describedby={`${marketsId}-summary`} aria-invalid={invalidMarkets || undefined}
              disabled={pending} onClick={() => openDialog("markets")}>
              <ChartIcon />{marketsTitle}
              {marketsEdited && selectedMarkets.length > 0 && <small data-criteria-count aria-hidden="true">{messages.number(selectedMarkets.length)}</small>}
            </CriteriaTrigger>
          </CriteriaOption>
          {!desktop && <CriteriaOption data-criteria-option="advanced" data-toolbar-group="advanced">
            <CriteriaTrigger type="button" variant="secondary" data-criteria-trigger="advanced" data-edited={advancedCount > 0}
              aria-haspopup="dialog" aria-controls={advancedId} aria-expanded={activeDialog === "advanced"}
              aria-invalid={issueDialog(errorGroup) === "advanced" || undefined}
              disabled={pending} onClick={() => openDialog("advanced")}>
              {advancedTitle}
              {advancedCount > 0 && <>
                <small data-criteria-count aria-hidden="true">{messages.number(advancedCount)}</small>
                <VisuallyHidden> {messages.plural("slips.activeFilterCount", advancedCount)}</VisuallyHidden>
              </>}
              <ChevronRightIcon data-dialog-arrow />
            </CriteriaTrigger>
          </CriteriaOption>}
          {!desktop && savedFiltersButton}
        </CriteriaOptions>
        <Actions data-criteria-actions data-toolbar-group="actions">
          <CriteriaTitle data-criteria-title>{messages.text("slips.toolbar.actions")}</CriteriaTitle>
          <ActionControls>
          {desktop && savedFiltersButton}
          <ClearLink href={action} variant="quiet" prefetch={false} onClick={(event) => { event.preventDefault(); reset(); }}><ResetIcon />{messages.text("slips.reset")}</ClearLink>
          {subscriberOnly ? <BuildLink data-slip-access-action href={subscriberHref(signedIn, action, "login")} prefetch={false}>
            <LockIcon /><SlipBuildActionLabel locale={locale} restricted />
          </BuildLink> : <BuildButton data-slip-access-action type="submit" disabled={pending}>
            <SlipIcon /><SlipBuildActionLabel locale={locale} restricted={false} />
          </BuildButton>}
          </ActionControls>
        </Actions>
        </BuilderOptions>
        <CriteriaSummary data-slip-criteria-summary>
          <span data-slip-summary-layout="mobile">{dateSummary()} · {timeSummary} · {messages.plural("slips.marketCount", selectedMarkets.length)} · {manualMarkets
            ? messages.text("slips.mobile.manual", { count: messages.number(manualMarkets) }) : messages.text("slips.autoShort")}</span>
          <span data-slip-summary-layout="desktop">
            <span><strong>{messages.text("slips.summary.marketsLabel")}:</strong> {marketCountSummary}</span>
            <span><strong>{messages.text("slips.summary.selectionLabel")}:</strong> {manualMarkets
              ? messages.text("slips.summary.chosenResults", { count: messages.number(manualMarkets) }) : messages.text("slips.automatic")}</span>
            <span>{messages.text(reuse ? "slips.reuseOn" : "slips.reuseOff")}</span>
          </span>
        </CriteriaSummary>
      </CriteriaForm>
    </BuilderPanel>
    <Results ref={resultsRef} data-slip-state={result?.state ?? "idle"} aria-busy={pending} aria-label={messages.text("slips.generated")}>
      {generated && <BuilderFeedback role="status" data-slip-build-feedback><p>{messages.plural(
        data.slips.length < criteria.slips ? "slips.generatedFewer" : "slips.generatedCount", data.slips.length,
        { requested: messages.number(criteria.slips) })}</p></BuilderFeedback>}
      {subscriberOnly || pending && !generated ? null : generated ? <>
        <SlipMatchRefreshProvider slips={shownSlips} enabled={!pending} onAccessRevoked={recheckAccess} accessFallback={accessRequired}
          {...(result.matchStates ? { initialStates: result.matchStates } : {})}>
        <SlipList data-slip-list>{shownSlips.map((slip, index) => {
          const estimatedProbability = data.jointProbabilities?.[slip.id];
          return <SlipCard key={slip.id} slip={slip} index={offset + index} locale={locale} {...(result.matchStates ? { matchStates: result.matchStates } : {})}
            publishedAt={result.asOf}
            shareSource={{ source: "builder", criteria: serializeSlipCriteria(criteria).toString(), slipId: slip.id }}
            {...(estimatedProbability !== undefined ? { estimatedProbability } : {})} />;
        })}</SlipList>
        </SlipMatchRefreshProvider>
        {pageCount > 1 && <Note>{messages.text("history.showing", { first: messages.number(offset + 1), last: messages.number(offset + shownSlips.length), total: messages.number(data.slips.length) })}</Note>}
        {pageCount > 1 && <PagePaginationSection>
          <NumberedPagination page={page} pages={pageCount} disabled={pending}
            labels={numberedPaginationLabels(messages, messages.text("slips.generated"))}
            onPage={(next) => { resultsRef.current?.scrollIntoView({ block: "start" }); setPagination({ result, page: next }); }} />
        </PagePaginationSection>}
      </> : <BuilderFeedback>{emptyState ? <EmptyState headingLevel={3} title={messages.text(`slips.state.${emptyState}.title`)}
        description={messages.text(`slips.state.${emptyState}.description`)} /> : <p>{messages.text("slips.emptyPrompt")}</p>}</BuilderFeedback>}
      {result?.searchLimited && <Note>{messages.text("slips.limited")}</Note>}
      {result?.partialCoverage && <Note>{messages.text("slips.partial")}</Note>}
      {result && <Note>{messages.text(desktop ? "slips.generatedAt" : "slips.asOf", { time: messages.reportingInstant(utcInstantFromEpochMilliseconds(result.asOf)) })}</Note>}
      {!result && !publicPolicy.features.providerOdds && <Note>{messages.text("slips.oddsNotice")}</Note>}
      <VisuallyHidden role="status" aria-live="polite">{pending ? messages.text("slips.building") : ""}</VisuallyHidden>
    </Results>
  </SlipStack>;
}
