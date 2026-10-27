import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate } from "../src/domain/calendar.ts";
import { applyFeedDraft, resetFeedFilters } from "../src/domain/feed-controls.ts";
import { deviceFeedEntryHref } from "../src/domain/device-feed.ts";
import { applyFeedPageDefaults, defaultPagePicks, feedQueryHref, parseFeedQuery, serializeFeedQuery } from "../src/domain/feed-query.ts";

const today = parseReportingDate("2026-10-27");
const parse = (parameters = "") => parseFeedQuery(new URLSearchParams(parameters), { today });
const page = (parameters = "", subscriberOnly = false) => {
  const input = new URLSearchParams(parameters);
  return applyFeedPageDefaults(parseFeedQuery(input, { today }), input, subscriberOnly);
};

test("page defaults select predictions without changing unrestricted API reads", () => {
  assert.equal(parse().picks, "all");
  assert.equal(serializeFeedQuery(parse(), today).toString(), "");
  assert.equal(serializeFeedQuery(page(), today).get("picks"), "only", "The page default must reach the real feed read");
  assert.equal(serializeFeedQuery(page("", true), today).has("picks"), false, "Guest reads retain the unrestricted API default");
  for (const status of ["all", "live", "finished"]) {
    assert.equal(defaultPagePicks(status), "only");
    assert.equal(page(`status=${status}`).picks, "only");
    assert.equal(defaultPagePicks(status, true), status === "finished" ? "only" : "all");
    assert.equal(page(`status=${status}`, true).picks, status === "finished" ? "only" : "all");
  }
});

test("explicit picks choices survive page defaults and navigation", () => {
  for (const subscriberOnly of [false, true]) {
    for (const picks of ["all", "only"]) assert.equal(page(`picks=${picks}`, subscriberOnly).picks, picks);
  }
  const original = page("when=last-7-days&picks=all&q=Club&page=3");
  const href = feedQueryHref(original, today);
  const parameters = new URL(href, "https://example.test").searchParams;
  assert.equal(parameters.get("picks"), "all");
  assert.deepEqual(applyFeedPageDefaults(parseFeedQuery(parameters, { today }), parameters), original);
  assert.equal(applyFeedDraft({ ...original, search: "  Other   Club " }, today).picks, "all");
  assert.equal(applyFeedPageDefaults(parse(), { picks: "all" }).picks, "all");
  assert.equal(applyFeedPageDefaults(parse(), {}).picks, "only");
});

test("Reset restores the viewer's eligible predictions default", () => {
  const original = page("picks=all&q=Club&page=3");
  assert.equal(resetFeedFilters(original).picks, "only");
  assert.equal(resetFeedFilters(original, true).picks, "all");
  assert.equal(resetFeedFilters({ ...original, status: "finished" }, true).picks, "only");
  assert.equal(resetFeedFilters(original).search, "");
  assert.equal(resetFeedFilters(original).page, 1);
});

test("fresh device navigation leaves predictions choice to the page default", () => {
  for (const entry of ["today", "live", "results"]) {
    const parameters = new URL(deviceFeedEntryHref(entry, today, "Africa/Kampala"), "https://example.test").searchParams;
    assert.equal(parameters.has("picks"), false);
    assert.equal(parameters.get("tz"), "Africa/Kampala");
  }
});
