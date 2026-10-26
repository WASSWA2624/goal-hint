import assert from "node:assert/strict";
import test from "node:test";
import { getReportingDate, parseReportingDate, parseUtcInstant } from "../src/domain/calendar.ts";
import { getDateInTimeZone, getDayBoundsInTimeZone, validTimeZone } from "../src/domain/device-calendar.ts";

test("device dates resolve from one instant independently of the EAT operational day", () => {
  const at = parseUtcInstant("2026-10-13T01:00:00Z");
  assert.equal(getReportingDate(at), "2026-10-13");
  assert.equal(getDateInTimeZone(at, "America/Los_Angeles"), "2026-10-12");
  assert.equal(getDateInTimeZone(at, "Pacific/Kiritimati"), "2026-10-13");
  assert.equal(getDateInTimeZone(parseUtcInstant("2026-12-31T18:30:00Z"), "Asia/Kathmandu"), "2027-01-01");
});

test("a local browsing day can contain fixtures from two EAT reporting dates", () => {
  const window = getDayBoundsInTimeZone(parseReportingDate("2026-10-12"), "America/Los_Angeles");
  assert.equal(new Date(window.startInclusive).toISOString(), "2026-10-12T07:00:00.000Z");
  assert.equal(new Date(window.endExclusive).toISOString(), "2026-10-13T07:00:00.000Z");
  assert.equal(getReportingDate(window.startInclusive), "2026-10-12");
  assert.equal(getReportingDate(window.endExclusive - 1), "2026-10-13");
});

test("midnight bounds preserve DST changes and non-hour offsets", () => {
  assert.equal(getDayBoundsInTimeZone(parseReportingDate("2026-03-08"), "America/New_York").endExclusive -
    getDayBoundsInTimeZone(parseReportingDate("2026-03-08"), "America/New_York").startInclusive, 23 * 3600000);
  assert.equal(getDayBoundsInTimeZone(parseReportingDate("2026-11-01"), "America/New_York").endExclusive -
    getDayBoundsInTimeZone(parseReportingDate("2026-11-01"), "America/New_York").startInclusive, 25 * 3600000);
  assert.equal(new Date(getDayBoundsInTimeZone(parseReportingDate("2026-10-13"), "Asia/Kathmandu").startInclusive).toISOString(),
    "2026-10-12T18:15:00.000Z");
});

test("invalid zones and nonexistent civil dates fail explicitly", () => {
  for (const zone of ["", "Invalid/Zone", null, 3, "x".repeat(101)]) assert.equal(validTimeZone(zone), false);
  assert.equal(validTimeZone("Africa/Kampala"), true);
  assert.throws(() => getDateInTimeZone(parseUtcInstant("2026-10-13T01:00:00Z"), "Invalid/Zone"));
  assert.throws(() => getDayBoundsInTimeZone(parseReportingDate("2011-12-30"), "Pacific/Apia"));
});
