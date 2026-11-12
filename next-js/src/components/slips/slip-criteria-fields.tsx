import { ChoicePicker } from "@/components/ui/choice-picker";
import type { TextInputProps } from "@/components/ui/controls";
import { DateTimeField } from "@/components/ui/date-time-field";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { fullDayKickoffTime } from "@/domain/kickoff-time";
import type { MarketFamily } from "@/domain/markets";
import { predictionLabel } from "@/domain/prediction-label";
import { publicPolicy } from "@/domain/public-policy";
import { serializeSlipCriteria, slipBuilderRules, slipInputFields, type SlipCriteria, type SlipCriteriaErrorCode, type SlipInputs } from "@/domain/slip-builder";
import { commitSlipNumber, slipDateBounds, slipNumberRangeIssue, type SlipDateTimeField, type SlipNumericField } from "@/domain/slip-input-guards";
import { slipMarketSelections, type SlipMarketSelection } from "@/domain/slip-markets";
import { createMessages } from "@/i18n/messages";
import { SlipNumericInput } from "./slip-numeric-input";
import { BuilderEssentials, FieldGroup, Fields, KickoffFields, LimitGroups, MarketChoice, MarketChoices, MarketField, Note, ReuseRow, TargetGroups } from "./slip-styles";

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

export function allSlipMarketsAutomatic(selectedMarkets: readonly MarketFamily[], outcomes: Outcomes) {
  return publicPolicy.markets.every(family => selectedMarkets.includes(family) && !outcomes[family]?.length);
}

type CriteriaFieldsOptions = Readonly<{
  locale: string; prefix: string; draft: SlipInputs; resetDraft: SlipInputs; error: BuilderIssue | null; errorId: string;
  feedbackKey: number; desktop: boolean; enhanced: boolean; showJoint: boolean;
  selectedMarkets: readonly MarketFamily[]; outcomes: Outcomes; reuse: boolean;
  onFieldChange: (field: SlipInputField, value: string) => void;
  onKickoffChange: (endpoint: KickoffEndpoint, day: string, minute: string) => void;
  onMarketToggle: (family: MarketFamily) => void;
  onOutcomesChange: (family: MarketFamily, outcomes: readonly SlipMarketSelection[]) => void;
  onAutomaticMarkets: () => void;
  onReuseChange: (enabled: boolean) => void;
  resetKickoffOnFeedback?: boolean; reuseInMarkets?: boolean; timeZone?: string; interval?: boolean;
}>;

/** Builder and saved filters share field controls and validation feedback. */
export function renderSlipCriteriaFields({ locale, prefix, draft, resetDraft, error, errorId, feedbackKey, desktop, enhanced, showJoint,
  selectedMarkets, outcomes, reuse, onFieldChange, onKickoffChange, onMarketToggle, onOutcomesChange, onAutomaticMarkets, onReuseChange,
  resetKickoffOnFeedback = false, reuseInMarkets = false, timeZone = publicPolicy.reportingTimeZone, interval = false }: CriteriaFieldsOptions) {
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
        label={messages.text(`slips.dateTime${endpoint}`)} value={value} required
        aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
        onValueChange={value => { const [day = "", minute = ""] = value.split("T"); onKickoffChange(endpoint, day, minute); }} />
    </>;
  }

  const targets = <BuilderEssentials data-slip-builder-essentials>
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
  </BuilderEssentials>;

  const limits = <LimitGroups>
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

  const kickoff = <>
    <legend>{messages.text("slips.dateAndTime")}</legend>
    {enhanced || interval ? <KickoffFields data-combined-kickoff-fields>
      {interval && <input type="hidden" name="tz" value={timeZone} />}
      {kickoffField("From")}{kickoffField("To")}
    </KickoffFields> : <Fields data-kickoff-fields>
      {field("dateFrom", messages.text("slips.dateFrom"))}
      {field("dateTo", messages.text("slips.dateTo"))}
      {field("timeFrom", messages.text("slips.timeFrom"))}
      {field("timeTo", messages.text("slips.timeTo"))}
    </Fields>}
  </>;

  const reuseField = <ReuseRow>
    <input type="hidden" name="reuse" value="0" />
    <label><input type="checkbox" name="reuse" value="1" checked={reuse}
      aria-describedby={desktop ? `${prefix}-reuse-hint` : undefined} onChange={event => onReuseChange(event.target.checked)} />{messages.text("slips.reuse")}</label>
    {desktop && <Note id={`${prefix}-reuse-hint`}>{messages.text("slips.reuseHint")}</Note>}
  </ReuseRow>;

  const markets = <FieldGroup data-criteria-field="markets" aria-describedby={invalidField === "markets" || invalidField === "outcomes" ? errorId : undefined}>
    <VisuallyHidden as="legend">{messages.text("slips.accordion.markets")}</VisuallyHidden>
    {desktop && <Note>{messages.text("slips.marketsHint")}</Note>}
    {!desktop && enhanced && <>
      <MarketChoice>
        <input type="checkbox" checked={allSlipMarketsAutomatic(selectedMarkets, outcomes)} aria-describedby={`${prefix}-all-automatic-hint`}
          onChange={onAutomaticMarkets} />
        {messages.text("slips.automatic")}
      </MarketChoice>
      <Note id={`${prefix}-all-automatic-hint`}>{messages.text("slips.automaticAllHint")}</Note>
    </>}
    <MarketChoices>
      {publicPolicy.markets.map(family => {
        const enabled = selectedMarkets.includes(family);
        const market = messages.text(family === "total-goals" ? "slips.totalGoalsMarket" : `market.family.${family}`);
        return <MarketField key={family}>
          <MarketChoice>
            <input type="checkbox" name="markets" value={family} checked={enabled} onChange={() => onMarketToggle(family)}
              aria-invalid={invalidField === "markets" || undefined} />{market}
          </MarketChoice>
          <ChoicePicker inline name={`picks.${family}`} label={messages.text("slips.outcomeLabel", { market })}
            automaticLabel={messages.text("slips.automatic")} automaticHint={messages.text("slips.automaticHint")}
            options={slipMarketSelections[family].map(value => ({ value, label: predictionLabel(messages, value) }))}
            selected={outcomes[family] ?? []} onChange={values => onOutcomesChange(family, values as readonly SlipMarketSelection[])}
            disabled={!enabled} invalid={invalidField === "outcomes"} {...(invalidField === "outcomes" ? { describedBy: errorId } : {})} />
        </MarketField>;
      })}
    </MarketChoices>
    {reuseInMarkets && reuseField}
  </FieldGroup>;

  return { targets, limits, kickoff, markets, reuse: reuseField };
}
