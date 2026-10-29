# 123 — Desktop Slip Builder toolbar

## Scope

Refine only the desktop Slips page at the existing 1024px breakpoint. Retain
the approved mobile UI, shared criteria defaults, validation and access routing.

## Implementation

- Size the slip count for four digits and the total-odds/match-count range
  inputs uniformly for five digits, including decimal odds. Treat these as
  display widths; keep the shared generation limits intact.
- Put essential inputs and all three popup triggers on one desktop row.
- Put labelled Date, Time, Markets and Selection summaries alongside Reset
  and the primary action on the next row. Shade Reset using the filter palette.
- Reuse responsive action labels and fixed desktop dimensions for the toolbar
  and subscriber notice: Sign in to build slips, Subscribe to build slips, or
  Build slips. Keep login/subscription destinations and the return path.
- Preserve the mobile markup's visual order, labels, sizing and summary copy.

## Verification

- Passed full TypeScript checking, full ESLint, Python syntax checks for both
  updated rendering scripts, and all 100 focused Slip Builder/card/paywall tests.
- Passed the isolated production fixture build and all Slip Builder SSR
  assertions, including the responsive action labels and login/subscription
  return destinations in both sections, native GET builds and criteria defaults.
- Passed 36 browser layout/account cases across 320, 390, 768, 1024, 1280 and
  1440px widths in light and dark appearance. All desktop numeric fields and
  popup triggers share one row, summaries align with actions, and both action
  buttons measure 208 by 32px in each account state, without horizontal overflow.
- Nine mobile/tablet comparisons match the preceding production bundle exactly
  for settings, input, trigger, summary, action and Reset geometry and copy.
  Desktop settings reduced from about 156px to 130px high.
- Root and verification agent inspected the final desktop/mobile screenshots
  in ignored `output/playwright/`. No JavaScript exceptions occurred.
- Passed all three popup Apply/Cancel/Escape interactions, summary updates,
  global Reset, and delayed client GET loading: Build slips / Building... stays
  208 by 32px and disables correctly. Coarse-pointer desktop actions both
  measure 208 by 44px.
- Passed JavaScript-disabled desktop native GET submission with the complete
  inline forms, four requested slips, edited individual odds and blank maxima.
- Verification fixture servers and browser session were stopped; artifacts
  remain in ignored output directories.
- The full nine-viewer paywall rendering suite was not run. Its updated
  assertions were syntax-checked, while the complete Slip Builder rendering
  suite exercised guest, member and subscriber states through the real route.
