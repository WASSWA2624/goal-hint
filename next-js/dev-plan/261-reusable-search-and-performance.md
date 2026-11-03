# 261 — Reusable search and performance sections

## Scope

- Replace feed-specific search styling with a shared floating-label search bar,
  inset submit action and optional responsive advanced-filter button.
- Reuse desktop filter fields in the combined advanced dialog and retain each
  section dialog, draft validation and cancellation behavior.
- Share six themed outcome cards between Matches, Best Slips and reports;
  keep mobile icons hidden and display explicit 24-hour EAT data timestamps.
- Preserve result drilldowns, cohort filters, unknown counts, desktop percentages
  and optional prediction coverage. Use existing shared control metrics/radii.

## Verification

- Passed full ESLint, TypeScript and the shared theme-token contract.
- Passed 43 targeted tests for search/filter drafts, result navigation,
  performance denominators, timestamp boundaries and Best Slips cohorts.
- Passed 10 browser combinations across light/dark and 320, 390, 768, 1024,
  1440px; four touch combinations verified 44px controls versus 40px for
  fine pointers. Search click/Enter, floating labels, filter-dialog focus,
  six-card layout and result selection passed.
- Passed four actual feed UI combinations (mobile/desktop, light/dark): search
  submission, advanced-dialog sections, discarded edits, focus restoration
  and result drilldown URLs. These isolated fixtures use synthetic data and
  do not expose every background API route.
- Passed theme SSR plus production loading and 10 complete dashboard states.
  The final fixture measured an 873ms streamed shell versus 1900ms blocking.
- Production build passed. Two existing download-catalog filesystem-tracing
  warnings remain. Screenshots are local under `output/playwright/` and are
  intentionally excluded from Git.

Production/native deployment remains separate from source integration.
