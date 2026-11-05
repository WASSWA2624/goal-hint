# Runtime performance review — 5 November 2026

## Scope and method

This review extends [287](ui-performance-287.md). It preserves the existing UI,
theme tokens, control sizes, navigation, business calculations, authorization,
freshness and refresh cadences. The baseline is `bb2d8b82` plus the working-tree
changes present when this task started; an ignored source snapshot records that
state. Concurrent contact, control-layout and sharing changes are separate work.

Source review covers the complete application architecture. Runtime checks use
representative production-built components with synthetic data, deterministic
scaling tests and disposable genuine MySQL instances. These are not measurements
of deployed traffic or physical phones. No live payment, messaging or football
provider operation is part of the benchmarks.

The owner additionally required incremental updates without reloading rendered
components. Equal JSON snapshots now retain their references, changed snapshots
reuse unchanged branches, slip cards are memoized, and the analytics pages list
subscribes to its own data rather than a changing report timestamp. Authentication,
revocation and genuinely changed results still propagate.

## Confirmed bottlenecks and fixes

| Area | Cause and change | Evidence |
| --- | --- | --- |
| Settlement history and match detail | Every cycle, locked revision and settlement pointer was hydrated serially. Reuse existing bounded history readers and fetch settlement revisions in groups of at most 100. Preserve original cycle order, seals, identities and transaction snapshot. | Identical projections for 1/10/101 cycles; database read counts decrease from 13/94/913 to 10/10/19 in the deterministic settled-cycle fixture. These counts exclude a separately loaded verified result when present. |
| Current locked match detail | The card and detail projection loaded the same settlement twice inside one read-only transaction. Share the verified projection by fixture and cycle only within that transaction; failures are evicted and new requests create new readers. | A second identical read adds zero queries; distinct fixture/cycle keys and new transactions still load independently. The single-cycle fixture avoids a further 10 redundant reads. |
| Period return reports | The batch reader and quote reader repeated the same quote count/JSON-size scan. Prepare one transaction-bound quote reader after validating/reserving the exact cohort, then decode only after the other bounded payloads validate. | One quote-size scan instead of two per quote-enabled batch; standalone callers retain their independent guard. No measured hosted latency gain is claimed. |
| Checkout background refresh | Timer, focus, visibility and online events could launch overlapping private reads. Coalesce pending reads, abort obsolete polls and keep explicit post-mutation reads fresh. Use the existing account-read deadline for both reads so a stalled request cannot suppress recovery indefinitely. | A controlled burst of 101 calls produces one GET and one accepted update. Regression checks cover late bodies, timeouts, authorization, cleanup, nested pauses and mutation overlap. POST behavior and retry policy are unchanged. |
| Match-tab scrolling | Each scroll event measured every hidden desktop label plus the More label, including on mobile. Scroll now updates only arrow state. Desktop fitting still responds to resize, font completion, selected tab, entitlement and messages. | The scroll path removes all 12 tab-label measurements plus the More-label measurement; visible markup and styling are unchanged. |
| Large option popups | Panel-only left/width custom properties were inherited through every option descendant, causing avoidable style invalidation. Use ordinary inline positioning properties with identical CSS defaults; retain height, clipping and opening-direction logic. | Controlled browser comparison over 2,001 rows / 10,014 descendants retained exact computed geometry and styles. Two traced openings were 788/748ms before and 735/546ms after; style recalculation was 536/567ms versus 453/390ms. Small synthetic samples establish the invalidation cause, not a service-level speedup. |
| Incremental background UI updates | Equivalent checkout/slip data was replaced, slip contexts notified on identical polls, and the analytics pages list listened to timestamp-only report changes. Reuse unchanged plain-data branches, suppress identical slip-observation notifications and memoize unaffected slip cards. Subscribe the analytics pages list to its stable pages snapshot while keeping full-report timestamps fresh. | Six identical accepted slip polls produce one notification. Tests retain unchanged roots and records, propagate changed/empty/revoked cohorts, preserve fresh analytics timestamps and leave account/auth revalidation intact. |
| Offline startup validation | Complete bundle validation read and hashed each asset serially. Validate in batches of four using the existing download bound; drain each batch before rejecting and retain every integrity/expiry/completeness check. | Nine interleaved synthetic samples with 33 entries and 10ms injected per-asset read delay: median 547.989ms → 150.871ms; both do 33 cache reads and 36 hashes. Peak asset-read concurrency is four. This is scheduling evidence, not measured device startup time. |

Offline validation can hold up to four asset buffers instead of one, within the
existing 10MiB bundle limit. No asset checks are skipped. The deterministic test
measures pending work, not actual browser heap allocation.

## Coverage and retained implementations

| Area reviewed | Findings and verification scope |
| --- | --- |
| Public routes and navigation | Matches, filters/search, pagination, details/history, Best Slips, Builder, sharing, performance, information/contact/download and common shell. Existing independent streaming and server authorization remain. Production UI fixture covers representative feed, dashboard, slips and large picker interactions. |
| Client state and rendering | Bounded feed page retention, RTK request caching, memoized cards, indexed picker options, local detail-section navigation, shared foreground progress and quiet serial live/slip refresh already limit work. No broad client rewrite was justified. |
| Member and checkout | Account/session/notification reads, registration/recovery, subscriptions, checkout and post-mutation refresh. OCR and share export already load lazily; OCR work is bounded by pixels, yields and supports cancellation. Payment mutations retain their existing atomic service contracts. |
| Administration and analytics | Record paging/search/detail, totals, exports, settings and report aggregation. Independent overview/analytics reads already overlap, while coherent reads retain transaction boundaries. Real host query plans and concurrent-user throughput still require deployment measurements. |
| Database and API | Feed/cohort hydration, detail/results, published slips, performance reports, auth/access, cache generations and pool configuration. Preserve bounded reads, private no-store responses and final entitlement checks. Optimize confirmed duplicate/serial work rather than increase pool sizes without contention evidence. |
| Media and assets | Local WOFF2 font subsets, deferred offscreen logos, first-party bounded image processing, lazy OCR/share helpers, static cache headers and private cache separation remain. The public contact parser still imports mobile-number validation; see the unresolved section below. |
| Offline lifecycle | Startup waits for page load/idle; refresh owns/coalesces work, honors visibility and cancellation, retains coherent previous bundles and excludes private responses. Unit checks cover integrity, expiry, failure recovery and concurrency. |
| Background work | Queue consumers are serial per worker with bounded retries, fenced leases and SKIP LOCKED claims. Live worker count and enrichment are bounded; result polling has a busy guard and bounded batches. Do not change freshness or scheduling to hide foreground contention. |
| Flutter host | Persistent WebView/profile, appearance/lifecycle serialization, hidden-state suspension, Android scroll-event deduplication, sharing, camera/file bridge and recovery reviewed in source. No native runtime change was justified without physical-device evidence. |
| Hosting and development | Standalone packaging, startup instrumentation, database pools per process, cPanel schedules and resource limits reviewed. Development compilation is separate from production request/interaction performance. Other chats' processes were preserved. |

## Verification

Focused checks establish exact output equivalence and bounded work. The
disposable MySQL settlement/detail/historical-quote suites pass 30 tests with no
skips or failures. The full ESLint check passes. The broad integrated JavaScript
suite records **3,014 passes, three failures and one skip across 3,018 tests**;
the three failures below all reproduce on the unchanged baseline. Subsequent
structural-sharing and incremental-store tests are validated separately.

The complete application production build and TypeScript check pass with external
services disabled and one build worker; the unchanged production configuration is
wrapped only to bound verification resource use and resolve isolated dependencies.
The offline manifest builds with 28 pinned assets. All 90 final focused tests pass
with no failures or skips, and scoped ESLint passes after the incremental-update
changes.

The final checkout/detail browser fixture passes **168 checks** in light/dark
themes at 390px and 1440px, with 34 screenshots and no runtime exceptions. Both
unchanged and changed-balance polls retain the exact heading/form/input nodes,
typed draft, selection, focus and 120px scroll position, with no document/RSC route
request or loading flash. Checks also cover lifecycle bursts, Back/provider
retention, mutation/poll overlap, phone-country popup, tab arrows/keyboard/More,
resize and content focus. Test-service changes are synthetic; no real payment is
performed. Independent cross-review found no unresolved regression in the changes.

All **96 popup geometry comparisons** pass for SearchableSelect, SelectMenu,
ChoicePicker and UnavailableField. Coverage includes both themes, mobile/desktop,
fine/coarse pointers, above/below placement, nested scrolling, resizing, larger
text, RTL and zoom. Descendant geometry, fonts and colors match the previous
positioning implementation.

The final shared component benchmark passes in all four theme/viewport profiles.
For the 2,000-option fixture, five-opening medians are 288/320/343/349ms
(light 390px/light 1440px/dark 390px/dark 1440px); the initial snapshot recorded
707/730/1,006/941ms. Resource pressure differed between these runs, so the
controlled style traces and exact geometry checks above provide the stronger
evidence. Final focus medians are 16–23ms and search medians are 70–131ms.

One additional mobile simulation uses 4× CPU slowdown, 150ms network latency and
200,000 bytes/second download throughput. It preserves the main content node,
restores filter-button focus and reports no runtime errors or horizontal overflow.
The lab sample records an LCP candidate at 1,716ms, an observed layout-shift sum
of 0.0034, complete fixture readiness at 9,435ms and a Playwright click-start to
Advanced Filters visibility interval of 2,693ms. The longest observed task across
navigation and interaction is 2,561ms. The dialog is already mounted while closed;
this is a different interaction from mounting the large picker. Actionability and
automation time are included, task timestamps do not isolate the dialog's own
cost, and layout shifts are not grouped into CLS session windows. This single
sample does not establish field responsiveness; constrained-device responsiveness
still needs profiling and qualification.

The unchanged snapshot's broad suite recorded 2,981 passes, six failures and one
skip. Three failures are snapshot/Turbopack dependency-root resolution, not app
regressions. Three source failures also predate these fixes: a stale pagination
export in completed-match tests, sitemap ordering expectations, and the public
contact-page phone-library import guard. The three snapshot resolution failures
do not occur in the primary-checkout integrated run.

## Unresolved findings and measurement limits

- **Contact-page dependency weight:** the public response parser reaches
  `support-contacts-input.ts` → `phone-mobile.ts` → `libphonenumber-js/mobile`.
  The existing bundle-boundary test catches this. Eliminating it while retaining
  identical validation requires a separate measured parser/loading change; this
  review does not weaken mobile-number validation to make that test pass. The
  contact feature is concurrent work and its files are outside this task's edits.
- **Very large picker mounts:** the synthetic 2,000-option case still creates
  roughly 10,000 popup descendants on opening. Panel style invalidation is reduced,
  but initial mounting remains significant. Virtualization or persistent hidden
  menus would require separate memory, accessibility and interaction qualification;
  neither is introduced under the current UI/behavior-preservation requirement.
- **Production data and concurrency:** hosted EXPLAIN plans, slow-query timing,
  pool waits across all web/worker processes, peak backlog and large historical
  aggregate costs remain unmeasured. Pool size is per process; a local single-user
  fixture cannot establish total connection demand or an appropriate replacement.
- **Hosting:** Passenger cold starts, compression/CDN behavior, CPU/memory limits
  and deployed availability require access to the running target. cPanel worker
  prerequisites can consume up to 180 seconds before a 270-second live window;
  flock prevents overlap, but actual coverage gaps need host timing evidence.
- **Devices and prolonged usage:** physical Android/Windows startup/resume,
  long-session memory, large native PNG sharing and constrained-device battery
  behavior are not qualified by browser emulation. Apple/Linux support limits
  remain those recorded in the Flutter documentation. The throttled browser sample
  above still has long main-thread tasks; no blanket smoothness claim is made.
- **Timing interpretation:** browser event-to-second-frame samples are lab
  approximations, not field INP. HTTP completion is not paint time. Controlled
  cache/query tests do not predict whole-app speedup. Shared-host resource pressure
  makes absolute timings diagnostic; operation counts and output equivalence are
  the primary before/after evidence for these fixes.

## Reproduction

- `node --conditions=react-server --test tests/settlement-read-performance.test.mjs`
  checks batch scaling, exact serial-result equivalence, snapshot reuse and seals.
- `node --conditions=react-server --test tests/checkout-refresh.test.mjs`
  checks refresh bursts, mutation ordering, authorization and bounded recovery.
- `node --conditions=react-server --test tests/offline-worker.test.mjs`
  checks bounded complete validation and the existing integrity/lifecycle cases.
- `node --conditions=react-server --test tests/structural-sharing.test.mjs
  tests/slip-refresh-identity.test.mjs tests/analytics-live-report.test.mjs`
  checks unchanged references/notifications and propagation of real updates,
  empty/revoked cohorts and fresh report timestamps.
- Existing `scripts/benchmark-ui.py` and `scripts/benchmark-ui-browser.mjs` provide
  production-built component smoke/interaction measurements in both themes at
  390px and 1440px. Raw measurements and screenshots remain in ignored output.
- Genuine MySQL integration uses the existing disposable-instance harness with
  `MYSQL_TEST_SERVER_BINARY`; installed/live application databases are not targets.

Ignored browser evidence is under `output/playwright/runtime-297/` (including
`flows/report.json` with source hashes and all retention checks, and
`slow/slow-profile.json` for the constrained simulation). Popup comparisons are in
`output/playwright/performance-audit-297/popup-geometry/summary.json`. The isolated
complete build is under `.tmp/performance-audit-297/integrated-app/`.

No deployment or real-world performance service level is implied by these checks.
