# 032 Match feed page

**Feature:** The server-rendered dated match feed shared by Today and Results.

**Depends on:** [018-match-card.md](018-match-card.md), [028-match-feed-api.md](028-match-feed-api.md), [031-public-response-cache.md](031-public-response-cache.md).

**Source:** [App specification](../app-write-up.md), sections 1–3, 5, 9, 11–13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Build the feed at `/en` and `/en/predictions/YYYY-MM-DD` using the existing date utilities, stored-data read service, shared page shell and match cards. The homepage opens directly to today's EAT fixtures with the reporting date visible. Today and Results use this same implementation; historical dates retain results and locked forecasts. Add Today, Tomorrow, Next 7 days and historical date navigation with ordinary links. Reserve integration points for the subsequent search and pagination prompts without implementing those features here.

Render approximately 30 initial cards on the server in kickoff/fixture order, with one column on phones and at most two on larger screens. Show current predictions for open cycles and locked predictions or the correct unavailable state for closed cycles. Display the seven-day availability message for future dates beyond the prediction window.

Distinguish confirmed no fixtures, incomplete import/partial coverage, unavailable prediction data and temporary read failure. Missing coverage cannot prove an empty date. Preserve available stored forecasts and their real publication/sync timestamps; never invent example forecasts as production content. Include a shared run-status area that can show the current completed/total counts from stored data. Public rendering must require no visitor account, token or authentication cookie, and must never trigger provider or AI calls.

## Acceptance checks

- Verify initial HTML includes teams, kickoff, prediction and styled-components CSS before hydration.
- Check today, seven-day boundaries, historical results, out-of-window messaging and each truthful empty/error state using representative stored fixtures.
- Check 320–430 px layouts, long names, broken logos, keyboard navigation and one-tap analysis links.
- Confirm repeated page requests cause no outbound research or prediction work.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results, and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`; do not replace source requirements with new product scope.
