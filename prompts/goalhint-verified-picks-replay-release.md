## GoalHint implementation prompt

Implement the revised Local Engine featured-pick rule, rerun predictions for finished, in-play, and upcoming fixtures, and release the verified change to test and production. Follow `AGENTS.md` and update `APP_OVERVIEW.md`. Reuse GoalHint’s existing forecast, odds, replay, and deployment infrastructure.

### 1. Require verified prices and positive expected return

- Consider every supported outcome in a validated Local Engine forecast, including outcomes other than the most probable selection in a market. Keep the football model’s probability calculation independent of bookmaker odds.
- Check every eligible bookmaker in the available odds data. Match the exact fixture occurrence, market, period, participant, line, outcome, and settlement rules. Include supported home and away team totals. Use the highest verified eligible decimal quote for each outcome, even if other bookmakers omit it. Retain the actual bookmaker, exact price, and observation time.
- Require **decimal odds of at least 1.10** and **strictly positive model-estimated net return**. For simple win-or-lose outcomes, use `win probability × decimal odds − 1`. For pushes and partial payouts, use the supported settlement probabilities and the actual payout rules. Exclude candidates with insufficient information to establish a positive return.
- Try minimum win probabilities of **95%, 90%, 85%, 80%, and 75%**, in that order. Stop at the first rung with a qualifying candidate. Rank candidates on that rung by unrounded odds, then unrounded win probability, then a stable market and selection order.
- Matches and Match Details must show the same featured selection and the exact quote used to qualify it, under existing odds access rules. If nothing qualifies, show no priced featured pick. Prevent fallback to the old unpriced featured recommendation. Keep model forecasts available in All Markets. When a fixture has no verified bookmaker odds at all, it may show a clearly identified forecast-only result through the existing presentation.

### 2. Rerun predictions across fixture statuses

Audit the full November 2026 cohort in the Africa/Kampala time zone and include current in-play and upcoming fixtures in GoalHint’s supported scope. Make the replay reusable for other historical ranges where sufficient archived evidence exists.

- **Finished and in-play fixtures.** Rerank eligible stored forecasts first. Rebuild forecasts where point-in-time football evidence supports it. Use only football evidence and exact bookmaker prices verifiably available by the declared pre-kickoff decision time. Exclude live scores, live prices, final results, and other later information from the pre-match replay. Join verified results only after the replay picks are frozen, for evaluation.
- **Upcoming fixtures.** Use the normal prospective forecast workflow with current eligible pre-match evidence and bookmaker quotes. Refresh eligible fixtures within the established worker limits and forecast lock. Record fixtures that are deferred or lack sufficient evidence or odds.
- **Database update.** Use the existing staged and reversible replay projection to update what users see by default. Identify replayed picks as retrospective. Preserve the original publications, prices, settlement, and performance records. Report eligible, changed, suppressed, deferred, and missing-data counts by status.

### 3. Keep the interface and verify the release

Keep the existing abbreviations, components, layout, fonts, and styling. For the match clock only, apply two-digit formatting where needed. Examples include `06:00`, `06:01`, and `+04` for four added minutes. Preserve the existing clock behavior and phase markers.

Verify quote identity and freshness, selection across several bookmakers, the price and return boundaries, partial payouts, ladder order, and no-pick cases. Verify Matches and Match Details agree, check the clock in light and dark themes, and demonstrate replay activation and rollback with the original records intact.

Run the relevant tests and build, commit and push the verified changes to GitHub, and follow the documented release procedure. Apply migrations required by this change after the documented backup and compatibility checks. Deploy and validate in test first, including a replay activation and rollback rehearsal. Then promote the verified release to production, validate its replay independently, activate the verified display projection, and smoke-test the released behavior. Report the commit, deployment and migration status, replay coverage, and any verified limitations.
