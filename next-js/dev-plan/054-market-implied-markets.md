# 054 Market-implied markets

**Feature:** Non-goal provider markets (corners, cards and others) from de-margined bookmaker odds.

**Depends on:** [052-provider-odds-import.md](052-provider-odds-import.md), [053-score-distribution-markets.md](053-score-distribution-markets.md).

**Source:** [App specification](../../app-write-up.md), sections 4 and 8 (version 1.8 approved expansion; version 1.9 paid access).

## Prompt

For each non-goal bet in `/odds/bets`, convert stored prices into de-margined implied probabilities with a documented method, labelled "market-implied" and never mixed with AI groups. Add settlement from stored fixture statistics and events (corners, cards, scorers), refusing settlement when the statistic is missing. Report performance separately from AI markets.

New families join `publicPolicy.markets` and the generalized family-total invariant from 053 (and, after 061, the gated forecast's `families` list in policy order); add no fixed family count. Market-implied probabilities and their prices are subscriber-only for unfinished fixtures, like every other probability (OP-36). Per-market performance stays aggregate-only: it never lists picks or probabilities of unfinished fixtures.

## Acceptance checks

- Overround removal is tested on two-way and multi-way groups; missing selections never produce a group.
- Unsettleable markets stay pending or void with a public reason.
- Snapshot and (after 061) gated-variant schemas accept exactly the families in `publicPolicy.markets`.

## Handoff

Required: mark this row ☑ Completed in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete; mark it ◐ Partial while either remains after work has started, and leave it ☐ Not started before that. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
