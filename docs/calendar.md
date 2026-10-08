# EAT calendar contract

Web, server and worker code share `src/domain/calendar.ts`. It contains pure
rules and imports only the browser-safe public policy. Reporting dates use
`Africa/Kampala`; persistence and comparisons use UTC instants. No scheduler,
provider request or database model is installed by this module.

## Values and shared API

`ReportingDate` is a validated Gregorian `YYYY-MM-DD` string in years
`0001–9999`. `UtcInstant` is an integer Unix epoch millisecond value within the
JavaScript Date range. These primitives remain language-neutral and serializable.
Adapters must enforce their storage type's narrower bounds, including MySQL
`DATETIME(3)`, rather than pass an arbitrary domain instant into persistence.

| API | Contract |
| --- | --- |
| `parseReportingDate`, `addReportingDays` | Reject impossible/noncanonical dates and invalid increments; advance Gregorian dates across month, year and leap-day boundaries. Arithmetic outside the supported reporting years fails. |
| `parseUtcInstant`, `utcInstantFromEpochMilliseconds`, `utcInstantFromDate`, `toUtcIsoString` | Accept explicit UTC strings with seconds and optional one-to-three fractional digits, or valid integer milliseconds. Offset, timezone-less, extra-precision and normalized invalid inputs fail. Copy Date values into primitives; serialization emits UTC ISO strings. |
| `getReportingDate`, `getReportingDayBounds` | Derive a named-zone reporting date and its inclusive start/exclusive end. Use explicit Gregorian/Latin `Intl` parts, independent of host timezone and locale. Historical timezone changes are respected. |
| `createPredictionWindow`, `isInWindow` | Freeze scalar run identity and original boundaries; test `[startInclusive, endExclusive)`. A run's seven-day end date must remain within supported reporting years. |
| `validateReportingDateRange` | Require both inclusive endpoints and an explicit positive finite integer maximum day count. Reject open, inverted and excessive ranges. Historical queries work independently of prediction eligibility. The last supported day's exclusive UTC bound may lie in year 10000. |
| `getPublicationDeadline`, `isBeforePublicationCutoff` | Standard deadline is scheduled kickoff minus 300 seconds; optional earlier closure can reduce it. Equality at either deadline rejects publication. |
| `isEligibleForPrediction`, `isTemporallyEligibleForPublication` | Require trusted original-manifest membership and kickoff membership in both the original and current windows. Publication also checks the strict deadline. |
| `createCalendar` | Require an injected `Clock`; capture its instant once per `currentWindow` or `canPublish` decision. |
| `getKickoffDisplayInput` | Return a frozen instant, unchanged EAT reporting date and explicit `Intl.DateTimeFormat` options. Default to Kampala; an optional validated visitor timezone changes display only. UI supplies locale and labels. |

Use the inclusive query dates for URL/provider date inputs and the returned
exclusive UTC range for timestamp queries. Public endpoint owners must supply
their approved query cap; this foundation does not invent a product-wide archive
limit. It computes range boundaries without enumerating potentially large lists.

## Daily schedule and immutable windows

`calendarRules` is the single source for calendar operating settings and is
reused by `operatingRules.calendar`. The daily logical trigger is **00:00 EAT**,
equivalent to **21:00 UTC on the preceding date**: UTC cron `0 21 * * *`.
The scheduler must explicitly use UTC. This is a contract for prompts 020/021
and deployment; no live schedule is configured here.

For run date `2026-10-07`, the frozen window begins at
`2026-10-06T21:00:00.000Z` and ends exclusively at
`2026-10-13T21:00:00.000Z`. It covers 7–13 October EAT. Persist these original
boundaries with the eventual run manifest. A later decision derives a fresh
rolling window from its captured publication instant and intersects eligibility
with the original window; it never rewrites the original run.

```ts
import {
  createCalendar,
  createPredictionWindow,
  parseReportingDate,
  parseUtcInstant,
  utcInstantFromDate,
} from "../src/domain/calendar.ts";

const calendar = createCalendar({ now: () => utcInstantFromDate(new Date()) });
const originalWindow = createPredictionWindow(parseReportingDate("2026-10-07"));

const temporallyEligible = calendar.canPublish({
  scheduledKickoff: parseUtcInstant("2026-10-08T16:00:00Z"),
  originalWindow,
  isOriginalManifestMember: true, // Obtain from the stored manifest, not visitor input.
});
```

Decision-making services inject the clock at their composition boundary; tests
supply fixed or advancing clocks. No domain operation reads the current time
implicitly. Publication services must capture/recheck authoritative transaction
time at the actual write, rather than rely on an earlier worker decision.

## Cutoff and later responsibilities

For kickoff `16:00:00.000Z`, the standard cutoff is `15:55:00.000Z`:
`15:54:59.999Z` is temporally eligible, `15:55:00.000Z` is ineligible. The effective
deadline is `min(standardCutoff, earlierCloseAt)`; a later closure cannot extend
the five-minute rule. The cycle service owns actual-start evidence, schedule
history, freshness, locked state and closure; it supplies an earlier closing
instant when authoritative evidence requires one.

These helpers establish temporal facts. Prompts 019–025 must additionally prove
manifest/cycle identity, eligible status, observation freshness, run ordering,
idempotency and transaction locking. A true temporal result grants no external
operation authority and does not reopen a closed cycle. Historical results and
previously locked forecasts remain addressable when their dates leave the
prediction window.

Visitor display never supplies reporting dates, run IDs, range bounds or cutoff
values. For example, a kickoff may display on 6 October in Los Angeles while its
EAT reporting date remains 7 October. Keep the local timezone visibly labeled
when that optional UI is implemented.

The explicit timezone and part-based formatting contract follows the
[ECMAScript Internationalization specification](https://tc39.es/ecma402/#sec-intl.datetimeformat).
Host-independence tests launch the same domain code with different
[Node `TZ` settings](https://nodejs.org/docs/latest-v24.x/api/cli.html#tz).
