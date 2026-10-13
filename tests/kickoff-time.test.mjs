import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate, validateReportingDateRange } from "../src/domain/calendar.ts";
import { parseFeedQuery, serializeFeedQuery, feedQueryKey } from "../src/domain/feed-query.ts";
import { kickoffTimeWindows } from "../src/domain/kickoff-time.ts";
import { feedSql } from "../src/server/matches/feed-read.ts";

const today = parseReportingDate("2026-10-11");
const range = (date) => validateReportingDateRange(parseReportingDate(date), parseReportingDate(date), 31);
const windows = (date, from, to, zone) => kickoffTimeWindows(range(date), { from, to, zone })
  .map(({ start, end }) => [new Date(start).toISOString(), new Date(end).toISOString()]);

test("exact kickoff minutes and inclusive time ranges use the selected local calendar date", () => {
  assert.deepEqual(windows("2026-10-11", "00:00", "00:00", "Africa/Kampala"), [["2026-10-10T21:00:00.000Z", "2026-10-10T21:01:00.000Z"]]);
  assert.deepEqual(windows("2026-10-11", "23:00", "23:59", "America/New_York"), [["2026-10-12T03:00:00.000Z", "2026-10-12T04:00:00.000Z"]]);
  assert.deepEqual(windows("2026-10-11", "12:00", "13:00", "Asia/Kathmandu"), [["2026-10-11T06:15:00.000Z", "2026-10-11T07:16:00.000Z"]]);
});
test("DST gaps have no invented minutes and repeated minutes include both occurrences", () => {
  assert.deepEqual(windows("2026-03-08", "02:30", "02:30", "America/New_York"), []);
  assert.deepEqual(windows("2026-11-01", "01:30", "01:30", "America/New_York"), [
    ["2026-11-01T05:30:00.000Z", "2026-11-01T05:31:00.000Z"], ["2026-11-01T06:30:00.000Z", "2026-11-01T06:31:00.000Z"]]);
});
test("time URLs round trip and invalid or incomplete filters fail", () => {
  const parsed = parseFeedQuery(new URLSearchParams("timeFrom=12:30&tz=Africa%2FKampala"), { today });
  assert.equal(parsed.time.to, "12:30");
  assert.deepEqual(parseFeedQuery(serializeFeedQuery(parsed, today), { today }), parsed);
  assert.notEqual(feedQueryKey(parsed, today), feedQueryKey({ ...parsed, time: null }, today));
  assert.equal(parseFeedQuery(new URLSearchParams("tz=UTC"), { today }).zone, "UTC");
  for (const value of ["timeFrom=24:00&tz=UTC", "timeFrom=12:00", "tz=Invalid/Zone", "timeFrom=12:00&timeTo=11:00&tz=UTC", "timeFrom=12:00&tz=Invalid/Zone"]) {
    assert.throws(() => parseFeedQuery(new URLSearchParams(value), { today }));
  }
});
test("SQL filters kickoff before pagination and keeps the full local date cohort for empty-state counts", () => {
  const query = parseFeedQuery(new URLSearchParams("timeFrom=23:00&timeTo=23:59&tz=America%2FNew_York"), { today });
  const sql = feedSql(query, range(today), [1]);
  assert.ok(sql.where.values.some((v) => v instanceof Date && v.toISOString() === "2026-10-12T03:00:00.000Z"));
  assert.ok(sql.scope.values.some((v) => v instanceof Date && v.toISOString() === "2026-10-11T04:00:00.000Z"));
  assert.doesNotMatch(sql.where.sql, /America|23:59/);
});
