# 203 — Phone slip sharing and recipient access

Extend the existing Share action to full phone Best Slips and Slip Builder cards.
Keep native disclosure headers and ordinary collapsed defaults; Share is a sibling
of the disclosure. Preserve shared-page expansion and leave individual-prediction
sharing undecided. Reuse branded PNGs, immutable links and downloads; distinguish
link, image and WhatsApp handoffs, retain copying/manual fallbacks and quiet cancel.
Extend the existing document-bound Flutter bridge with bounded PNGs and canonical
shared links, using share_plus and existing origin/nonce/lifecycle checks.

Return an allowlisted restricted landing without a snapshot when access is needed.
Keep existing completion/entitlement rules and race rechecks. Use generic metadata
for every viewer; never embed selections in restricted HTML/RSC/social previews.
Allow only canonical shared-slip return paths through auth and access steps, keeping
ordinary home/admin/restricted-session routing intact. Handle missing/unavailable
links clearly. No database migration or payment/referral rule change is intended.

Verify service/HTTP access states and races, safe returns, native bridge bounds,
copy/download/native/cancel/failure, disclosure separation and responsive themes.
Record actual results here, simplify the active audit and keep release/device checks
Unverified. Finish on main, commit/push and preserve existing stashes/worktrees.

## Verification

- The focused sharing/image/download/invitation/auth suite passed **83 tests with no skips**. Six affected sharing/invitation cases passed again after adding native caption-size preflight. This covers safe canonical returns, ordinary/admin/restricted authentication destinations, trusted share sources, access/completion rules and expiry races, immutable snapshots/deduplication, branded pagination, downloads, native outcomes and fallbacks.
- **One genuine MySQL integration case passed**, exercising the actual SharedSlip migration, insert-only privileges, retry deduplication, permanent snapshots after account erasure and immutable triggers. The test used a disposable server, not the configured local database.
- **13 Flutter bridge/link/platform tests passed**, with Flutter analysis clean. PNG bytes/names/dimensions, canonical links, nonce/document ownership, concurrency, cancellation, failure, navigation invalidation and popover anchors are covered. The actual injected JavaScript template also completed a browser channel/PNG/cancellation handshake. See Flutter plan 013.
- Strict TypeScript and changed-file ESLint passed. The production sharing fixture built; HTML/API checks cover restricted privacy, generic metadata, completed/eligible/missing/unavailable recipients and initial collapsed phone actions. The final fixture additionally checks private Flight responses and the allowlisted subscription return link.
- Playwright passed **20 source/width/theme combinations**: Best Slips and Slip Builder at 1440/1024/768/390/320px in light/dark themes. Headers expanded/collapsed, Share preserved both states, Escape restored focus, drawers stayed contained without horizontal overflow and phone controls met 44px targets. Desktop/phone captures were visually inspected.
- Browser checks verified copy-link/caption, focused manual selection after clipboard denial, separate native link/file payloads with click activation, quiet cancel, failure/unsupported feedback and WhatsApp URL encoding without automatic image attachment or delivery claims. Native/social APIs were intercepted or simulated; no messages were sent. Unauthorized/changed/unavailable preparation states stayed collapsed with no image; a simulated 503 recovered on Retry, and cached reopening made no additional publish request.
- A real **1080×1104 PNG** downloaded. An **800-selection ZIP** contained all **25 PNGs plus caption.txt**, with PNG widths verified at 1080px; the PNG contents totaled 24,795,061 bytes. Exports beyond the native bridge's 12 MiB limit retain link sharing and download alternatives. The existing maximum remains supported by the browser export path.
- Browser recipient checks verified six viewer/completion combinations in HTML and API responses, no restricted snapshot fields, private/no-store APIs and unchanged shared-page expansion. Both 390px and 1440px journeys exercised the production sign-in form/handler, the same canonical shared return, Get access and explicit Return after a fixture-only approval. No payment/referral accounting or real access grant was performed by those fixture steps.
- No database migration is introduced. Configured local `db:verify` found no pending migrations/drift and `db:health` is ready. Remote deployment, signed builds, real social targets, installed WebView downloads (especially large exports), cache cleanup and physical-device handoffs remain **Unverified** in the release group.
- The active audit removes delivered sharing gaps, retains individual-prediction sharing and shared-page expansion as decisions, keeps builder polling in its prior group, and recommends registration/referral security as the next standalone batch. Earlier desktop evidence remains in plan 153; notification and prior audit evidence remain in plans 201/202.
