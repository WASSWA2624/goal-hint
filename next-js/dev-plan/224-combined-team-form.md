# 224 · Combined team form

## Intended result

- Add Both teams before the two club choices and Head-to-Head. Default the Form
  tab and direct Form links to both clubs and the latest ten fixtures in total.
- Merge the permitted stored results chronologically, newest first, with a stable
  tie-break and one row per fixture. Apply venue filters for each club before
  deduplication and the combined match limit. Preserve individual club and H2H views.
- Display compact dates including the year, keeping actual home/away order,
  scores and each club's W/D/L indicator. Preserve item links, Back, filters,
  pagination and current access boundaries.
- Keep Team Stats and other sections' existing defaults. Preserve explicit
  five/ten/twenty/all choices across URL round trips and refreshes.

## Verification

- Exercise chronological merging, consecutive fixtures for one club, shared
  fixtures, venue filtering, limits, missing collections and non-mutation in unit
  tests. Verify contextual defaults, deep links and explicit sample sizes.
- Extend native browser acceptance for Both teams defaults, source-derived
  fixture ordering, deduplication, venue choices, pagination, date visibility,
  responsive radio groups and existing match information interactions.
- All 38 focused match-view, presentation and navigation tests passed, including
  explicit sample-size round trips and year formatting across display-zone
  boundaries. Full TypeScript and scoped ESLint passed.
- The native production fixture compiled successfully. All 267 browser checks
  passed with no browser errors, including combined defaults, source-derived
  ordering and venue filters, shared-fixture pagination, refresh persistence,
  responsive layout, existing tab scroll behavior and unchanged access gates.
- Reviewed desktop and mobile screenshots. The labelled review fixture uses
  different club schedules and a shared historical meeting to make merging and
  deduplication reviewable; these sample records remain outside production data.
  The live preview at localhost:3118 stays connected to shared source changes.
