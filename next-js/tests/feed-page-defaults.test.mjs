import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate } from "../src/domain/calendar.ts";
import { applyFeedDraft, resetFeedFilters } from "../src/domain/feed-controls.ts";
import { deviceFeedEntryHref } from "../src/domain/device-feed.ts";
import { applyFeedPageDefaults, defaultMarkets, defaultMatchProbability, feedQueryHref, getFeedToday, parseFeedQuery, resolveFeedDates, serializeFeedQuery } from "../src/domain/feed-query.ts";

const today = parseReportingDate("2026-10-27");
const parse = (parameters = "") => parseFeedQuery(new URLSearchParams(parameters), { today });
const page = (parameters = "") => {
  const input = new URLSearchParams(parameters);
  return applyFeedPageDefaults(parseFeedQuery(input, { today }), input);
};

test("page defaults leave recommendations unrestricted across date and status filters", () => {
  assert.equal(parse().picks, "all");
  assert.equal(serializeFeedQuery(parse(), today).toString(), "");
  assert.equal(serializeFeedQuery(page(), today).has("picks"), false, "The page default must reach the real feed read");
  for (const status of ["all", "live", "finished"]) {
    assert.equal(page(`status=${status}&market=match-result`).picks, "all");
  }
});

test("Matches opens with today's fixtures, no probability or odds requirement, live games first and 50 items", () => {
  const query = page();
  assert.equal(query.status, "all");
  assert.deepEqual(query.dates, { kind: "today" });
  assert.deepEqual(query.sort, { by: "live-first", direction: "desc" });
  assert.deepEqual(query.markets, defaultMarkets);
  assert.equal(query.search, "");
  assert.deepEqual(query.leagues, []);
  assert.deepEqual(query.countries, []);
  assert.deepEqual(query.probability, { min: 0, max: 100 });
  assert.equal(query.odds, null);
  assert.equal(query.time, undefined);
  assert.equal(query.page, 1); assert.equal(query.pageSize, 50); assert.equal(query.summary, undefined);
  const parameters = serializeFeedQuery(query, today);
  assert.equal(parameters.get("when"), "today");
  assert.equal(parameters.has("prob"), false);
  assert.equal(parameters.get("sort"), "live-first");
  assert.deepEqual(parse().dates, { kind: "last-30-days" });
  assert.deepEqual(parse().sort, { by: "kickoff", direction: "desc" });
});

test("explicit probability filters round-trip including the legacy above-75 preset", () => {
  for (const [value, probability] of [["above-75", defaultMatchProbability], ["75-100", { min: 75, max: 100 }],
    ["0-100", { min: 0, max: 100 }]]) {
    const query = page(`when=today&prob=${value}`);
    assert.deepEqual(query.probability, probability);
    assert.deepEqual(page(new URL(feedQueryHref(query, today), "https://example.test").searchParams.toString()), query);
  }
  assert.deepEqual(page("when=yesterday").probability, { min: 0, max: 100 });
  assert.deepEqual(page("date=2026-10-26&prob=40-75").probability, { min: 40, max: 75 });
});

test("explicit dates and sorting survive Matches navigation, including API defaults", () => {
  for (const when of ["last-30-days", "last-7-days", "today", "next-7-days"]) {
    for (const sort of ["kickoff", "probability"]) {
      for (const dir of ["asc", "desc"]) {
        const original = page(`when=${when}&sort=${sort}&dir=${dir}&picks=all&tz=Africa%2FKampala&page=3`);
        const parameters = new URL(feedQueryHref(original, today), "https://example.test").searchParams;
        assert.deepEqual(page(parameters.toString()), original);
        assert.deepEqual(original.dates, { kind: when });
        assert.deepEqual(original.sort, { by: sort, direction: dir });
      }
    }
  }
  assert.deepEqual(page("dir=asc").sort, { by: "kickoff", direction: "asc" });
  assert.deepEqual(page("when=yesterday").sort, { by: "kickoff", direction: "desc" });
  assert.deepEqual(page("when=today").sort, { by: "live-first", direction: "desc" });
  assert.throws(() => parse("sort=live-first&dir=asc"));
  for (const parameters of ["date=2026-10-26", "from=2026-10-20&to=2026-10-26"]) {
    assert.deepEqual(page(parameters).dates, parse(parameters).dates);
  }
  const archived = parseFeedQuery({}, { today, routeDate: "2026-10-20" });
  const result = applyFeedPageDefaults(archived, {}, { dated: true });
  assert.deepEqual(result.dates, archived.dates);
  assert.deepEqual(result.sort, archived.sort);
  assert.equal(result.picks, "all");
});

test("Today uses the browsing time zone without adding a kickoff constraint", () => {
  const query = page("when=today&tz=America%2FNew_York");
  const instant = Date.parse("2026-10-28T01:00:00Z");
  const localToday = getFeedToday(query, instant);
  assert.equal(localToday, "2026-10-27");
  const range = resolveFeedDates(query, localToday, instant);
  assert.equal(range.startDate, localToday);
  assert.equal(range.endDate, localToday);
  assert.equal(range.dayCount, 1);
  assert.equal(query.time, undefined);
});

test("explicit picks choices survive page defaults and navigation", () => {
  for (const picks of ["all", "only"]) assert.equal(page(`picks=${picks}`).picks, picks);
  const original = page("when=last-7-days&picks=all&q=Club&page=3");
  const href = feedQueryHref(original, today);
  const parameters = new URL(href, "https://example.test").searchParams;
  assert.equal(parameters.get("picks"), "all");
  assert.deepEqual(applyFeedPageDefaults(parseFeedQuery(parameters, { today }), parameters), original);
  assert.equal(applyFeedDraft({ ...original, search: "  Other   Club " }, today).picks, "all");
  assert.equal(applyFeedPageDefaults(parse(), { picks: "all" }).picks, "all");
  assert.equal(applyFeedPageDefaults(parse(), {}).picks, "all");
});

test("Reset restores today's forecasts without a recommendation filter", () => {
  const original = page("picks=only&q=Club&page=3");
  assert.equal(resetFeedFilters(original).picks, "all");
  const resetCompleted = resetFeedFilters({ ...original, status: "finished" });
  assert.equal(resetCompleted.status, "all");
  assert.equal(resetCompleted.picks, "all", "Reset returns to All, where guests cannot request subscriber predictions");
  assert.equal(resetFeedFilters(original).search, "");
  assert.equal(resetFeedFilters(original).page, 1);
  const changed = page("when=next-7-days&status=scheduled&picks=all&q=Club&league=one&country=England&market=total-goals&prob=50-90&sort=kickoff&dir=asc&timeFrom=12:00&timeTo=18:00&tz=Africa%2FKampala&page=3&pageSize=40");
  const reset = resetFeedFilters(changed);
  assert.deepEqual(reset, page("tz=Africa%2FKampala&pageSize=40"));
  assert.deepEqual(resetFeedFilters(reset), reset);
  assert.deepEqual(page(new URL(feedQueryHref(reset, today), "https://example.test").searchParams.toString()), reset);
});

test("fresh device navigation leaves the picks choice to the page default", () => {
  for (const entry of ["today", "live", "results"]) {
    const parameters = new URL(deviceFeedEntryHref(entry, today, "Africa/Kampala"), "https://example.test").searchParams;
    assert.equal(parameters.has("picks"), false);
    assert.equal(parameters.get("tz"), "Africa/Kampala");
  }
});
