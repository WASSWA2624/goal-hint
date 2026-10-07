# 028 Match feed API

**Feature:** Public stored-data match feed queries.

**Depends on:** [004-eat-calendar.md](004-eat-calendar.md), [005-market-domain.md](005-market-domain.md), [009-canonical-football-catalog.md](009-canonical-football-catalog.md), [017-client-state.md](017-client-state.md), [021-daily-selection.md](021-daily-selection.md), [027-market-settlement.md](027-market-settlement.md)

**Source:** [app-write-up.md](../app-write-up.md) §§1–5, 9–13, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and stored-data repositories. Implement `GET /api/matches` and its reusable server query service only. Use this same service for future server-rendered pages; visitor requests must never call providers, research or prediction workers.

Schema-validate date or bounded seven-day range, search, league, market, status, sort and pagination using the established URL contract. Support historical dates and EAT boundaries. Search indexed team/league/country names and aliases case-insensitively across the entire selected range, before pagination. Default to kickoff plus fixture ID ordering. Probability ordering applies only to the selected family, uses stored unrounded values and places missing values last; add stable tie-breakers. Define documented pagination limits, defaulting to approximately 30 cards, and provide ordinary next/previous page links or equivalent metadata.

Return one card record per fixture with coherent current/locked/void-cycle selection, source, publication time, outcome, actual sync time, update status and monotonic fixture version plus cycle/run/revision references. Preserve void reasons and unavailable families. Include trustworthy run progress and coverage metadata so clients distinguish no fixtures, no filter matches, insufficient data, temporary failure and partial imports. An incomplete/degraded import cannot establish an authoritative empty date. Expose the seven-day availability message where relevant without hiding historical locked forecasts.

Use safe parameterized queries, permitted filter values, bounded response sizes and anonymous public-search rate limiting. Minimize visitor data; require no account, token or authentication cookie. Exclude raw provider payloads, evidence internals, prompts, credentials and worker logs. Return structured recoverable errors without disguising database failure as an empty list. Use uncached reads initially; the later cache feature will wrap this contract.

## Acceptance checks

- Query aliases and matching records beyond the first page, historical dates and exact EAT range boundaries.
- Test deterministic pagination/sorting, missing probabilities, partial coverage and applicable-cycle deduplication.
- Verify invalid/oversized inputs and search bursts are bounded, anonymous requests succeed and provider/AI adapters are never invoked.

## Handoff

Record changed files, query/security checks and blockers in `docs/development-progress.md`; document response/error/pagination contracts in `docs/implementation-decisions.md`.
