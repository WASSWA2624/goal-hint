import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate } from "../src/domain/calendar.ts";
import { performancePageHref } from "../src/domain/performance-page.ts";
import { performanceHref } from "../src/domain/navigation.ts";
import { parsePerformancePageQuery } from "../src/server/performance/performance-page.ts";

const today = parseReportingDate("2026-10-25");
const filters = { from: "2026-10-01", to: "2026-10-25", market: "double-chance", source: "ai", model: "a".repeat(64), version: "model-v1" };

test("dashboard queries separate slip pagination from exact EAT prediction filters", () => {
  const result = parsePerformancePageQuery({ ...filters, page: "3" }, today);
  assert.equal(result.page, 3); assert.equal(result.parameters.has("page"), false);
  assert.equal(result.query.range.startDate, filters.from); assert.equal(result.query.market, "double-chance");
  assert.equal(result.query.range.window.startInclusive, Date.parse("2026-09-30T21:00:00Z"));
  const defaults = parsePerformancePageQuery({}, today);
  assert.equal(defaults.page, 1); assert.equal(defaults.query.range.startDate, "2026-09-26");
});

test("ambiguous, oversized, unsupported or invalid dashboard filters fail closed", () => {
  for (const input of [
    { page: "0" }, { page: "1.5" }, { page: "10000" }, { page: ["1", "2"] }, { market: ["all"] }, { unknown: "x" },
    { from: "2026-09-01", to: "2026-10-25" }, { from: "2026-10-25" }, { source: "invalid" }, { version: "x".repeat(3000) },
  ]) assert.throws(() => parsePerformancePageQuery(input, today), (error) => error.code === "invalid-query");
});

test("pagination pins the reporting period and all selected source/model filters", () => {
  const href = performancePageHref(filters, 2), url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/en/performance"); assert.equal(url.searchParams.get("page"), "2");
  for (const [key, value] of Object.entries(filters)) assert.equal(url.searchParams.get(key), value);
  assert.equal(performancePageHref(filters).includes("page="), false);
  assert.equal(performanceHref("fr"), "/en/performance");
  for (const page of [0, 1.5, 10000, NaN]) assert.throws(() => performancePageHref(filters, page), RangeError);
});

test("native visible filters can switch a model-pinned AI view to the provider without hidden constraints", () => {
  // A basic form submission consists of the visible controls only; pagination retains the original advanced pins.
  const visible = { from: filters.from, to: filters.to, market: filters.market, source: "api-football" };
  const parsed = parsePerformancePageQuery(visible, today);
  assert.equal(parsed.query.source, "api-football"); assert.equal(parsed.query.model, null); assert.equal(parsed.query.version, null);
  const original = new URL(performancePageHref(filters, 2), "https://example.test");
  assert.equal(original.searchParams.get("model"), filters.model); assert.equal(original.searchParams.get("version"), filters.version);
});
