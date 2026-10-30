# 158 — Smooth slip status switching

## Scope

Keep loaded slips and their date-range totals visible when switching result
filters, without weakening current/future prediction access checks.

## Implementation

- Project result filters immediately from a complete loaded All cohort. Preserve
  original ranks and exact filtered totals; paginate projected statuses in pages
  of 50. Retain the complete daily source for local filtering while displaying
  at most 50 slips per page, including All (updated by plan 160).
- Reuse accepted query views from a bounded 12-entry in-memory cache tied to one
  server seed and observed access tier. Revalidate every requested view through
  the private endpoint, including returning to the daily default.
- For a partially loaded same-date range, retain the actual old result until the
  new view arrives. Show Updating slips in the applied summary; label retained
  rows/counts/pages with their actual query, not the requested toggle.
- Preserve usable results on a failed background read and offer an inline Retry.
  Unseen ranges without usable data retain normal loading/error feedback.
- Clear protected cache eligibility immediately on API or observation access
  revocation. Preserve expiry/renewal defaults and stale-server/mobile safeguards.
  Abort superseded requests and reject mismatched dates or query responses.
- Pause automatic page refresh during a background filter read. Disable paging
  while the visible query is retained from an unfinished status/page change.
- Reject an older daily All seed when newer accepted statistics change the
  cohort, so returning to All cannot roll counters back.

## Verification

- All 46 client cache/projection, publication browse, access, query, header and card tests passed on
  Node 24.18.1; scoped ESLint, TypeScript and the integrated production build passed.
- The initial 24 browser transition checks passed with held responses, cached repeat
  filters, partial pages, failed updates/Retry, aborted/out-of-order replies,
  known-empty ranges and immediate observation-endpoint access revocation.
  Mutation observers detected no blank list during complete-cohort switches.
- The isolated fixture uses fixed synthetic expiry to avoid simulated renewals
  on every session read. Deliberate 503 responses verify recovery; fixture-only
  missing auxiliary routes do not exercise real external services.
- Layout, percentages, numbering and smooth glow were checked with plan 157.
