"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/components/analytics/tracker";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { ButtonLink, TextInput, type TextInputProps } from "@/components/ui/controls";
import { ChoicePicker } from "@/components/ui/choice-picker";
import { CriteriaDialog } from "@/components/ui/criteria-dialog";
import { EmptyState } from "@/components/ui/feedback";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { addReportingDays, parseReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { marketSelections, type MarketFamily, type MarketSelection } from "@/domain/markets";
import { slipsHref } from "@/domain/navigation";
import { subscriberHref } from "@/domain/subscriber-navigation";
import { predictionLabel } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipBuilderRules, slipInputFields,
  type SlipCriteria, type SlipCriteriaErrorCode, type SlipInputs } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import type { SlipBuildPageResult } from "@/domain/slip-page";
import { SlipTable } from "./slip-table";
import { Actions, BuildButton, BuilderHeader, BuilderPanel, ClearLink, CriteriaError, CriteriaForm, CriteriaOptions, CriteriaTrigger, FieldGroup,
  Fields, HeadingRow, LimitGroups, MarketChoice, MarketChoices, MarketField, Note, Results, ReuseRow, SlipHeading, SlipStack, TargetGroups } from "./slip-styles";

export function SlipAccessRequired({ locale, showAccount = false, signedIn = false }: { locale: string; showAccount?: boolean; signedIn?: boolean }) {
  const messages = createMessages(locale);
  return <SlipStack><AppBrandBar locale={locale} showAccount={showAccount} />
    <EmptyState headingLevel={1} title={messages.text("paywall.slips")} description={messages.text("paywall.slipsDescription")}
      action={<ButtonLink size="large" href={subscriberHref(signedIn, "/en/slips")} prefetch={false}>{messages.text(signedIn ? "subscribe.title" : "account.register")}</ButtonLink>} />
  </SlipStack>;
}

export type SlipCriteriaIssue = Readonly<{ code: SlipCriteriaErrorCode; field: keyof SlipCriteria | "query" }>;
type CriteriaGroup = "limits" | "kickoff" | "markets";
type NumericRangeField = `${"total" | "teams" | "odds" | "prob" | "totalProb"}${"Min" | "Max"}`;
const groupFields = {
  limits: ["oddsMin", "oddsMax", "probMin", "probMax", "totalProbMin", "totalProbMax"],
  kickoff: ["dateFrom", "dateTo", "timeFrom", "timeTo"],
  markets: [],
} as const;
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
  const bound = (defaults[name] ?? (name.endsWith("Min") ? 0 : 100)) / (name === "totalMin" || name === "totalMax" || name.startsWith("odds") ? 100 : 1);
  return value === undefined || value === "" ? bound : Number(value);
}

/** Blank numeric limits display Any while retaining the parser's supported bounds. */
function criteriaDraft(criteria: SlipCriteria, inputs: SlipInputs = {}): SlipInputs {
  const values = serializeSlipCriteria(criteria), defaults = defaultSlipCriteria(criteria.dateFrom);
  return Object.fromEntries(slipInputFields.map((name) => {
    let value = inputs[name] ?? values.get(name) ?? "";
    if (!value && name !== "slips" && !isNumericRange(name)) value = values.get(name) || (name === "timeFrom" ? fullDayKickoffTime.from : name === "timeTo" ? fullDayKickoffTime.to : "");
    // Display the same number without spending phone width on trailing decimal zeroes.
    const numericFormat = name.startsWith("prob") || name.startsWith("totalProb") ? /^(0|[1-9]\d*)(?:\.\d{1,3})?$/
      : name.startsWith("odds") || name.startsWith("total") ? /^(0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^[1-9]\d*$/;
    if (name !== "dateFrom" && name !== "dateTo" && name !== "timeFrom" && name !== "timeTo" && numericFormat.test(value)) {
      value = isNumericRange(name) && rangeValue(name, value, defaults) === rangeValue(name, undefined, defaults) ? "" : String(Number(value));
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
}>;

/** The native GET form and enhanced navigation use the same strict criteria parser. */
export function SlipBuilder({ locale, today, criteria, result, error: initialError = null, initialInputs = {}, initialMarkets, initialOutcomes, initialReuse, showAccount = false, subscriberOnly = false, signedIn = false, jointEstimates = false }: Props) {
  const messages = createMessages(locale), router = useRouter(), prefix = useId();
  const [pending, startTransition] = useTransition(), [error, setError] = useState(initialError);
  const enhanced = useSyncExternalStore(subscribeNever, clientReady, serverReady);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const action = slipsHref(locale), errorId = `${prefix}-error`, formId = `${prefix}-form`;
  const resetCriteria = { ...defaultSlipCriteria(today), timeFrom: fullDayKickoffTime.from, timeTo: fullDayKickoffTime.to };
  const resetDraft = criteriaDraft(resetCriteria);
  const [draft, setDraft] = useState(() => criteriaDraft(criteria, initialInputs));
  const [selectedMarkets, setSelectedMarkets] = useState(initialMarkets ?? criteria.markets);
  const [outcomes, setOutcomes] = useState(initialOutcomes ?? criteria.outcomes ?? {});
  const [reuse, setReuse] = useState(initialReuse ?? criteria.reuse);
  const [activeGroup, setActiveGroup] = useState<CriteriaGroup | null>(() => issueGroup(initialError));
  const snapshot = useRef<{ group: CriteriaGroup; draft: SlipInputs; markets: typeof selectedMarkets; outcomes: typeof outcomes; reuse: boolean } | null>(
    activeGroup ? { group: activeGroup, draft: { ...draft }, markets: selectedMarkets, outcomes, reuse } : null);
  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => errorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [error, activeGroup]);
  function range(from: typeof slipInputFields[number], to: typeof slipInputFields[number], unit = "") {
    const lower = draft[from]?.trim(), upper = draft[to]?.trim(), any = messages.text("slips.any");
    if (!lower && !upper) return any;
    const minimum = lower ? `${lower}${unit}` : any, maximum = upper ? `${upper}${unit}` : any;
    return minimum === maximum ? minimum : `${minimum}–${maximum}`;
  }
  function dateSummary() {
    if (!draft.dateFrom && !draft.dateTo) return messages.text("slips.summary.anyDates");
    try {
      const from = parseReportingDate(draft.dateFrom || today), to = parseReportingDate(draft.dateTo || addReportingDays(from, 30));
      return from === to ? messages.reportingDateShort(from) : `${messages.reportingDateShort(from)}–${messages.reportingDateShort(to)}`;
    } catch { return messages.text("slips.summary.checkDates"); }
  }
  const invalidField = error?.field;
  const showJoint = jointEstimates || criteria.totalProbMin !== undefined || criteria.totalProbMax !== undefined
    || initialInputs.totalProbMin !== undefined || initialInputs.totalProbMax !== undefined;
  const invalidLimits = groupFields.limits.some((field) => field === invalidField);
  const invalidKickoff = invalidField === "dateFrom" || invalidField === "dateTo" || invalidField === "timeFrom" || invalidField === "timeTo";
  const invalidMarkets = invalidField === "markets" || invalidField === "outcomes";
  const manualMarkets = selectedMarkets.filter((family) => outcomes[family]?.length).length;
  const marketsSummary = messages.text("slips.summary.markets", {
    markets: selectedMarkets.length === publicPolicy.markets.length
      ? messages.text("slips.summary.allMarkets", { count: messages.number(selectedMarkets.length) })
      : messages.plural("slips.marketCount", selectedMarkets.length),
    results: manualMarkets ? messages.text("slips.summary.chosenResults", { count: messages.number(manualMarkets) })
      : messages.text("slips.summary.automaticResults"),
  });
  const errorGroup = issueGroup(error);
  const dialogTitle = (group: CriteriaGroup) => group === "limits" ? messages.text("slips.dialog.limits")
    : group === "kickoff" ? messages.text("slips.dialog.kickoffTitle") : messages.text("slips.accordion.markets");
  const summaries = {
    limits: messages.text(showJoint ? "slips.summary.limitsJoint" : "slips.summary.limits", { odds: range("oddsMin", "oddsMax"), probability: range("probMin", "probMax", "%"), combined: range("totalProbMin", "totalProbMax", "%") }),
    kickoff: messages.text("slips.summary.kickoff", { dates: dateSummary(), times: range("timeFrom", "timeTo") }),
    markets: marketsSummary,
  };
  function changed(fields: readonly typeof slipInputFields[number][]) {
    return fields.some((name) => isNumericRange(name)
      ? rangeValue(name, draft[name], resetCriteria) !== rangeValue(name, undefined, resetCriteria) : draft[name] !== resetDraft[name]);
  }
  const criteriaCounts = {
    limits: Number(changed(["oddsMin", "oddsMax"])) + Number(changed(["probMin", "probMax"])) + Number(changed(["totalProbMin", "totalProbMax"])),
    kickoff: Number(changed(["dateFrom", "dateTo"])) + Number(changed(["timeFrom", "timeTo"])),
    markets: selectedMarkets.length,
  };
  function edited(group: CriteriaGroup) {
    return group === "markets" ? selectedMarkets.length !== publicPolicy.markets.length || manualMarkets > 0 || reuse : criteriaCounts[group] > 0;
  }
  function openDialog(group: CriteriaGroup) {
    snapshot.current = { group, draft: { ...draft }, markets: selectedMarkets, outcomes, reuse };
    setActiveGroup(group);
  }
  function cancelDialog() {
    const previous = snapshot.current;
    if (previous) {
      if (previous.group === "markets") { setSelectedMarkets(previous.markets); setOutcomes(previous.outcomes); setReuse(previous.reuse); }
      else setDraft((current) => ({ ...current, ...Object.fromEntries(groupFields[previous.group].map((name) => [name, previous.draft[name]])) }));
    }
    setError((current) => issueGroup(current) === activeGroup ? null : current);
    snapshot.current = null; setActiveGroup(null);
  }
  function applyDialog(group: CriteriaGroup) {
    const parameters = serializeSlipCriteria(resetCriteria);
    for (const name of groupFields[group]) parameters.set(name, draft[name] ?? "");
    if (group === "markets") {
      parameters.delete("markets");
      selectedMarkets.forEach((market) => parameters.append("markets", market));
      for (const market of selectedMarkets) outcomes[market]?.forEach((value) => parameters.append(`picks.${market}`, value));
      parameters.set("reuse", reuse ? "1" : "0"); parameters.set("build", "1");
    }
    try {
      const empty = group === "kickoff" && groupFields.kickoff.find((name) => !draft[name]?.trim());
      if (empty) throw new SlipCriteriaError(empty, empty.startsWith("time") ? "invalid-time-range" : "invalid-date-range");
      parseSlipCriteria(parameters, today);
      setError((current) => issueGroup(current) === group ? null : current);
      snapshot.current = null; setActiveGroup(null);
    } catch (issue) {
      if (!(issue instanceof SlipCriteriaError)) throw issue;
      setError({ code: issue.code, field: issue.field });
    }
  }
  function reset() {
    setDraft(resetDraft); setSelectedMarkets(publicPolicy.markets); setOutcomes({}); setReuse(false);
    setError(null); snapshot.current = null; setActiveGroup(null);
    if (window.location.search) startTransition(() => router.push(action, { scroll: false }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parameters = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string") parameters.append(key, value); });
    try {
      const next = serializeSlipCriteria(parseSlipCriteria(parameters, today));
      next.set("build", "1"); setError(null); trackEvent("slip_build");
      const href = `${action}?${next}`;
      startTransition(() => {
        if (`${window.location.pathname}${window.location.search}` === href) router.refresh();
        else router.push(href, { scroll: false });
      });
    } catch (issue) {
      if (issue instanceof SlipCriteriaError) {
        const nextError = { code: issue.code, field: issue.field };
        setError(nextError);
        const group = issueGroup(nextError);
        if (group) openDialog(group); else { snapshot.current = null; setActiveGroup(null); }
      }
      else throw issue;
    }
  }

  function field(name: typeof slipInputFields[number], label: TextInputProps["label"], options: Omit<TextInputProps, "label" | "name"> = {}) {
    const invalid = error?.field === name || (error?.field === "dateFrom" && name === "dateTo")
      || (error?.field === "timeFrom" && name === "timeTo")
      || (error?.field === "totalMin" && name === "totalMax") || (error?.field === "oddsMin" && name === "oddsMax")
      || (error?.field === "probMin" && name === "probMax") || (error?.field === "totalProbMin" && name === "totalProbMax") || (error?.field === "teamsMin" && name === "teamsMax");
    return <TextInput name={name} id={`${prefix}-${name}`} label={label} type="number" inputMode="decimal"
      placeholder={isNumericRange(name) ? messages.text("slips.any") : undefined}
      value={draft[name] ?? ""} onChange={(event) => { const value = event.currentTarget.value.slice(0, 256); setDraft((current) => ({ ...current, [name]: value })); }} aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : undefined} {...options} />;
  }
  function errorMessage(group: CriteriaGroup | null) {
    return error && errorGroup === group ? <CriteriaError id={errorId} ref={errorRef} tabIndex={-1} role="alert">{messages.text(`slips.error.${error.code}`)}</CriteriaError> : null;
  }
  const oddsOptions = { min: slipBuilderRules.minimumOddsHundredths / 100, step: "0.01" };
  const data = result?.data, generated = result?.state === "generated" && data !== null && data !== undefined;
  const emptyState = result?.state === "generated" ? "data-unavailable" : result?.state;

  return <SlipStack aria-busy={pending}>
    <AppBrandBar locale={locale} showAccount={showAccount} />
    <BuilderHeader>
      <SlipHeading>{messages.text("slips.title")}</SlipHeading>
      {field("slips", messages.text("slips.count"), { form: formId, min: 1, max: slipBuilderRules.maximumSlips, step: 1, inputMode: "numeric", required: true, "aria-label": messages.text("slips.count") })}
    </BuilderHeader>
    <BuilderPanel aria-labelledby={`${prefix}-criteria`}>
      <VisuallyHidden as="h2" id={`${prefix}-criteria`}>{messages.text("slips.criteria")}</VisuallyHidden>
      <CriteriaForm id={formId} action={action} method="get" ref={formRef} onSubmit={submit} noValidate>
        <input type="hidden" name="build" value="1" />
        <FieldGroup data-criteria-field="targets"><VisuallyHidden as="legend">{messages.text("slips.yourSlips")}</VisuallyHidden><TargetGroups>
          <fieldset><legend>{messages.text("slips.totalOddsRange")}</legend><Fields>
            {field("totalMin", messages.text("slips.minimum"), { ...oddsOptions, max: slipBuilderRules.maximumTotalOddsHundredths / 100, "aria-label": messages.text("slips.totalMin") })}
            {field("totalMax", messages.text("slips.maximum"), { ...oddsOptions, max: slipBuilderRules.maximumTotalOddsHundredths / 100, "aria-label": messages.text("slips.totalMax") })}
          </Fields></fieldset>
          <fieldset><legend>{messages.text("slips.selectionsRange")}</legend><Fields>
            {field("teamsMin", messages.text("slips.minimum"), { min: 1, max: slipBuilderRules.maximumSelections, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMin") })}
            {field("teamsMax", messages.text("slips.maximum"), { min: 1, max: slipBuilderRules.maximumSelections, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMax") })}
          </Fields></fieldset>
        </TargetGroups></FieldGroup>
        <CriteriaOptions data-slip-criteria-options hidden={!enhanced}>
          {(["limits", "kickoff", "markets"] as const).map((group) => <CriteriaTrigger key={group} type="button" variant="secondary" data-criteria-trigger={group}
            data-edited={edited(group)} aria-haspopup="dialog" aria-controls={`${prefix}-${group}`} aria-expanded={activeGroup === group}
            aria-describedby={`${prefix}-${group}-summary`} aria-invalid={({ limits: invalidLimits, kickoff: invalidKickoff, markets: invalidMarkets })[group] || undefined}
            disabled={pending} onClick={() => openDialog(group)}>
            <span data-criteria-label>{messages.text(`slips.dialog.${group}`)}</span>
            {(group === "markets" || criteriaCounts[group] > 0) && <>
              <small data-criteria-count aria-hidden="true">{messages.number(criteriaCounts[group])}</small>
              <VisuallyHidden> {messages.plural(group === "markets" ? "slips.marketCount" : "slips.activeFilterCount", criteriaCounts[group])}</VisuallyHidden>
            </>}
          </CriteriaTrigger>)}
        </CriteriaOptions>
        {(["limits", "kickoff", "markets"] as const).map((group) => <VisuallyHidden key={group} id={`${prefix}-${group}-summary`}>{summaries[group]}</VisuallyHidden>)}
        <CriteriaDialog id={`${prefix}-limits`} group="limits" title={dialogTitle("limits")} open={activeGroup === "limits"}
          onCancel={cancelDialog} onApply={() => applyDialog("limits")} applyLabel={messages.text("slips.dialog.apply")}
          cancelLabel={messages.text("slips.dialog.cancel")} closeLabel={messages.text("slips.dialog.close", { section: dialogTitle("limits") })}>
        {errorMessage("limits")}
        <FieldGroup as="div"><LimitGroups>
          <fieldset><legend>{messages.text("slips.individualOdds")}</legend><Fields>
            {field("oddsMin", messages.text("slips.minimum"), { ...oddsOptions, max: slipBuilderRules.maximumOddsHundredths / 100, "aria-label": messages.text("slips.oddsMin") })}
            {field("oddsMax", messages.text("slips.maximum"), { ...oddsOptions, max: slipBuilderRules.maximumOddsHundredths / 100, "aria-label": messages.text("slips.oddsMax") })}
          </Fields></fieldset>
          <fieldset><legend>{messages.text("slips.probabilityPercent")}</legend><Fields>
            {field("probMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMin") })}
            {field("probMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMax") })}
          </Fields></fieldset>
          {showJoint && <fieldset data-joint-limit><legend>{messages.text("slips.combinedProbabilityPercent")}</legend><Fields>
            {field("totalProbMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.totalProbMin") })}
            {field("totalProbMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.totalProbMax") })}
          </Fields><Note>{messages.text("slips.combinedProbabilityHint")}</Note></fieldset>}
        </LimitGroups></FieldGroup>
        </CriteriaDialog>
        <CriteriaDialog id={`${prefix}-kickoff`} group="kickoff" title={dialogTitle("kickoff")} open={activeGroup === "kickoff"}
          onCancel={cancelDialog} onApply={() => applyDialog("kickoff")} applyLabel={messages.text("slips.dialog.apply")}
          cancelLabel={messages.text("slips.dialog.cancel")} closeLabel={messages.text("slips.dialog.close", { section: dialogTitle("kickoff") })}>
        {errorMessage("kickoff")}
        <FieldGroup data-criteria-field="kickoff"><VisuallyHidden as="legend">{dialogTitle("kickoff")}</VisuallyHidden><Fields data-kickoff-fields>
          {field("dateFrom", messages.text("slips.dateFrom"), { type: "date", inputMode: undefined })}
          {field("dateTo", messages.text("slips.dateTo"), { type: "date", inputMode: undefined })}
          {field("timeFrom", messages.text("slips.timeFrom"), { type: "time", inputMode: undefined, step: 60 })}
          {field("timeTo", messages.text("slips.timeTo"), { type: "time", inputMode: undefined, step: 60 })}
        </Fields></FieldGroup>
        </CriteriaDialog>
        <CriteriaDialog id={`${prefix}-markets`} group="markets" title={dialogTitle("markets")} open={activeGroup === "markets"}
          onCancel={cancelDialog} onApply={() => applyDialog("markets")} applyLabel={messages.text("slips.dialog.apply")}
          cancelLabel={messages.text("slips.dialog.cancel")} closeLabel={messages.text("slips.dialog.close", { section: dialogTitle("markets") })}>
        {errorMessage("markets")}
        <FieldGroup data-criteria-field="markets" aria-describedby={invalidMarkets ? errorId : undefined}>
          <VisuallyHidden as="legend">{messages.text("slips.accordion.markets")}</VisuallyHidden><MarketChoices>
            {publicPolicy.markets.map((family) => <MarketField key={family}><MarketChoice>
              <input type="checkbox" name="markets" value={family} checked={selectedMarkets.includes(family)}
                onChange={() => {
                  setSelectedMarkets(selectedMarkets.includes(family) ? selectedMarkets.filter((value) => value !== family) : [...selectedMarkets, family]);
                  setOutcomes((current) => { const next = { ...current }; delete next[family]; return next; });
                }} aria-invalid={error?.field === "markets" || undefined} />{messages.text(`market.family.${family}`)}
            </MarketChoice><ChoicePicker inline name={`picks.${family}`} label={messages.text("slips.outcomeLabel", { market: messages.text(`market.family.${family}`) })}
              automaticLabel={messages.text("slips.automatic")} automaticHint={messages.text("slips.automaticHint")}
              options={marketSelections[family].map((value) => ({ value, label: predictionLabel(messages, value) }))}
              selected={outcomes[family] ?? []} onChange={(values) => setOutcomes((current) => ({ ...current, [family]: values as readonly MarketSelection[] }))}
              disabled={!selectedMarkets.includes(family)} invalid={error?.field === "outcomes"} {...(error?.field === "outcomes" ? { describedBy: errorId } : {})} />
            </MarketField>)}
          </MarketChoices>
        <ReuseRow>
          <input type="hidden" name="reuse" value="0" />
          <label><input type="checkbox" name="reuse" value="1" checked={reuse} onChange={(event) => setReuse(event.target.checked)} />{messages.text("slips.reuse")}</label>
        </ReuseRow>
        </FieldGroup>
        </CriteriaDialog>
        {errorMessage(null)}
        <Actions data-criteria-actions>
          <ClearLink href={action} variant="secondary" prefetch={false} onClick={(event) => { event.preventDefault(); reset(); }}>{messages.text("slips.reset")}</ClearLink>
          {subscriberOnly ? <ButtonLink href={subscriberHref(signedIn, "/en/slips")} prefetch={false}>{messages.text(signedIn ? "subscribe.title" : "account.register")}</ButtonLink>
            : <BuildButton type="submit" disabled={pending}>{messages.text(pending ? "slips.building" : "slips.build")}</BuildButton>}
        </Actions>
      </CriteriaForm>
    </BuilderPanel>
    <Results data-slip-state={result?.state ?? "idle"} aria-busy={pending} aria-labelledby={`${prefix}-results`}>
      <HeadingRow><h2 id={`${prefix}-results`}>{messages.text("slips.generated")}</h2>
        {data && <Note>{messages.text("slips.resultCount", { count: messages.number(data.slips.length),
          requested: messages.plural("slips.requestedCount", criteria.slips), matches: messages.plural("slips.qualifyingMatches", data.qualifyingMatches) })}</Note>}
      </HeadingRow>
      {subscriberOnly ? <EmptyState headingLevel={3} title={messages.text("paywall.slips")} description={messages.text("paywall.slipsDescription")} action={<ButtonLink href={subscriberHref(signedIn, "/en/slips")} prefetch={false}>{messages.text(signedIn ? "subscribe.title" : "account.register")}</ButtonLink>} /> : generated ? <>
        <Note>{messages.text(data.jointProbabilities ? "slips.jointRanking" : "slips.ranking")}</Note>
        {data.slips.map((slip, index) => {
          const estimatedProbability = data.jointProbabilities?.[slip.id];
          return <SlipTable key={slip.id} slip={slip} index={index} locale={locale}
            {...(estimatedProbability !== undefined ? { estimatedProbability } : {})} />;
        })}
        <Note>{messages.text("slips.averageHint")}</Note>
      </> : <EmptyState headingLevel={3} title={messages.text(emptyState ? `slips.state.${emptyState}.title` : "slips.idleTitle")}
        description={messages.text(emptyState ? `slips.state.${emptyState}.description` : "slips.idle")} />}
      {result?.searchLimited && <Note>{messages.text("slips.limited")}</Note>}
      {result?.partialCoverage && <Note>{messages.text("slips.partial")}</Note>}
      {generated && data.slips.length < criteria.slips && !result.searchLimited && <Note>{messages.text("slips.fewer")}</Note>}
      {data && (data.excludedMissingOdds > 0 || data.excludedMissingForecast > 0) && <Note>{messages.text("slips.excluded", {
        odds: messages.number(data.excludedMissingOdds), forecasts: messages.number(data.excludedMissingForecast) })}</Note>}
      {data?.excludedUnestimated !== undefined && data.excludedUnestimated > 0 && <Note>{messages.plural("slips.unestimated", data.excludedUnestimated)}</Note>}
      {result && <Note>{messages.text("slips.asOf", { time: messages.reportingInstant(utcInstantFromEpochMilliseconds(result.asOf)) })}</Note>}
      {!result && !publicPolicy.features.providerOdds && <Note>{messages.text("slips.oddsNotice")}</Note>}
      <VisuallyHidden role="status" aria-live="polite">{pending ? messages.text("slips.building") : ""}</VisuallyHidden>
    </Results>
  </SlipStack>;
}
