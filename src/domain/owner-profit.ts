import { toCsv } from "./analytics-csv.ts";
import { getReportingDate, getReportingDayBounds, parseReportingDate, utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { formatUgx } from "./subscription-plans.ts";

/**
 * Owner profit (B06): what the business actually paid each EAT month, set against the revenue the Overview counts. The
 * owner enters each network's mobile-money charges from its statement, the operating costs and the tax; nothing here is
 * estimated, converted, imported or defaulted, so a missing part reads Not entered, never UGX 0. Net profit exists only for
 * a month that has ended and that the owner has closed. The basis is cash by EAT month. Pure: no server imports.
 */
export const profitRules = Object.freeze({
  maxAmountUgx: 100_000_000,
  labelMax: 80,
  noteMax: 200,
  referenceMax: 80,
  reasonMax: 200,
  monthsShown: 24,
  currency: /^[A-Z]{3}$/u,
  invoiceAmount: /^\d{1,12}(\.\d{1,4})?$/u,
  reference: /^[A-Za-z0-9 ./#:_-]{1,80}$/u,
});

export type CostKind = "fee" | "expense" | "tax";
export type LineKind = Exclude<CostKind, "fee">;
export type ProfitNetwork = "mtn" | "airtel";
export type LineCadence = "monthly" | "yearly";
export const profitNetworks: readonly ProfitNetwork[] = Object.freeze(["mtn", "airtel"]);
export const networkLabels: Readonly<Record<ProfitNetwork, string>> = Object.freeze({ mtn: "MTN", airtel: "Airtel" });

type Category = Readonly<{ value: string; label: string }>;
/** Expense categories, the one tax category and the one charges category; the database CHECKs list the same values. */
export const costCategories = Object.freeze({
  expense: Object.freeze([
    { value: "hosting", label: "Hosting" },
    { value: "football-data", label: "Football data (API-Football)" },
    { value: "sms", label: "SMS messages" },
    { value: "ai", label: "AI service" },
    { value: "domain", label: "Domain name" },
    { value: "refund", label: "Money paid back" },
    { value: "other", label: "Other" },
  ] as const satisfies readonly Category[]),
  tax: Object.freeze([{ value: "tax", label: "Tax" }] as const satisfies readonly Category[]),
  fee: Object.freeze([{ value: "charges", label: "Mobile-money charges" }] as const satisfies readonly Category[]),
});
export type CostCategories = typeof costCategories;
const expenseCategories: ReadonlySet<string> = new Set(costCategories.expense.map(({ value }) => value));
const kindCategory = { fee: "charges", tax: "tax" } as const;

export function costCategoryLabel(kind: CostKind, category: string): string {
  return (costCategories[kind] as readonly Category[]).find(item => item.value === category)?.label ?? "Other";
}

// --- Months ---------------------------------------------------------------------------------------------------------------

declare const profitMonthBrand: unique symbol;
/** An EAT calendar month, `YYYY-MM`. */
export type ProfitMonth = string & { readonly [profitMonthBrand]: true };
const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/u;

export function parseProfitMonth(value: unknown): ProfitMonth | null {
  if (typeof value !== "string") return null;
  const match = monthPattern.exec(value);
  return match && Number(match[1]) >= 1970 && Number(match[1]) <= 9998 ? value as ProfitMonth : null;
}

/** The EAT month an instant (epoch milliseconds) belongs to. */
export function profitMonthOf(ms: number): ProfitMonth {
  return getReportingDate(utcInstantFromEpochMilliseconds(ms)).slice(0, 7) as ProfitMonth;
}

export function addProfitMonths(month: ProfitMonth, count: number): ProfitMonth {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}` as ProfitMonth;
}

/** The month's instants: from 00:00 EAT on its first day to 00:00 EAT on the next month's first day (epoch ms). */
export function profitMonthBounds(month: ProfitMonth): Readonly<{ start: number; end: number }> {
  const first = (value: ProfitMonth) => getReportingDayBounds(parseReportingDate(`${value}-01`)).startInclusive;
  return { start: first(month), end: first(addProfitMonths(month, 1)) };
}

/** The current EAT month and the 23 before it, newest first. */
export function profitMonthWindow(nowMs: number): readonly ProfitMonth[] {
  const current = profitMonthOf(nowMs);
  return Array.from({ length: profitRules.monthsShown }, (_, index) => addProfitMonths(current, -index));
}

export function profitMonthInWindow(month: ProfitMonth, nowMs: number): boolean {
  const window = profitMonthWindow(nowMs);
  return month <= window[0]! && month >= window.at(-1)!;
}

/** The `@db.Date` value for a month: its first day at UTC midnight. Read back with {@link profitMonthFromDate}, never in EAT. */
export function profitMonthDate(month: ProfitMonth): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

export function profitMonthFromDate(value: Date): ProfitMonth {
  return value.toISOString().slice(0, 7) as ProfitMonth;
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
/** "October 2026". */
export function profitMonthLabel(month: ProfitMonth): string {
  return monthFormat.format(profitMonthDate(month));
}

// --- Rows -----------------------------------------------------------------------------------------------------------------

/** A counted payment (approved, not reversed) at the instant it was approved. */
export type ProfitPayment = Readonly<{ network: ProfitNetwork | null; amountUgx: number | null; countedAt: number }>;
/** A manual amount the owner recorded without a network, at the instant the access period was created. */
export type ProfitManual = Readonly<{ amountUgx: number | null; countedAt: number }>;

export type CostLineView = Readonly<{
  id: string;
  kind: LineKind;
  category: string;
  label: string;
  cadence: LineCadence;
  startMonth: ProfitMonth;
  endMonth: ProfitMonth | null;
  typicalUgx: number | null;
  createdAt: string;
  updatedAt: string;
}>;

export type CostEntryView = Readonly<{
  id: string;
  month: ProfitMonth;
  kind: CostKind;
  category: string;
  network: ProfitNetwork | null;
  label: string;
  recurringLineId: string | null;
  amountUgx: number;
  invoiceCurrency: string | null;
  invoiceAmount: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
}>;

export type ProfitSnapshot = Readonly<{ revenueUgx: number; feesUgx: number; expensesUgx: number; taxUgx: number; netUgx: number }>;
/** The stored close of one month; closedAt null means open. */
export type ProfitCloseRow = Readonly<{ month: ProfitMonth; closedAt: string | null; closedBy: string | null; snapshot: ProfitSnapshot | null }>;

/** Whether a recurring line expects an entry in a month: every month from start to end, or a yearly line's calendar month. */
export function lineDueIn(line: Pick<CostLineView, "cadence" | "startMonth" | "endMonth">, month: ProfitMonth): boolean {
  if (month < line.startMonth || line.endMonth !== null && month > line.endMonth) return false;
  return line.cadence === "monthly" || month.slice(5) === line.startMonth.slice(5);
}

// --- Report ---------------------------------------------------------------------------------------------------------------

export type ProfitPart = "revenue" | "fees" | "expenses" | "tax";
type Bucket = Readonly<{ amountUgx: number; count: number }>;
export type MissingLine = Readonly<{ id: string; kind: LineKind; category: string; label: string; typicalUgx: number | null }>;
export type ProfitNet =
  | Readonly<{ status: "available"; amountUgx: number }>
  | Readonly<{ status: "changed"; closedUgx: number; nowUgx: number }>
  | Readonly<{ status: "unavailable"; reasons: readonly string[] }>;

export type ProfitMonthReport = Readonly<{
  month: ProfitMonth;
  label: string;
  /** now is at or after the month's end. */
  ended: boolean;
  revenue: Readonly<{ amountUgx: number; count: number; byNetwork: Readonly<{ mtn: Bucket; airtel: Bucket; manual: Bucket }> }>;
  fees: Readonly<{ amountUgx: number; entries: readonly CostEntryView[]; missingNetworks: readonly ProfitNetwork[] }>;
  expenses: Readonly<{ amountUgx: number; entries: readonly CostEntryView[]; missingLines: readonly MissingLine[] }>;
  tax: Readonly<{ amountUgx: number; entries: readonly CostEntryView[]; missingLines: readonly MissingLine[] }>;
  /** Voided entries, newest first, for the record; never counted. */
  voided: readonly CostEntryView[];
  close: Readonly<{
    state: "open" | "closed" | "changed";
    closedAt: string | null;
    closedBy: string | null;
    snapshot: ProfitSnapshot | null;
    differences: readonly Readonly<{ part: ProfitPart; closedUgx: number; nowUgx: number }>[];
  }>;
  net: ProfitNet;
  closeRequirements: Readonly<{ ok: boolean; reasons: readonly string[]; needsNoTaxConfirmation: boolean; preview: ProfitSnapshot | null }>;
}>;

const sum = (entries: readonly CostEntryView[]) => entries.reduce((total, entry) => total + entry.amountUgx, 0);

/**
 * One month's measured revenue, entered charges, costs and tax, and whether a net profit exists. `payments` and `manual`
 * are counted rows for any span (this function keeps the month's); `entries` may include other months and voided rows.
 * Missing parts are listed only while the month is open: a closed month keeps what the owner confirmed.
 */
export function profitMonthReport({ month, now, payments, manual, lines, entries, close }: {
  month: ProfitMonth; now: number; payments: readonly ProfitPayment[]; manual: readonly ProfitManual[];
  lines: readonly CostLineView[]; entries: readonly CostEntryView[]; close: ProfitCloseRow | null;
}): ProfitMonthReport {
  const label = profitMonthLabel(month), { start, end } = profitMonthBounds(month), ended = now >= end;
  const inMonth = (at: number) => at >= start && at < end;
  const buckets = { mtn: { amountUgx: 0, count: 0 }, airtel: { amountUgx: 0, count: 0 }, manual: { amountUgx: 0, count: 0 } };
  for (const payment of payments) if (inMonth(payment.countedAt)) {
    const bucket = buckets[payment.network ?? "manual"];
    bucket.amountUgx += payment.amountUgx ?? 0; bucket.count += 1;
  }
  for (const row of manual) if (inMonth(row.countedAt)) { buckets.manual.amountUgx += row.amountUgx ?? 0; buckets.manual.count += 1; }
  const revenueUgx = buckets.mtn.amountUgx + buckets.airtel.amountUgx + buckets.manual.amountUgx;
  const count = buckets.mtn.count + buckets.airtel.count + buckets.manual.count;

  const own = entries.filter(entry => entry.month === month);
  const live = own.filter(entry => entry.voidedAt === null);
  const voided = own.filter(entry => entry.voidedAt !== null).sort((a, b) => b.voidedAt!.localeCompare(a.voidedAt!));
  const of = (kind: CostKind) => live.filter(entry => entry.kind === kind);
  const fees = of("fee"), expenses = of("expense"), tax = of("tax");
  const closed = close?.closedAt != null && close.snapshot !== null;
  const missingNetworks = closed ? [] : profitNetworks.filter(network => buckets[network].count > 0 && !fees.some(entry => entry.network === network));
  const missing = (kind: LineKind): MissingLine[] => closed ? [] : lines
    .filter(line => line.kind === kind && lineDueIn(line, month) && !live.some(entry => entry.recurringLineId === line.id))
    .map(({ id, kind, category, label, typicalUgx }) => ({ id, kind, category, label, typicalUgx }));
  const missingExpenses = missing("expense"), missingTax = missing("tax");
  const nowTotals = { revenueUgx, feesUgx: sum(fees), expensesUgx: sum(expenses), taxUgx: sum(tax) };
  const nowNet = nowTotals.revenueUgx - nowTotals.feesUgx - nowTotals.expensesUgx - nowTotals.taxUgx;

  const snapshot = closed ? close.snapshot : null;
  const differences = snapshot ? (["revenue", "fees", "expenses", "tax"] as const).flatMap(part => {
    const key = `${part}Ugx` as const;
    return snapshot[key] === nowTotals[key] ? [] : [{ part, closedUgx: snapshot[key], nowUgx: nowTotals[key] }];
  }) : [];
  const state = !snapshot ? "open" : differences.length > 0 ? "changed" : "closed";

  const reasons = closed ? [`${label} is closed.`] : [
    ...(ended ? [] : [`${label} has not ended.`]),
    ...missingNetworks.map(network => `${networkLabels[network]} charges are not entered for ${label}.`),
    ...[...missingExpenses, ...missingTax].map(line => `${line.label} is not entered for ${label}.`),
  ];
  const ok = !closed && reasons.length === 0;
  const net: ProfitNet = snapshot
    ? (state === "closed" ? { status: "available", amountUgx: snapshot.netUgx } : { status: "changed", closedUgx: snapshot.netUgx, nowUgx: nowNet })
    : { status: "unavailable", reasons: [...reasons, `Close ${label} to confirm every cost and tax is entered.`] };

  return {
    month, label, ended,
    revenue: { amountUgx: revenueUgx, count, byNetwork: buckets },
    fees: { amountUgx: nowTotals.feesUgx, entries: fees, missingNetworks },
    expenses: { amountUgx: nowTotals.expensesUgx, entries: expenses, missingLines: missingExpenses },
    tax: { amountUgx: nowTotals.taxUgx, entries: tax, missingLines: missingTax },
    voided,
    close: { state, closedAt: closed ? close.closedAt : null, closedBy: closed ? close.closedBy : null, snapshot, differences },
    net,
    closeRequirements: { ok, reasons, needsNoTaxConfirmation: !closed && tax.length === 0,
      preview: ok ? { ...nowTotals, netUgx: nowNet } : null },
  };
}

export type ProfitMonthSummary = Readonly<{
  month: ProfitMonth;
  label: string;
  state: ProfitMonthReport["close"]["state"];
  ended: boolean;
  revenueUgx: number;
  payments: number;
  /** Null while an open month has a part not entered. */
  feesUgx: number | null;
  expensesUgx: number | null;
  taxUgx: number | null;
  net: ProfitNet;
}>;

/** The months-list row: a part still missing in an open month is null, never zero. */
export function profitMonthSummary(report: ProfitMonthReport): ProfitMonthSummary {
  return {
    month: report.month, label: report.label, state: report.close.state, ended: report.ended,
    revenueUgx: report.revenue.amountUgx, payments: report.revenue.count,
    feesUgx: report.fees.missingNetworks.length > 0 ? null : report.fees.amountUgx,
    expensesUgx: report.expenses.missingLines.length > 0 ? null : report.expenses.amountUgx,
    taxUgx: report.tax.missingLines.length > 0 ? null : report.tax.amountUgx,
    net: report.net,
  };
}

const stateLabels = { open: "Open", closed: "Closed", changed: "Changed after closing" } as const;
export function profitStateLabel(state: ProfitMonthSummary["state"]): string {
  return stateLabels[state];
}

/** One row per month; amounts are whole UGX numbers, and a part not entered reads "Not entered", never 0. */
export function profitCsv(summaries: readonly ProfitMonthSummary[]): string {
  const part = (value: number | null) => value ?? "Not entered";
  return toCsv<ProfitMonthSummary>([
    { header: "Month", value: row => row.month },
    { header: "Status", value: row => profitStateLabel(row.state) },
    { header: "Revenue (UGX)", value: row => row.revenueUgx },
    { header: "Payments", value: row => row.payments },
    { header: "Mobile-money charges (UGX)", value: row => part(row.feesUgx) },
    { header: "Costs (UGX)", value: row => part(row.expensesUgx) },
    { header: "Tax (UGX)", value: row => part(row.taxUgx) },
    { header: "Net profit (UGX)", value: row => row.net.status === "available" ? row.net.amountUgx : row.net.status === "changed" ? row.net.nowUgx : "Not available" },
    { header: "Net profit when closed (UGX)", value: row => row.net.status === "available" ? row.net.amountUgx : row.net.status === "changed" ? row.net.closedUgx : "" },
  ], summaries);
}

// --- Parsers --------------------------------------------------------------------------------------------------------------

type Errors = Record<string, string>;
type Parsed<Fields> = Readonly<{ ok: true; fields: Fields }> | Readonly<{ ok: false; errors: Readonly<Errors> }>;
const controlCharacters = /[\u0000-\u001f\u007f]/u;
const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export const isProfitRecordId = (value: unknown): value is string => typeof value === "string" && recordId.test(value);
const absent = (value: unknown) => value === undefined || value === null || value === "";
const amountMessage = `Enter a whole UGX amount from 0 to ${formatUgx(profitRules.maxAmountUgx)}.`;
const record = (input: unknown) => input !== null && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;

/** Trimmed plain text: null when blank, an error when it has control characters or is too long. */
function plainText(value: unknown, max: number): { value: string | null } | { error: string } {
  if (absent(value)) return { value: null };
  if (typeof value !== "string") return { error: `Use at most ${max} plain characters.` };
  const trimmed = value.trim();
  if (trimmed === "") return { value: null };
  return trimmed.length > max || controlCharacters.test(trimmed) ? { error: `Use at most ${max} plain characters.` } : { value: trimmed };
}
function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= profitRules.maxAmountUgx ? value : null;
}
function unknownFields(input: Record<string, unknown>, known: readonly string[], errors: Errors, key: string, noun: string) {
  for (const field of Object.keys(input)) if (!known.includes(field)) errors[key] = `Unknown ${noun} field: ${field.slice(0, 40)}.`;
}

export type CostEntryFields = Readonly<{
  month: ProfitMonth;
  kind: CostKind;
  category: string;
  network: ProfitNetwork | null;
  /** Null for charges or a recurring cost: the service names it from the network or the line. */
  label: string | null;
  recurringLineId: string | null;
  amountUgx: number;
  invoiceCurrency: string | null;
  invoiceAmount: string | null;
  reference: string | null;
  note: string | null;
}>;
const entryKeys = ["month", "kind", "category", "network", "label", "recurringLineId", "amountUgx", "invoiceCurrency", "invoiceAmount", "reference", "note"] as const;

/** A new charge, cost or tax entry. Charges need a network and no category; costs need a category; tax needs neither. */
export function parseCostEntryFields(input: unknown): Parsed<CostEntryFields> {
  const values = record(input);
  if (!values) return { ok: false, errors: { entry: "Send the month, kind and amount." } };
  const errors: Errors = {};
  unknownFields(values, entryKeys, errors, "entry", "cost");
  const month = parseProfitMonth(values.month);
  if (!month) errors.month = "Choose a month.";
  const kind = values.kind === "fee" || values.kind === "expense" || values.kind === "tax" ? values.kind : null;
  if (!kind) errors.kind = "Choose charges, a cost or tax.";
  let category = "", network: ProfitNetwork | null = null;
  if (kind === "expense") {
    if (typeof values.category === "string" && expenseCategories.has(values.category)) category = values.category;
    else errors.category = "Choose a category.";
  } else if (kind) {
    category = kindCategory[kind];
    if (!absent(values.category) && values.category !== category) errors.category = kind === "tax" ? "Tax has no other category." : "Charges have no other category.";
  }
  if (kind === "fee") {
    if (values.network === "mtn" || values.network === "airtel") network = values.network;
    else errors.network = "Choose MTN or Airtel.";
  } else if (!absent(values.network)) errors.network = "Only mobile-money charges have a network.";
  let recurringLineId: string | null = null;
  if (!absent(values.recurringLineId)) {
    if (kind === "fee") errors.recurringLineId = "Charges are not a recurring cost.";
    else if (isProfitRecordId(values.recurringLineId)) recurringLineId = values.recurringLineId;
    else errors.recurringLineId = "Choose a recurring cost.";
  }
  const label = plainText(values.label, profitRules.labelMax);
  if ("error" in label) errors.label = label.error;
  else if (label.value === null && kind !== "fee" && !recurringLineId) errors.label = "Enter a label, for example Hosting for October.";
  const amountUgx = amount(values.amountUgx);
  if (amountUgx === null) errors.amountUgx = amountMessage;
  const currency = absent(values.invoiceCurrency) ? null : values.invoiceCurrency;
  const printed = absent(values.invoiceAmount) ? null : values.invoiceAmount;
  if (currency !== null && (typeof currency !== "string" || !profitRules.currency.test(currency))) errors.invoiceCurrency = "Use a three-letter currency code, for example USD.";
  if (printed !== null && (typeof printed !== "string" || !profitRules.invoiceAmount.test(printed))) errors.invoiceAmount = "Enter the amount as printed, for example 45.00.";
  if ((currency === null) !== (printed === null) && !errors.invoiceCurrency && !errors.invoiceAmount) {
    errors[currency === null ? "invoiceCurrency" : "invoiceAmount"] = "Enter both the bill's currency and its amount, or neither.";
  }
  let reference: string | null = null;
  if (!absent(values.reference)) {
    const trimmed = typeof values.reference === "string" ? values.reference.trim() : "";
    if (profitRules.reference.test(trimmed)) reference = trimmed;
    else errors.reference = `Use letters, digits, spaces and . / # : _ - only, up to ${profitRules.referenceMax}.`;
  }
  const note = plainText(values.note, profitRules.noteMax);
  if ("error" in note) errors.note = note.error;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, fields: { month: month!, kind: kind!, category, network, label: "value" in label ? label.value : null, recurringLineId,
    amountUgx: amountUgx!, invoiceCurrency: currency as string | null, invoiceAmount: printed as string | null, reference,
    note: "value" in note ? note.value : null } };
}

export type CostLineFields = Readonly<{
  kind: LineKind;
  category: string;
  label: string;
  cadence: LineCadence;
  startMonth: ProfitMonth;
  endMonth: ProfitMonth | null;
  typicalUgx: number | null;
}>;
export type CostLineChanges = Partial<Pick<CostLineFields, "label" | "endMonth" | "typicalUgx">>;
const lineKeys = ["kind", "category", "label", "cadence", "startMonth", "endMonth", "typicalUgx"] as const;
const editableLineKeys: readonly string[] = ["label", "typicalUgx", "endMonth"];

/**
 * A new recurring cost or tax, or with `partial` an edit, which may change only the label, the typical amount and the end
 * month. The end month is on or after the start; an edit's end is checked against the stored start by the service.
 */
export function parseCostLineFields(input: unknown, options: { partial: true }): Parsed<CostLineChanges>;
export function parseCostLineFields(input: unknown, options?: { partial?: false }): Parsed<CostLineFields>;
export function parseCostLineFields(input: unknown, { partial = false }: { partial?: boolean } = {}): Parsed<CostLineFields | CostLineChanges> {
  const values = record(input);
  if (!values) return { ok: false, errors: { line: "Send the recurring cost's details." } };
  const errors: Errors = {}, fields: Record<string, unknown> = {};
  unknownFields(values, lineKeys, errors, "line", "recurring cost");
  if (partial && Object.keys(values).some(key => (lineKeys as readonly string[]).includes(key) && !editableLineKeys.includes(key))) {
    errors.line = "Only the label, typical amount and end month can change.";
  }
  if (!partial) {
    const kind = values.kind === "expense" || values.kind === "tax" ? values.kind : null;
    if (!kind) errors.kind = "Choose a cost or tax.";
    else fields.kind = kind;
    if (kind === "expense") {
      if (typeof values.category === "string" && expenseCategories.has(values.category)) fields.category = values.category;
      else errors.category = "Choose a category.";
    } else if (kind === "tax") {
      if (!absent(values.category) && values.category !== "tax") errors.category = "Tax has no other category.";
      fields.category = "tax";
    }
    if (values.cadence === "monthly" || values.cadence === "yearly") fields.cadence = values.cadence;
    else errors.cadence = "Choose monthly or yearly.";
    const start = parseProfitMonth(values.startMonth);
    if (start) fields.startMonth = start;
    else errors.startMonth = "Choose the first month it is due.";
  }
  if (values.label !== undefined || !partial) {
    const label = plainText(values.label, profitRules.labelMax);
    if ("error" in label) errors.label = label.error;
    else if (label.value === null) errors.label = "Enter a label, for example Hosting.";
    else fields.label = label.value;
  }
  if (values.endMonth !== undefined || !partial) {
    if (absent(values.endMonth)) fields.endMonth = null;
    else {
      const end = parseProfitMonth(values.endMonth);
      if (!end) errors.endMonth = "Choose the last month it is due, or leave it empty.";
      else if (typeof fields.startMonth === "string" && end < fields.startMonth) errors.endMonth = "End on or after the start month.";
      else fields.endMonth = end;
    }
  }
  if (values.typicalUgx !== undefined || !partial) {
    if (absent(values.typicalUgx)) fields.typicalUgx = null;
    else {
      const typical = amount(values.typicalUgx);
      if (typical === null) errors.typicalUgx = amountMessage;
      else fields.typicalUgx = typical;
    }
  }
  if (partial && Object.keys(fields).length === 0 && Object.keys(errors).length === 0) errors.line = "Change the label, typical amount or end month.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, fields: fields as CostLineFields | CostLineChanges };
}

/** A void or reopen reason: trimmed plain text, 1–200 characters. */
export function parseProfitReason(value: unknown): Parsed<string> {
  const reason = plainText(value, profitRules.reasonMax);
  if ("error" in reason) return { ok: false, errors: { reason: reason.error } };
  return reason.value === null ? { ok: false, errors: { reason: "Give a reason." } } : { ok: true, fields: reason.value };
}

export type CloseFields = Readonly<{ expected: ProfitSnapshot; confirmNoTax: boolean }>;

/** The totals the owner reviewed, which must still be the month's totals at the close, and the no-tax confirmation. */
export function parseCloseFields(input: unknown): Parsed<CloseFields> {
  const values = record(input);
  if (!values) return { ok: false, errors: { expected: "Review the totals again before closing." } };
  const errors: Errors = {};
  unknownFields(values, ["expected", "confirmNoTax"], errors, "close", "close");
  const expected = record(values.expected);
  const keys = ["revenueUgx", "feesUgx", "expensesUgx", "taxUgx", "netUgx"] as const;
  const whole = (key: (typeof keys)[number], value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && (key === "netUgx" || value >= 0);
  if (!expected || Object.keys(expected).length !== keys.length || !keys.every(key => whole(key, expected[key]))) {
    errors.expected = "Review the totals again before closing.";
  }
  if (values.confirmNoTax !== undefined && typeof values.confirmNoTax !== "boolean") errors.confirmNoTax = "Confirm with yes or no.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, fields: { expected: Object.fromEntries(keys.map(key => [key, expected![key]])) as ProfitSnapshot,
    confirmNoTax: values.confirmNoTax === true } };
}
