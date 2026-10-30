# 155 — Shared slip status headers and public history defaults

## Scope

Unify slip headers and give visitors yesterday's results while reserving today's
and future predictions for valid subscribers.

## Implementation

- Reuse square, fixed-width semantic outcome badges across desktop and compact
  slip headers. Keep Share before Status and the disclosure arrow at the far end.
- Place a sealed publication timestamp after the slip number, then Top ranked.
  Use date-only fallback when needed; never infer a publication time. Integrate
  saved/history timestamps too, removing duplicate date/status headings.
- Spell out Average match probability on desktop. Preserve original selections
  and use matching original-cycle observations for header outcomes.
- Start active subscribers on Today/All slips and guests or expired members on
  Yesterday/All slips. Toolbar and custom-dialog Reset respect those defaults.
- Release historical publications publicly. Gate current/future selections in
  SSR and API, recheck access after reads, and re-read implicit defaults after an
  access change. Preserve explicit range filters and safe aggregate previews.
- Present one registration/subscription prompt per locked list, including empty
  future periods. Disable subscriber-only observation polling for public history;
  retain the regular page refresh.

## Verification

- All 66 targeted access, publication, date-query, header-outcome, slip/card and
  original-cycle observation tests passed. Coverage includes mixed custom ranges,
  expiry and renewal during default API reads, safe allowlists and unknown legs.
- Scoped ESLint passed for all changed runtime/test files. The final integrated
  production build passed compilation, TypeScript, 21 generated pages and the
  27-asset offline bundle.
- All 71 final browser checks passed in an isolated production fixture with no
  JavaScript page exceptions. Desktop 1024/1440px and mobile 320/390px layouts
  keep the exact title/date/rank order and one date/status per header. Status
  badges are 72px wide, with at least 4.90:1 text contrast in both themes.
- Browser coverage includes visitor/member/subscriber defaults, Reset/custom
  dates, keyboard disclosure/Share/focus behavior, and expiry with the server
  refresh deliberately held. Failed requests, switching to mobile, retry,
  reload and renewal never restore protected current/future selections.
- Fixture-only HTTP errors are expected for omitted share/observation/offline
  routes and the intentional failed-read test. End-to-end share preparation
  remains outside this change's scope.
- Git review preserves the existing detached worktrees and stashes. Only main
  exists locally/remotely; generated fixtures and screenshots remain ignored.
