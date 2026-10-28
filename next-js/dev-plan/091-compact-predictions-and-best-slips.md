# Compact predictions and expandable Best Slips

## Scope

- Define reusable short prediction labels and explanations for all supported
  outcome types. Boolean selections display Yes or No in their market context.
- Raise generation, validation, publication and history capacity to 100 valid
  slips, retaining bounded search, genuine probabilities and fixture diversity.
- Show daily Best Slips in descending estimated probability, with each summary
  collapsed initially and the entire header acting as its expansion control.
- Preserve unrelated working changes, existing stashes and linked worktrees.

## Implementation

- Keep presentation labels separate from stored selection keys and settlement
  rules. Expose full meanings through accessible descriptions and a prediction key.
- Reuse one native details/summary component for entitled and locked slip cards.
  Keep odds, probability and selection counts visible in the summary.
- Cover the full count path, including database constraints and history reads;
  return fewer slips when the qualifying cohort or search budget is insufficient.
- Verify focused generation and label regressions, rendered HTML, responsive
  interaction, lint, types and a production build before committing to main.

## Verification

- All 217 focused prediction, match-card, builder, ranking, publication, cohort,
  price, service, forecast, saved-slip and performance unit tests passed without
  skips. Separate detail, timezone and SEO regression suites also passed.
- Both migration consistency/guard/checksum tests passed. Genuine MySQL migration
  integration was skipped because the required MySQL server binary is absent;
  no application database or production migration was applied.
- Production rendering passed all 33 existing builder cases, saved-snapshot
  checks and four new Best Slips cases: entitled, locked, 100 slips and limited
  coverage. Native summaries contain phrasing/heading markup without flow-only
  descendants or competing controls.
- Playwright verified whole-summary clicking, Enter/Space, refresh persistence,
  collapsed/expanded visibility, locked access, 100 slips and the prediction key.
  Layout checks covered 320, 390, 768, 1280 and 1920 pixels. Final visual review
  caught and corrected a mobile badge selector matching the summary facts.
- Full ESLint, TypeScript checking and the optimized production build with its
  offline manifest passed. Final responsive screenshots are local-only artifacts.
- A 500-fixture synthetic cohort generated 100 two-match slips in 785 ms and
  100 three-match slips in 1,856 ms. At lower odds, it generated 83 six-match
  slips from 498 unique fixtures in 4,698 ms. Searches disclose their bounds.
  Twenty randomized small cohorts agreed with exhaustive ranking oracles.
- Existing immutable daily publications retain their original count. New daily
  publications, including demo mode, support up to 100 and accept fewer when
  the qualifying cohort is smaller. Demo mode scans the full daily cohort until
  reaching capacity, rather than stopping after its former ten-slip showcase.
- Eight demo regressions passed, including 100 complete disjoint slips,
  nonempty partial sets, original forecast chronology, and more than ten slips
  from the unmodified raw demo fixtures. The builder quantity field also has
  enough room for its new three-digit maximum.
- The final combined run passed all 270 slip, prediction, authentication and
  client-graph tests without skips. Focused lint and the optimized production
  build (including TypeScript and the offline manifest) passed after the demo
  capacity follow-up.
