# 125 — Guarded Slip Builder inputs

## Scope

Add immediate input guards and match-count formatting on the Slips page while
preserving blank Any bounds, shared criteria contracts and mobile layout.

## Implementation

- Reuse exact numeric guard, precision, step, grouping and range-order helpers.
- Enhance numeric fields to guarded accessible spinbuttons while retaining a
  single canonical named input and the native number-input fallback without JS.
- Reject invalid characters, pasted values and hard-bound violations, with
  field feedback that does not move the layout. Retain useful decimal prefixes.
- Use 0.01 odds steps, whole positive match/slip counts, comma match grouping,
  and percentages within 0–100. Keep the configured 100-slip maximum.
- Guard native date/time input, calendar bounds, date-window length and range
  ordering, preserving normal segment editing and both-endpoint edits.
- Label the desktop count Total slips, use right-facing dialog arrows, and
  halve the desktop toolbar/results gap without changing mobile layout.

## Verification

- Passed 108 focused tests, including eight new guard tests for floors, caps,
  precision, exact steps, grouping, blank bounds, ordering and calendar limits.
- Passed full TypeScript checking, full ESLint, subsequent scoped lint/type
  checks, Python syntax checks and `git diff --check`.
- Passed production fixture builds and all updated Slip Builder SSR checks,
  including numeric constraints, right chevrons and canonical native forms.
- Passed 57 browser layout/account/theme/pointer cases without overflow or
  JavaScript exceptions. All 18 fine/coarse mobile/tablet comparisons and
  16 popup comparisons matched the prior control and dialog geometry exactly.
- Passed 23 input interaction groups: rejected letters, signs, exponents,
  zero/fractional counts, excessive precision, 101% probability, hard numeric
  ceilings, exact keyboard/mouse steps, comma formatting/paste, editable pair
  ordering feedback, date/time window guards and warning cleanup.
- Passed grouped caret, repeated Backspace/Delete, range replacement, native
  word deletion, input-only virtual keyboard deletion, canonical grouped GET
  values, fixed pending-button dimensions and JavaScript-disabled native GET.
- Root inspected desktop/mobile screenshots in ignored `output/playwright/`.
- Passed the final source-stable production build and full SSR suite. Repeated
  all 23 hard-bound/date/modal groups, eight caret/paste/submit/native-GET
  groups and 24 final layout cases; nine repeated mobile baselines matched.
- Passed trusted browser IME tests: invalid composition is rejected without
  locking later input; valid text replaces selected values; grouped numeric
  composition displays commas while committing plain digits. Provisional
  composition never changes the canonical form value before validation.
- Confirmed the Slips page alone uses a 6px desktop gap; the shared Best Slips
  stack retains 12px. Fixed primary-action dimensions remain unchanged.
- Final warnings were visually checked on mobile and inside dialogs: they
  stay on-screen, appear above the modal and do not move the layout. No
  JavaScript exceptions or horizontal overflow occurred.
- Verification servers/browser were stopped and generated artifacts remain
  ignored under `.tmp/` and `output/playwright/`.
