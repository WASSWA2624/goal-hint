# Single-line desktop slip concepts

## Scope

- Revise the existing desktop review with ten one-line match variants.
- Preserve design 01's header presentation and reduce its vertical height only.
- Show short day/month, 24-hour kickoff/EAT, league/logo, country/flag, teams,
  market/pick, odds and individual probability in that order on one line.
- Place the home logo after its name, before vs; retain the away logo before
  its name. Ellipsize long team/league/country labels with full-text hover and
  keyboard access.
- Keep collapsed/expanded examples, context and light/dark controls, and leave
  mobile and live desktop layouts unchanged until a variant is selected.

## Implementation

- Reuse the shared aggregate disclosure and snapshot/prediction formatters, with
  a dedicated desktop review row and scoped styles.
- Keep every variant's header identical and vary only match-row presentation.
- Simplify the preview controls to context, design navigation and appearance;
  include a mix of short and long names in the sample records.
- Build the review in its own ignored folder so application builds cannot
  replace the running preview's manifests or assets.
- Retain private configurations, stashes and detached worktrees.

## Verification

- Full ESLint and the optimized production build passed, including TypeScript
  and offline-manifest generation. All 21 focused snapshot, prediction-label,
  country-flag and competition-flag regressions passed without skips.
- Browser checks passed all ten designs in 12 viewport/theme/context combinations
  at 1024/1280/1600px, both themes and both display contexts. Headers are identical
  36px rows; match rows are 32–38px. No field overflow or column overlap occurred.
- Verified collapsed/expanded initial states, Enter/Space toggling, exact field
  order, home/away crest placement, local flag/logo decoding, ellipsis and the
  full-text tooltip on hover and keyboard focus with Escape dismissal.
- Independent browser review confirmed hoverable tooltip content and the EAT
  midnight rollover (30 Oct, 00:00 EAT), with no weekday in displayed dates.
- Confirmed narrow review windows scroll locally and the existing mobile slip
  rendering has no desktop rows or added logos. Screenshots were visually
  reviewed in light and dark; generated artifacts remain ignored local output.
- Separate mobile-preview work appeared during this task and is preserved;
  only the desktop review and equivalent shared probability formatter extraction
  belong to this change.
- An application rebuild replaced a manifest used by the first background
  preview. The isolated review build and its production browser smoke test now
  pass independently, including all ten options, 36px headers and focus tooltips.
  The review remains on port 3120 without analytics or offline startup.
