# 037 Live client refresh

**Feature:** Safe background refresh of visible feed and match data.

**Depends on:** [017-client-state.md](017-client-state.md), [028-match-feed-api.md](028-match-feed-api.md), [029-match-detail-api.md](029-match-detail-api.md), [031-public-response-cache.md](031-public-response-cache.md), [034-pagination-navigation.md](034-pagination-navigation.md), [036-revision-history.md](036-revision-history.md).

**Source:** [App specification](../app-write-up.md), sections 2, 5, 9, 11 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing state/API/cache contracts. Implement one explicit handoff from server-rendered match data to browser refresh state. Use the existing Redux Toolkit/RTK Query boundary only where browser refresh is needed. Visible active-match views may read the application endpoints every 15–30 seconds; slow or pause polling in background tabs and resume safely on visibility changes. Visitors never call the provider directly or enqueue AI work.

Apply the existing monotonic fixture-data versions together with cycle/run/revision references when merging responses. Reject older responses, including earlier cycles, and keep a revision's probability, source and explanation together. Account for in-flight query changes and unmounts. A late response cannot reverse a newer score/status, lock, settlement correction or publication. Historical revision inspection must remain explicitly historical rather than becoming current state.

At EAT midnight recompute today and the rolling seven-day window for views following relative dates; preserve explicitly selected historical dates. Refresh relevant URLs/query state without losing valid filters or unnecessarily resetting a loaded historical position. Show stored daily-run status, “Updating predictions for the next 7 days” and shared completed/total counts while published jobs appear progressively. Retained forecasts keep their original timestamps and show update delays honestly.

On transport errors keep loaded cards/details, display actual last-sync times and distinguish partial coverage from an empty result. Avoid repeated screen-reader interruptions. Deduplicate browser requests appropriately, and prove browser activity cannot multiply the shared provider polling or change locked forecasts.

## Acceptance checks

- Deliver delayed responses in reversed order across publication, locking, cycle changes and result corrections; assert no rollback or mixed snapshots.
- Verify 15–30 second visible refresh, hidden-tab behavior, reconnect and EAT-midnight rollover.
- Check shared progress counts, incremental publications and retained-data failures on feed/detail pages.
- Verify client reads produce no AI jobs or visitor-specific provider loops.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks/results and blockers; record refresh/rollover decisions in `docs/implementation-decisions.md`.
