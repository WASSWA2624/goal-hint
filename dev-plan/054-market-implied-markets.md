# 054 Market-implied markets

**Feature:** Non-goal provider markets (corners, cards and others) from de-margined bookmaker odds.

**Depends on:** [052-provider-odds-import.md](052-provider-odds-import.md), [053-score-distribution-markets.md](053-score-distribution-markets.md).

**Source:** [App specification](../app-write-up.md), sections 4 and 8 (version 1.8 approved expansion).

## Prompt

For each non-goal bet in `/odds/bets`, convert stored prices into de-margined implied probabilities with a documented method, labelled "market-implied" and never mixed with AI groups. Add settlement from stored fixture statistics and events (corners, cards, scorers), refusing settlement when the statistic is missing. Report performance separately from AI markets.

## Acceptance checks

- Overround removal is tested on two-way and multi-way groups; missing selections never produce a group.
- Unsettleable markets stay pending or void with a public reason.

## Handoff

Required: tick this row in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
