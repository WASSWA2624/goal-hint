# 034 Pagination and navigation restoration

**Feature:** Accessible Load more pagination with reliable Back restoration.

**Depends on:** [028-match-feed-api.md](028-match-feed-api.md), [032-match-feed-page.md](032-match-feed-page.md), [033-search-filter-controls.md](033-search-filter-controls.md).

**Source:** [App specification](../app-write-up.md), sections 2, 9, 12, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code. Implement the feed's pagination using the established API pagination contract. Keep ordinary crawlable pagination links that work on direct requests and with JavaScript disabled. Progressively enhance the interaction with a clearly labeled Load more control; do not replace it with automatic infinite scrolling. Preserve validated search, date/range, league, market, status and sort parameters in every pagination URL.

Retain approximately 30 cards for the initial page. Append fetched pages without duplicate fixtures, and handle list changes according to the existing deterministic order/version contract. Do not silently skip data after concurrent publication or schedule changes; document the chosen consistency behavior. Reset loaded pages when the effective query changes. Disable duplicate concurrent loads, communicate failures accessibly and allow retry while retaining loaded cards.

On navigating from the feed into a match and pressing Back, restore the same applied filters, loaded position and scroll position. Scope any browser-stored restoration record to the canonical query and navigation entry, with bounded storage and expiry. Fetch necessary stored-data pages before restoring the position, preserve focus sensibly and avoid using restoration storage as authoritative fixture state. Support direct visits to later page URLs independently of prior browsing.

Reuse shared square-corner controls and page tokens. Reserve logo dimensions and lazy-load below-fold remote images through native image elements; do not introduce an image proxy or provider requests into the browser data flow.

## Acceptance checks

- Follow pagination links without JavaScript and confirm later fixtures remain discoverable.
- Load several pages, navigate to an existing shell destination or isolated test route, then go Back; verify filters, loaded extent and scroll return on mobile and desktop. Repeat through the real match-detail page in prompt 035 once it exists.
- Exercise a failed page load, duplicate click, changed query and concurrent fixture update without losing existing cards or duplicating records.
- Check keyboard focus and announcements after appending cards.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, evidence from checks and actual blockers. Record pagination consistency/restoration decisions in `docs/implementation-decisions.md`.
