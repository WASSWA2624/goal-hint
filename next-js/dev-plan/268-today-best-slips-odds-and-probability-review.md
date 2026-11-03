# 268 — Today's Best Slips, odds bounds and probability review

- Default the homepage, API defaults, performance cards and result drilldowns
  to today's EAT date. Label the cards Today’s performance. Reuse the current
  cohort for today's totals; legacy archive requests read their today totals
  independently and in parallel.
- Keep only Total odds in Advanced Filters, with the same shared single-choice
  buttons on mobile and desktop, local drafts, discard, Reset and Apply.
  Give the shared Reset action a slightly stronger themed background.
  Retain 24-hour snapshot time, add a distinct browsing gap and align section
  labels with card edges.
- Show two-place bands: 2.50–5.00 (default), 5.00–10.00, 10.00–20.00,
  20.00–50.00, 50.00–100.00 and 100.00–200.00. Exact boundary quotes enter
  the next band; 200.00 is included. Keep engine precision and stable original
  IDs, with public ranks 101–120 in the new sixth band.
- Validate original sealed criteria when reading historical publications.
  Include adjacent old publication families for boundary quotes, preserve
  canonical access and bounded complete-day archive pagination.
- Rank by whole-slip probability, more matches, then higher odds through one
  comparator shared with joint custom builds. Correct the demo's
  candidate order to probability first, odds second, and seal new demo ranks
  with compareBestSlips. Do not alter original forecasts or invent estimates.
- Mobile results show Today’s best slips, Total odds and a full range/total count,
  directly on the body background close above the first slip, without browsing
  dates, EAT or result text. Remove the failed
  update message and its retry button above retained results.
- Reduce the space below the performance heading/date while preserving top
  spacing. Keep the existing top loading indicator and remove inline updating
  text. Place the mobile results caption 2px above the first slip in normal lists.
- Extend the database band constraint through an additive migration. Preserve
  all sealed history and canonical links, including old below-2.50 entries.

## Probability investigation

Read-only local database inspection examined 138 stored demo slips. All were
synthetic. Today's first slip was a single match at 0.347073 probability and
2.78 odds; 34.7% was its correctly formatted original forecast. The demo selected
by odds before probability and allowed all valid source probabilities. The same
selection appeared in four higher-band examples. The live builder already uses
qualified whole-slip ranking, with a separate arithmetic mean in the UI.

The configured non-demo database contained no publications. No stored snapshots,
credentials or production state were changed. Existing examples retain their
forecasts; corrections apply to future demo publications. Read-only browsing
and history checks passed against all five bands in the existing demo database,
including canonical access to all 39 of today's original slips.

## Verification

- 208 targeted Node unit tests and 165 Python script tests passed. Disposable
  MySQL integration passed without skipping, including immutable old bands,
  concurrent sixth-band publication and canonical rank 101.
- Application typecheck, focused ESLint and the shared theme contract passed.
  The scoped production fixture build and its server-rendered checks passed.
- Eight light/dark browser combinations passed at 320, 390, 1024 and 1440px.
  Checks covered today's scope and totals, all six native choices, keyboard
  navigation, local drafts, discard, Reset/Apply, full result counts and failed
  updates retaining confirmed rows without inline status banners. Heading/card
  gaps are 1px; the mobile caption/list gap is 2px. Screenshots were reviewed,
  including the stronger Reset background in both themes.
- The new migration was verified on disposable MySQL and applied only to the
  owned development demo. Migration files retain LF endings for stable
  cross-platform checksums. Hosted and configured non-demo targets still need
  this migration and the updated application/worker release.

Browser fixtures use synthetic forecasts and a fixed reporting date. They do
not establish live model qualification; the live joint-model binding still
requires a reviewed model. No existing sealed forecasts were rewritten.
