# Independent odds coverage — 20 November 2026

The coordinated worker can collect the full available bookmaker scope for each scheduled pre-match date. The three-hour worker slot uses sealed page receipts and stores each completed page's structured snapshots atomically. A retry resumes at the first uncommitted page. Only a complete date receipt can withdraw a missing fixture. The existing provider-day reserve, provider pacing, page and date budgets still apply. Fixture selection, forecast calculation and price collection have independent schedules.

Pre-match and in-play catalogs use separate namespaces. Each returned market receives a reviewed mapping or a stored reason indicating why it cannot be interpreted. Structured price history retains provider and observation clocks, selection labels and known identities. In-play observations use the API-Football live source with a nullable bookmaker ID. The collector keeps meaningful corrections, availability changes and late observations. Repeated identical current states extend the observed time range on the same history row. The private structured storage authority excludes original odds response bodies. [API-Football odds endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

Reference selection compares the same fixture, phase, period, market, line and selection identity. The preferred bookmaker is first, followed by the configured fallback order and then the freshest eligible exact offer with a stable source tie-break. A requested bookmaker stays pinned. The contract can distinguish a missing or stale offer from a valid reference and carry its actual source separately. Forecast eligibility continues to depend on football evidence. Odds remain external prices and only eligible quotes enter the existing recommendation tie-break.

## Configuration and hosted qualification

- `GOAL_HINT_ODDS_BOOKMAKER_FALLBACK_IDS` is an optional comma-separated list of distinct positive provider IDs in order of preference. It defaults to empty. Existing environments keep their odds import and display settings.
- `20261120130000_in_play_odds_history` adds a private structured history table. The worker requires read, insert and update access to this table. Existing web price reads continue to use the current-offer tables. Retention and public display are verified independently.
- The provider describes seven days of pre-match retrieval and no retrospective in-play endpoint. The captured history starts when authorized collection starts. Pre-match rows outside a verified fixture occurrence and its pre-kickoff window preserve their coverage result in the receipt. Complete hosted catalog coverage and public display remain contingent on plan capacity, retention authority and documented display rights.
- The private worker log reports mapped, unmapped and unsupported catalog entries. The existing Admin batch counts exclude internal page checkpoints so each date continues to contribute its aggregate receipts.

## Verification

The environment layout, TypeScript, ESLint and Prisma validation passed. The migration was applied to isolated MariaDB 10.4.32, including a valid history update and rejection of four invalid fixture, clock and JSON cases. The in-play integration passed on isolated MySQL, including private collection, duplicate tracking, corrections, withdrawals, stale current reads, entitlement and unchanged forecast counts. The subsequent partial-market and catalog refinements passed the focused unit and adapter suite. All checks used synthetic sources.

The pre-match suite passed all 14 isolated MySQL checks, including atomic rollback and resume, append-only price history, least-privilege grants, stale current prices, frozen closing prices and unchanged forecast jobs, publication counts and fixture versions. The 29 focused pre-match unit checks passed. The existing featured-pick ranking discrepancy remains in scope for Step 07.
