import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import {
  addReportingDays,
  CalendarValidationError,
  calendarRules,
  createCalendar,
  createPredictionWindow,
  getKickoffDisplayInput,
  getPublicationDeadline,
  getReportingDate,
  getReportingDayBounds,
  isBeforePublicationCutoff,
  isEligibleForPrediction,
  isInWindow,
  isTemporallyEligibleForPublication,
  parseReportingDate,
  parseUtcInstant,
  toUtcIsoString,
  utcInstantFromDate,
  utcInstantFromEpochMilliseconds,
  validateReportingDateRange,
} from "../src/domain/calendar.ts";
import { operatingRules } from "../src/server/config/runtime-policy.ts";

const execFileAsync = promisify(execFile);
const date = parseReportingDate;
const instant = parseUtcInstant;
const runDate = date("2026-10-07");

test("calendar rules describe the EAT midnight trigger and strict five-minute cutoff", () => {
  assert.equal(calendarRules.storedTimeZone, "UTC");
  assert.equal(calendarRules.dailyRunTime, "00:00");
  assert.equal(calendarRules.dailyRunUtcCron, "0 21 * * *");
  assert.equal(calendarRules.windowDays, 7);
  assert.equal(calendarRules.cutoffSecondsBeforeKickoff, 300);
  assert.equal(calendarRules.publicationStrictlyBeforeCutoff, true);
  assert.equal(calendarRules.observedPlayClosesPublication, true);
  assert.ok(Object.isFrozen(calendarRules));
  assert.equal(operatingRules.calendar, calendarRules);
});

test("reporting dates accept only real canonical Gregorian dates", () => {
  for (const value of ["0001-01-01", "9999-12-31", "2000-02-29", "2024-02-29", "2026-10-07"]) {
    assert.equal(date(value), value);
  }
  for (const value of [
    undefined, null, 20261007, new Date(), "", "2026-1-07", "2026-10-7",
    "2026-10-07 ", " 2026-10-07", "2026/10/07", "2026-10-07T00:00:00Z",
    ...["\n", "\r\n", "\u2028", "\u2029"].map((suffix) => `2026-10-07${suffix}`),
    "0000-01-01", "10000-01-01", "2026-00-01", "2026-13-01", "2026-01-00",
    "2026-01-32", "2026-04-31", "2026-02-29", "1900-02-29", "2100-02-29",
  ]) {
    assert.throws(() => date(value), CalendarValidationError, String(value));
  }
});

test("date increments cross month, year and Gregorian leap-century boundaries", () => {
  for (const [start, days, expected] of [
    ["2026-10-31", 1, "2026-11-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2024-02-29", 1, "2024-03-01"],
    ["2000-02-28", 2, "2000-03-01"],
    ["2000-03-01", -1, "2000-02-29"],
    ["1900-02-28", 1, "1900-03-01"],
    ["2100-02-28", 1, "2100-03-01"],
    ["0001-01-01", 0, "0001-01-01"],
    ["0001-01-01", 1, "0001-01-02"],
    ["9999-12-31", -1, "9999-12-30"],
  ]) {
    assert.equal(addReportingDays(date(start), days), expected);
  }
  assert.throws(() => addReportingDays(date("0001-01-01"), -1), CalendarValidationError);
  assert.throws(() => addReportingDays(date("9999-12-31"), 1), CalendarValidationError);
  for (const days of [undefined, null, "1", 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => addReportingDays(runDate, days), CalendarValidationError);
  }
});

test("UTC parsing requires explicit seconds, a Z suffix and millisecond precision", () => {
  for (const [value, expected] of [
    ["2026-10-07T09:10:11Z", "2026-10-07T09:10:11.000Z"],
    ["2026-10-07T09:10:11.1Z", "2026-10-07T09:10:11.100Z"],
    ["2026-10-07T09:10:11.12Z", "2026-10-07T09:10:11.120Z"],
    ["2026-10-07T09:10:11.123Z", "2026-10-07T09:10:11.123Z"],
    ["0001-01-01T00:00:00Z", "0001-01-01T00:00:00.000Z"],
    ["9999-12-31T23:59:59.999Z", "9999-12-31T23:59:59.999Z"],
  ]) {
    assert.equal(toUtcIsoString(instant(value)), expected);
  }
  for (const value of [
    undefined, null, 0, "2026-10-07", "2026-10-07T09:10Z", "2026-10-07T09:10:11",
    "2026-10-07T09:10:11+00:00", "2026-10-07T09:10:11+03:00",
    "2026-10-07T09:10:11.1234Z", "2026-10-07T09:10:11.Z", "2026-10-07T09:10:11z",
    "2026-10-07 09:10:11Z", "2026-10-07T24:00:00Z", "2026-10-07T09:60:00Z",
    "2026-10-07T09:10:60Z", "2026-02-29T09:10:11Z", "2026-04-31T09:10:11Z",
    "0000-01-01T00:00:00Z", "2026-10-07T09:10:11Z ",
    ...["\n", "\r\n", "\u2028", "\u2029"].map((suffix) => `2026-10-07T09:10:11Z${suffix}`),
  ]) {
    assert.throws(() => instant(value), CalendarValidationError, String(value));
  }
});

test("UTC instants validate integer epoch values and copy mutable Date inputs", () => {
  const source = new Date("2026-10-06T21:00:00.000Z");
  const captured = utcInstantFromDate(source);
  const window = createPredictionWindow(getReportingDate(captured));
  source.setUTCFullYear(2030);
  assert.equal(typeof captured, "number");
  assert.equal(toUtcIsoString(captured), "2026-10-06T21:00:00.000Z");
  assert.equal(window.runDate, "2026-10-07");
  assert.equal(utcInstantFromEpochMilliseconds(0), 0);
  assert.equal(utcInstantFromEpochMilliseconds(-1), -1);
  for (const value of [undefined, null, "0", NaN, Infinity, 0.1, 8_640_000_000_000_001]) {
    assert.throws(() => utcInstantFromEpochMilliseconds(value), CalendarValidationError);
  }
  assert.throws(() => utcInstantFromDate(new Date(NaN)), CalendarValidationError);
});

test("7 October 2026 spans exactly seven EAT dates with inclusive start and exclusive end", () => {
  const window = createPredictionWindow(runDate);
  const start = instant("2026-10-06T21:00:00Z");
  const end = instant("2026-10-13T21:00:00Z");
  assert.deepEqual(window, {
    runDate: "2026-10-07",
    lastDate: "2026-10-13",
    endDateExclusive: "2026-10-14",
    startInclusive: start,
    endExclusive: end,
  });
  for (const [value, expected] of [
    [start - 1, false], [start, true], [start + 1, true],
    [end - 1, true], [end, false], [end + 1, false],
  ]) {
    assert.equal(isInWindow(value, window), expected);
  }
  assert.equal(getReportingDate(end - 1), "2026-10-13");
  assert.equal(getReportingDate(end), "2026-10-14");
  assert.ok(Object.isFrozen(window));
  assert.throws(() => { window.endExclusive = end + 86_400_000; }, TypeError);
  assert.ok(Object.values(window).every((value) => !(value instanceof Date)));
  assert.throws(() => isInWindow(start, { startInclusive: end, endExclusive: start }), CalendarValidationError);
  assert.throws(() => isInWindow(start, { startInclusive: start, endExclusive: start }), CalendarValidationError);
});

test("EAT dates and day bounds roll over at 21:00 UTC independently of UTC dates", () => {
  const midnight = instant("2026-10-07T21:00:00Z");
  assert.equal(getReportingDate(midnight - 1), "2026-10-07");
  assert.equal(getReportingDate(midnight), "2026-10-08");
  assert.equal(getReportingDate(midnight + 1), "2026-10-08");
  assert.deepEqual(getReportingDayBounds(runDate), {
    startInclusive: instant("2026-10-06T21:00:00Z"),
    endExclusive: midnight,
  });
  assert.equal(getReportingDayBounds(date("2026-10-08")).startInclusive, midnight);
  assert.ok(Object.isFrozen(getReportingDayBounds(runDate)));
});

test("historical Kampala offset transitions preserve short and long reporting days", () => {
  // Pinned Node's Intl timezone data records UTC+02:30 becoming +03:00 in
  // July 1928, then returning to +02:30 in January 1930. Day arithmetic
  // must follow those historical dates rather than imposing today's offset.
  for (const [value, start, end, duration] of [
    ["1928-07-01", "1928-06-30T21:30:00Z", "1928-07-01T21:00:00Z", 84_600_000],
    ["1930-01-04", "1930-01-03T21:00:00Z", "1930-01-04T21:30:00Z", 88_200_000],
  ]) {
    const reportingDate = date(value);
    const bounds = getReportingDayBounds(reportingDate);
    assert.equal(bounds.startInclusive, instant(start));
    assert.equal(bounds.endExclusive, instant(end));
    assert.equal(bounds.endExclusive - bounds.startInclusive, duration);
    assert.equal(getReportingDate(bounds.startInclusive), value);
    assert.equal(getReportingDate(bounds.endExclusive - 1), value);
    assert.equal(getReportingDate(bounds.startInclusive - 1), addReportingDays(reportingDate, -1));
    assert.equal(getReportingDate(bounds.endExclusive), addReportingDays(reportingDate, 1));
    assert.equal(isInWindow(bounds.endExclusive - 1, bounds), true);
    assert.equal(isInWindow(bounds.endExclusive, bounds), false);
  }
});

test("reporting-day conversion respects the supported Gregorian year boundaries", () => {
  for (const value of ["0001-01-01", "0099-12-31", "0100-01-01", "9999-12-31"]) {
    const bounds = getReportingDayBounds(date(value));
    assert.equal(getReportingDate(bounds.startInclusive), value);
    assert.equal(getReportingDate(bounds.endExclusive - 1), value);
    assert.ok(bounds.endExclusive > bounds.startInclusive);
  }
  const first = getReportingDayBounds(date("0001-01-01"));
  const last = getReportingDayBounds(date("9999-12-31"));
  assert.throws(() => getReportingDate(first.startInclusive - 1), CalendarValidationError);
  assert.throws(() => getReportingDate(last.endExclusive), CalendarValidationError);
  assert.throws(() => createPredictionWindow(date("9999-12-25")), CalendarValidationError);
});

test("bounded inclusive historical ranges remain valid outside the prediction window", () => {
  const range = validateReportingDateRange("2000-02-28", "2000-03-01", 3);
  assert.equal(range.startDate, "2000-02-28");
  assert.equal(range.endDate, "2000-03-01");
  assert.equal(range.dayCount, 3);
  assert.equal(getReportingDate(range.window.startInclusive), "2000-02-28");
  assert.equal(getReportingDate(range.window.endExclusive - 1), "2000-03-01");
  assert.equal(getReportingDate(range.window.endExclusive), "2000-03-02");
  assert.equal(isInWindow(range.window.startInclusive, createPredictionWindow(runDate)), false);
  assert.equal(validateReportingDateRange("2026-10-07", "2026-10-07", 1).dayCount, 1);
  assert.ok(Object.isFrozen(range));
  assert.ok(Object.isFrozen(range.window));
  for (const [start, end, cap] of [
    [undefined, "2026-10-07", 7], ["2026-10-07", undefined, 7],
    ["", "2026-10-07", 7], ["2026-10-07", "", 7],
    ["2026-10-08", "2026-10-07", 7], ["2026-10-07", "2026-10-14", 7],
    ["2026-02-29", "2026-03-01", 7],
    ...[undefined, null, 0, -1, 1.5, Infinity, "7"].map((cap) => ["2026-10-07", "2026-10-07", cap]),
  ]) {
    assert.throws(() => validateReportingDateRange(start, end, cap), CalendarValidationError);
  }
});

test("prediction eligibility requires manifest membership and both immutable windows", () => {
  const original = createPredictionWindow(runDate);
  const current = createPredictionWindow(date("2026-10-08"));
  const snapshot = { ...original };
  const both = instant("2026-10-08T09:00:00Z");
  assert.equal(isEligibleForPrediction(both, original, current, true), true);
  assert.equal(isEligibleForPrediction(both, original, current, false), false);
  assert.equal(isEligibleForPrediction(both, original, current, undefined), false);
  assert.equal(isEligibleForPrediction(instant("2026-10-07T09:00:00Z"), original, current, true), false);
  // A manifest fixture moved past its original boundary cannot enter through a newer run.
  assert.equal(isEligibleForPrediction(instant("2026-10-14T09:00:00Z"), original, current, true), false);
  assert.equal(isEligibleForPrediction(instant("2026-10-15T09:00:00Z"), original, current, true), false);
  assert.deepEqual(original, snapshot);
});

test("standard publication cutoff is strict and earlier closures can only shorten it", () => {
  const kickoff = instant("2026-10-08T09:00:00Z");
  const cutoff = instant("2026-10-08T08:55:00Z");
  const earlier = instant("2026-10-08T08:50:00Z");
  assert.equal(getPublicationDeadline(kickoff), cutoff);
  assert.equal(isBeforePublicationCutoff(cutoff - 1, kickoff), true);
  assert.equal(isBeforePublicationCutoff(cutoff, kickoff), false);
  assert.equal(isBeforePublicationCutoff(cutoff + 1, kickoff), false);
  assert.equal(getPublicationDeadline(kickoff, earlier), earlier);
  assert.equal(isBeforePublicationCutoff(earlier - 1, kickoff, earlier), true);
  assert.equal(isBeforePublicationCutoff(earlier, kickoff, earlier), false);
  assert.equal(getPublicationDeadline(kickoff, kickoff + 60_000), cutoff);
  assert.equal(isBeforePublicationCutoff(cutoff, kickoff, kickoff + 60_000), false);
});

test("publication eligibility combines the current day, original manifest and cutoff", () => {
  const input = {
    scheduledKickoff: instant("2026-10-08T09:00:00Z"),
    originalWindow: createPredictionWindow(runDate),
    isOriginalManifestMember: true,
  };
  const cutoff = instant("2026-10-08T08:55:00Z");
  assert.equal(isTemporallyEligibleForPublication(cutoff - 1, input), true);
  assert.equal(isTemporallyEligibleForPublication(cutoff, input), false);
  assert.equal(isTemporallyEligibleForPublication(cutoff - 1, { ...input, isOriginalManifestMember: false }), false);
  const earlierCloseAt = cutoff - 60_000;
  assert.equal(isTemporallyEligibleForPublication(earlierCloseAt - 1, { ...input, earlierCloseAt }), true);
  assert.equal(isTemporallyEligibleForPublication(earlierCloseAt, { ...input, earlierCloseAt }), false);
  assert.equal(isTemporallyEligibleForPublication(instant("2026-10-14T08:00:00Z"), {
    ...input, scheduledKickoff: instant("2026-10-14T09:00:00Z"),
  }), false);
});

test("injected clocks are read once per decision and midnight never rewrites a run", () => {
  const midnight = instant("2026-10-07T21:00:00Z");
  let now = midnight - 1;
  let reads = 0;
  const calendar = createCalendar({ now: () => { reads += 1; return now; } });
  const original = calendar.currentWindow();
  assert.equal(reads, 1);
  assert.equal(original.runDate, "2026-10-07");
  now = midnight;
  const current = calendar.currentWindow();
  assert.equal(reads, 2);
  assert.equal(current.runDate, "2026-10-08");
  assert.equal(original.runDate, "2026-10-07");
  assert.equal(original.endDateExclusive, "2026-10-14");
  const input = {
    scheduledKickoff: instant("2026-10-08T09:00:00Z"),
    originalWindow: original,
    isOriginalManifestMember: true,
  };
  assert.equal(calendar.canPublish(input), true);
  assert.equal(reads, 3);
  now = instant("2026-10-08T08:55:00Z");
  assert.equal(calendar.canPublish(input), false);
  assert.equal(reads, 4);
  assert.ok(Object.isFrozen(calendar));
});

test("visitor display changes the displayed date without changing the EAT date or instant", () => {
  const kickoff = instant("2026-10-06T21:00:00Z");
  const defaultDisplay = getKickoffDisplayInput(kickoff);
  assert.equal(defaultDisplay.timeZone, "Africa/Kampala");
  const localDate = (input) => {
    const parts = new Intl.DateTimeFormat("en-US", input.options).formatToParts(input.value);
    return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type).value).join("-");
  };
  assert.equal(localDate(defaultDisplay), "2026-10-07");
  for (const [timeZone, expected] of [["America/Los_Angeles", "2026-10-06"], ["Asia/Tokyo", "2026-10-07"]]) {
    const display = getKickoffDisplayInput(kickoff, timeZone);
    assert.equal(localDate(display), expected);
    assert.equal(display.value, kickoff);
    assert.equal(display.reportingDate, "2026-10-07");
    assert.equal(display.options.timeZone, display.timeZone);
    assert.ok(Object.isFrozen(display));
    assert.ok(Object.isFrozen(display.options));
  }
  for (const timeZone of ["", "Synthetic/Invalid", null, 3]) {
    assert.throws(() => getKickoffDisplayInput(kickoff, timeZone), CalendarValidationError);
  }
});

test("calendar results are identical in UTC, Los Angeles and Tokyo host processes", async () => {
  const calendarUrl = new URL("../src/domain/calendar.ts", import.meta.url).href;
  const script = `
    import {
      addReportingDays, createPredictionWindow, getKickoffDisplayInput,
      getPublicationDeadline, getReportingDate, isInWindow, parseReportingDate, parseUtcInstant,
    } from ${JSON.stringify(calendarUrl)};
    const kickoff = parseUtcInstant("2026-10-08T09:00:00Z");
    const window = createPredictionWindow(parseReportingDate("2026-10-07"));
    console.log(JSON.stringify({
      host: Intl.DateTimeFormat().resolvedOptions().timeZone,
      result: {
        window,
        beforeMidnight: getReportingDate(parseUtcInstant("2026-10-07T20:59:59.999Z")),
        atMidnight: getReportingDate(parseUtcInstant("2026-10-07T21:00:00Z")),
        yearTransition: addReportingDays(parseReportingDate("2026-12-31"), 1),
        leapTransition: addReportingDays(parseReportingDate("2000-02-28"), 1),
        cutoff: getPublicationDeadline(kickoff),
        includesStart: isInWindow(window.startInclusive, window),
        includesEnd: isInWindow(window.endExclusive, window),
        defaultDisplay: getKickoffDisplayInput(kickoff),
      },
    }));
  `;
  const zones = ["UTC", "America/Los_Angeles", "Asia/Tokyo"];
  const results = await Promise.all(zones.map(async (TZ) => {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", script], {
      env: { ...process.env, TZ }, timeout: 30_000, windowsHide: true,
    });
    assert.equal(stderr, "");
    const output = JSON.parse(stdout);
    assert.equal(output.host, TZ);
    return output.result;
  }));
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  assert.equal(results[0].beforeMidnight, "2026-10-07");
  assert.equal(results[0].atMidnight, "2026-10-08");
  assert.equal(results[0].yearTransition, "2027-01-01");
  assert.equal(results[0].leapTransition, "2000-02-29");
  assert.equal(results[0].includesStart, true);
  assert.equal(results[0].includesEnd, false);
});
