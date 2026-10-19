"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/components/analytics/tracker";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { ButtonLink, TextInput, type TextInputProps } from "@/components/ui/controls";
import { ChoicePicker } from "@/components/ui/choice-picker";
import { CriteriaAccordion } from "@/components/ui/criteria-accordion";
import { EmptyState } from "@/components/ui/feedback";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { addReportingDays, parseReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { marketSelections, type MarketFamily, type MarketSelection } from "@/domain/markets";
import { slipsHref } from "@/domain/navigation";
import { predictionLabel } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipBuilderRules, slipInputFields,
  type SlipCriteria, type SlipCriteriaErrorCode, type SlipInputs } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import type { SlipBuildPageResult } from "@/domain/slip-page";
import { SlipTable } from "./slip-table";
import { Actions, BuildButton, ClearLink, CriteriaError, CriteriaForm, CriteriaPanel, FieldGroup,
  Fields, HeadingRow, LimitGroups, MarketChoice, MarketChoices, MarketField, Note, Results, ReuseRow, SlipHeading, SlipStack, TargetGroups } from "./slip-styles";

export function SlipAccessRequired({ locale, showAccount = false }: { locale: string; showAccount?: boolean }) {
  const messages = createMessages(locale);
  return <SlipStack><AppBrandBar locale={locale} showAccount={showAccount} />
    <EmptyState title={messages.text("paywall.slips")} description={messages.text("paywall.slipsDescription")}
      action={<ButtonLink size="large" href="/en/subscribe" prefetch={false}>{messages.text("paywall.getAccess")}</ButtonLink>} />
  </SlipStack>;
}

export type SlipCriteriaIssue = Readonly<{ code: SlipCriteriaErrorCode; field: keyof SlipCriteria | "query" }>;
type Props = Readonly<{
  locale: string; today: ReportingDate; criteria: SlipCriteria; result: SlipBuildPageResult | null;
  error?: SlipCriteriaIssue | null; initialInputs?: SlipInputs; initialMarkets?: readonly MarketFamily[];
  initialOutcomes?: SlipCriteria["outcomes"];
  initialReuse?: boolean; showAccount?: boolean;
}>;

/** The native GET form and enhanced navigation use the same strict criteria parser. */
export function SlipBuilder({ locale, today, criteria, result, error: initialError = null, initialInputs = {}, initialMarkets, initialOutcomes, initialReuse, showAccount = false }: Props) {
  const messages = createMessages(locale), router = useRouter(), prefix = useId();
  const [pending, startTransition] = useTransition(), [error, setError] = useState(initialError);
  const [validationVersion, setValidationVersion] = useState(0);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const defaults = serializeSlipCriteria(criteria), action = slipsHref(locale), errorId = `${prefix}-error`;
  const anyCriteria = { ...defaultSlipCriteria(today), dateTo: defaultSlipCriteria(criteria.dateFrom).dateTo };
  const initialDraft: SlipInputs = Object.fromEntries(slipInputFields.map((name) => [name,
    initialInputs[name] ?? (name !== "slips" && criteria[name] === anyCriteria[name] ? "" : defaults.get(name) ?? "")]));
  const [draft, setDraft] = useState(initialDraft), [resetVersion, setResetVersion] = useState(0);
  const [selectedMarkets, setSelectedMarkets] = useState(initialMarkets ?? criteria.markets);
  const [outcomes, setOutcomes] = useState(initialOutcomes ?? criteria.outcomes ?? {});
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function updateDraft(form: HTMLFormElement) {
    const values = new FormData(form), next: SlipInputs = {};
    for (const name of slipInputFields) {
      const value = values.get(name); next[name] = typeof value === "string" ? value.slice(0, 256) : "";
    }
    setDraft((current) => slipInputFields.every((name) => current[name] === next[name]) ? current : next);
  }
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
  const invalidLimits = invalidField === "oddsMin" || invalidField === "oddsMax" || invalidField === "probMin" || invalidField === "probMax";
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parameters = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => { if (typeof value === "string") parameters.append(key, value); });
    try {
      const next = serializeSlipCriteria(parseSlipCriteria(parameters, today));
      // Empty bounds mean Any; retain that useful visual affordance in the URL.
      for (const field of slipInputFields) {
        if (parameters.get(field) === "") next.set(field, "");
      }
      next.set("build", "1"); setError(null); trackEvent("slip_build");
      const href = `${action}?${next}`;
      startTransition(() => {
        if (`${window.location.pathname}${window.location.search}` === href) router.refresh();
        else router.push(href, { scroll: false });
      });
    } catch (issue) {
      if (issue instanceof SlipCriteriaError) {
        setError({ code: issue.code, field: issue.field }); setValidationVersion((current) => current + 1);
      }
      else throw issue;
    }
  }

  function field(name: typeof slipInputFields[number], label: TextInputProps["label"], options: Omit<TextInputProps, "label" | "name"> = {}) {
    const invalid = error?.field === name || (error?.field === "dateFrom" && name === "dateTo")
      || (error?.field === "timeFrom" && name === "timeTo")
      || (error?.field === "totalMin" && name === "totalMax") || (error?.field === "oddsMin" && name === "oddsMax")
      || (error?.field === "probMin" && name === "probMax") || (error?.field === "teamsMin" && name === "teamsMax");
    return <TextInput name={name} id={`${prefix}-${name}`} label={label} type="number" inputMode="decimal" placeholder={messages.text("slips.any")}
      defaultValue={initialDraft[name]} aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : undefined} {...options} />;
  }
  const oddsOptions = { min: slipBuilderRules.minimumOddsHundredths / 100, step: "0.01" };
  const data = result?.data, generated = result?.state === "generated" && data !== null && data !== undefined;
  const emptyState = result?.state === "generated" ? "data-unavailable" : result?.state;

  return <SlipStack aria-busy={pending}>
    <AppBrandBar locale={locale} showAccount={showAccount} />
    <SlipHeading>{messages.text("slips.title")}</SlipHeading>
    <CriteriaPanel aria-labelledby={`${prefix}-criteria`}>
      <VisuallyHidden as="h2" id={`${prefix}-criteria`}>{messages.text("slips.criteria")}</VisuallyHidden>
      <CriteriaForm $hasError={error !== null} action={action} method="get" ref={formRef} onSubmit={submit} onInput={(event) => updateDraft(event.currentTarget)} noValidate>
        <input type="hidden" name="build" value="1" />
        <FieldGroup data-criteria-field="targets"><legend>{messages.text("slips.yourSlips")}</legend><TargetGroups>
          {field("slips", messages.text("slips.countShort"), { min: 1, max: slipBuilderRules.maximumSlips, step: 1, inputMode: "numeric", required: true, "aria-label": messages.text("slips.count") })}
          <fieldset><legend>{messages.text("slips.totalOddsRange")}</legend><Fields>
            {field("totalMin", messages.text("slips.minimum"), { ...oddsOptions, max: slipBuilderRules.maximumTotalOddsHundredths / 100, "aria-label": messages.text("slips.totalMin") })}
            {field("totalMax", messages.text("slips.maximum"), { ...oddsOptions, max: slipBuilderRules.maximumTotalOddsHundredths / 100, "aria-label": messages.text("slips.totalMax") })}
          </Fields></fieldset>
          <fieldset><legend>{messages.text("slips.selectionsRange")}</legend><Fields>
            {field("teamsMin", messages.text("slips.minimum"), { min: 1, max: slipBuilderRules.maximumSelections, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMin") })}
            {field("teamsMax", messages.text("slips.maximum"), { min: 1, max: slipBuilderRules.maximumSelections, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMax") })}
          </Fields></fieldset>
        </TargetGroups></FieldGroup>
        <CriteriaAccordion group="limits" title={messages.text("slips.accordion.limits")} resetVersion={resetVersion} invalid={invalidLimits} validationVersion={validationVersion}
          summary={messages.text("slips.summary.limits", { odds: range("oddsMin", "oddsMax"), probability: range("probMin", "probMax", "%") })}>
        <FieldGroup as="div"><LimitGroups>
          <fieldset><legend>{messages.text("slips.individualOdds")}</legend><Fields>
            {field("oddsMin", messages.text("slips.minimum"), { ...oddsOptions, max: slipBuilderRules.maximumOddsHundredths / 100, "aria-label": messages.text("slips.oddsMin") })}
            {field("oddsMax", messages.text("slips.maximum"), { ...oddsOptions, max: slipBuilderRules.maximumOddsHundredths / 100, "aria-label": messages.text("slips.oddsMax") })}
          </Fields></fieldset>
          <fieldset><legend>{messages.text("slips.probabilityPercent")}</legend><Fields>
            {field("probMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMin") })}
            {field("probMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMax") })}
          </Fields></fieldset>
        </LimitGroups><Note>{messages.text("slips.oddsHint")}</Note></FieldGroup>
        </CriteriaAccordion>
        <CriteriaAccordion group="kickoff" title={messages.text("slips.accordion.kickoff")} resetVersion={resetVersion} invalid={invalidKickoff} validationVersion={validationVersion}
          summary={messages.text("slips.summary.kickoff", { dates: dateSummary(), times: draft.timeFrom || draft.timeTo
            ? range("timeFrom", "timeTo") : messages.text("slips.summary.allDay") })}>
        <FieldGroup data-criteria-field="kickoff"><legend>{messages.text("slips.kickoff")}</legend><Fields>
          {field("dateFrom", messages.text("slips.dateFrom"), { type: "date", inputMode: undefined })}
          {field("dateTo", messages.text("slips.dateTo"), { type: "date", inputMode: undefined })}
          {field("timeFrom", messages.text("slips.timeFrom"), { type: "time", inputMode: undefined, step: 60 })}
          {field("timeTo", messages.text("slips.timeTo"), { type: "time", inputMode: undefined, step: 60 })}
        </Fields><Note>{messages.text("slips.timeHint")}</Note></FieldGroup>
        </CriteriaAccordion>
        <CriteriaAccordion group="markets" title={messages.text("slips.accordion.markets")} resetVersion={resetVersion} invalid={invalidMarkets} validationVersion={validationVersion}
          summary={marketsSummary}>
        <FieldGroup data-criteria-field="markets" aria-describedby={invalidMarkets ? errorId : undefined}>
          <legend>{messages.text("slips.accordion.markets")}</legend><MarketChoices>
            {publicPolicy.markets.map((family) => <MarketField key={family}><MarketChoice>
              <input type="checkbox" name="markets" value={family} checked={selectedMarkets.includes(family)}
                onChange={() => {
                  setSelectedMarkets(selectedMarkets.includes(family) ? selectedMarkets.filter((value) => value !== family) : [...selectedMarkets, family]);
                  setOutcomes((current) => { const next = { ...current }; delete next[family]; return next; });
                }} aria-invalid={error?.field === "markets" || undefined} />{messages.text(`market.family.${family}`)}
            </MarketChoice><ChoicePicker name={`picks.${family}`} label={messages.text("slips.outcomeLabel", { market: messages.text(`market.family.${family}`) })}
              automaticLabel={messages.text("slips.anyAutomatic")} automaticHint={messages.text("slips.automaticHint")}
              options={marketSelections[family].map((value) => ({ value, label: predictionLabel(messages, value) }))}
              selected={outcomes[family] ?? []} onChange={(values) => setOutcomes((current) => ({ ...current, [family]: values as readonly MarketSelection[] }))}
              disabled={!selectedMarkets.includes(family)} invalid={error?.field === "outcomes"} {...(error?.field === "outcomes" ? { describedBy: errorId } : {})} />
            </MarketField>)}
          </MarketChoices>
          <Note>{messages.text("slips.outcomeHint")}</Note>
        </FieldGroup>
        </CriteriaAccordion>
        <ReuseRow>
          <input type="hidden" name="reuse" value="0" />
          <label><input type="checkbox" name="reuse" value="1" defaultChecked={initialReuse ?? criteria.reuse} />{messages.text("slips.reuse")}</label>
        </ReuseRow>
        <Note data-criteria-hint>{messages.text("slips.compactHint")}</Note>
        {error && <CriteriaError id={errorId} ref={errorRef} tabIndex={-1} role="alert">{messages.text(`slips.error.${error.code}`)}</CriteriaError>}
        <Actions>
          <ClearLink href={action} variant="secondary" prefetch={false} onClick={(event) => {
            if (window.location.pathname === action && window.location.search === "") {
              event.preventDefault(); formRef.current?.reset(); setDraft(initialDraft); setResetVersion((current) => current + 1);
              setError(null); setSelectedMarkets(publicPolicy.markets); setOutcomes({});
            }
          }}>{messages.text("slips.reset")}</ClearLink>
          <BuildButton type="submit" disabled={pending}>{messages.text(pending ? "slips.building" : "slips.build")}</BuildButton>
        </Actions>
      </CriteriaForm>
    </CriteriaPanel>
    <Results data-slip-state={result?.state ?? "idle"} aria-busy={pending} aria-labelledby={`${prefix}-results`}>
      <HeadingRow><h2 id={`${prefix}-results`}>{messages.text("slips.generated")}</h2>
        {data && <Note>{messages.text("slips.resultCount", { count: messages.number(data.slips.length),
          requested: messages.plural("slips.requestedCount", criteria.slips), matches: messages.plural("slips.qualifyingMatches", data.qualifyingMatches) })}</Note>}
      </HeadingRow>
      {generated ? <>
        <Note>{messages.text("slips.ranking")}</Note>
        {data.slips.map((slip, index) => <SlipTable key={slip.id} slip={slip} index={index} locale={locale} />)}
        <Note>{messages.text("slips.averageHint")}</Note>
      </> : <EmptyState headingLevel={3} title={messages.text(emptyState ? `slips.state.${emptyState}.title` : "slips.idleTitle")}
        description={messages.text(emptyState ? `slips.state.${emptyState}.description` : "slips.idle")} />}
      {result?.searchLimited && <Note>{messages.text("slips.limited")}</Note>}
      {result?.partialCoverage && <Note>{messages.text("slips.partial")}</Note>}
      {generated && data.slips.length < criteria.slips && !result.searchLimited && <Note>{messages.text("slips.fewer")}</Note>}
      {data && (data.excludedMissingOdds > 0 || data.excludedMissingForecast > 0) && <Note>{messages.text("slips.excluded", {
        odds: messages.number(data.excludedMissingOdds), forecasts: messages.number(data.excludedMissingForecast) })}</Note>}
      {result && <Note>{messages.text("slips.asOf", { time: messages.reportingInstant(utcInstantFromEpochMilliseconds(result.asOf)) })}</Note>}
      {!result && !publicPolicy.features.providerOdds && <Note>{messages.text("slips.oddsNotice")}</Note>}
      <VisuallyHidden role="status" aria-live="polite">{pending ? messages.text("slips.building") : ""}</VisuallyHidden>
    </Results>
  </SlipStack>;
}
