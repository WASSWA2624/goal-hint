import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { addProfitMonths, lineDueIn, parseCloseFields, parseCostEntryFields, parseCostLineFields, parseProfitMonth, parseProfitReason,
  profitCsv, profitMonthBounds, profitMonthOf, profitMonthReport, profitMonthSummary } from "../src/domain/owner-profit.ts";

const month = "2026-10", ended = Date.parse("2026-10-31T21:00:00Z");
const report = fields => profitMonthReport({ month, now: ended, payments: [], manual: [], lines: [], entries: [], close: null, ...fields });
const entry = fields => ({ id: randomUUID(), month, kind: "expense", category: "hosting", network: null, label: "Hosting", recurringLineId: null,
  amountUgx: 1000, invoiceCurrency: null, invoiceAmount: null, reference: null, note: null, createdAt: "2026-10-25T09:00:00Z", createdBy: "owner",
  voidedAt: null, voidedBy: null, voidReason: null, ...fields });

test("profit month windows use EAT and cross year boundaries correctly", () => {
  assert.equal(profitMonthOf(Date.parse("2026-09-30T20:59:59Z")), "2026-09");
  assert.equal(profitMonthOf(Date.parse("2026-09-30T21:00:00Z")), month);
  assert.deepEqual(profitMonthBounds(month), { start: Date.parse("2026-09-30T21:00:00Z"), end: ended });
  assert.equal(addProfitMonths("2026-12", 1), "2027-01"); assert.equal(addProfitMonths("2026-01", -1), "2025-12");
  for (const value of [null, "2026-13", "26-10", "1969-12", "2026-10-01"]) assert.equal(parseProfitMonth(value), null);
});

test("cost entries validate whole UGX and paired unconverted invoice details", () => {
  const fields = { month, kind: "expense", category: "hosting", label: " Hosting ", amountUgx: 20000, invoiceCurrency: "USD", invoiceAmount: "5.25" };
  const parsed = parseCostEntryFields(fields); assert.equal(parsed.ok, true);
  assert.equal(parsed.fields.label, "Hosting"); assert.equal(parsed.fields.amountUgx, 20000); assert.equal(parsed.fields.invoiceAmount, "5.25");
  for (const invalid of [{ amountUgx: -1 }, { amountUgx: 1.5 }, { amountUgx: "20000" }, { invoiceCurrency: null }, { invoiceCurrency: "usd" },
    { invoiceAmount: "1e3" }, { label: "Hosting\nprivate" }, { extra: "unknown" }]) assert.equal(parseCostEntryFields({ ...fields, ...invalid }).ok, false);
  assert.equal(parseCostEntryFields({ month, kind: "fee", network: "mtn", amountUgx: 0 }).ok, true);
  assert.equal(parseCostEntryFields({ month, kind: "fee", amountUgx: 0 }).ok, false);
});

test("recurring lines retain cadence and cannot be edited into another accounting category", () => {
  const line = { kind: "expense", category: "hosting", label: "Hosting", cadence: "monthly", startMonth: month, typicalUgx: 10000 };
  assert.equal(parseCostLineFields(line).ok, true);
  assert.equal(parseCostLineFields({ ...line, endMonth: "2026-09" }).ok, false);
  assert.equal(parseCostLineFields({ cadence: "yearly" }, { partial: true }).ok, false);
  assert.equal(parseCostLineFields({}, { partial: true }).ok, false);
  assert.deepEqual(parseCostLineFields({ typicalUgx: 0 }, { partial: true }), { ok: true, fields: { typicalUgx: 0 } });
  assert.equal(lineDueIn({ ...line, endMonth: null }, "2026-11"), true);
  assert.equal(lineDueIn({ ...line, cadence: "yearly", endMonth: null }, "2026-11"), false);
  assert.equal(lineDueIn({ ...line, cadence: "yearly", endMonth: null }, "2027-10"), true);
});

test("missing monthly costs and network charges remain unavailable instead of using typical amounts", () => {
  const line = { id: randomUUID(), kind: "expense", category: "hosting", label: "Hosting", cadence: "monthly", startMonth: month,
    endMonth: null, typicalUgx: 5000, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
  const value = report({ lines: [line], payments: [{ network: "mtn", amountUgx: 10000, countedAt: ended - 1000 }] });
  assert.equal(value.revenue.amountUgx, 10000); assert.equal(value.expenses.amountUgx, 0);
  assert.deepEqual(value.fees.missingNetworks, ["mtn"]); assert.equal(value.expenses.missingLines[0].id, line.id);
  assert.equal(value.closeRequirements.ok, false); assert.equal(value.net.status, "unavailable");
  const summary = profitMonthSummary(value); assert.equal(summary.feesUgx, null); assert.equal(summary.expensesUgx, null);
  assert.match(profitCsv([summary]), /Not entered/u);
});

test("month arithmetic excludes voided and out-of-period costs and detects changes after closing", () => {
  const entries = [entry({ amountUgx: 1000 }), entry({ kind: "fee", category: "charges", network: "mtn", amountUgx: 300 }),
    entry({ kind: "tax", category: "tax", amountUgx: 700 }), entry({ amountUgx: 9000, voidedAt: "2026-10-25T10:00:00Z" }),
    entry({ month: "2026-09", amountUgx: 8000 })];
  const payments = [{ network: "mtn", amountUgx: 10000, countedAt: ended - 1000 }, { network: "airtel", amountUgx: 50000, countedAt: ended }];
  const open = report({ entries, payments, manual: [{ amountUgx: 2000, countedAt: ended - 2000 }] });
  assert.equal(open.revenue.amountUgx, 12000); assert.equal(open.voided.length, 1); assert.equal(open.closeRequirements.ok, true);
  assert.deepEqual(open.closeRequirements.preview, { revenueUgx: 12000, feesUgx: 300, expensesUgx: 1000, taxUgx: 700, netUgx: 10000 });
  const close = { month, closedAt: "2026-11-01T00:00:00Z", closedBy: "owner", snapshot: open.closeRequirements.preview };
  const closed = report({ entries, payments, manual: [{ amountUgx: 2000, countedAt: ended - 2000 }], close });
  assert.deepEqual(closed.net, { status: "available", amountUgx: 10000 });
  const corrected = report({ entries, payments, close });
  assert.equal(corrected.close.state, "changed"); assert.deepEqual(corrected.net, { status: "changed", closedUgx: 10000, nowUgx: 8000 });
});

test("future/current months cannot close and confirmation parsers reject malformed input", () => {
  const current = report({ now: ended - 1 }); assert.equal(current.closeRequirements.ok, false); assert.equal(current.net.status, "unavailable");
  const expected = { revenueUgx: 1000, feesUgx: 50, expensesUgx: 1000, taxUgx: 0, netUgx: -50 };
  assert.deepEqual(parseCloseFields({ expected, confirmNoTax: true }), { ok: true, fields: { expected, confirmNoTax: true } });
  assert.equal(parseCloseFields({ expected: { ...expected, feesUgx: -1 } }).ok, false);
  assert.equal(parseCloseFields({ expected, confirmNoTax: "yes" }).ok, false);
  assert.equal(parseCloseFields({ expected, extra: true }).ok, false);
  assert.equal(parseProfitReason("   ").ok, false); assert.deepEqual(parseProfitReason(" Corrected receipt "), { ok: true, fields: "Corrected receipt" });
});
