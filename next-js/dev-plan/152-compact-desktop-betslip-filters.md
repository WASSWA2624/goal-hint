# 152 — Compact desktop BetSlip filters

## Selected scope

Implement design 1, Compact selectors, on the desktop BetSlip page. Reuse the
Matches filter styling and the shared date dialog. Keep the existing mobile
daily view and the slip-generation/publication workflow.

## Implementation

- Add a compact date dropdown, All slips/Won/Lost/Pending buttons, and Reset.
- Support Today, Yesterday, Tomorrow, Last 3/7/30 days, Next 7/30 days, All dates,
  and inclusive custom publication dates up to 366 days, all in EAT.
- Combine dates and outcomes; reset to Today/All. Cancel and Escape discard date
  drafts. A date-only reset retains the selected result.
- Read immutable published slips with original-cycle adjudication. Preserve
  public aggregate gating and recheck entitlement after filtered API reads.
- Return exact counts and 20 slips per page for explicit ranges. Continue All
  dates in bounded 31-publication scans using date/rank cursors, with honest
  page counts, scanned dates, and continuation for empty intermediate scans.
- Keep whole-range performance counts independent of outcome/page filters;
  omit incomplete All dates aggregates. Include Void only under All slips.
- Abort obsolete requests, withhold stale private results after refreshed server
  seeds, and provide loading, retry, empty-state, and page-navigation feedback.
- Add date/outcome metadata to filtered slip rows. Reuse existing slip cards,
  live observations, theme tokens, translations, and modal focus behavior.
- Preserve SSR/default daily reads, legacy homepage feed-query redirects,
  existing publication history contracts, and the design comparison gallery.

## Verification

- Full repository lint, route generation/TypeScript, and the production build
  passed. The production offline manifest was generated successfully.
- The complete existing Best Slips test suite passed, followed by 50 related
  calendar/query/browse/publication/saved-slip tests and six API checks. These
  cover original cycles, exact counts, sparse All dates scans, continuation
  within a daily publication, malformed queries, and access expiry.
- The complete existing production slip-rendering acceptance suite passed,
  including entitled/locked/member/100-slip/limited Best Slips cases.
- The latest isolated production fixture passed 36 browser assertions covering
  presets/results, custom dates and validation, Cancel/Escape, Reset, exact and
  cursor pagination, error/retry, and locked public summaries. Screenshots at
  1440/1024px in both themes were inspected; the toolbar stays in one row with
  square controls. At 390px, the original daily view remains without filters
  or horizontal overflow. No JavaScript page exceptions occurred.
- Seven final browser edge checks passed, bringing the latest compiled UI to
  43/43: both pagination boundaries retain focus, late canceled responses stay
  hidden, All dates empty scans continue, scanned dates remain visible, and a
  30-second request timeout offers retry. The fixture has expected missing
  account/live-polling HTTP routes and an intentionally injected 503; these
  are separate from JavaScript page exceptions.
- Genuine MySQL integration was skipped because this workstation has no
  `mysqld` binary. Unit tests exercise the SQL adapter contract with sealed
  synthetic rows; no live database or deployment verification is claimed.
