# 226 · Full standings and knockout brackets

## Intended result

- Read complete stored season tables and every supplied group; preserve provider
  ranks, signed points and missing statistics. Never manufacture a full league
  table from the development catalog's limited match cohort.
- Show compact #/Team/P/GD/PT/Form and detailed #/Team/P/W/D/L/GF/GA/GD/PT/Form
  tables, without a repeated Group column. Pin position and team while detailed
  columns scroll. Highlight the fixture clubs and use supplied short names or
  ellipsis with accessible full names.
- Show five sourced W/D/L dots and accessible form details. Provider form is
  [oldest to newest](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).
- Render source-linked knockout rounds, aggregate and penalty details, TBD slots
  and partial coverage. Support round selectors, arrows, keyboard navigation,
  native touch scrolling, mouse panning and return to the current match.
- Preserve data gates, cached section reads and URL state. Schema additions stay
  optional for old snapshots. No provider dispatches or database migrations are
  needed to open this screen.

## Verification

- Validate standings normalization, partial/missing source data, group selection,
  explicit stage recognition, graph references, observed advancement, unknown
  winners, score periods, two-fixture ties and collision-free tree layout.
- Exercise table/bracket modes, groups, compact/detailed rows, form details,
  sticky columns, round controls, touch/drag/keyboard navigation, current-match
  focus, reduced motion and unchanged page shells at desktop and phone widths.

## Implementation

- Added an optional, validated competition projection to context snapshots, so
  existing snapshots remain readable. The public insights cache now uses v2.
- Read `SeasonStandings` for the fixture's season. Normalize provider tables
  without recalculating ranks, discard duplicate/bad rows with partial coverage,
  and retain missing statistics as unavailable. Canonical team mappings provide
  the approved crests and short names.
- Prefer an explicitly supplied draw. Otherwise read at most 512 season fixtures
  and batch their sealed result evidence. Catalog draws stay labelled partial;
  advancement links require observed participants, and single-fixture winners
  require a coherent final total or shootout. Regulation-only scores stay labelled.
- Reuse the shared radio controls, crests, number/date formatting and modal. Form
  and tie dialogs restore focus to their opener. Mobile tab centering observes
  label width changes; the content panel reserves an explicit minimum height
  before a longer section is replaced.
- Added labelled review examples for a full twenty-team league, a complete draw,
  a grouped competition with a future knockout phase, and a partial draw. These
  are test fixtures, not production records or provider dispatches.

## Completed checks · 1 November 2026

- 57 focused Node tests passed, including normalization, graph integrity,
  verified scores, future-data rejection, existing match details and paywall rules.
- Native production fixture build, project TypeScript and scoped ESLint passed.
- 76 competition browser checks and 267 existing match-tab checks passed in fresh
  Chromium sessions. The competition suite covers 320/390/768/1024/1440px,
  complete/partial/grouped data, both table modes, pinned columns, form dialogs,
  round controls, native scrolling, mouse drag, keyboard navigation, reduced
  motion, dark mode and unchanged outer page navigation. No runtime errors.
- The broader suite verifies existing tab centering, stable scroll positions,
  filters, markets, team sheets and access restrictions. Async control assertions
  wait for the rendered selection as well as URL updates.
- Live development preview remains on 3118 with the new labelled scenarios.
  Production tables depend on available stored season snapshots. Catalog-derived
  knockout coverage remains explicitly partial; no missing facts are fabricated.
