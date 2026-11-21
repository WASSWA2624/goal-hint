import { FilterDateTimeRow, FilterSection } from "@/components/ui/advanced-filter-dialog";
import type { TextInputProps } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import type { MarketFilterMatches } from "@/domain/market-filter-search";
import { publicPolicy } from "@/domain/public-policy";
import { serializeSlipCriteria, slipBuilderRules, slipInputFields, type SlipCriteria, type SlipCriteriaErrorCode, type SlipInputs } from "@/domain/slip-builder";
import { commitSlipNumber, slipDateBounds, slipNumberRangeIssue, type SlipDateTimeField, type SlipNumericField } from "@/domain/slip-input-guards";
import type { SlipMarketFamily, SlipMarketSelection } from "@/domain/slip-markets";
import { createMessages } from "@/i18n/messages";
import { SlipMarketFilterFields } from "./slip-market-filter-fields";
import { SlipNumericInput } from "./slip-numeric-input";
import { BuilderCriteriaGrid, Fields, Note, ReuseRow } from "./slip-styles";

export type SlipCriteriaIssue = Readonly<{ code: SlipCriteriaErrorCode; field: keyof SlipCriteria | "query" }>;
export type BuilderIssue = SlipCriteriaIssue | Readonly<{ field: SlipNumericField; message: string }>;
export type SlipInputField = typeof slipInputFields[number];
export type NumericRangeField = `${"total" | "teams" | "odds" | "prob" | "totalProb"}${"Min" | "Max"}`;
type KickoffEndpoint = "From" | "To";
type Outcomes = NonNullable<SlipCriteria["outcomes"]>;

export function isDateTimeField(name: SlipInputField): name is SlipDateTimeField {
  return name === "dateFrom" || name === "dateTo" || name === "timeFrom" || name === "timeTo";
}

export function isNumericRange(name: string): name is NumericRangeField {
  return name.endsWith("Min") || name.endsWith("Max");
}

/** Submit canonical values without changing the text in the controls. */
export function commitNumericParameters(parameters: URLSearchParams) {
  for (const field of slipInputFields) {
    if (isDateTimeField(field)) continue;
    const raw = parameters.get(field);
    if (raw === null) continue;
    const result = commitSlipNumber(field, raw);
    if (!result.accepted) return { field, result };
    parameters.set(field, result.value);
  }
  return null;
}

/** Keep configured defaults explicit, unrestricted ceilings blank, and invalid submitted drafts editable. */
export function criteriaDraft(criteria: SlipCriteria, inputs: SlipInputs = {}): SlipInputs {
  const values = serializeSlipCriteria(criteria);
  return Object.fromEntries(slipInputFields.map((name) => {
    const initialValue = criteria.interval && isDateTimeField(name) ? criteria[name] : values.get(name);
    let value = inputs[name] ?? initialValue ?? "";
    if (!value && name !== "slips" && !isNumericRange(name)) value = initialValue || (name === "timeFrom" ? fullDayKickoffTime.from : name === "timeTo" ? fullDayKickoffTime.to : "");
    // Keep total odds at two decimal places; other ranges retain compact numeric formatting.
    const numericFormat = name.startsWith("prob") || name.startsWith("totalProb") ? /^(0|[1-9]\d*)(?:\.\d{1,3})?$/
      : name.startsWith("odds") || name.startsWith("total") ? /^(0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^[1-9]\d*$/;
    if (!isDateTimeField(name) && numericFormat.test(value)) {
      if (name === "totalMin" || name === "totalMax") {
        const checked = commitSlipNumber(name, value);
        if (checked.accepted) value = checked.value;
      } else value = name === "totalProbMin" && Number(value) === 0 ? ""
        : value.includes(".") ? value.replace(/0+$/u, "").replace(/\.$/u, "") : value;
    }
    return [name, value];
  }));
}

export { allSlipMarketsAutomatic, slipMarketFilterSummary } from "./slip-market-filter-fields";

type CriteriaFieldsOptions = Readonly<{
  locale: string; prefix: string; draft: SlipInputs; resetDraft: SlipInputs; error: BuilderIssue | null; errorId: string;
  feedbackKey: number; enhanced: boolean; showJoint: boolean;
  selectedMarkets: readonly SlipMarketFamily[]; outcomes: Outcomes; reuse: boolean;
  onFieldChange: (field: SlipInputField, value: string) => void;
  onKickoffChange: (endpoint: KickoffEndpoint, day: string, minute: string) => void;
  onMarketToggle: (family: SlipMarketFamily) => void;
  onOutcomesChange: (family: SlipMarketFamily, outcomes: readonly SlipMarketSelection[]) => void;
  onAutomaticMarkets: () => void;
  onReuseChange: (enabled: boolean) => void;
  resetKickoffOnFeedback?: boolean; timeZone?: string; interval?: boolean;
}>;

/** Builder and saved filters share field controls and validation feedback. */
export function renderSlipCriteriaFields({ locale, prefix, draft, resetDraft, error, errorId, feedbackKey, enhanced, showJoint,
  selectedMarkets, outcomes, reuse, onFieldChange, onKickoffChange, onMarketToggle, onOutcomesChange, onAutomaticMarkets, onReuseChange,
  resetKickoffOnFeedback = false, timeZone = publicPolicy.reportingTimeZone, interval = false }: CriteriaFieldsOptions) {
  const messages = createMessages(locale);
  const invalidField = error?.field;
  const criteriaError = error && "code" in error ? error : null;
  const oddsOptions = { min: slipBuilderRules.minimumOddsHundredths / 100, step: "0.01" };
  const kickoffKey = (name: string) => resetKickoffOnFeedback ? `${name}-${feedbackKey}` : undefined;

  function field(name: SlipInputField, label: TextInputProps["label"], options: Omit<TextInputProps, "label" | "name"> = {}) {
    const numericMessage = error && "message" in error && error.field === name ? error.message : undefined;
    const invalid = Boolean(numericMessage) || criteriaError?.field === name || (invalidField === "dateFrom" && name === "dateTo")
      || (invalidField === "timeFrom" && name === "timeTo")
      || (criteriaError?.field === "totalMin" && name === "totalMax") || (criteriaError?.field === "oddsMin" && name === "oddsMax")
      || (criteriaError?.field === "probMin" && name === "probMax") || (criteriaError?.field === "totalProbMin" && name === "totalProbMax") || (criteriaError?.field === "teamsMin" && name === "teamsMax");
    const shared = { name, id: `${prefix}-${name}`, label,
      placeholder: isNumericRange(name) ? messages.text("slips.any") : undefined,
      "aria-invalid": invalid || undefined, "aria-describedby": invalid && criteriaError && !isDateTimeField(name) ? errorId : undefined, ...options };
    if (!isDateTimeField(name)) return <SlipNumericInput {...shared} field={name} locale={locale}
      feedbackKey={feedbackKey} validationMessage={numericMessage}
      value={draft[name] ?? ""} onValueChange={value => onFieldChange(name, value)}
      rangeError={value => slipNumberRangeIssue(name, { ...draft, [name]: value }, resetDraft) ? messages.text("slips.guard.range") : undefined} />;
    const date = name.startsWith("date");
    const bounds = date ? name === "dateFrom" ? { min: "0001-01-01", max: "9999-12-31" } : slipDateBounds("dateTo", draft)
      : { min: name === "timeTo" ? draft.timeFrom || fullDayKickoffTime.from : fullDayKickoffTime.from, max: fullDayKickoffTime.to };
    return <DateTimeField key={kickoffKey(name)} {...shared} locale={locale} mode={date ? "date" : "time"} {...bounds}
      required value={draft[name] ?? ""} error={invalid && criteriaError ? messages.text(`slips.error.${criteriaError.code}`) : undefined}
      onValueChange={value => onFieldChange(name, value)} />;
  }

  function kickoffField(endpoint: KickoffEndpoint) {
    const date = `date${endpoint}` as const, time = `time${endpoint}` as const;
    const value = draft[date] && draft[time] ? `${draft[date]}T${draft[time]}` : "";
    const invalid = invalidField === date || invalidField === time
      || endpoint === "To" && (invalidField === "dateFrom" || invalidField === "timeFrom");
    return <>
      {!interval && <>
        <input type="hidden" name={date} value={draft[date] ?? ""} />
        <input type="hidden" name={time} value={draft[time] ?? ""} />
      </>}
      <DateTimeField key={kickoffKey(date)} id={`${prefix}-date-time-${endpoint}`} locale={locale} mode="datetime" timeZone={timeZone}
        name={interval ? endpoint === "From" ? "start" : "end" : undefined}
        label={messages.text(endpoint === "From" ? "feed.filters.from" : "feed.filters.to")} value={value} required
        aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        onValueChange={value => { const [day = "", minute = ""] = value.split("T"); onKickoffChange(endpoint, day, minute); }} />
    </>;
  }

  const targets = <BuilderCriteriaGrid data-slip-builder-essentials data-criteria-field="targets">
    <FilterSection data-slip-count><legend>{messages.text("slips.totalSlips")}</legend>
      {field("slips", null, { min: 1, max: slipBuilderRules.maximumSlips, step: 1, inputMode: "numeric", required: true, "aria-label": messages.text("slips.count") })}
    </FilterSection>
    <FilterSection><legend>{messages.text("slips.mobile.totalOdds")}</legend><Fields>
      {field("totalMin", messages.text("slips.minimum"), { ...oddsOptions, "aria-label": messages.text("slips.totalMin") })}
      {field("totalMax", messages.text("slips.maximum"), { ...oddsOptions, "aria-label": messages.text("slips.totalMax") })}
    </Fields></FilterSection>
    <FilterSection><legend>{messages.text("slips.mobile.matches")}</legend><Fields>
      {field("teamsMin", messages.text("slips.minimum"), { min: 1, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMin") })}
      {field("teamsMax", messages.text("slips.maximum"), { min: 1, step: 1, inputMode: "numeric", "aria-label": messages.text("slips.teamsMax") })}
    </Fields></FilterSection>
  </BuilderCriteriaGrid>;

  const limits = <BuilderCriteriaGrid data-slip-limits>
    <FilterSection><legend>{messages.text("slips.individualOdds")}</legend><Fields>
      {field("oddsMin", messages.text("slips.minimum"), { ...oddsOptions, "aria-label": messages.text("slips.oddsMin") })}
      {field("oddsMax", messages.text("slips.maximum"), { ...oddsOptions, "aria-label": messages.text("slips.oddsMax") })}
    </Fields></FilterSection>
    <FilterSection><legend>{messages.text("slips.probabilityPercent")}</legend><Fields>
      {field("probMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMin") })}
      {field("probMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.probMax") })}
    </Fields></FilterSection>
    {showJoint && <FilterSection data-joint-limit><legend>{messages.text("slips.combinedProbabilityPercent")}</legend><Fields>
      {field("totalProbMin", messages.text("slips.minimum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.totalProbMin") })}
      {field("totalProbMax", messages.text("slips.maximum"), { min: 0, max: 100, step: "0.001", "aria-label": messages.text("slips.totalProbMax") })}
    </Fields><Note>{messages.text("slips.combinedProbabilityHint")}</Note></FilterSection>}
  </BuilderCriteriaGrid>;

  const kickoff = <>
    <legend>{messages.text("filters.dateTimeWindow")}</legend>
    {enhanced || interval ? <FilterDateTimeRow data-combined-kickoff-fields>
      {interval && <input type="hidden" name="tz" value={timeZone} />}
      {kickoffField("From")}{kickoffField("To")}
    </FilterDateTimeRow> : <Fields data-kickoff-fields>
      {field("dateFrom", messages.text("slips.dateFrom"))}
      {field("dateTo", messages.text("slips.dateTo"))}
      {field("timeFrom", messages.text("slips.timeFrom"))}
      {field("timeTo", messages.text("slips.timeTo"))}
    </Fields>}
  </>;

  const reuseField = <ReuseRow>
    <input type="hidden" name="reuse" value="0" />
    <label><input type="checkbox" name="reuse" value="1" checked={reuse}
      aria-describedby={`${prefix}-reuse-hint`} onChange={event => onReuseChange(event.target.checked)} />{messages.text("slips.reuse")}</label>
    <Note id={`${prefix}-reuse-hint`}>{messages.text("slips.reuseHint")}</Note>
  </ReuseRow>;

  const markets = (matches: MarketFilterMatches | null) => <SlipMarketFilterFields
    {...{ messages, prefix, matches, enhanced, selectedMarkets, outcomes, invalidField, errorId,
      onMarketToggle, onOutcomesChange, onAutomaticMarkets }} />;

  return { targets, limits, kickoff, markets, reuse: reuseField };
}
