# 033 Search and filter controls

**Feature:** Shareable search and filter controls over the complete selected date cohort.

**Depends on:** [017-client-state.md](017-client-state.md), [028-match-feed-api.md](028-match-feed-api.md), [032-match-feed-page.md](032-match-feed-page.md).

**Source:** [App specification](../app-write-up.md), sections 2, 3, 9, 11, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing implementation. Add the reusable search/filter interface to the feed. Reuse `SearchInput` and `FilterControl` rather than creating page-specific variants. Put search visibly above the cards and provide compact league, status and market controls, clear active states and Reset. Search must match team, league and country names, including stored aliases and case-insensitive matches, across the full selected date/range through the existing indexed application query. Filtering only downloaded cards is insufficient.

Keep applied date/range, search, market, league, status and sort values in validated URLs. Use the existing per-provider Redux store only for mutable UI drafts and view preferences. Server rendering and refreshes must interpret identical URL parameters. Commit changes accessibly, avoid excessive requests with a bounded input strategy, and reset pagination whenever query membership or order changes. Cancel or disregard responses belonging to superseded queries.

Default to kickoff order with fixture ID as a stable tie-breaker. Enable probability order only for one selected market, keep missing probabilities last and never rank unrelated market families together. Reset must produce a documented consistent default state while preserving the user's selected reporting date/range. Display the selected family through the existing card component.

Use labeled controls, visible focus, restrained count announcements and a dismissible filter panel that returns focus to its trigger. Distinguish no filter matches from no fixtures, partial coverage and temporary failure. A failed refresh preserves the previous visible data with an honest status.

## Acceptance checks

- Find fixtures initially beyond the first page using aliases, mixed case, league and country searches.
- Verify reload, shared URL and Back restore applied controls and produce the same server query.
- Check probability ties, missing probabilities, Reset, fast query changes and invalid parameters.
- Test keyboard operation, focus return, narrow screens and non-disruptive announcements.

## Handoff

Update `docs/development-progress.md` with changed files, checks/results and actual blockers. Record decisions in `docs/implementation-decisions.md` without changing product requirements.
