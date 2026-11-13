"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/components/analytics/tracker";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { FilterDialogContent, FilterDialogSection, FiltersDialog, FilterSection } from "@/components/ui/advanced-filter-dialog";
import { ButtonLink } from "@/components/ui/controls";
import { FilterDialogTrigger } from "@/components/ui/filter-dialog-trigger";
import { LockIcon, ResetIcon, SlipIcon } from "@/components/ui/icons";
import { MarketFilterControl, MarketFilterDialog } from "@/components/ui/market-filter-dialog";
import { EmptyState } from "@/components/ui/feedback";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { PagePaginationSection } from "@/components/ui/pagination-styles";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
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
import { allSlipMarketsAutomatic, commitNumericParameters, criteriaDraft, isDateTimeField, isNumericRange, renderSlipCriteriaFields, slipMarketFilterSummary,
  type BuilderIssue, type NumericRangeField, type SlipCriteriaIssue } from "./slip-criteria-fields";
import { slipNumberErrorMessage } from "./slip-numeric-input";
import { SlipCriteriaSummary } from "./slip-criteria-summary";
import { SavedSlipConfigurations, type ConfigurationChoice } from "./saved-slip-configurations";
import { canonicalSlipConfigurationParameters, datedSlipConfiguration, slipConfigurationCriteria, slipConfigurationHref, slipConfigurationIdSchema, type SlipConfiguration } from "@/domain/slip-configurations";
import { UnlockPanel } from "@/components/members/prediction-unlock";
import { Actions, BuildActionLabel, BuildButton, BuildLink, BuilderFeedback, BuilderHeader, BuilderOptions, BuilderPanel, CriteriaError,
  CriteriaForm, CriteriaOptions, FieldGroup, Note, Results, SlipHeading, SlipList, SlipStack } from "./slip-styles";

export type { SlipCriteriaIssue } from "./slip-criteria-fields";

export function SlipAccessRequired({ locale, showAccount = false, signedIn = false }: { locale: string; showAccount?: boolean; signedIn?: boolean }) {
  return <SlipStack><AppBrandBar locale={locale} showAccount={showAccount} />
    <UnlockPanel locale={locale} signedIn={signedIn} returnTo={slipsHref(locale)} guestView="login" />
  </SlipStack>;
}

type CriteriaGroup = "targets" | "limits" | "kickoff" | "markets";
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
  targets: ["slips", "totalMin", "totalMax", "teamsMin", "teamsMax"],
  limits: ["oddsMin", "oddsMax", "probMin", "probMax", "totalProbMin", "totalProbMax"],
  kickoff: ["dateFrom", "dateTo", "timeFrom", "timeTo"],
} as const;
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
  if (groupFields.targets.some((field) => field === issue.field)) return "targets";
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
  providerOdds?: boolean;
  configurationId?: string | null; applyDefault?: boolean;
}>;

/** The native GET form and enhanced navigation use the same strict criteria parser. */
export function SlipBuilder({ locale, today, criteria, result: receivedResult, error: initialError = null, initialInputs = {}, initialTimeZone, initialMarkets,
  initialOutcomes, initialReuse, showAccount = false, subscriberOnly = false, signedIn = false, jointEstimates = false, configurationId = null,
  applyDefault = false, providerOdds = publicPolicy.features.providerOdds }: Props) {
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
  const [selectedConfiguration, setSelectedConfiguration] = useState<ConfigurationChoice | null>(() => configurationId ? { id: configurationId } : null);
  const [draftConfiguration, setDraftConfiguration] = useState(selectedConfiguration);
  const savedFiltersId = `${prefix}-saved-filters`;
  const defaultAllowed = useRef(true);
  const canApplyDefault = useCallback(() => defaultAllowed.current, []);
  const markInteracted = useCallback(() => { defaultAllowed.current = false; }, []);
  const action = slipsHref(locale), errorId = `${prefix}-error`, formId = `${prefix}-form`;
  const resetCriteria = { ...defaultSlipCriteria(today), timeFrom: fullDayKickoffTime.from, timeTo: fullDayKickoffTime.to };
  const resetDraft = criteriaDraft(resetCriteria);
  const [draft, setDraft] = useState(() => criteriaDraft(criteria, initialInputs));
  const [appliedCriteria, setAppliedCriteria] = useState(criteria);
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
      setExactKickoff(parameters, draft, kickoffZone ?? publicPolicy.reportingTimeZone);
      parameters.set("markets", selectedMarkets.join(",")); parameters.set("reuse", reuse ? "1" : "0");
      for (const market of selectedMarkets) if (outcomes[market]?.length) parameters.set(`picks.${market}`, outcomes[market]!.join(","));
      parameters.set("build", "1");
      const prepared = parseSlipCriteria(parameters, today);
      return canonicalSlipConfigurationParameters(serializeSlipCriteria(prepared).toString(), today);
    } catch { return null; }
  }, [signedIn, missingKickoff, draft, selectedMarkets, outcomes, reuse, today, kickoffZone]);
  const [activeDialog, setDialogState] = useState<BuilderDialog | null>(() => {
    const group = issueGroup(initialError);
    return group === "markets" ? "markets" : group ? "advanced" : null;
  });
  const marketsOpen = activeDialog === "markets";
  const snapshot = useRef<{ draft: SlipInputs; markets: typeof selectedMarkets; outcomes: typeof outcomes; reuse: boolean; kickoffZone: typeof kickoffZone } | null>(
    activeDialog ? { draft, markets: selectedMarkets, outcomes, reuse, kickoffZone } : null);
  const marketSnapshot = useRef<{ markets: typeof selectedMarkets; outcomes: typeof outcomes } | null>(
    marketsOpen ? { markets: selectedMarkets, outcomes } : null);
  const resetPending = useRef(false);
  const removeConfiguration = useCallback((id: string) => {
    setSelectedConfiguration(current => current?.id === id ? null : current);
    setDraftConfiguration(current => current?.id === id ? null : current);
    const url = new URL(window.location.href);
    if (url.searchParams.get("configuration") === id) {
      url.searchParams.delete("configuration");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  const updateConfigurationRevision = useCallback((id: string, previousRevision: number, revision: number) => {
    const update = (current: ConfigurationChoice | null) => current?.id === id && (current.revision ?? previousRevision) === previousRevision
      ? { id, revision } : current;
    setDraftConfiguration(update); setSelectedConfiguration(update);
  }, []);
  const loadConfiguration = useCallback((configuration: SlipConfiguration | null, applyImmediately = false) => {
    if (!configuration) { setDraftConfiguration(null); return true; }
    const day = currentDateInZone(deviceZone);
    let applied: SlipConfiguration, next: SlipCriteria;
    try {
      applied = datedSlipConfiguration(configuration, day, deviceZone);
      next = slipConfigurationCriteria(applied.parameters, day);
    } catch (error) {
      if (error instanceof SlipCriteriaError || error instanceof RangeError) return false;
      throw error;
    }
    const choice = { id: configuration.id, revision: configuration.revision };
    setKickoffZone(next.interval?.zone);
    setDraft(criteriaDraft(next)); setSelectedMarkets(next.markets); setOutcomes(next.outcomes ?? {}); setReuse(next.reuse);
    setDraftConfiguration(choice);
    setError(null); setFeedbackKey(value => value + 1);
    marketSnapshot.current = null; resetPending.current = false;
    if (applyImmediately) {
      setAppliedCriteria(next); setSelectedConfiguration(choice); setClearedResult(receivedResult);
      window.history.replaceState(null, "", slipConfigurationHref(applied, locale, day));
    }
    return true;
  }, [deviceZone, locale, receivedResult]);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      if ("message" in error) formRef.current?.querySelector<HTMLInputElement>(`[data-slip-numeric-field="${error.field}"]`)?.focus();
      else errorRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [error, activeDialog]);
  const showJoint = jointEstimates || criteria.totalProbMin !== undefined || criteria.totalProbMax !== undefined
    || initialInputs.totalProbMin !== undefined || initialInputs.totalProbMax !== undefined || Boolean(draft.totalProbMin || draft.totalProbMax);
  const invalidMarkets = error?.field === "markets" || error?.field === "outcomes";
  const allAutomatic = allSlipMarketsAutomatic(selectedMarkets, outcomes);
  const marketsSummary = slipMarketFilterSummary(messages, selectedMarkets, outcomes);
  const errorGroup = issueGroup(error);
  const marketsTitle = messages.text("slips.dialog.markets"), filtersTitle = messages.text("filters.title");
  const issueDialog = (group: CriteriaGroup | null) => group === "markets" ? "markets" : group ? "advanced" : null;
  function changed(fields: readonly typeof slipInputFields[number][]) {
    return fields.some((name) => isNumericRange(name)
      ? rangeValue(name, draft[name], resetCriteria) !== rangeValue(name, undefined, resetCriteria) : draft[name] !== resetDraft[name]);
  }
  const advancedCount = Number(changed(["oddsMin", "oddsMax"])) + Number(changed(["probMin", "probMax"]))
    + Number(changed(["totalProbMin", "totalProbMax"])) + Number(changed(groupFields.kickoff)) + Number(reuse) + Number(!allAutomatic)
    + Number(changed(["slips"])) + Number(changed(["totalMin", "totalMax"])) + Number(changed(["teamsMin", "teamsMax"]));
  function openDialog(group: BuilderDialog) {
    if (activeDialog === null) {
      setFeedbackKey((current) => current + 1);
      snapshot.current = { draft, markets: selectedMarkets, outcomes, reuse, kickoffZone };
      setDraftConfiguration(selectedConfiguration);
    }
    if (group === "markets") marketSnapshot.current = { markets: selectedMarkets, outcomes };
    setDialogState(group);
  }
  function clearDialogIssue(dialog: BuilderDialog) {
    setError(current => {
      const group = issueGroup(current);
      return group && (dialog === "advanced" || group === "markets") ? null : current;
    });
  }
  function cancelDialog(group: BuilderDialog) {
    const previous = group === "advanced" ? snapshot.current : marketSnapshot.current;
    if (previous) { setSelectedMarkets(previous.markets); setOutcomes(previous.outcomes); }
    if (group === "advanced") {
      setFeedbackKey((current) => current + 1);
      if (snapshot.current) {
        setDraft(snapshot.current.draft); setReuse(snapshot.current.reuse); setKickoffZone(snapshot.current.kickoffZone);
      }
      setDraftConfiguration(selectedConfiguration);
      snapshot.current = null;
      resetPending.current = false;
    }
    clearDialogIssue(group);
    marketSnapshot.current = null;
    setDialogState(group === "advanced" ? null : "advanced");
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
      for (const name of slipInputFields) parameters.set(name, draft[name] ?? "");
      if (kickoffZone) setExactKickoff(parameters, draft, kickoffZone);
    }
    parameters.delete("markets");
    selectedMarkets.forEach((market) => parameters.append("markets", market));
    for (const market of selectedMarkets) outcomes[market]?.forEach((value) => parameters.append(`picks.${market}`, value));
    parameters.set("reuse", reuse ? "1" : "0"); parameters.set("build", "1");
    const validation = validateCriteria(parameters, group === "advanced");
    if ("issue" in validation) {
      setError(validation.issue);
      if (group === "advanced" && issueGroup(validation.issue) === "markets") openDialog("markets");
      return;
    }
    clearDialogIssue(group);
    if (group === "advanced") {
      setAppliedCriteria(validation.criteria);
      setSelectedConfiguration(draftConfiguration);
      setFeedbackKey((current) => current + 1); snapshot.current = null;
      const params = serializeSlipCriteria(validation.criteria);
      const changedPreset = draftConfiguration?.id !== selectedConfiguration?.id ||
        !!draftConfiguration && params.toString() !== serializeSlipCriteria(appliedCriteria).toString();
      if (changedPreset || resetPending.current) {
        setClearedResult(receivedResult);
        if (draftConfiguration) params.set("configuration", draftConfiguration.id);
        if (changedPreset || window.location.search) window.history.replaceState(null, "", `${action}?${params}`);
      }
      resetPending.current = false;
    }
    marketSnapshot.current = null;
    setDialogState(group === "advanced" ? null : "advanced");
  }
  function resetDialog(group: BuilderDialog) {
    if (group === "advanced") {
      setFeedbackKey((current) => current + 1);
      setKickoffZone(undefined); setDraft(resetDraft); setReuse(resetCriteria.reuse);
      setDraftConfiguration(null);
      resetPending.current = true;
    }
    setSelectedMarkets(resetCriteria.markets); setOutcomes(resetCriteria.outcomes ?? {});
    clearDialogIssue(group);
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
      else { snapshot.current = null; marketSnapshot.current = null; setDialogState(null); }
      return;
    }
    const next = serializeSlipCriteria(validation.criteria);
    setAppliedCriteria(validation.criteria);
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
    resetKickoffOnFeedback: true,
  });
  const kickoffContents = <>{kickoffFields}{kickoffZone && enhanced && <Note>
    {messages.text("slipConfigs.timeZone", { zone: kickoffZone.replaceAll("_", " ") })}
  </Note>}{errorMessage("kickoff")}</>;

  return <SlipStack data-slip-builder-page aria-busy={pending} onInputCapture={markInteracted} onClickCapture={markInteracted} onKeyDownCapture={markInteracted}>
    <AppBrandBar locale={locale} showAccount={showAccount} />
    <BuilderHeader>
      <SlipHeading>{messages.text("slips.title")}</SlipHeading>
    </BuilderHeader>
    <BuilderPanel data-slip-builder-toolbar aria-labelledby={`${prefix}-criteria`}>
      <VisuallyHidden as="h2" id={`${prefix}-criteria`}>{messages.text("slips.criteria")}</VisuallyHidden>
      <CriteriaForm id={formId} data-enhanced={enhanced} action={action} method="get" ref={formRef} onSubmit={submit} noValidate>
        <input type="hidden" name="build" value="1" />
        {selectedConfiguration && <input type="hidden" name="configuration" value={selectedConfiguration.id} />}
        <FiltersDialog id={advancedId} locale={locale} group="advanced" open={activeDialog !== null} closeLabel={messages.text("filters.close")}
          onReset={() => resetDialog("advanced")} onCancel={() => cancelDialog("advanced")} onApply={() => applyDialog("advanced")}>
          <FilterDialogContent>
            {signedIn && <FilterDialogSection hidden={!enhanced}>
              <SavedSlipConfigurations id={savedFiltersId} locale={locale} currentParameters={currentParameters} appliedId={selectedConfiguration?.id}
                choice={draftConfiguration} onLoad={loadConfiguration} onRemoved={removeConfiguration} onRevisionChanged={updateConfigurationRevision}
                applyDefault={applyDefault} pending={pending} canApplyDefault={canApplyDefault} />
            </FilterDialogSection>}
            <FilterDialogSection>{targets}{errorMessage("targets")}</FilterDialogSection>
            <FilterDialogSection><FieldGroup data-criteria-field="limits">
              <VisuallyHidden as="legend">{messages.text("slips.dialog.limits")}</VisuallyHidden>
              {limitsFields}{errorMessage("limits")}
            </FieldGroup></FilterDialogSection>
            <FilterDialogSection><FilterSection data-criteria-field="kickoff">
              {kickoffContents}
            </FilterSection></FilterDialogSection>
            <FilterDialogSection>{reuseField}</FilterDialogSection>
            <FilterDialogSection hidden={!enhanced}>
              <MarketFilterControl data-criteria-trigger="markets" dialogId={marketsId} open={marketsOpen}
                summary={marketsSummary} aria-invalid={invalidMarkets || undefined} onClick={() => openDialog("markets")}>
                {marketsTitle}
              </MarketFilterControl>
            </FilterDialogSection>
            {!enhanced && <ButtonLink href={action} variant="secondary" prefetch={false}>
              <ResetIcon />{messages.text("feed.filters.resetFilters")}
            </ButtonLink>}
          </FilterDialogContent>
        </FiltersDialog>
        <MarketFilterDialog id={marketsId} locale={locale} group="markets" open={marketsOpen}
          onReset={() => resetDialog("markets")} onCancel={() => cancelDialog("markets")} onApply={() => applyDialog("markets")}>
          {matches => <>{errorMessage("markets")}{marketFields(matches)}</>}
        </MarketFilterDialog>
        {errorMessage(null)}
        <SlipCriteriaSummary locale={locale} criteria={appliedCriteria}
          showJoint={jointEstimates || appliedCriteria.totalProbMin !== undefined || appliedCriteria.totalProbMax !== undefined} />
        <BuilderOptions data-slip-builder-options>
          <CriteriaOptions data-slip-criteria-options hidden={!enhanced}>
            <FilterDialogTrigger data-criteria-trigger="advanced" dialogId={advancedId} open={activeDialog !== null}
              count={advancedCount} aria-label={advancedCount ? messages.plural("filters.active", advancedCount) : filtersTitle}
              aria-invalid={!!errorGroup || undefined}
              disabled={pending} onClick={() => openDialog("advanced")}>
              {filtersTitle}
            </FilterDialogTrigger>
          </CriteriaOptions>
          <Actions data-criteria-actions data-toolbar-group="actions">
            {subscriberOnly ? <BuildLink data-slip-access-action href={subscriberHref(signedIn, action, "login")} prefetch={false}>
              <LockIcon /><SlipBuildActionLabel locale={locale} restricted />
            </BuildLink> : <BuildButton data-slip-access-action type="submit" disabled={pending}>
              <SlipIcon /><SlipBuildActionLabel locale={locale} restricted={false} />
            </BuildButton>}
          </Actions>
        </BuilderOptions>
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
      {!result && !providerOdds && <Note>{messages.text("slips.oddsNotice")}</Note>}
      <VisuallyHidden role="status" aria-live="polite">{pending ? messages.text("slips.building") : ""}</VisuallyHidden>
    </Results>
  </SlipStack>;
}
