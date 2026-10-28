# Apply Inline ledger to production slips

## Scope

- Apply approved design 01 to Best slips and slip-builder results through their
  shared display, including saved and published history using that component.
- Replace visible whole-slip winning probability with average match probability.
  Preserve ranking, generation, stored snapshots and subscriber access behavior.
- Keep compact rows readable with original full names, competition/country,
  kickoff/timezone, market/pick, odds, probability and supplied saved results.

## Implementation

- Reuse the reviewed compact selection rows and a shared aggregate header/frame.
- Best slips keep native collapsible summaries; generated/history slips stay open.
  Locked summaries share the layout and show the existing relevant access action.
- Expose average probability as an explicit public aggregate, while preserving
  the allowlist for private selection/forecast data and final entitlement recheck.
- Remove the replaced summary presentation and preserve other working changes,
  linked worktrees and existing stashes.

## Verification

- All 164 focused slip generation, snapshot, ranking, service, publication,
  probability, saved-result and prediction-label regressions passed without skips.
- Full ESLint and the optimized production build, including TypeScript and the
  offline manifest, passed. A final build includes canonical original-name links.
- Production rendering passed 33 builder/form/validation/regeneration cases,
  five Best slips cases (including both access actions and 100 slips), existing
  saved-card privacy checks and new compact saved-score/outcome checks.
- Production privacy acceptance passed 668 HTML/RSC/API/history/insights/oracle
  and private-route checks across nine viewer states, including final access
  downgrades. Only approved summary aggregates remain public.
- Browser checks passed 70 route/width/theme combinations at 320, 375, 430, 768
  and 1440px, covering both themes, long names, locked/entitled slips, 100 slips,
  builder results and saved results. Enter/Space, analysis links, 44px targets and
  200% text at 320px passed without horizontal overflow or runtime errors.
- Visually reviewed the mobile Best slips and light/dark builder screenshots.
  Confirmed the running local home renders Inline ledger with original averages.
  Screenshots and temporary browser scripts remain ignored local output.
