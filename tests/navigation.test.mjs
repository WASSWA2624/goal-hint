import assert from "node:assert/strict";
import test from "node:test";
import { getReportingDate, parseReportingDate, parseUtcInstant } from "../src/domain/calendar.ts";
import {
  feedHref, getFeedEntry, homeHref, informationHref, matchHref, parseFeedView,
} from "../src/domain/navigation.ts";
import { getLocaleRedirect, isSupportedLocale, resolveLocale } from "../src/i18n/locales.ts";
import { createMessages } from "../src/i18n/messages.ts";

test("English is the only published locale and all other message/link locales fall back", () => {
  assert.equal(isSupportedLocale("en"), true);
  for (const locale of [undefined, "fr", "en-US", "EN", "__proto__", "en/../fr"]) {
    assert.equal(resolveLocale(locale), "en");
    assert.equal(homeHref(locale), "/en");
    assert.equal(createMessages(locale).text("navigation.today"), "Today");
  }
});

test("unpublished locale redirects preserve route identity and do not rewrite arbitrary paths", () => {
  for (const [input, expected] of [
    ["/fr", "/en"], ["/sw/privacy", "/en/privacy"], ["/EN/contact", "/en/contact"],
    ["/en-US/predictions/2026-10-07", "/en/predictions/2026-10-07"],
    ["/pt-BR/matches/fixture-123/home-v-away", "/en/matches/fixture-123/home-v-away"],
    ["/eng/how-it-works", "/en/how-it-works"],
    ["/en", null], ["/en/terms", null], ["/", null], ["/_next/static/a.js", null],
    ["/privacy", null], ["/france/privacy", null], ["//fr/contact", null],
  ]) assert.equal(getLocaleRedirect(input), expected, input);
});

test("both navigation entries use one dated feed and change together at EAT midnight", () => {
  for (const [instant, today, yesterday] of [
    ["2026-10-08T20:59:59.999Z", "2026-10-08", "2026-10-07"],
    ["2026-10-08T21:00:00Z", "2026-10-09", "2026-10-08"],
    ["2026-12-31T21:00:00Z", "2027-01-01", "2026-12-31"],
  ]) {
    const reportingDate = getReportingDate(parseUtcInstant(instant));
    const todayView = getFeedEntry(reportingDate, "today");
    const resultsView = getFeedEntry(reportingDate, "results");
    assert.deepEqual(todayView, { date: today, status: "all" });
    assert.deepEqual(resultsView, { date: yesterday, status: "finished" });
    assert.equal(feedHref(todayView), `/en/predictions/${today}`);
    assert.equal(feedHref(resultsView), `/en/predictions/${yesterday}?status=finished`);
  }
});

test("historical feed views do not depend on the rolling prediction window", () => {
  const view = parseFeedView("2020-02-29", "finished");
  assert.equal(feedHref(view, "fr"), "/en/predictions/2020-02-29?status=finished");
  assert.deepEqual(parseFeedView("2030-01-01"), { date: "2030-01-01", status: "all" });
  assert.equal(feedHref(parseFeedView("2030-01-01", "all")), "/en/predictions/2030-01-01");
});

test("malformed dates and ambiguous or unsupported statuses cannot produce feed links", () => {
  for (const date of ["2026-02-29", "2026-10-7", "2026-10-07/../privacy"]) {
    assert.throws(() => parseFeedView(date));
    assert.throws(() => feedHref({ date, status: "all" }));
  }
  for (const status of ["", "Finished", "correct", "unknown", ["finished", "all"]]) {
    assert.throws(() => parseFeedView("2026-10-07", status), RangeError);
  }
});

test("match and information links preserve locale-neutral IDs and route conventions", () => {
  assert.equal(informationHref("how-it-works", "fr"), "/en/how-it-works");
  assert.equal(matchHref("fixture-123", "home-v-away"), "/en/matches/fixture-123/home-v-away");
  for (const [id, slug] of [["../privacy", "home-v-away"], ["123", "../../terms"], ["", "home-v-away"], ["123", ""]]) {
    assert.throws(() => matchHref(id, slug), RangeError);
  }
});

test("plural-aware copy formats counts and rejects invalid count claims", () => {
  const messages = createMessages();
  assert.equal(messages.plural("feed.matchCount", 0), "0 matches");
  assert.equal(messages.plural("feed.matchCount", 1), "1 match");
  assert.equal(messages.plural("feed.matchCount", 2), "2 matches");
  assert.equal(messages.plural("feed.matchCount", 1200), "1,200 matches");
  assert.equal(messages.number(0.54, { style: "percent" }), "54%");
  for (const count of [-1, 1.5, NaN, Infinity]) assert.throws(() => messages.plural("feed.matchCount", count), RangeError);
});

test("missing translated keys and plural forms fall back without mutating English", () => {
  const expanded = createMessages("en", {
    "navigation.today": "Browse all of today's football matches and their available analysis",
    "feed.matchCount": { other: "Available matches: {count}" },
  });
  assert.equal(expanded.text("navigation.results"), "Results");
  assert.equal(expanded.plural("feed.matchCount", 1), "Available matches: 1");
  assert.equal(createMessages().text("navigation.today"), "Today");
});

test("reporting-date labels retain the named EAT day rather than the host timezone", () => {
  const messages = createMessages();
  assert.equal(messages.reportingDate(parseReportingDate("2026-10-09")), "Friday, October 9, 2026");
  assert.equal(messages.reportingDate(parseReportingDate("2024-02-29")), "Thursday, February 29, 2024");
});
