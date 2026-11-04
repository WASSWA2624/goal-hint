"use client";

import { DateTimeField } from "@/components/ui/date-time-field";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/components/analytics/tracker";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import type { TextInputProps } from "@/components/ui/controls";
import { ChoicePicker } from "@/components/ui/choice-picker";
import { CriteriaAccordion } from "@/components/ui/criteria-accordion";
import { ChevronRightIcon, ResetIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/feedback";
import { NumberedPagination, numberedPaginationLabels } from "@/components/ui/numbered-pagination";
import { PagePaginationSection } from "@/components/ui/pagination-styles";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { marketSelections, type MarketFamily, type MarketSelection } from "@/domain/markets";
import { slipsHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { predictionLabel } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipBuilderRules, slipInputFields,
  type SlipCriteria, type SlipCriteriaErrorCode, type SlipInputs } from "@/domain/slip-builder";
import { guardSlipNumber, slipDateBounds, slipNumberRangeIssue, type SlipDateTimeField, type SlipNumericField } from "@/domain/slip-input-guards";
import { createMessages } from "@/i18n/messages";
import type { SlipBuildPageResult } from "@/domain/slip-page";
import { compareSlipDisplayProbability, slipPageSize } from "@/domain/slip-pagination";
import { SlipCard } from "./slip-card";
import { SlipLoading } from "./slip-loading";
import { SlipMatchRefreshProvider } from "./slip-match-refresh";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { SlipNumericInput } from "./slip-numeric-input";
import { SavedSlipConfigurations } from "./saved-slip-configurations";
import { canonicalSlipConfigurationParameters, slipConfigurationCriteria, slipConfigurationHref, slipConfigurationIdSchema, type SlipConfiguration } from "@/domain/slip-configurations";
import { UnlockPanel } from "@/components/members/prediction-unlock";
import { ActionControls, Actions, AdvancedCriteria, BuildActionLabel, BuildButton, BuildLink, BuilderEssentials, BuilderHeader, BuilderOptions, BuilderPanel, ClearLink, CriteriaError, CriteriaForm, CriteriaOption, CriteriaOptions, CriteriaSummary, CriteriaTitle, CriteriaTrigger, FieldGroup,
  Fields, InlineCriteria, LimitGroups, MarketChoice, MarketChoices, MarketField, BuilderCriteriaDialog, Note, Results, BuilderFeedback, ReuseRow, SavedFiltersButton, SlipHeading, SlipList, SlipStack, TargetGroups } from "./slip-styles";

export function SlipAccessRequired({ locale, showAccount = false, signedIn = false }: { locale: string; showAccount?: boolean; signedIn?: boolean }) {
  return <SlipStack><AppBrandBar locale={locale} showAccount={showAccount} />
    <UnlockPanel locale={locale} signedIn={signedIn} returnTo={slipsHref(locale)} guestView="login" />
  </SlipStack>;
}

export type SlipCriteriaIssue = Readonly<{ code: SlipCriteriaErrorCode; field: keyof SlipCriteria | "query" }>;
type CriteriaGroup = "limits" | "kickoff" | "markets";
/** Responsive copies keep the action's existing desktop structure and stable dimensions. */
function SlipBuildActionLabel({ locale, restricted, pending = false }: {
  locale: string; restricted: boolean; signedIn: boolean; pending?: boolean;
}) {
  const messages = createMessages(locale);
  const build = messages.text(pending ? "slips.building" : "slips.build");
  return <BuildActionLabel>
    <span data-action-label="mobile">{restricted ? messages.text("paywall.unlock") : build}</span>
    <span data-action-label="desktop">{restricted ? messages.text("paywall.unlock") : build}</span>
  </BuildActionLabel>;
}
function isDateTimeField(name: typeof slipInputFields[number]): name is SlipDateTimeField {
  return name === "dateFrom" || name === "dateTo" || name === "timeFrom" || name === "timeTo";
}
type NumericRangeField = `${"total" | "teams" | "odds" | "prob" | "totalProb"}${"Min" | "Max"}`;
const groupFields = {
  limits: ["oddsMin", "oddsMax", "probMin", "probMax", "totalProbMin", "totalProbMax"],
  kickoff: ["dateFrom", "dateTo", "timeFrom", "timeTo"],
} as const;
const advancedFields = [...groupFields.limits, ...groupFields.kickoff];
const subscribeNever = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function issueGroup(issue: SlipCriteriaIssue | null): CriteriaGroup | null {
  if (!issue) return null;
  if (groupFields.limits.some((field) => field === issue.field)) return "limits";
  if (groupFields.kickoff.some((field) => field === issue.field)) return "kickoff";
  return issue.field === "markets" || issue.field === "outcomes" ? "markets" : null;
}

function isNumericRange(name: typeof slipInputFields[number]): name is NumericRangeField {
  return name.endsWith("Min") || name.endsWith("Max");
}

function rangeValue(name: NumericRangeField, value: string | undefined, defaults: SlipCriteria) {
  const probability = name.startsWith("prob") || name.startsWith("totalProb");
  const bound = (defaults[name] ?? (name.endsWith("Min") ? 0 : probability ? 100 : Infinity))
    / (name === "totalMin" || name === "totalMax" || name.startsWith("odds") ? 100 : 1);
  return value === undefined || value === "" ? bound : Number(value);
}

/** Keep configured defaults explicit, unrestricted ceilings blank, and invalid submitted drafts editable. */
function criteriaDraft(criteria: SlipCriteria, inputs: SlipInputs = {}): SlipInputs {
  const values = serializeSlipCriteria(criteria);
  return Object.fromEntries(slipInputFields.map((name) => {
    let value = inputs[name] ?? values.get(name) ?? "";
    if (!value && name !== "slips" && !isNumericRange(name)) value = values.get(name) || (name === "timeFrom" ? fullDayKickoffTime.from : name === "timeTo" ? fullDayKickoffTime.to : "");
    // Keep total odds at two decimal places; other ranges retain compact numeric formatting.
    const numericFormat = name.startsWith("prob") || name.startsWith("totalProb") ? /^(0|[1-9]\d*)(?:\.\d{1,3})?$/
      : name.startsWith("odds") || name.startsWith("total") ? /^(0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^[1-9]\d*$/;
    if (name !== "dateFrom" && name !== "dateTo" && name !== "timeFrom" && name !== "timeTo" && numericFormat.test(value)) {
      if (name === "totalMin" || name === "totalMax") {
        const checked = guardSlipNumber(name, value, true);
        if (checked.accepted) value = checked.value;
      } else value = name === "totalProbMin" && Number(value) === 0 ? ""
        : value.includes(".") ? value.replace(/0+$/u, "").replace(/\.$/u, "") : value;
    }
    return [name, value];
  }));
}
type Props = Readonly<{
  locale: string; today: ReportingDate; criteria: SlipCriteria; result: SlipBuildPageResult | null;
  error?: SlipCriteriaIssue | null; initialInputs?: SlipInputs; initialMarkets?: readonly MarketFamily[];
  initialOutcomes?: SlipCriteria["outcomes"];
  initialReuse?: boolean; showAccount?: boolean; subscriberOnly?: boolean; signedIn?: boolean;
  jointEstimates?: boolean;
  configurationId?: string | null; applyDefault?: boolean;
}>;

/** The native GET form and enhanced navigation use the same strict criteria parser. */
export function SlipBuilder({ locale, today, criteria, result: receivedResult, error: initialError = null, initialInputs = {}, initialMarkets, initialOutcomes, initialReuse, showAccount = false, subscriberOnly = false, signedIn = false, jointEstimates = false, configurationId = null, applyDefault = false }: Props) {
  const messages = createMessages(locale), router = useRouter(), prefix = useId();
  const [clearedResult, setClearedResult] = useState<SlipBuildPageResult | null>(null);
  const result = clearedResult === receivedResult ? null : receivedResult;
  const [pending, startTransition] = useTransition(), [error, setError] = useState(initialError);
  const [pagination, setPagination] = useState({ result, page: 1 });
  if (pagination.result !== result) setPagination({ result, page: 1 });
  const desktop = useDesktopLayout();
  const recheckAccess = useCallback(() => { startTransition(() => router.refresh()); }, [router]);
  const enhanced = useSyncExternalStore(subscribeNever, clientReady, serverReady);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null), resultsRef = useRef<HTMLElement>(null);
  const savedFiltersTrigger = useRef<HTMLButtonElement>(null);
  const [savedFiltersOpen, setSavedFiltersOpen] = useState(false);
  const [selectedConfiguration, setSelectedConfiguration] = useState(configurationId);
  const savedFiltersId = `${prefix}-saved-filters`;
  const defaultAllowed = useRef(true);
  const canApplyDefault = useCallback(() => defaultAllowed.current, []);
  const markInteracted = useCallback(() => { defaultAllowed.current = false; }, []);
  const action = slipsHref(locale), errorId = `${prefix}-error`, formId = `${prefix}-form`;
  const resetCriteria = { ...defaultSlipCriteria(today), timeFrom: fullDayKickoffTime.from, timeTo: fullDayKickoffTime.to };
  const resetDraft = criteriaDraft(resetCriteria);
  const [draft, setDraft] = useState(() => criteriaDraft(criteria, initialInputs));
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [selectedMarkets, setSelectedMarkets] = useState(initialMarkets ?? criteria.markets);
  const [outcomes, setOutcomes] = useState(initialOutcomes ?? criteria.outcomes ?? {});
  const [reuse, setReuse] = useState(initialReuse ?? criteria.reuse);
  const missingKickoff = groupFields.kickoff.find((name) => !draft[name]?.trim());
  const dialogGroup = desktop ? "markets" : "advanced";
  const dialogId = `${prefix}-${dialogGroup}`;
  const currentParameters = useMemo(() => {
    if (missingKickoff) return null;
    try {
      const parameters = new URLSearchParams();
      for (const field of slipInputFields) parameters.set(field, draft[field] ?? "");
      parameters.set("markets", selectedMarkets.join(",")); parameters.set("reuse", reuse ? "1" : "0");
      for (const market of selectedMarkets) if (outcomes[market]?.length) parameters.set(`picks.${market}`, outcomes[market]!.join(","));
      return canonicalSlipConfigurationParameters(parameters.toString(), today);
    } catch { return null; }
  }, [missingKickoff, draft, selectedMarkets, outcomes, reuse, today]);
  const [dialogState, setDialogState] = useState<"open" | "mobile-error" | null>(() => {
    const group = issueGroup(initialError);
    return group === "markets" ? "open" : group ? "mobile-error" : null;
  });
  const dialogOpen = dialogState === "open" || !desktop && dialogState === "mobile-error";
  const snapshot = useRef<{ draft: SlipInputs; markets: typeof selectedMarkets; outcomes: typeof outcomes; reuse: boolean } | null>(
    dialogState ? { draft, markets: selectedMarkets, outcomes, reuse } : null);
  const clearAppliedConfiguration = useCallback(() => {
    setSelectedConfiguration(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("configuration");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const loadConfiguration = useCallback((configuration: SlipConfiguration) => {
    const day = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
    const next = slipConfigurationCriteria(configuration.parameters, day);
    setDraft(criteriaDraft(next)); setSelectedMarkets(next.markets); setOutcomes(next.outcomes ?? {}); setReuse(next.reuse);
    setError(null); setFeedbackKey(value => value + 1);
    snapshot.current = null; setDialogState(null); setSelectedConfiguration(configuration.id); setClearedResult(receivedResult);
    // Keep the management dialog open and replace the generation URL without a server build/read.
    window.history.replaceState(null, "", slipConfigurationHref(configuration, locale, day));
  }, [locale, receivedResult]);
  const closeSavedFilters = useCallback(() => {
    setSavedFiltersOpen(false);
    requestAnimationFrame(() => savedFiltersTrigger.current?.focus());
  }, []);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => errorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [error, dialogOpen]);
  function range(from: typeof slipInputFields[number], to: typeof slipInputFields[number], unit = "") {
    const lower = draft[from]?.trim(), upper = draft[to]?.trim(), any = messages.text("slips.any");
    if (!lower && !upper) return any;
    const minimum = lower ? `${lower}${unit}` : any, maximum = upper ? `${upper}${unit}` : any;
    return minimum === maximum ? minimum : `${minimum}–${maximum}`;
  }
  function dateSummary() {
    try {
      const from = parseReportingDate(draft.dateFrom || today), to = parseReportingDate(draft.dateTo || from);
      if (from === today && to === today) return messages.text("slips.today");
      return from === to ? messages.reportingDateShort(from) : `${messages.reportingDateShort(from)}–${messages.reportingDateShort(to)}`;
    } catch { return messages.text("slips.summary.checkDates"); }
  }
  const invalidField = error?.field;
  const showJoint = jointEstimates || criteria.totalProbMin !== undefined || criteria.totalProbMax !== undefined
    || initialInputs.totalProbMin !== undefined || initialInputs.totalProbMax !== undefined || Boolean(draft.totalProbMin || draft.totalProbMax);
  const invalidMarkets = invalidField === "markets" || invalidField === "outcomes";
  const manualMarkets = selectedMarkets.filter((family) => outcomes[family]?.length).length;
  const allAutomatic = publicPolicy.markets.every((family) => selectedMarkets.includes(family) && !outcomes[family]?.length);
  const marketCountSummary = selectedMarkets.length === publicPolicy.markets.length
    ? messages.text("slips.summary.allMarkets", { count: messages.number(selectedMarkets.length) })
    : messages.plural("slips.marketCount", selectedMarkets.length);
  const marketsSummary = messages.text("slips.summary.markets", {
    markets: marketCountSummary,
    results: manualMarkets ? messages.text("slips.summary.chosenResults", { count: messages.number(manualMarkets) })
      : messages.text("slips.summary.automaticResults"),
  });
  const errorGroup = issueGroup(error);
  const dialogTitle = messages.text(desktop ? "slips.accordion.markets" : "feed.filters.dialogTitle");
  const dialogLabel = messages.text(desktop ? manualMarkets ? "slips.toolbar.manual" : "slips.automatic" : "feed.filters.dialogTitle");
  const dialogIssue = (group: CriteriaGroup | null) => group !== null && (!desktop || group === "markets");
  function changed(fields: readonly typeof slipInputFields[number][]) {
    return fields.some((name) => isNumericRange(name)
      ? rangeValue(name, draft[name], resetCriteria) !== rangeValue(name, undefined, resetCriteria) : draft[name] !== resetDraft[name]);
  }
  const marketsEdited = !allAutomatic || reuse;
  const criteriaCount = desktop ? selectedMarkets.length
    : Number(changed(["oddsMin", "oddsMax"])) + Number(changed(["probMin", "probMax"]))
      + Number(changed(["totalProbMin", "totalProbMax"])) + Number(changed(groupFields.kickoff)) + Number(marketsEdited);
  function openDialog() {
    setFeedbackKey((current) => current + 1);
    snapshot.current = { draft, markets: selectedMarkets, outcomes, reuse };
    setDialogState("open");
  }
  function restoreAdvanced(values: SlipInputs) {
    setDraft((current) => ({ ...current, ...Object.fromEntries(advancedFields.map((name) => [name, values[name]])) }));
  }
  function cancelDialog() {
    setFeedbackKey((current) => current + 1);
    const previous = snapshot.current;
    if (previous) {
      restoreAdvanced(previous.draft);
      setSelectedMarkets(previous.markets); setOutcomes(previous.outcomes); setReuse(previous.reuse);
    }
    setError((current) => dialogIssue(issueGroup(current)) ? null : current);
    snapshot.current = null; setDialogState(null);
  }
  function validateCriteria(parameters: URLSearchParams, requireKickoff: boolean) {
    if (requireKickoff && missingKickoff) {
      throw new SlipCriteriaError(missingKickoff, missingKickoff.startsWith("time") ? "invalid-time-range" : "invalid-date-range");
    }
    return parseSlipCriteria(parameters, today);
  }
  function applyDialog() {
    const parameters = serializeSlipCriteria(resetCriteria);
    if (!desktop) for (const name of advancedFields) parameters.set(name, draft[name] ?? "");
    parameters.delete("markets");
    selectedMarkets.forEach((market) => parameters.append("markets", market));
    for (const market of selectedMarkets) outcomes[market]?.forEach((value) => parameters.append(`picks.${market}`, value));
    parameters.set("reuse", reuse ? "1" : "0"); parameters.set("build", "1");
    try {
      validateCriteria(parameters, !desktop);
      setError((current) => dialogIssue(issueGroup(current)) ? null : current);
      setFeedbackKey((current) => current + 1);
      snapshot.current = null; setDialogState(null);
    } catch (issue) {
      if (!(issue instanceof SlipCriteriaError)) throw issue;
      setError({ code: issue.code, field: issue.field });
    }
  }
  function reset() {
    setFeedbackKey((current) => current + 1);
    setDraft(resetDraft); setSelectedMarkets(resetCriteria.markets); setOutcomes(resetCriteria.outcomes ?? {}); setReuse(resetCriteria.reuse);
    setError(null); snapshot.current = null; setDialogState(null);
    setSelectedConfiguration(null);
    setClearedResult(receivedResult);
    if (window.location.search) startTransition(() => router.push(`${action}?${serializeSlipCriteria(resetCriteria)}`, { scroll: false }));
  }
  function resetDialog() {
    setFeedbackKey((current) => current + 1);
    if (!desktop) restoreAdvanced(resetDraft);
    setSelectedMarkets(resetCriteria.markets); setOutcomes(resetCriteria.outcomes ?? {}); setReuse(resetCriteria.reuse);
    setError((current) => dialogIssue(issueGroup(current)) ? null : current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parameters = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string") parameters.append(key, value); });
    const configuration = parameters.get("configuration");
    parameters.delete("configuration");
    try {
      const next = serializeSlipCriteria(validateCriteria(parameters, true));
      setClearedResult(null);
      if (slipConfigurationIdSchema.safeParse(configuration).success) next.set("configuration", configuration!);
      next.set("build", "1"); setError(null); setFeedbackKey((current) => current + 1); trackEvent("slip_build");
      const href = `${action}?${next}`;
      startTransition(() => {
        if (`${window.location.pathname}${window.location.search}` === href) router.refresh();
        else router.push(href, { scroll: false });
      });
    } catch (issue) {
      if (issue instanceof SlipCriteriaError) {
        const nextError = { code: issue.code, field: issue.field };
        setError(nextError);
        if (dialogIssue(issueGroup(nextError))) openDialog();
        else { snapshot.current = null; setDialogState(null); }
      }
      else throw issue;
    }
  }

  function updateField(name: typeof slipInputFields[number], value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setError((current) => current && (current.field === name
      || isDateTimeField(name) && current.field.toString().startsWith(name.startsWith("date") ? "date" : "time")
      || isNumericRange(name) && current.field.toString().replace(/(?:Min|Max)$/u, "") === name.replace(/(?:Min|Max)$/u, "")) ? null : current);
  }
  function field(name: typeof slipInputFields[number], label: TextInputProps["label"], options: Omit<TextInputProps, "label" | "name"> = {}) {
    const invalid = error?.field === name || (error?.field === "dateFrom" && name === "dateTo")
      || (error?.field === "timeFrom" && name === "timeTo")
      || (error?.field === "totalMin" && name === "totalMax") || (error?.field === "oddsMin" && name === "oddsMax")
      || (error?.field === "probMin" && name === "probMax") || (error?.field === "totalProbMin" && name === "totalProbMax") || (error?.field === "teamsMin" && name === "teamsMax");
    const shared = { name, id: `${prefix}-${name}`, label,
      placeholder: isNumericRange(name) ? messages.text("slips.any") : undefined,
      "aria-invalid": invalid || undefined, "aria-describedby": invalid && !isDateTimeField(name) ? errorId : undefined, ...options };
    if (!isDateTimeField(name)) return <SlipNumericInput {...shared} field={name as SlipNumericField} locale={locale}
      feedbackKey={feedbackKey}
      value={draft[name] ?? ""} onValueChange={(value) => updateField(name, value)}
      onCommit={(value) => slipNumberRangeIssue(name, { ...draft, [name]: value }, resetDraft) ? messages.text("slips.guard.range") : undefined} />;
    const date = name.startsWith("date");
    const bounds = date ? name === "dateFrom" ? { min: "0001-01-01", max: "9999-12-31" } : slipDateBounds("dateTo", draft)
      : { min: name === "timeTo" ? draft.timeFrom || fullDayKickoffTime.from : fullDayKickoffTime.from, max: fullDayKickoffTime.to };
    return <DateTimeField {...shared} locale={locale} mode={date ? "date" : "time"} {...bounds} required value={draft[name] ?? ""}
      error={invalid && error ? messages.text(`slips.error.${error.code}`) : undefined}
      onValueChange={value => updateField(name, value)} />;
  }
  function kickoffField(endpoint: "From" | "To") {
    const date = `date${endpoint}` as const, time = `time${endpoint}` as const;
    const value = draft[date] && draft[time] ? `${draft[date]}T${draft[time]}` : "";
    const invalid = invalidField === date || invalidField === time
      || endpoint === "To" && (invalidField === "dateFrom" || invalidField === "timeFrom");
    return <>
      <input type="hidden" name={date} value={draft[date] ?? ""} />
      <input type="hidden" name={time} value={draft[time] ?? ""} />
      <DateTimeField key={desktop ? undefined : feedbackKey} id={`${prefix}-date-time-${endpoint}`} locale={locale} mode="datetime" timeZone={publicPolicy.reportingTimeZone}
        label={messages.text(`slips.dateTime${endpoint}`)} value={value} required
        aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        onValueChange={(value) => {
          const [day = "", minute = ""] = value.split("T");
          setDraft((current) => ({ ...current, [date]: day, [time]: minute }));
          setError((current) => issueGroup(current) === "kickoff" ? null : current);
        }} />
    </>;
  }
  function errorMessage(group: CriteriaGroup | null) {
    return error && errorGroup === group ? <CriteriaError id={errorId} ref={errorRef} tabIndex={-1} role="alert">{messages.text(`slips.error.${error.code}`)}</CriteriaError> : null;
  }
  const oddsOptions = { min: slipBuilderRules.minimumOddsHundredths / 100, step: "0.01" };
  const data = result?.data, generated = result?.state === "generated" && data !== null && data !== undefined;
  const slips = data?.slips;
  const pageCount = Math.ceil((slips?.length ?? 0) / slipPageSize);
  const page = Math.min(pagination.page, Math.max(1, pageCount)), offset = (page - 1) * slipPageSize;
  const orderedSlips = useMemo(() => slips ? [...slips].sort(compareSlipDisplayProbability) : [], [slips]);
  const shownSlips = useMemo(() => orderedSlips.slice(offset, offset + slipPageSize), [orderedSlips, offset]);
  const emptyState = result?.state === "generated" ? "data-unavailable" : result?.state;
  const timeSummary = draft.timeFrom === fullDayKickoffTime.from && draft.timeTo === fullDayKickoffTime.to
    ? messages.text("slips.summary.allDay") : `${range("timeFrom", "timeTo")} EAT`;
  const accessRequired = <UnlockPanel locale={locale} signedIn={signedIn} returnTo={action} guestView="login" />;
  const limitsFields = <LimitGroups>
    <fieldset><legend>{messages.text("slips.individualOdds")}</legend><Fields>
      {field("oddsMin", messages.text("slips.minimum"), { ...oddsOptions, "aria-label": messages.text("slips.oddsMin") })}
      {field("oddsMax", messages.text("slips.maximum"), { ...oddsOptions, "aria-label": messages.text("slips.oddsMax") })}
    </Fields></fieldset>
    <fieldset><legend>{messages.text("slips.probabilityPercent")}</legend><Fields>
      {field("probMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMin") })}
      {field("probMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMax") })}
    </Fields></fieldset>
    {showJoint && <fieldset data-joint-limit><legend>{messages.text("slips.combinedProbabilityPercent")}</legend><Fields>
      {field("totalProbMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.totalProbMin") })}
      {field("totalProbMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.totalProbMax") })}
    </Fields><Note>{messages.text("slips.combinedProbabilityHint")}</Note></fieldset>}
  </LimitGroups>;
  const kickoffFields = desktop || enhanced ? <Fields data-combined-kickoff-fields>
    {kickoffField("From")}{kickoffField("To")}
  </Fields> : <Fields data-kickoff-fields>
    {field("dateFrom", messages.text("slips.dateFrom"))}
    {field("dateTo", messages.text("slips.dateTo"))}
    {field("timeFrom", messages.text("slips.timeFrom"))}
    {field("timeTo", messages.text("slips.timeTo"))}
  </Fields>;
  const reuseField = <ReuseRow>
    <input type="hidden" name="reuse" value="0" />
    <label><input type="checkbox" name="reuse" value="1" checked={reuse}
      aria-describedby={desktop ? `${prefix}-reuse-hint` : undefined} onChange={(event) => setReuse(event.target.checked)} />{messages.text("slips.reuse")}</label>
    {desktop && <Note id={`${prefix}-reuse-hint`}>{messages.text("slips.reuseHint")}</Note>}
  </ReuseRow>;
  const marketFields = <FieldGroup data-criteria-field="markets" aria-describedby={invalidMarkets ? errorId : undefined}>
    <VisuallyHidden as="legend">{messages.text("slips.accordion.markets")}</VisuallyHidden>
    {desktop && <Note>{messages.text("slips.marketsHint")}</Note>}
    {!desktop && enhanced && <>
      <MarketChoice>
        <input type="checkbox" checked={allAutomatic} aria-describedby={`${prefix}-all-automatic-hint`}
          onChange={() => { setSelectedMarkets(resetCriteria.markets); setOutcomes({}); }} />
        {messages.text("slips.automatic")}
      </MarketChoice>
      <Note id={`${prefix}-all-automatic-hint`}>{messages.text("slips.automaticAllHint")}</Note>
    </>}
    <MarketChoices>
      {publicPolicy.markets.map((family) => {
        const enabled = selectedMarkets.includes(family), market = messages.text(`market.family.${family}`);
        return <MarketField key={family}>
          <MarketChoice>
            <input type="checkbox" name="markets" value={family} checked={enabled}
              onChange={() => {
                setSelectedMarkets((current) => enabled ? current.filter((value) => value !== family) : [...current, family]);
                setOutcomes((current) => { const next = { ...current }; delete next[family]; return next; });
              }} aria-invalid={error?.field === "markets" || undefined} />{market}
          </MarketChoice>
          <ChoicePicker inline name={`picks.${family}`} label={messages.text("slips.outcomeLabel", { market })}
            automaticLabel={messages.text("slips.automatic")} automaticHint={messages.text("slips.automaticHint")}
            options={marketSelections[family].map((value) => ({ value, label: predictionLabel(messages, value) }))}
            selected={outcomes[family] ?? []}
            onChange={(values) => setOutcomes((current) => ({ ...current, [family]: values as readonly MarketSelection[] }))}
            disabled={!enabled} invalid={error?.field === "outcomes"} {...(error?.field === "outcomes" ? { describedBy: errorId } : {})} />
        </MarketField>;
      })}
    </MarketChoices>
    {desktop && reuseField}
  </FieldGroup>;
  const savedFiltersButton = signedIn && <SavedFiltersButton ref={savedFiltersTrigger} type="button" variant="secondary" data-saved-filters-trigger
    aria-haspopup="dialog" aria-expanded={savedFiltersOpen} aria-controls={savedFiltersId} disabled={pending || !enhanced}
    onClick={() => setSavedFiltersOpen(true)}>{messages.text("slipConfigs.title")}</SavedFiltersButton>;

  return <SlipStack data-slip-builder-page aria-busy={pending} onInputCapture={markInteracted} onClickCapture={markInteracted} onKeyDownCapture={markInteracted}>
    <AppBrandBar locale={locale} showAccount={showAccount} />
    <BuilderHeader>
      <SlipHeading>{messages.text("slips.title")}</SlipHeading>
    </BuilderHeader>
    {signedIn && <SavedSlipConfigurations id={savedFiltersId} locale={locale} currentParameters={currentParameters} appliedId={selectedConfiguration}
      open={savedFiltersOpen} onClose={closeSavedFilters} onAppliedConfigurationRemoved={clearAppliedConfiguration}
      applyDefault={applyDefault} onLoad={loadConfiguration} pending={pending} canApplyDefault={canApplyDefault} />}
    <BuilderPanel data-slip-builder-toolbar aria-labelledby={`${prefix}-criteria`}>
      <VisuallyHidden as="h2" id={`${prefix}-criteria`}>{messages.text("slips.criteria")}</VisuallyHidden>
      <CriteriaForm id={formId} data-enhanced={enhanced} action={action} method="get" ref={formRef} onSubmit={submit} noValidate>
        <input type="hidden" name="build" value="1" />
        {selectedConfiguration && <input type="hidden" name="configuration" value={selectedConfiguration} />}
        <BuilderEssentials data-slip-builder-essentials>
        <fieldset data-slip-count data-toolbar-group="slips"><legend>{messages.text("slips.totalSlips")}</legend>{field("slips", null, { min: 1, max: slipBuilderRules.maximumSlips, step: 1, inputMode: "numeric", required: true, "aria-label": messages.text("slips.count") })}</fieldset>
        <FieldGroup data-criteria-field="targets"><VisuallyHidden as="legend">{messages.text("slips.yourSlips")}</VisuallyHidden><TargetGroups data-slip-target-groups>
          <fieldset data-toolbar-group="total"><legend><span data-slip-label="mobile">{messages.text("slips.mobile.totalOdds")}</span><span data-slip-label="desktop">{messages.text("slips.totalOddsRange")}</span></legend><Fields>
            {field("totalMin", messages.text("slips.minimum"), { ...oddsOptions, "aria-label": messages.text("slips.totalMin") })}
            {field("totalMax", messages.text("slips.maximum"), { ...oddsOptions, "aria-label": messages.text("slips.totalMax") })}
          </Fields></fieldset>
          <fieldset data-toolbar-group="matches"><legend><span data-slip-label="mobile">{messages.text("slips.mobile.matches")}</span><span data-slip-label="desktop">{messages.text("slips.selectionsRange")}</span></legend><Fields>
            {field("teamsMin", messages.text("slips.minimum"), { min: 1, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMin") })}
            {field("teamsMax", messages.text("slips.maximum"), { min: 1, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMax") })}
          </Fields></fieldset>
        </TargetGroups></FieldGroup>
        </BuilderEssentials>
        {desktop && <>
          <VisuallyHidden id={`${dialogId}-summary`}>{marketsSummary}</VisuallyHidden>
          <InlineCriteria data-criteria-field="limits">
            <VisuallyHidden as="legend">{messages.text("slips.dialog.limits")}</VisuallyHidden>
            {limitsFields}
            {errorMessage("limits")}
          </InlineCriteria>
          <InlineCriteria data-criteria-field="kickoff">
            <VisuallyHidden as="legend">{messages.text("slips.dialog.kickoffTitle")}</VisuallyHidden>
            {kickoffFields}
            {errorMessage("kickoff")}
          </InlineCriteria>
        </>}
        <BuilderCriteriaDialog id={dialogId} group={dialogGroup} title={dialogTitle} open={dialogOpen}
          onReset={resetDialog} resetLabel={messages.text("slips.reset")}
          onCancel={cancelDialog} onApply={applyDialog} applyLabel={messages.text("slips.dialog.apply")}
          cancelLabel={messages.text("slips.dialog.cancel")} closeLabel={messages.text("slips.dialog.close", { section: dialogTitle })}>
          {dialogIssue(errorGroup) && errorMessage(errorGroup)}
          {desktop ? marketFields : <AdvancedCriteria>
            <FieldGroup data-criteria-field="limits">
              <VisuallyHidden as="legend">{messages.text("slips.dialog.limits")}</VisuallyHidden>
              {limitsFields}
            </FieldGroup>
            <FieldGroup data-criteria-field="kickoff">
              <VisuallyHidden as="legend">{messages.text("slips.dialog.kickoffTitle")}</VisuallyHidden>
              {kickoffFields}
            </FieldGroup>
            {reuseField}
            <CriteriaAccordion group="markets" title={messages.text("slips.dialog.markets")} summary={marketsSummary}
              defaultOpen invalid={invalidMarkets} resetVersion={feedbackKey}>
              {marketFields}
            </CriteriaAccordion>
          </AdvancedCriteria>}
        </BuilderCriteriaDialog>
        {errorMessage(null)}
        <BuilderOptions data-slip-builder-options>
        <CriteriaOptions data-slip-criteria-options hidden={!enhanced}>
          <CriteriaOption data-criteria-option={dialogGroup} data-toolbar-group={dialogGroup}>
            <CriteriaTitle data-criteria-title>{desktop ? messages.text("slips.dialog.markets") : dialogTitle}</CriteriaTitle>
            <CriteriaTrigger type="button" variant="secondary" data-criteria-trigger={dialogGroup}
              aria-label={desktop ? `${messages.text("slips.dialog.markets")}: ${dialogLabel}` : undefined}
              data-edited={desktop ? marketsEdited : criteriaCount > 0} aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={dialogOpen}
              aria-describedby={desktop ? `${dialogId}-summary` : undefined} aria-invalid={dialogIssue(errorGroup) || undefined}
              disabled={pending} onClick={openDialog}>
              <span data-criteria-label>{dialogLabel}</span>
              {criteriaCount > 0 && (!desktop || marketsEdited) && <>
                <small data-criteria-count aria-hidden="true">{messages.number(criteriaCount)}</small>
                {!desktop && <VisuallyHidden> {messages.plural("slips.activeFilterCount", criteriaCount)}</VisuallyHidden>}
              </>}
              <ChevronRightIcon data-dialog-arrow />
            </CriteriaTrigger>
          </CriteriaOption>
          {!desktop && savedFiltersButton}
        </CriteriaOptions>
        <Actions data-criteria-actions data-toolbar-group="actions">
          <CriteriaTitle data-criteria-title>{messages.text("slips.toolbar.actions")}</CriteriaTitle>
          <ActionControls>
          {desktop && savedFiltersButton}
          <ClearLink href={action} variant="quiet" prefetch={false} onClick={(event) => { event.preventDefault(); reset(); }}><ResetIcon />{messages.text("slips.reset")}</ClearLink>
          {subscriberOnly ? <BuildLink data-slip-access-action href={subscriberHref(signedIn, action, "login")} prefetch={false}>
            <SlipBuildActionLabel locale={locale} restricted signedIn={signedIn} />
          </BuildLink> : <BuildButton data-slip-access-action type="submit" disabled={pending}>
            <SlipBuildActionLabel locale={locale} restricted={false} signedIn={signedIn} pending={pending} />
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
      {subscriberOnly ? null : pending && !generated ? <SlipLoading locale={locale} label={messages.text("slips.building")} /> : generated ? <>
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
