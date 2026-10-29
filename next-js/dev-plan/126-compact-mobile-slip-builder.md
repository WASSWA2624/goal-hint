# 126 — Compact mobile Slip Builder

## Scope

Refine the Slips page below the existing 1024px desktop breakpoint. Preserve
the completed desktop presentation, all input guards, number formatting,
criteria defaults, blank Any bounds and shared page styles.

## Implementation

- Compact the mobile form to 36px controls, small fitted labels and tighter
  spacing; retain readable 16px numeric input text.
- Keep essential targets together, then three short popup buttons, one action
  row and a concise date/time/markets/outcomes summary.
  At tablet widths below desktop, share the popup/action row to reclaim space.
- Reclaim the visible mobile heading space while preserving the accessible H1.
- Use a shaded Reset and a fixed 208px by 36px account-aware action, including
  the pending state. Retain existing login/subscription return paths.
- Remove the duplicate lower action and provide concise mobile guidance for
  guests, signed-in viewers without access and eligible viewers.
- Compact builder-local mobile dialogs without changing their native form,
  guards, Apply/Cancel/Reset behavior or desktop presentation.

## Verification

- Passed full TypeScript checking, full ESLint, final scoped lint, Python syntax
  checks, `git diff --check` and all 108 focused builder/guard/card/paywall tests.
- Passed the production fixture build and full updated Slip Builder SSR suite,
  including one account action, responsive guidance, defaults and native forms.
- Passed 78 broad layout/account/theme/pointer cases and 42 final layout checks
  after the tablet refinement, without horizontal overflow or JavaScript errors.
  Phone controls measure 185.5px high, down from about 226.2px for coarse pointers;
  the tablet toolbar measures 145.5px, down from about 176.2px.
- Desktop remained exact in 48 geometry/text/static-style comparisons, 24
  settled dark-color comparisons and 12 popup comparisons. Theme background
  transitions were allowed to finish before comparing animated colors.
- Passed narrow-phone default/active filter fit, single-line labels, 13px badges,
  36px controls, a 64px Reset and a constant 208px by 36px primary action.
- Passed seven mobile interaction groups covering count/character guards, 0.01
  odds steps, comma formatting, probability limits, popup warnings and rollback,
  date/time guards, markets, Reset, loading-button sizing and canonical/native
  GET submission retaining blank Any bounds.
- Passed dark mobile warning visibility without clipping or layout shifts and
  the compact two-column date/time dialog with readable 16px input values.
- Root visually inspected final phone, date-dialog and dark-warning screenshots
  in ignored `output/playwright/`. Input guard components and domain defaults
  were not modified.
- Passed the final 320px active-badge and long date/time summary checks: labels
  fit, badges do not overlap, and custom summaries wrap without overflow.
- All owned fixture servers/browser sessions were stopped; generated files
  remain ignored. The full nine-viewer paywall rendering suite was not run;
  updated assertions were syntax-checked and all three real Slips account states
  were covered by complete Slip Builder SSR and browser checks.
