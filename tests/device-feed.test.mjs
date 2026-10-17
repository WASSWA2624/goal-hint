import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate } from "../src/domain/calendar.ts";
import { deviceFeedEntryHref, deviceFeedQuery } from "../src/domain/device-feed.ts";
import { feedQueryHref, parseFeedQuery } from "../src/domain/feed-query.ts";
import { resetFeedFilters } from "../src/domain/feed-controls.ts";

const today = parseReportingDate("2026-10-12"), zone = "America/Los_Angeles";
const query = (parameters = "") => parseFeedQuery(new URLSearchParams(parameters), { today });

test("initial relative entries adopt the device zone while retaining filters and resetting page", () => {
  for (const when of ["today", "tomorrow", "next-7-days"]) {
    const original = query(`when=${when}&q=Club&league=league-a&page=3`);
    const local = deviceFeedQuery(original, zone);
    assert.equal(local.zone, zone); assert.equal(local.page, 1);
    assert.deepEqual(local.dates, original.dates);
    assert.equal(local.search, "Club"); assert.deepEqual(local.leagues, ["league-a"]);
    assert.match(feedQueryHref(local, today), /tz=America%2FLos_Angeles/u);
  }
});

test("named historical dates, explicit ranges and applied zones are never rewritten", () => {
  for (const parameters of ["date=2020-02-29", "from=2020-02-29&to=2020-03-02", "tz=Asia%2FKathmandu",
    "timeFrom=13:00&timeTo=14:00&tz=Africa%2FKampala"]) assert.equal(deviceFeedQuery(query(parameters), zone), null);
});

test("device navigation selects today/live and yesterday's results in the same browsing zone", () => {
  assert.equal(deviceFeedEntryHref("today", today, zone), "/en?tz=America%2FLos_Angeles");
  assert.equal(deviceFeedEntryHref("live", today, zone), "/en?tz=America%2FLos_Angeles&status=live");
  assert.equal(deviceFeedEntryHref("results", today, zone), "/en/predictions/2026-10-11?tz=America%2FLos_Angeles&status=finished");
  assert.equal(deviceFeedEntryHref("results", parseReportingDate("2027-01-01"), "Asia/Kathmandu"),
    "/en/predictions/2026-12-31?tz=Asia%2FKathmandu&status=finished");
});

test("Clear filters returns to the last 30 days in the device zone and removes optional time bounds", () => {
  const original = query("date=2020-02-29&tz=America%2FLos_Angeles&timeFrom=12:00&timeTo=13:00&q=Club");
  const cleared = resetFeedFilters(original);
  assert.equal(cleared.zone, zone); assert.equal(cleared.time, undefined);
  assert.deepEqual(cleared.dates, { kind: "last-30-days" });
  assert.equal(feedQueryHref(cleared, today), "/en?tz=America%2FLos_Angeles");
});
