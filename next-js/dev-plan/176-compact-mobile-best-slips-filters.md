# 176 — Compact mobile Best slips filters

## Scope

Remove the visible Slip date label, tighten mobile controls, arrange all six
status filters in two rows of three, and separate the applied-filter heading
from the aligned selection and result-range row. Preserve desktop and behavior.

## Implementation

- Retain the date selector's accessible name while removing the floating-label
  markup and its wrapper. Use 32px date, Custom date and Reset controls with
  reduced vertical padding on mobile.
- Use three equal columns for the six semantic status filters. Each compact
  36px card keeps its label above its count and bracketed percentage.
- Give Applied filters a full-width heading row. Put selected criteria in the
  left column and the displayed range in the right column below it. Allow long
  selections to wrap within their own column without overlapping the range.
- Keep desktop flex presentation through a display-contents selection wrapper.
  Reuse existing queries, counts, range validation, reset and pagination.

## Verification

- Scoped ESLint and the application TypeScript check passed.
- Browser review passed 67 checks across 320, 360, 390, 768 and 1440px widths
  in light and dark themes: equal three-column status cards, compact heights,
  readable text without horizontal overflow, separate heading, and aligned
  applied selections/result range. Desktop retains its existing flex layout.
- Confirmed status selection and percentages, date changes retaining status,
  custom-date dialog cancellation and focus restoration, and Reset.
- Visually reviewed light/dark mobile screenshots. Git whitespace checks passed.
- Browser checks used the actual shared components with local fixture data;
  no live backend or database changes were needed for this presentation change.
