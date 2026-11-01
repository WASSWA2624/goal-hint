# Joined match cards inside slips

## Scope

Join the white selections inside mobile and desktop slips. Retain pale gray
headers, use the slip background for a thin outer frame and row separators,
and round only the exposed ends of each selection stack.

## Implementation

- Add a shared joined-selection treatment consumed by the common slip container.
  Selection wrappers touch, with a 1px separator and the existing 6px tray inset.
- Give the first row top corners, the last row bottom corners, and middle rows
  square corners. A single selection receives all four corners. Analysis links
  inherit the row corners without clipping tooltips or keyboard focus.
- Keep white selection fills in light mode on both layouts, overriding desktop
  slip striping while preserving the standalone match feed's treatment.
- Set desktop light-mode slip headers to the same pale gray as mobile headers.
  Keep the frame and separator width in the theme contract, independently of
  global component border settings. Retain theme-adaptive dark fills.
- Extend the existing rendering fixture with real one-match and three-match
  synthetic slips, plus border, corner, spacing, and focus geometry checks.

## Verification

- All 63 focused theme, card, filter, pagination, and performance tests passed.
  Scoped ESLint checks passed.
- Both production fixtures built and typechecked successfully in an isolated
  checkout; the shared theme fixture also passed server-rendering checks.
- All 30 collapsed-slip, expanded-slip, and open-dialog checks passed across
  light/dark modes at 320, 390, 768, 1024, and 1440px. Always-expanded one- and
  three-match examples validate single, first, middle, and last corners.
- Desktop and mobile captures were reviewed. No uncaught page errors occurred;
  the minimal fixture emits expected missing-route/service-worker 404 messages.
- This scoped verification is isolated from the concurrent floating-label
  refactor, which requires its own integrated control/outline checks.
