# 178 — Team stack mobile match cards

## Request

Apply the selected **02 · Team stack** match-card design across mobile Matches,
Cards and Slips. Retain the approved desktop rows and slip headers.

## Implementation

- Share one Team stack style fragment between feed cards and slip selections.
- Stack full team names with leading crests on the left. Put the market and
  readable prediction above labeled odds and estimated chance on the right.
- Keep kickoff, league/country, current progress and recorded outcome visible,
  with square frames and the shared theme's spacing, colors and radius tokens.
- Preserve authorized forecast projection, canonical full-card links, exact
  selected prices/probabilities, original slip snapshots and bound observations.
- Show supplied live/saved scores and clocks without changing stored picks or
  inventing a final phase for a saved-only result.
- Reflow narrow effective widths; preserve one SSR copy of each fixture and
  the shared list's offscreen layout optimization.

## Verification

- Lint and strict application type checks passed. The final focused Node run
  passed all 44 tests, including prediction wording, authorization, canonical
  links, original saved alternatives and observation binding.
- Production-mode feed/slip acceptance builds and SSR verifiers passed. The
  latter covers all builder states, manual selection/generation boundaries,
  saved/redacted/offline cards and original prices/probability precision.
- Added live/half-time acceptance observations: supplied 1–0 scores and 67′/HT
  phases render while the original 7.73 odds, 23.5% chance and pending outcome
  stay bound to the stored selection.
- Browser checks covered 336 rendered cards across Matches, Best slips,
  generated slips, long names and snapshot/access examples at 320/375/430/768px
  in both themes, plus 200% text. No card clipping, overlapping information,
  squeezed captions, duplicate visible market labels or card overflow remained.
  No unhandled JavaScript errors occurred.
- Native keyboard disclosure and the approved desktop Aligned ledger checked
  successfully at 1280px with one responsive fixture copy. With JavaScript
  disabled, the initial desktop score/status grid slots also remained intact.
- Updated an existing sidecar test's stale expectation: the unchanged public
  policy omits an unfinished slip entirely instead of exposing its summary.

## Remaining limitation

At 200% text size, the existing builder legend and actions (Matches per slip,
Reset and Build slips) extend beyond a 375px page. The match cards themselves
reflow correctly. Those controls are outside this change; their implementation,
the approved slip headers, desktop renderer, APIs and Flutter were preserved.

The ten-option review remains available as a comparison reference.
