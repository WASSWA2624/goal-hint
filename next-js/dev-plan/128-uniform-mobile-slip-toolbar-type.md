# 128 — Uniform mobile Slip Builder type

## Scope

Match all mobile Slip Builder toolbar text to its existing 10px label size.
Preserve desktop presentation, dialog typography, guards, formatting, defaults,
blank Any bounds and fixed account-action dimensions.

## Implementation

- Define one mobile-only toolbar font token and reuse it for category/floating
  labels, input values/placeholders, trigger text/counts, Reset, account actions
  and the settings summary.
- Preserve emphasis weights, control dimensions, centered values and layout.
- Keep the existing iOS dialog numeric rule, then override only main toolbar
  numeric controls with the shared font size.
- Leave all input, form, navigation and account-state behavior unchanged.

## Verification

- TypeScript and scoped ESLint passed; all 8 numeric/date/time guard tests passed.
- Production fixture build and the full Slips SSR suite passed. The browser
  comparison covered 12 mobile
  width/theme/pointer combinations: requested toolbar text computes to 10px,
  controls retain their dimensions, and the 208 × 36px action stays fixed.
- All 24 desktop comparisons and 4 popup comparisons match the prior commit's
  text, styles and geometry. Mobile layouts have no horizontal overflow.
- All 36 browser smoke assertions passed, covering account states, defaults and
  Reset, blank Any bounds/placeholders, numeric guards, 101% rejection, exact
  0.01 steps, grouped match counts, floating-label focus and active count badges.
- The pending Building slips… action also remains 208 × 36px at 10px.
- Reviewed the final mobile screenshot; all owned browser/fixture sessions were
  closed. Existing stashes and detached worktrees remain intact.
