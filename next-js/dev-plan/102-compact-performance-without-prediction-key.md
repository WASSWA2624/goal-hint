# Compact performance summaries without Prediction key

## Scope

- Remove the expandable Prediction key from all match/slip/performance screens
  on mobile, tablet and desktop.
- Match Overall performance to collapsed slip header height: 44px on mobile and
  tablet; 2.25rem (36px at the default text size) on desktop, with 44px minimum
  for coarse pointers.
- Retain titles, periods, totals, predicted counts, outcome counts/icons,
  percentages, coverage/extras and the distribution bar.

## Implementation

- Remove all rendering/imports of the unused prediction key component and its
  unused list prop. Keep underlying prediction descriptions and market labels.
- Reuse the shared PerformanceSummary for every context. Use two compact rows
  on narrow screens and one horizontal row on desktop.
- Keep metrics in a keyboard-accessible horizontal strip when they exceed the
  available width. Scale height with enlarged text and retain square boundaries.

## Verification

- Focused ESLint and 45 performance/feed-summary/prediction/match-card tests
  passed. The optimized production build, including TypeScript, passed.
- Existing theme fixture SSR passed with real summary/slip components and
  original predicted totals and outcome shares.
- Focused browser checks passed at 320/375/430/768/1024/1440px in light/dark,
  plus coarse-pointer and large-count/long-header stress cases. Heights match
  44px mobile/tablet, 36px desktop and 44px coarse-pointer desktop summaries.
- All counts, title, period, wide percentages, icons and distribution segments
  remain present. Keyboard scrolling reaches the last metric, with no document
  overflow, vertical clipping or JavaScript runtime errors. Prediction key UI
  is absent. Screenshots were visually inspected in ignored output files.
- The fixture's broader theme checks retain stale assertions for earlier
  match/slip borders and headers; these are unrelated to this summary change.
- Preserve Git stashes and detached worktrees; commit and push main.
