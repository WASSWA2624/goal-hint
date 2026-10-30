# 160 — Shared slip pagination and continuous glow

## Scope

Use the Matches paginator for Best Slips and Slip Builder, showing 50 slips per
page. Smoothly reverse the In progress halo without an abrupt animation reset.

## Implementation

- Reuse `NumberedPagination` and its existing labels/styles. Add optional disabled
  navigation during pending reads without changing Matches' link-based behavior.
- Define one `slipPageSize` constant for Builder, Best Slips API and local cache
  projection. Show the paginator only when the known total exceeds 50.
- Preserve the complete daily source for instant status filters, but display
  only the selected 50-slip page. Keep absolute ranks, full-range statistics
  and the existing applied-filter range summary.
- Support numbered page jumps for exact ranges, including mobile daily pages.
  Date/status, access or layout changes restart at page 1; partial pending views
  keep their actual query and disable page navigation until resolved.
- Paginate Builder's generated cohort locally, retaining rank/index and sharing
  identity. New build results restart page 1; refresh only visible match rows.
- Keep the dot's core steady. Animate a separate halo's opacity and scale with
  two-second ease-in-out phases that alternate continuously. Reduced motion
  retains a steady halo; badge dimensions and colors stay unchanged.

## Verification

- All 46 targeted cache/query/access/publication/card/header tests passed on
  Node 24.18.1, including 50/51/100 page boundaries, no skipped/duplicate ranks,
  original-cycle result filtering and subscription expiry.
- Scoped ESLint passed for all new or changed runtime and test files.
- All 96 pagination browser assertions passed on both slip pages at 50, 51 and
  100 slips, desktop 1440px and mobile 390px. Checked exact page counts, original
  ranks, no skipped/duplicate slips, first/last/number navigation, filter reset,
  immediate local Best Slips projection and horizontal overflow. No page errors.
- All 40 final halo assertions passed across 1440/1024/390/320px and both themes,
  including samples immediately before/after each alternate-cycle endpoint.
  The dot stays solid, the halo reverses smoothly, and reduced motion is steady.
- Integrated TypeScript and the production build passed on Node 24.18.1 /
  npm 11.16.0, including 21 static pages and the offline asset manifest.
