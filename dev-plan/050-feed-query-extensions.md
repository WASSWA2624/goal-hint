# 050 Feed query extensions

**Feature:** Multi-value league/country/market filters, probability range, sort direction, longer date ranges and numbered-pagination data.

**Depends on:** [028-match-feed-api.md](028-match-feed-api.md), [033-search-filter-controls.md](033-search-filter-controls.md), [034-pagination-navigation.md](034-pagination-navigation.md).

**Source:** [App specification](../app-write-up.md), sections 2–4 (version 1.8 owner-approved edits) and the [layout templates](templates/).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Extend the shared `FeedQuery` contract in `src/domain/feed-query.ts` so pages, the public API and browser state share one canonical URL form:

- `league` and `country`: comma lists (repeated keys from plain forms join identically), deduplicated and sorted, at most 50 each. Country names come from stored competitions.
- `market`: one or more market families in policy order; the default remains match result.
- `prob=MIN-MAX`: whole-percent bounds on each fixture's shown pick; `0-100` is omitted.
- `sort=kickoff|probability` with `dir=asc|desc`; directions default to kickoff ascending and probability descending and are omitted when default. Remove `sortMarket`.
- Date presets Today, Tomorrow, Next 3 days, Next 7 days and Next 30 days; explicit ranges up to 31 days. Predictions stay within the seven-day window.

In the feed SQL, join each fixture's shown pick: the highest selected probability among the selected families in the displayed revision, ties in policy order. Apply league, country and probability filters, and order by kickoff or shown-pick probability in either direction (missing probabilities last, kickoff/fixture ID tie-breakers). League options include approved logo URLs and fixture counts for filter suggestions. Add the competition logo to fixture snapshots. Bump the public-cache projection.

Provide pure helpers for the browser: shown-pick selection that mirrors the SQL, continuous row numbering and `1 2 3 4 … N` page sequences of at most seven slots.

## Acceptance checks

- Unit tests cover canonical round trips, rejection of malformed lists, ranges and directions, preset ranges and the page-sequence and shown-pick helpers.
- MySQL integration checks best-pick ordering in both directions, ties and the probability window.
- Existing single-market URLs keep working; old `sortMarket` URLs are rejected rather than silently reinterpreted.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results, and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
