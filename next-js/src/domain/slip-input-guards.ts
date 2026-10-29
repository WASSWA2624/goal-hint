import { addReportingDays, parseReportingDate, validateReportingDateRange } from "./calendar.ts";
import { slipBuilderRules, type SlipInputs, type slipInputFields } from "./slip-builder.ts";
import { formatOddsHundredths } from "./odds.ts";

export type SlipNumericField = Exclude<typeof slipInputFields[number], "dateFrom" | "dateTo" | "timeFrom" | "timeTo">;
export type SlipDateTimeField = "dateFrom" | "dateTo" | "timeFrom" | "timeTo";
export type SlipNumberGuardIssue = "number" | "whole-number" | "precision" | "minimum" | "maximum";
export type SlipNumberGuardResult = Readonly<{ accepted: true; value: string; complete: boolean }>
  | Readonly<{ accepted: false; issue: SlipNumberGuardIssue; limit?: string }>;
export type SlipNumericRule = Readonly<{
  minimum: string; maximum: string; precision: number; step: string; grouped: boolean; required: boolean;
}>;

const countRule: SlipNumericRule = Object.freeze({ minimum: "1", maximum: String(Number.MAX_SAFE_INTEGER), precision: 0, step: "1", grouped: true, required: false });
const slipRule: SlipNumericRule = Object.freeze({ ...countRule, maximum: String(slipBuilderRules.maximumSlips), grouped: false, required: true });
const oddsRule: SlipNumericRule = Object.freeze({ minimum: formatOddsHundredths(slipBuilderRules.minimumOddsHundredths), maximum: formatOddsHundredths(slipBuilderRules.maximumOddsHundredths), precision: 2, step: "0.01", grouped: false, required: false });
const totalOddsRule: SlipNumericRule = Object.freeze({ ...oddsRule, maximum: formatOddsHundredths(slipBuilderRules.maximumTotalOddsHundredths) });
const probabilityRule: SlipNumericRule = Object.freeze({ minimum: "0", maximum: "100", precision: 3, step: "0.001", grouped: false, required: false });

/** UI bounds mirror the shared parser; an unrestricted match ceiling is not an arbitrary UI cap. */
export function slipNumericRule(field: SlipNumericField): SlipNumericRule {
  if (field === "slips") return slipRule;
  if (field.startsWith("teams")) return countRule;
  if (field.startsWith("total") && !field.startsWith("totalProb")) return totalOddsRule;
  return field.startsWith("prob") || field.startsWith("totalProb") ? probabilityRule : oddsRule;
}

function scaled(value: string, precision: number): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole || "0") * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0") || "0");
}

/** Accept useful edit states without letting signs, exponents, precision or ceiling violations through. */
export function guardSlipNumber(field: SlipNumericField, raw: string, commit = false): SlipNumberGuardResult {
  const rule = slipNumericRule(field);
  if (raw === "") return commit && rule.required ? { accepted: false, issue: "minimum", limit: rule.minimum }
    : { accepted: true, value: "", complete: !rule.required };
  if (raw.length > 64 || !/^\d*(?:\.\d*)?$/u.test(raw) || raw === "." && rule.precision === 0) {
    return { accepted: false, issue: rule.precision === 0 ? "whole-number" : "number" };
  }
  if (rule.precision === 0 && raw.includes(".")) return { accepted: false, issue: "whole-number" };
  const [whole = "", fraction] = raw.split(".");
  if (fraction !== undefined && fraction.length > rule.precision) return { accepted: false, issue: "precision", limit: String(rule.precision) };
  let value = (whole || "0").replace(/^0+(?=\d)/u, "") + (fraction !== undefined ? `.${fraction}` : "");
  if (commit && value.endsWith(".")) value = value.slice(0, -1);
  const amount = scaled(value, rule.precision);
  if (amount > scaled(rule.maximum, rule.precision)) return { accepted: false, issue: "maximum", limit: rule.maximum };
  const aboveFloor = amount >= scaled(rule.minimum, rule.precision);
  if (!aboveFloor && (commit || rule.precision === 0)) return { accepted: false, issue: "minimum", limit: rule.minimum };
  if (commit && (field === "totalMin" || field === "totalMax")) {
    const [integer, decimal = ""] = value.split(".");
    value = `${integer}.${decimal.padEnd(2, "0")}`;
  }
  return { accepted: true, value, complete: aboveFloor && !value.endsWith(".") };
}

/** Decimal grouping never converts a safe-integer count through floating point. */
export function formatSlipMatchCount(value: string): string {
  return /^\d+$/u.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/gu, ",") : value;
}

/** Accept either plain digits or correctly grouped copied text; reject ambiguous punctuation. */
export function normalizeSlipMatchCount(value: string): string | null {
  if (value === "" || /^\d+$/u.test(value)) return value;
  return /^\d{1,3}(?:,\d{3})+$/u.test(value) ? value.replaceAll(",", "") : null;
}

/** Exact decimal steps avoid binary drift and reject a step beyond either hard bound. */
export function stepSlipNumber(field: SlipNumericField, raw: string, direction: 1 | -1): SlipNumberGuardResult {
  const rule = slipNumericRule(field);
  if (raw === "") return guardSlipNumber(field, rule.minimum, true);
  const parsed = guardSlipNumber(field, raw);
  if (!parsed.accepted) return parsed;
  const value = scaled(parsed.value, rule.precision) + BigInt(direction) * scaled(rule.step, rule.precision);
  if (value < scaled(rule.minimum, rule.precision)) return { accepted: false, issue: "minimum", limit: rule.minimum };
  if (value > scaled(rule.maximum, rule.precision)) return { accepted: false, issue: "maximum", limit: rule.maximum };
  const factor = 10n ** BigInt(rule.precision);
  const result = rule.precision === 0 ? String(value) : `${value / factor}.${String(value % factor).padStart(rule.precision, "0")}`;
  return { accepted: true, value: result, complete: true };
}

/** Ordering feedback is separate from draft guards so both bounds remain freely editable. */
export function slipNumberRangeIssue(field: SlipNumericField, draft: SlipInputs, defaults: SlipInputs = {}): "range" | null {
  if (field === "slips") return null;
  const prefix = field.replace(/(?:Min|Max)$/u, "");
  const from = `${prefix}Min` as SlipNumericField, to = `${prefix}Max` as SlipNumericField;
  const rule = slipNumericRule(field), lower = draft[from] || defaults[from] || rule.minimum, upper = draft[to];
  if (!upper) return null;
  const minimum = guardSlipNumber(from, lower, true), maximum = guardSlipNumber(to, upper, true);
  return minimum.accepted && maximum.accepted && scaled(minimum.value, rule.precision) > scaled(maximum.value, rule.precision) ? "range" : null;
}

export type SlipDateTimeGuardIssue = "required" | "date" | "date-order" | "date-window" | "time" | "time-order";
export type SlipDateTimeGuardResult = Readonly<{ accepted: true; value: string; complete: boolean }>
  | Readonly<{ accepted: false; issue: SlipDateTimeGuardIssue }>;

/** Complete calendar values and ordered windows use the same supported years and day budget as builds. */
export function guardSlipDateTime(field: SlipDateTimeField, value: string, draft: SlipInputs, commit = false, validatePeer = true): SlipDateTimeGuardResult {
  if (value === "") return commit ? { accepted: false, issue: "required" } : { accepted: true, value, complete: false };
  if (field.startsWith("date")) {
    try { parseReportingDate(value); } catch { return { accepted: false, issue: "date" }; }
    if (!validatePeer) return { accepted: true, value, complete: true };
    const from = field === "dateFrom" ? value : draft.dateFrom;
    const to = field === "dateTo" ? value : draft.dateTo;
    if (from && to) {
      try { parseReportingDate(from); parseReportingDate(to); } catch { return { accepted: true, value, complete: false }; }
      if (from > to) return { accepted: false, issue: "date-order" };
      try { validateReportingDateRange(from, to, slipBuilderRules.maximumDays); }
      catch { return { accepted: false, issue: "date-window" }; }
    }
    return { accepted: true, value, complete: Boolean(from && to) };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) return { accepted: false, issue: "time" };
  if (!validatePeer) return { accepted: true, value, complete: true };
  const from = field === "timeFrom" ? value : draft.timeFrom;
  const to = field === "timeTo" ? value : draft.timeTo;
  const complete = Boolean(from && to && /^([01]\d|2[0-3]):[0-5]\d$/u.test(from) && /^([01]\d|2[0-3]):[0-5]\d$/u.test(to));
  if (complete && from! > to!) {
    return { accepted: false, issue: "time-order" };
  }
  return { accepted: true, value, complete };
}

/** Calendar input bounds stay within years 0001–9999, including near the representable edges. */
export function slipDateBounds(field: "dateFrom" | "dateTo", draft: SlipInputs): Readonly<{ min: string; max: string }> {
  const peer = field === "dateFrom" ? draft.dateTo : draft.dateFrom;
  try {
    const date = parseReportingDate(peer);
    if (field === "dateFrom") {
      let min = "0001-01-01";
      try { min = addReportingDays(date, 1 - slipBuilderRules.maximumDays); } catch { /* Stay at the supported lower edge. */ }
      return { min, max: date };
    }
    let max = "9999-12-31";
    try { max = addReportingDays(date, slipBuilderRules.maximumDays - 1); } catch { /* Stay at the supported upper edge. */ }
    return { min: date, max };
  } catch { return { min: "0001-01-01", max: "9999-12-31" }; }
}
