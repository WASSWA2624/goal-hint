# Ten compact mobile slip designs

## Scope

- Create ten comparable mobile layouts, each with a collapsed summary and compact
  expanded match rows, for review before choosing the production layout.
- Use the corrected product name, Best slips, and share one reusable component
  between the Best slips and slip-builder sample contexts.
- Show slip number, total odds, average match probability and selection count;
  omit overall winning probability from these design alternatives.
- Preserve original teams, competition/country, kickoff/timezone, market and pick,
  odds, per-match probability and saved results. Keep analysis access secondary.
- Use square components, native disclosure behavior and readable wrapping.

## Implementation

- Add a non-indexable `/en/slips/designs` review route with synthetic records.
- Provide ten coordinated summary/match arrangements using shared semantics,
  formatting and theme tokens; retain the existing production screens for now.
- Allow comparison and individual inspection, both display contexts, narrow-phone
  widths, light/dark appearance, long names, eight selections and saved results.
- Preserve unrelated working changes, stashes and existing detached worktrees.

## Verification

- Full ESLint, TypeScript and the optimized production build, including offline
  manifest generation, passed.
- All 13 focused snapshot and prediction-label regressions passed without skips.
- Playwright checked all ten designs in 40 viewport/theme/sample combinations:
  320, 360, 390, 430 and 1440px; light/dark; typical, long-name, eight-selection
  and settled samples. No page or individual-field horizontal overflow occurred.
- Verified initial collapsed/expanded states, 44px summary targets, Enter/Space
  toggling, sample counts, saved scores/results, both display contexts, single
  design inspection and the desktop 320px preview. No runtime errors occurred
  during the final check; the review route emits `noindex, nofollow`.
- Visually inspected light/dark mobile captures and the ten-option comparison.
  Typical 390px samples measured 55–74px per summary and 68–100px per match;
  options 01 and 04 were smallest at 55px/68px. Long names wrap visibly.
- Screenshots and the browser-check scratch script are ignored local output.
  Production home and builder integration remains the next design-selection step.
