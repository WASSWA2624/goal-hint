# 052 Provider odds import

**Feature:** Store API-Football pre-match odds and enable the odds display and odds-range filter.

**Depends on:** [006-api-quota-limiter.md](006-api-quota-limiter.md), [007-api-football-adapter.md](007-api-football-adapter.md), [050-feed-query-extensions.md](050-feed-query-extensions.md), [051-feed-screen-layout.md](051-feed-screen-layout.md).

**Source:** [App specification](../app-write-up.md), sections 1, 6, 11 and 14 (version 1.8).

## Prompt

Add the `/odds` and `/odds/bets` endpoints to the adapter contract with strict normalization, rights-safe storage and quota-limited, scheduled imports for fixtures in the window where odds are published. Record bookmaker, bet, line, decimal odds, retrieval time and provider update time; keep history append-only. Choose one documented bookmaker or a median across bookmakers, and expose de-margined implied probabilities separately from AI probabilities.

Extend the feed with `odds=MIN-MAX` (decimal, two places) applied to the shown pick's market price, show the price beside each pick, and enable the odds controls added in prompt 051. Odds are information only; never add betting, bet slips or affiliate links.

## Acceptance checks

- Quota budgets and the essential reserve hold with odds polling enabled; costs are recorded against the US$45 ceiling.
- Stale or missing odds never fill another market's price; filters exclude fixtures without a price.

## Handoff

Required: tick this row in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
