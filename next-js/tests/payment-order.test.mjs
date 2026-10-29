import assert from "node:assert/strict";
import test from "node:test";
import { paymentSortOptions, sortPayments } from "../src/components/admin/payment-order.ts";

const payment = (id, values = {}) => ({
  id, reference: id, accountId: `account-${id}`, accountPhone: "256700000100", payerPhone: "256700000100",
  network: "mtn", transactionId: `TX-${id}`, amount: 5000, purpose: "plan", planId: "weekly", planName: "Weekly",
  durationDays: 7, price: 5000, submittedAt: "2026-10-29T09:00:00Z", status: "pending", hasImage: false,
  accountCreditUgx: 0, final: null, checks: [], ...values,
});
const ids = (rows, sort) => sortPayments(rows, sort).map(row => row.id);

test("queue order returns a new array, preserves payment identity and never mutates frozen input", () => {
  const rows = Object.freeze([Object.freeze(payment("second")), Object.freeze(payment("first"))]);
  const ordered = sortPayments(rows, "queue");
  assert.notEqual(ordered, rows);
  assert.deepEqual(ordered, rows);
  assert.equal(ordered[0], rows[0]);
  assert.deepEqual(ids(rows, "reference"), ["first", "second"]);
  assert.deepEqual(rows.map(row => row.id), ["second", "first"]);
});

test("oldest and newest compare instants rather than formatted dates and retain equal-date order", () => {
  const rows = [payment("later", { submittedAt: "2026-10-29T12:30:00+03:00" }),
    payment("same-first"), payment("earlier", { submittedAt: "2026-10-29T08:00:00Z" }), payment("same-second")];
  assert.deepEqual(ids(rows, "oldest"), ["earlier", "same-first", "same-second", "later"]);
  assert.deepEqual(ids(rows, "newest"), ["later", "same-first", "same-second", "earlier"]);
});

test("amount sorting uses confirmed amounts, preserves a confirmed zero and falls back from null", () => {
  const rows = [payment("reported", { amount: 20000 }),
    payment("confirmed-zero", { amount: 50000, final: { amount: 0, network: "mtn", transactionId: "A" } }),
    payment("confirmed-high", { amount: 1000, final: { amount: 30000, network: "mtn", transactionId: "B" } }),
    payment("confirmed-null", { amount: 10000, final: { amount: null, network: "mtn", transactionId: "C" } })];
  assert.deepEqual(ids(rows, "amount"), ["confirmed-high", "reported", "confirmed-null", "confirmed-zero"]);
  assert.deepEqual(ids(rows, "amount-lowest"), ["confirmed-zero", "confirmed-null", "reported", "confirmed-high"]);
});

test("reference and transaction ordering is natural, case insensitive, stable, and missing last", () => {
  const references = [payment("ten", { reference: "P10" }), payment("two", { reference: "P2" }),
    payment("two-again", { reference: "p2" }), payment("empty", { reference: " " })];
  assert.deepEqual(ids(references, "reference"), ["two", "two-again", "ten", "empty"]);
  assert.deepEqual(ids(references, "reference-desc"), ["ten", "two", "two-again", "empty"]);
  const transactions = [payment("reported-ten", { transactionId: "TX10" }),
    payment("confirmed-two", { transactionId: "TX99", final: { amount: 5000, network: "mtn", transactionId: "TX2" } }),
    payment("fallback-three", { transactionId: "TX3", final: { amount: null, network: null, transactionId: " " } }),
    payment("empty", { transactionId: "" })];
  assert.deepEqual(ids(transactions, "transaction"), ["confirmed-two", "fallback-three", "reported-ten", "empty"]);
  assert.deepEqual(ids(transactions, "transaction-desc"), ["reported-ten", "fallback-three", "confirmed-two", "empty"]);
});

test("contact ordering prefers payer, normalizes presentation, uses account fallback and leaves erased contacts last", () => {
  const rows = [payment("higher", { payerPhone: "+256 750 000 200", accountPhone: "256700000001" }),
    payment("fallback", { payerPhone: null, accountPhone: "256700000050" }),
    payment("lower", { payerPhone: "256700000010" }),
    payment("empty", { payerPhone: " ", accountPhone: null })];
  assert.deepEqual(ids(rows, "phone"), ["lower", "fallback", "higher", "empty"]);
  assert.deepEqual(ids(rows, "phone-desc"), ["higher", "fallback", "lower", "empty"]);
});

test("provider ordering uses the confirmed network and leaves unknown empty networks last", () => {
  const rows = [payment("mtn"), payment("airtel", { final: { amount: 5000, network: "airtel", transactionId: "TX" } }),
    payment("empty", { network: " " })];
  assert.deepEqual(ids(rows, "provider"), ["airtel", "mtn", "empty"]);
  assert.deepEqual(ids(rows, "provider-desc"), ["mtn", "airtel", "empty"]);
});

test("package and duration sorting honor saved names, top-ups, missing durations, and stable equal lengths", () => {
  const rows = [payment("weekly"), payment("daily", { planName: "Daily", durationDays: 1 }),
    payment("topup", { purpose: "topup", planName: "", durationDays: null }),
    payment("weekly-again", { planName: "Weekly original offer" })];
  assert.deepEqual(ids(rows, "package"), ["topup", "daily", "weekly", "weekly-again"]);
  assert.deepEqual(ids(rows, "package-desc"), ["weekly-again", "weekly", "daily", "topup"]);
  assert.deepEqual(ids(rows, "duration"), ["daily", "weekly", "weekly-again", "topup"]);
  assert.deepEqual(ids(rows, "duration-desc"), ["weekly", "weekly-again", "daily", "topup"]);
});

test("every exposed sort accepts empty data and retains queue order when the chosen values tie", () => {
  assert.equal(new Set(paymentSortOptions.map(option => option.value)).size, paymentSortOptions.length);
  const rows = [payment("a", { reference: "same", transactionId: "same" }), payment("b", { reference: "same", transactionId: "same" })];
  for (const { value } of paymentSortOptions) {
    assert.deepEqual(sortPayments([], value), [], value);
    assert.deepEqual(ids(rows, value), ["a", "b"], value);
  }
});
