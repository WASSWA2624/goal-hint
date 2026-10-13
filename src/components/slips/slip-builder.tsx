"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { TextInput, type TextInputProps } from "@/components/ui/controls";
import { ChoicePicker } from "@/components/ui/choice-picker";
import { EmptyState } from "@/components/ui/feedback";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { marketSelections, type MarketFamily, type MarketSelection } from "@/domain/markets";
import { slipsHref } from "@/domain/navigation";
import { publicPolicy } from "@/domain/public-policy";
import { defaultSlipCriteria, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipBuilderRules, slipInputFields,
  type SlipCriteria, type SlipCriteriaErrorCode, type SlipInputs } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import type { SlipBuildPageResult } from "@/domain/slip-page";
import { SlipTable } from "./slip-table";
import { Actions, BuildButton, ClearLink, CriteriaError, CriteriaForm, CriteriaPanel, FieldGroup,
  Fields, HeadingRow, MarketChoice, MarketChoices, MarketField, Note, Results, SlipHeading, SlipStack } from "./slip-styles";

export type SlipCriteriaIssue = Readonly<{ code: SlipCriteriaErrorCode; field: keyof SlipCriteria | "query" }>;
type Props = Readonly<{
  locale: string; today: ReportingDate; criteria: SlipCriteria; result: SlipBuildPageResult | null;
  error?: SlipCriteriaIssue | null; initialInputs?: SlipInputs; initialMarkets?: readonly MarketFamily[];
  initialOutcomes?: SlipCriteria["outcomes"];
  initialReuse?: boolean;
}>;

/** The native GET form and enhanced navigation use the same strict criteria parser. */
export function SlipBuilder({ locale, today, criteria, result, error: initialError = null, initialInputs = {}, initialMarkets, initialOutcomes, initialReuse }: Props) {
  const messages = createMessages(locale), router = useRouter(), prefix = useId();
  const [pending, startTransition] = useTransition(), [error, setError] = useState(initialError);
  const formRef = useRef<HTMLFormElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const defaults = serializeSlipCriteria(criteria), action = slipsHref(locale), errorId = `${prefix}-error`;
  const anyCriteria = { ...defaultSlipCriteria(today), dateTo: defaultSlipCriteria(criteria.dateFrom).dateTo };
  const [selectedMarkets, setSelectedMarkets] = useState(initialMarkets ?? criteria.markets);
  const [outcomes, setOutcomes] = useState(initialOutcomes ?? criteria.outcomes ?? {});
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

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
      next.set("build", "1"); setError(null);
      const href = `${action}?${next}`;
      startTransition(() => {
        if (`${window.location.pathname}${window.location.search}` === href) router.refresh();
        else router.push(href, { scroll: false });
      });
    } catch (issue) {
      if (issue instanceof SlipCriteriaError) setError({ code: issue.code, field: issue.field });
      else throw issue;
    }
  }

  function field(name: typeof slipInputFields[number], label: TextInputProps["label"], options: Omit<TextInputProps, "label" | "name"> = {}) {
    const invalid = error?.field === name || (error?.field === "dateFrom" && name === "dateTo")
      || (error?.field === "timeFrom" && name === "timeTo")
      || (error?.field === "totalMin" && name === "totalMax") || (error?.field === "oddsMin" && name === "oddsMax")
      || (error?.field === "probMin" && name === "probMax") || (error?.field === "teamsMin" && name === "teamsMax");
    const anyValue = name !== "slips" && criteria[name] === anyCriteria[name];
    return <TextInput name={name} id={`${prefix}-${name}`} label={label} type="number" inputMode="decimal" placeholder={messages.text("slips.any")}
      defaultValue={initialInputs[name] ?? (anyValue ? "" : defaults.get(name) ?? "")} aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : undefined} {...options} />;
  }
  const oddsOptions = { min: slipBuilderRules.minimumOddsHundredths / 100, step: "0.01" };
  const data = result?.data, generated = result?.state === "generated" && data !== null && data !== undefined;
  const emptyState = result?.state === "generated" ? "data-unavailable" : result?.state;

  return <SlipStack>
    <AppBrandBar locale={locale} />
    <SlipHeading>{messages.text("slips.title")}</SlipHeading>
    <CriteriaPanel aria-labelledby={`${prefix}-criteria`}>
      <HeadingRow><h2 id={`${prefix}-criteria`}>{messages.text("slips.criteria")}</h2></HeadingRow>
      <Note>{messages.text("slips.anyHint")}</Note>
      <CriteriaForm action={action} method="get" ref={formRef} onSubmit={submit} noValidate>
        <input type="hidden" name="build" value="1" />
        <FieldGroup><legend>{messages.text("slips.targets")}</legend><Fields>
          {field("totalMin", messages.text("slips.totalMin"), { ...oddsOptions, max: slipBuilderRules.maximumTotalOddsHundredths / 100 })}
          {field("totalMax", messages.text("slips.totalMax"), { ...oddsOptions, max: slipBuilderRules.maximumTotalOddsHundredths / 100 })}
          {field("teamsMin", messages.text("slips.teamsMin"), { min: 1, max: slipBuilderRules.maximumSelections, step: 1, inputMode: "numeric" })}
          {field("teamsMax", messages.text("slips.teamsMax"), { min: 1, max: slipBuilderRules.maximumSelections, step: 1, inputMode: "numeric" })}
          {field("slips", messages.text("slips.count"), { min: 1, max: slipBuilderRules.maximumSlips, step: 1, inputMode: "numeric", required: true })}
        </Fields></FieldGroup>
        <FieldGroup><legend>{messages.text("slips.limits")}</legend><Fields>
          {field("oddsMin", messages.text("slips.oddsMin"), { ...oddsOptions, max: slipBuilderRules.maximumOddsHundredths / 100 })}
          {field("oddsMax", messages.text("slips.oddsMax"), { ...oddsOptions, max: slipBuilderRules.maximumOddsHundredths / 100 })}
          {field("probMin", messages.text("slips.probMin"), { min: 0, max: 100, step: "0.001" })}
          {field("probMax", messages.text("slips.probMax"), { min: 0, max: 100, step: "0.001" })}
        </Fields><Note>{messages.text("slips.oddsHint")}</Note></FieldGroup>
        <FieldGroup data-criteria-field="kickoff"><legend>{messages.text("slips.kickoff")}</legend><Fields>
          {field("dateFrom", messages.text("slips.dateFrom"), { type: "date", inputMode: undefined })}
          {field("dateTo", messages.text("slips.dateTo"), { type: "date", inputMode: undefined })}
          {field("timeFrom", messages.text("slips.timeFrom"), { type: "time", inputMode: undefined, step: 60 })}
          {field("timeTo", messages.text("slips.timeTo"), { type: "time", inputMode: undefined, step: 60 })}
        </Fields><Note>{messages.text("slips.timeHint")}</Note></FieldGroup>
        <FieldGroup data-criteria-field="markets" aria-describedby={error?.field === "markets" ? errorId : undefined}>
          <legend>{messages.text("slips.markets")}</legend><MarketChoices>
            {publicPolicy.markets.map((family) => <MarketField key={family}><MarketChoice>
              <input type="checkbox" name="markets" value={family} checked={selectedMarkets.includes(family)}
                onChange={() => {
                  setSelectedMarkets(selectedMarkets.includes(family) ? selectedMarkets.filter((value) => value !== family) : [...selectedMarkets, family]);
                  setOutcomes((current) => { const next = { ...current }; delete next[family]; return next; });
                }} aria-invalid={error?.field === "markets" || undefined} />{messages.text(`market.family.${family}`)}
            </MarketChoice><ChoicePicker name={`picks.${family}`} label={messages.text("slips.outcomeLabel", { market: messages.text(`market.family.${family}`) })}
              automaticLabel={messages.text("slips.anyAutomatic")} automaticHint={messages.text("slips.automaticHint")}
              options={marketSelections[family].map((value) => ({ value, label: messages.text(`market.selection.${value}`) }))}
              selected={outcomes[family] ?? []} onChange={(values) => setOutcomes((current) => ({ ...current, [family]: values as readonly MarketSelection[] }))}
              disabled={!selectedMarkets.includes(family)} invalid={error?.field === "outcomes"} {...(error?.field === "outcomes" ? { describedBy: errorId } : {})} />
            </MarketField>)}
          </MarketChoices>
          <Note>{messages.text("slips.outcomeHint")}</Note>
        </FieldGroup>
        {error && <CriteriaError id={errorId} ref={errorRef} tabIndex={-1} role="alert">{messages.text(`slips.error.${error.code}`)}</CriteriaError>}
        <Actions>
          <input type="hidden" name="reuse" value="0" />
          <label><input type="checkbox" name="reuse" value="1" defaultChecked={initialReuse ?? criteria.reuse} />{messages.text("slips.reuse")}</label>
          <ClearLink href={action} variant="secondary" prefetch={false} onClick={(event) => {
            if (window.location.pathname === action && window.location.search === "") {
              event.preventDefault(); formRef.current?.reset(); setError(null); setSelectedMarkets(publicPolicy.markets); setOutcomes({});
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
