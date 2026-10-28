import assert from "node:assert/strict";
import test from "node:test";
import { CalendarValidationError, parseReportingDate, parseUtcInstant } from "../src/domain/calendar.ts";
import { createMessages } from "../src/i18n/messages.ts";

test("default timestamp formatting retains 24-hour EAT server output", () => {
  const messages = createMessages("en"), at = parseUtcInstant("2026-10-06T21:30:00Z");
  assert.equal(messages.reportingDay(at), "Wed, Oct 7");
  assert.equal(messages.reportingTime(at), "00:30");
  assert.equal(messages.reportingInstant(at), "Oct 7, 2026, 00:30 EAT");
  assert.equal(messages.timeZone(at), "EAT");
});

test("device display zones change instant date and time without shifting named reporting dates", () => {
  const messages = createMessages("en", undefined, "America/Los_Angeles");
  const at = parseUtcInstant("2026-10-07T01:30:00Z"), date = parseReportingDate("2026-10-07");
  assert.equal(messages.reportingDay(at), "Tue, Oct 6");
  assert.equal(messages.reportingTime(at), "18:30");
  assert.equal(messages.reportingInstant(at), "Oct 6, 2026, 18:30 PDT");
  assert.equal(messages.timeZone(at), "PDT");
  assert.equal(messages.reportingDate(date), "Wednesday, October 7, 2026");
  assert.equal(messages.reportingDateShort(date), "Wed, Oct 7");
  assert.equal(messages.reportingDateMedium(date), "Wed, Oct 7, 2026");
});

test("zone labels and local times follow daylight-saving changes at each instant", () => {
  const messages = createMessages("en", undefined, "Europe/London");
  const summer = parseUtcInstant("2026-07-11T23:30:00Z"), winter = parseUtcInstant("2026-12-11T23:30:00Z");
  assert.equal(messages.reportingDay(summer), "Sun, Jul 12");
  assert.equal(messages.reportingTime(summer), "00:30");
  assert.equal(messages.timeZone(summer), "GMT+1");
  assert.equal(messages.reportingDay(winter), "Fri, Dec 11");
  assert.equal(messages.reportingTime(winter), "23:30");
  assert.equal(messages.timeZone(winter), "GMT");
});

test("non-hour zone offsets remain accurate in 24-hour time", () => {
  const messages = createMessages("en", undefined, "Asia/Kolkata"), at = parseUtcInstant("2026-10-07T20:15:00Z");
  assert.equal(messages.reportingDay(at), "Thu, Oct 8");
  assert.equal(messages.reportingTime(at), "01:45");
  assert.equal(messages.reportingInstant(at), "Oct 8, 2026, 01:45 GMT+5:30");
  assert.equal(messages.timeZone(at), "GMT+5:30");
});

test("message instances are immutable and reused per locale and display zone", () => {
  const local = createMessages("en", undefined, "America/Los_Angeles");
  assert.equal(createMessages("fr", undefined, "America/Los_Angeles"), local);
  assert.equal(Object.isFrozen(local), true);
  assert.notEqual(local, createMessages("en"));
  const translated = createMessages("en", { "navigation.today": "This day" }, "Asia/Kolkata");
  assert.equal(translated.text("navigation.today"), "This day");
  assert.equal(translated.reportingTime(parseUtcInstant("2026-10-07T20:15:00Z")), "01:45");
  assert.equal(createMessages("en", undefined, "Asia/Kolkata").text("navigation.today"), "Today");
  for (const zone of ["", "Synthetic/Invalid", null]) assert.throws(() => createMessages("en", undefined, zone), RangeError);
});

test("compact kickoff labels use day-month and explicit 12-hour frames without changing existing timestamp formats", () => {
  const messages = createMessages("en"), at = parseUtcInstant("2026-10-28T18:00:00Z");
  assert.equal(messages.shortKickoffDate(at), "28-Oct");
  assert.equal(messages.shortKickoffTime(at), "9:00 PM");
  assert.equal(messages.reportingTime(at), "21:00");
  for (const [value, expected] of [["2026-10-27T21:00:00Z", "12:00 AM"], ["2026-10-28T09:00:00Z", "12:00 PM"]]) {
    const instant = parseUtcInstant(value);
    assert.equal(messages.shortKickoffDate(instant), "28-Oct");
    assert.equal(messages.shortKickoffTime(instant), expected);
  }
});

test("compact dates and times cross midnight together in the selected display zone", () => {
  const at = parseUtcInstant("2026-10-28T01:30:00Z");
  const server = createMessages("en"), local = createMessages("en", undefined, "America/Los_Angeles");
  assert.equal(server.shortKickoffDate(at), "28-Oct");
  assert.equal(server.shortKickoffTime(at), "4:30 AM");
  assert.equal(local.shortKickoffDate(at), "27-Oct");
  assert.equal(local.shortKickoffTime(at), "6:30 PM");
  assert.equal(local.reportingDateShort(parseReportingDate("2026-10-28")), "Wed, Oct 28");
  const halfHour = createMessages("en", undefined, "Asia/Kolkata"), nextDay = parseUtcInstant("2026-10-28T20:15:00Z");
  assert.equal(halfHour.shortKickoffDate(nextDay), "29-Oct");
  assert.equal(halfHour.shortKickoffTime(nextDay), "1:45 AM");
});

test("compact kickoff labels follow daylight-saving offsets and keep instant validation", () => {
  const messages = createMessages("en", undefined, "America/Los_Angeles");
  for (const [value, zone] of [["2026-11-01T08:30:00Z", "PDT"], ["2026-11-01T09:30:00Z", "PST"]]) {
    const instant = parseUtcInstant(value);
    assert.equal(messages.shortKickoffDate(instant), "1-Nov");
    assert.equal(messages.shortKickoffTime(instant), "1:30 AM");
    assert.equal(messages.timeZone(instant), zone);
  }
  for (const invalid of [NaN, Infinity, 0.5]) {
    assert.throws(() => messages.shortKickoffDate(invalid), CalendarValidationError);
    assert.throws(() => messages.shortKickoffTime(invalid), CalendarValidationError);
  }
});
