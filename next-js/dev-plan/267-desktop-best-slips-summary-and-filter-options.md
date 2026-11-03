# 267 — Compact desktop Best Slips summary and filter options

- Hide the separate first-publication date on desktop, left-align browsing
  dates, outcome and odds, and remove the summary fill and padding. Use the
  page background and tighter theme spacing around the performance section.
- Show the performance reporting date/range and actual snapshot time in
  24-hour EAT. Today's single-day performance uses one date and time;
  historical/range views explicitly identify the checked date. Do not invent
  a timestamp for unavailable data or change the performance/list scopes.
- Reuse native-radio SegmentedChoice controls to list all eleven date options
  and five odds bands inside the desktop Advanced Filters dialog. Retain
  custom dates, validation, draft discard, Reset, Apply and keyboard behavior.
- Preserve mobile dropdowns, publication date and summary presentation. Use
  shared control heights, theme colours and radius tokens in both themes.
- Extend the existing synthetic fixture with production-shaped snapshot
  metadata and browser acceptance for layout, dates and option groups.

## Verification

- Full application typecheck, focused ESLint and the shared theme-token contract
  passed. All 44 targeted slip-query, client-state, summary, result-navigation
  and timestamp tests passed.
- The production slip fixture compiled and typechecked. Its scoped SSR checks
  passed for multi-day, yesterday and bounded All dates views.
- Eight browser combinations passed: light/dark at 320, 390, 1024 and 1440px
  with fine pointers. Checked every desktop option, combined date/odds Apply,
  native arrow keys, Escape/focus return, draft Reset/discard, invalid custom
  ranges, Enter submission, today's timestamp and the separate checked date
  for yesterday's performance. Mobile dropdown workflows also passed.
- Desktop and mobile screenshots were inspected in both themes. Desktop
  summaries are transparent, unpadded and left-aligned; the separate date is
  hidden, heading padding is 2px per edge, and controls retain shared heights.
  No viewport overflow or browser runtime errors occurred.
- The synthetic fixture omits unrelated account-session, community, live-match
  polling and service-worker endpoints, so those requests can return 404.
  No live-data, hosted or native deployment acceptance was performed.

Source integration and deployment are separate.
