# 154 — Compact BetSlip date and result rows

## Scope

Refine the selected desktop BetSlip filters into one toolbar with distinct date
and result toggle groups, a clear Reset action, and an applied summary below.
Retain the current date popup, filtering, access rules, and mobile view.

## Implementation

- Replace the date dropdown with one row of Last 30 days, Last 7 days, Last 3
  days, Yesterday, Today, Tomorrow, Next 3 days, Next 7 days, Next 30 days, and
  Custom range buttons, in that order.
- Add Next 3 days to the shared parser/resolver/serializer, from tomorrow
  through three days ahead in EAT. Preserve the internal All dates API option.
- Put All slips, Won, Lost, and Pending beside the dates in a separate segmented
  group with neutral, green, red, and amber theme colors. Solid selected fills
  and `aria-pressed` make both toggle groups distinct. Keep Reset on the same
  row as a separate outlined action with its existing reset icon.
- Show the applied period, exact dates, and result below the buttons. Keep the
  custom-range edit action in this summary row and retain the existing dialog.
- Use square, 28px fine-pointer toggles in compact group frames, 44px touch
  targets, narrow gaps, and quiet horizontal panel edges. Omit vertical panel
  borders. Use compact day labels below 1280px while retaining full accessible
  names and hover titles. Keep result toggles and Reset visible at narrow widths.
- Keep result counts below the filters without repeating the ordinary date
  summary. Preserve All dates scan captions for API compatibility.
- Preserve concurrent slip-sharing and Flutter work. Commit only this scope.

## Verification

- Scoped ESLint and all 17 query, publication-browsing, and API tests passed.
  Next 3 days tests cover month, year, and leap-day transitions and preserve
  period, result, and page through URL serialization.
- The final real UI built successfully in an isolated production fixture from
  committed main with the six owned source/test files overlaid. Its TypeScript
  checks passed independently of concurrent sharing work.
- All 38 final browser flow/layout checks passed, followed by all ten selected
  fill contrast and inset-focus checks. No JavaScript page exceptions occurred.
- All 15 controls share one vertical center at 1024px and 1440px in both themes,
  without hidden or clipped dates. Group frames and Reset remain distinct.
  The panel is 67.73px high; the applied summary stays below the toolbar.
- Selected-result contrast is at least 5.58:1. Keyboard outlines are inset so
  the date scroll container cannot clip them. Screenshots wait for settled
  themes and disable transitions; light and dark layouts were visually reviewed.
- Verified exact date order, full accessible names for compact labels, Next
  3 days requests/empty future results, combined results, Reset, inclusive custom
  dates, invalid/oversized ranges, Cancel/Escape/focus return, and retained result
  choice. Mobile at 390px preserves its existing daily layout.
- Generated snapshots, servers, scripts, and screenshots remain ignored. The
  isolated fixture emits expected HTTP errors for omitted account/live routes.
- The final integrated production build passed on the current main checkout,
  including TypeScript, all 21 generated pages, and the offline bundle manifest.
