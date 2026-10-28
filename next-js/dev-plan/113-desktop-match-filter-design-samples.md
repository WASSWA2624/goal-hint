# Desktop match filter design samples

## Accepted scope

- Produce ten interactive desktop filter concepts for the user to compare and
  select before implementing a production redesign.
- Follow the existing predicted-match styling: compact 12–13px typography,
  square edges, themed borders and colors, and 32px controls.
- Preserve search, match status, date presets, custom date/time ranges,
  leagues, countries, markets, probability/odds limits, sorting, Predictions
  only, Reset, and Apply filters as visible or readily accessible controls.
- Keep the production Matches interface and mobile/tablet behavior unchanged.

## Deliverable

- Add one self-contained preview fragment at
  `design/desktop-match-filter-designs/desktop-match-filter-designs.html` with
  shared controls, dialog behavior, and clearly labeled illustrative results.
- Include these concepts in order: Compact toolbar, Status tabs, Filter cells,
  Quick dates, Quiet ledger, Expandable toolbar, Filter rail, Tabbed groups,
  Split toolbar, and Inline probability.
- Document the comparison and local preview command in the accompanying README.
- Keep this design preview isolated from production routes and components.

## Behavior boundaries

- Reuse preview controls and a shared draft model across concepts. Main Apply
  applies local sample filtering; main Reset restores and applies defaults.
- Dialog Done retains a section draft; Cancel restores its opening values;
  section Reset affects only that section. Keep keyboard focus and dismissals
  usable.
- Retain All statuses, Last 30 days, Latest first, Predictions only, all
  leagues/countries/markets, and unrestricted probability/time as preview
  defaults. Live uses Today and all kickoff times.
- Preserve at least one selected market and valid 0–100 probability bounds.
  Present odds as unavailable with disabled controls.
- Use sample data only. Do not introduce live requests, production query
  changes, fabricated live feed claims, or account-access changes.
- Preserve existing uncommitted navigation changes and other unrelated work.

## Verification

- JavaScript syntax validation passed; all ten carousel concepts are present.
- All 100 layout cases passed across ten concepts, both themes, and
  1280/1024/768/390/320px widths, with no overlapping controls, clipped button
  labels, or horizontal page overflow.
- Country Cancel/Done/Apply, draft search and Enter, Reset, probability bounds,
  disabled odds, and Live/Today behavior passed in every concept.
- League search, Predictions only, custom dates, UTC conversion, probability
  ordering, market minimums, Escape, and keyboard focus checks also passed.
- Desktop visual inspection passed for toolbar, cell, rail, inline probability,
  and dark ledger presentations. No JavaScript runtime exceptions occurred.
- A reload warning about sandboxed form submission comes from the standalone
  preview environment; the preview contains no form elements and its tested
  interactions work. No production build or live feed test was required.
- Commit only the three design preview/documentation files and push `main`.
  Preserve other work, existing stashes, and detached worktrees.
