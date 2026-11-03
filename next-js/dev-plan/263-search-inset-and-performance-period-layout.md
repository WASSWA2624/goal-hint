# 263 — Search inset and compact performance header

## Scope

- Keep embedded search actions and inputs inside their field’s content box,
  including mobile/desktop and fine/coarse pointer control heights.
- Use the shared “Prediction performance” title, one right-aligned reporting
  day/range and no second date or refresh timestamp. Keep market identity in
  report sections and preserve actual cohort/result-filter behavior.
- Remove duplicated horizontal insets, minimize header/card spacing, soften
  selection borders, and place desktop icons beside labels. Mobile stays
  icon-free. Reuse these changes in feeds, slips, reports and loading states.
- Add compact reporting-range formatting that preserves named civil dates,
  including across display zones, months and years.

## Verification

- Full lint, typecheck, theme-token contract and production build passed.
- All 25 targeted date-formatting, performance, period and result-navigation
  tests passed, including same-month, cross-month, cross-year and display-zone
  boundaries.
- Theme SSR and 14 browser combinations passed: both themes at 320–1440px,
  plus coarse-pointer mobile/desktop controls. Embedded actions and inputs stay
  inside their field; card/header edges align, the gap is 3px, icons belong to
  labels and selection uses a muted 1px inset rule.
- Another 20 browser combinations passed on Matches, Best Slips and reports in
  both themes at 390/1440px. Matches correctly displays yesterday, a chosen day
  and a cross-month range. Mobile summary grids share the app-header rails.
- Production loading and all 10 dashboard states passed with synthetic records.
  The final streamed shell arrived in 621ms versus 1923ms for the blocked read.
- The two existing download-catalog filesystem-tracing build warnings remain.

Source integration and hosted/native deployment remain separate.
