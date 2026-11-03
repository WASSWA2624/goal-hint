# 265 — Best Slips filter dialog and results bar

## Scope

- Add an optional action slot to the reusable performance summary. Best Slips
  places its filter button beside the card row on desktop, stretching to the
  same height, and below the cards on mobile with shared control metrics.
- Reuse the Advanced Filters dialog shell for slip date presets, inline custom
  date validation, total odds, Reset and Apply. Keep edits local until Apply;
  dismissal restores the applied values and returns focus to the opener.
- Consolidate the first visible publication date, browsing dates, outcome, odds
  and result count into one information bar, keeping browsing details aligned
  toward the right and the count at its far end.
  Remove repeating day dividers; individual slip publication dates remain.
- Retain result drilldowns, band identity, pagination, access controls and
  bounded All dates coverage. Matches behavior is outside this change.

## Verification

- Typecheck, focused lint, the theme-token contract and 26 targeted query,
  client-projection, summary and result-navigation tests passed.
- Production fixture compilation and scoped SSR passed for multi-day,
  yesterday and All dates collections, each with one opener and information bar.
  Type checking ran separately to avoid duplicate compiler work.
- All 12 browser combinations passed in light/dark themes: 320, 390, 1024 and
  1440px fine pointers, plus 390/1440px coarse pointers. Desktop actions match
  the 52px card row; mobile actions use the shared 40/44px metric. Draft discard,
  focus return, combined Apply, Reset, invalid-date handling and Enter all passed.
- After rebasing onto the independently updated main branch, scoped production
  SSR and another four light/dark mobile/desktop browser combinations passed.
- Screenshots were reviewed on mobile and desktop. No page overflow or browser
  runtime errors occurred. Numbered pagination and outcome drilldowns also
  passed in the browser.
- The older whole-slip renderer still expects three Share buttons in its locked
  fixture. Both this implementation and an isolated copy of the pre-change
  components render zero under identical fixture access; the assertion fails on
  the baseline too. The scoped Best Slips verifier covers this UI change.

Independent Matches/admin work is preserved. Best Slips reuses its shared
dialog shell and footer messages.
Source integration and hosted/native deployment remain separate.
