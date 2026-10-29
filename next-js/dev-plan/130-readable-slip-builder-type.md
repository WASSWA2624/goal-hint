# 130 — Readable Slip Builder type

## Scope

Improve the mobile Slip Builder text reduced in plan 128, keeping the existing
component dimensions, spacing, layout, desktop presentation and dialog styles.
Retain different text sizes for labels, values and secondary information.

## Implementation

- Increase category and floating Min/Max labels and action text to 12px.
- Increase numeric values and Any placeholders to 14px, including the existing
  iOS override; use 11px for count badges and a 10–11px responsive summary to
  preserve wrapping on narrow phones.
- Scale dialog trigger text between 11px and 12px to fit narrow phones with
  active badges.
- Preserve label and summary line boxes, 36px controls, badge dimensions,
  existing columns and the fixed 208px action width.
- Preserve numeric/date guards, defaults, Reset and account routing.

## Verification

- Passed scoped ESLint, full TypeScript checking, all eight numeric/date guard
  tests, the final production fixture build and complete Slip Builder SSR suite.
- All 36 browser geometry comparisons passed across 320, 390, 768, 1024 and
  1440px widths, both themes, fine/coarse pointers and desktop account states.
  Desktop styles and all four dialog comparisons remain unchanged.
- Five additional active-filter comparisons at 320, 360, 375, 390 and 768px
  retain exact panel, summary, input and action geometry. Maximum filter badges
  fit alongside their labels without horizontal overflow.
- Passed 37 browser smoke assertions covering all mobile account actions,
  12px category/floating labels, 14px values/placeholders, numeric guards,
  exact decimal steps, grouped match counts, blank bounds, dialog Apply and
  global Reset. No browser runtime errors occurred.
- Visually reviewed final 390px light and 320px dark screenshots. Controls stay
  36px high and the account action stays 208px wide; no input or form logic changed.
