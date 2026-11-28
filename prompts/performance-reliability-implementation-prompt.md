# Goal Hint — Performance, Data Loading, Navigation and Reliability Remediation

**Task type:** Investigate, implement, test and document fixes in the **existing codebase**.  
**Priority:** Launch-blocking reliability and performance work.  
**Scope:** Matches, Best Slips, shared performance-summary cards, slip sharing, login/session access, Admin → Users list refresh, common page/document navigation and recovery, and public mobile/desktop page-weight and PageSpeed auditability.  
**Separate project:** Do **not** implement new admin-management or payment features in this task. Those will be specified later.

## 1. Mission and working rules

Goal Hint must load its essential pages promptly, remain lightweight on normal mobile data, and recover predictably from intermittent connectivity and temporary backend failures. Investigate the **actual root causes** of slow loading, HTTP errors, failed data reads, and complete page-load failures. Implement durable, maintainable fixes—**not** superficial error suppression, unlimited retries, or merely longer timeouts.

**You will receive this prompt without screenshots.** The reports below describe the observed behavior sufficiently; inspect the repository to identify the real components and APIs. Do not ask for screenshots as a prerequisite.

1. Read `AGENTS.md`, `APP_OVERVIEW.md`, the relevant files in `implementation-docs/`, and the corresponding source code/tests. The **current code and reproducible evidence** override potentially stale documentation.
2. Work primarily within `next-js/` for UI, APIs and domain logic. Flutter is a minimal web host; inspect its navigation/connection integration when relevant, without duplicating web business logic.
3. Preserve existing product behavior, authorization, access gates, historical predictions, fixture ordering, date/time rules, public slip identity and ranks, page/filter links, performance-summary semantics and financial integrity. **No visible redesign, layout/wording rework, theme change or feature removal** is authorized; optimize the existing look and feel.
4. Preserve both light and dark modes, mobile/desktop layouts, shared theme tokens, reusable controls, shared `NavigationProgress`, and efficient in-place rendering according to `AGENTS.md`.
5. Prefer a **targeted, evidence-based fix** over broad rewrites. Do not add a new state framework, unneeded dependency, service, queue or caching layer without showing why existing facilities cannot solve the problem.
6. Do not deploy to staging or production, run production mutations, alter credentials or payment settings, or change provider workers without explicit authorization. Production diagnosis must be read-only and privacy-safe. If source, logs or environment access is missing, complete the parts you can and state exactly what cannot be verified.

## 2. User-observed failures to reproduce and resolve

These are observations, **not confirmed diagnoses**. All occurred during normal browsing on an Android phone with mobile data available; a separate speed test showed approximately **5 Mbps** download. Throughput alone does not establish network health.

| Area | Observed symptom | Required investigation / outcome |
| --- | --- | --- |
| **Matches** `/en/matches` | Sometimes loads only after a long wait; sometimes loads correctly (an observed day had **1,080 matches** and displayed **1–50**); sometimes shows Goal Hint's white **“Couldn't load this page”** recovery screen. | Explain and reduce both slow initial data delivery and outright document/feed failures. Keep filtering, totals, ordering and Show More correct. |
| **Matches return/reload** | After visiting a successfully rendered Matches page and returning to it, the browser showed a black **“This page couldn't load. Reload to try again, or go back.”** screen. Reload then produced the app's white connection/retry screen. | Investigate client-side navigation vs full document requests, hydration/streaming failures, history/back-forward restoration, error boundaries, recovery worker and server response behavior. |
| **Best Slips** `/en/best-slips` | Header, date controls, performance cards and footer rendered, but the list displayed **“Slips could not be loaded. Please try again.”** | Diagnose `/api/best-slips` and related server/database/serialization/client error paths. Make initial and refreshed lists reliable without losing the accepted query or completed content. |
| **Performance cards across Matches and Best Slips** | When switching between Matches and Best Slips, the lists sometimes remain visible but the shared Won / Pending / Lost / Others cards stop showing actual values and instead say **“performance data unavailable”** (wording approximate). | Inspect the shared performance-summary component, separate or combined counts requests, backend aggregation, query/date/odds-band identities, request races, mount/unmount behavior and refresh paths. Ensure the cards display correct period counts reliably without blocking the list or clearing valid counts for a compatible cohort. |
| **Slip share** | Sharing a Best Slip sometimes succeeds and sometimes fails. | Trace public slip resolution, sharing endpoint, preview/image generation, browser share/download and native bridge. Make failure messages actionable and offer a safe, reliable fallback. |
| **Login** `/en/account` | Form loads, but a sign-in attempt returns **“Account access is unavailable. Try again later.”** | Distinguish real service/network issues from credential errors, throttling and session failures; fix the underlying failure while keeping authentication protections. |
| **Admin → Users** `/admin/users` | The user directory sometimes fails when Refresh is used. | Trace authorized directory requests, server data access, count/pagination/refresh and stale request handling; retain existing rows and selected record on temporary failure. |
| **Control examples** | Privacy and the initial Slip Builder settings page loaded normally, while data-dependent pages failed intermittently. | Use this as a clue, not proof that the database alone is responsible. Compare full-document, static/SSR and API-driven paths. |
| **PageSpeed Insights audit** | A mobile browser run of Google PageSpeed Insights for **`https://goalhint.com/`** returned **“Unable to resolve https://goalhint.com/. Try checking the URL for validity.”** instead of scores. | Treat this as an **audit/reachability failure, not a Lighthouse performance score**. Examine canonical URL and redirects, external DNS A/AAAA resolution, HTTPS/TLS, IPv4/IPv6, CDN/WAF/firewall/bot treatment and external HTTP 5xx/timeouts. Make the public URL reliably auditable without weakening necessary security controls. |

**Key expectation:** An ordinary user should not need repeated manual reloads to access the main product. An actual offline or server outage cannot be made to disappear; when recovery is impossible, the product must show a truthful, usable state and automatically recover where safe.

## 3. Existing behavior that must be inspected, not reinvented

Repository documentation as supplied on **28 November 2026** describes the following. **Verify every item against actual code before acting.**

- **Shared performance summaries** appear above Matches and Best Slips, showing Won, Pending, Lost and Others on compact screens (six original cards on desktop). Their values are for the applied reporting period/cohort **before an outcome filter or pagination**; Others groups Void and Cancelled. The counts must not become unrelated to the active date/odds-band filters when navigating or refreshing. See `next-js/src/components/performance/performance-summary.tsx`, `next-js/src/server/matches/feed-performance.ts` and relevant Matches/Best Slips summary assembly code.
- **Matches** shows bounded result pages (typically **50 fixtures** each), search/filters, period counts, URL-addressable pages, stored projections, visible-page polling and an in-page retry. The broad standalone Matches API defaults to a **30-day** window; a production probe recorded HTTP **503** on 27 November, whereas a bounded **Today** request returned HTTP **200** on 28 November.
- **Best Slips** uses `GET /api/best-slips`, a browse hook, an accepted-result window, **20-slip** Show More batches, archive cursors, one interactive request per query change, request cancellation, approximately **30-second** request deadline and visible-page refresh checks. It must protect sealed publications and respect member access.
- **Login** uses `POST /api/account/login`, with `/api/account/sign-in` as a compatibility alias; session information is fetched through `/api/account/session`. Documented HTTP semantics include 400, 401, 403, 409, 429 and 503; rate limits and credential protection must remain enforced.
- **Admin → Users** uses `/api/admin/users`, authenticated server-side filtering/counting, bounded pages of up to **100**, a Refresh action and a selected-account workspace. Existing successful refresh should replace accepted rows without losing selection.
- **Navigation/offline recovery** has a persistent app shell, a service worker/connection page and a documented **15-second document header timeout**. The Matches in-page read is documented as allowing up to **40 seconds**; earlier changes already attempted to preserve content and retry. Do not blindly increase these values: investigate whether the timeout, server load, response streaming or service worker produces a false connection failure.
- **Share** uses a stored slip identity/public date-and-rank link, a server share handler and image/export handling; the browser may not support native sharing. Never expose unreleased picks through an alternate share route.

**Useful source entry points** (confirm paths and follow actual imports):

- Matches: `next-js/src/app/_components/feed-surface.tsx`, `next-js/src/server/matches/public-feed.ts`, `next-js/src/server/matches/feed-performance.ts`, `next-js/src/server/intelligence/november-replay-store.ts`, `next-js/src/components/match/use-live-feed-search.ts`, `next-js/src/components/match/use-feed-pagination.ts`.
- Best Slips: `next-js/src/app/_components/best-slips-route.tsx`, `next-js/src/components/slips/use-best-slips-browse.ts`, `next-js/src/server/slips/best-slips-http.ts`, `next-js/src/server/slips/published-slips.ts`, `next-js/src/domain/slip-browse-window.ts`.
- Sharing: `next-js/src/server/slips/shared-slips-http.ts`, shared slip-card/share UI, and `next-js/docs/slip-sharing.md`.
- Auth: `next-js/src/components/members/account-auth-form.tsx`, `next-js/src/server/members/member-auth-http.ts`, `next-js/src/server/members/member-auth.ts`, `next-js/src/server/members/member-sessions.ts`, `next-js/src/server/members/rate-limit.ts`.
- Users: `next-js/src/components/admin/user-workspace.tsx`, `next-js/src/server/admin/user-workspace.ts`, `next-js/src/server/admin/user-directory.ts`, `next-js/src/server/admin/users-http.ts`.
- Navigation/recovery: `next-js/src/app/[locale]/(app-navigation)/layout.tsx`, `next-js/src/components/navigation/navigation-progress.tsx`, `next-js/src/components/offline/offline-view.tsx`, `next-js/public/offline-worker.js`, `next-js/docs/offline-startup.md`, `next-js/src/components/admin/use-admin-refresh.ts`.
- Evidence: `next-js/docs/reports/ui-performance-2026-11-27.md`, `next-js/docs/match-feed-api.md`, `implementation-docs/deployment-and-version-control.md`, `implementation-docs/markets-and-display.md`, `implementation-docs/automatic-slips.md`, `implementation-docs/ui-implementation.md`, and the corresponding focused browser/unit/integration tests.
- External audit: Google PageSpeed Insights / Lighthouse and public DNS/HTTPS diagnostics (if accessible). Confirm actual URL and probe results; never infer scores from an unavailable audit.

## 4. Required execution sequence

### Phase A — Establish an evidence-based baseline

1. Inventory **every request involved in the named flows**: HTML/RSC render, client API fetch, shared performance-count fetch/aggregation, authenticated session check, SQL, cache, polling, service worker, share/export and related assets. Draw the request/dependency chain for each symptom.
2. Reproduce each failure **where possible** with repeatable tests and representative data volumes. Do not rely solely on an empty local/staging database: a production-sized cohort is essential for the 1,080-match day and the documented broad Matches 503. Use safe, synthetic or read-only data when appropriate.
3. Measure initial document/header time, first meaningful display, first correct summary-card values, first successful data response, request count, payload size, request concurrency, 4xx/5xx rate, API p50/p95/p99 durations, timeouts and browser errors. Check both first visit and return navigation.
4. Add or leverage privacy-safe correlated request IDs and structured timing/error logs spanning browser request, route handler, server service and database. **No passwords, raw session tokens, payment secrets or private personal details in logs.**
5. Inspect backend pressure: MariaDB/Prisma query plans (`EXPLAIN` where safe), indexes, expensive counts, joins/replay evaluation, N+1 reads, missing bounds, locks, connection-pool exhaustion, CPU/memory saturation, concurrent scheduled jobs, server/proxy timeouts and worker competition. Distinguish measured causes from hypotheses.
6. Investigate why a successful Matches page later becomes a full document failure: Next.js streaming/server components, client-route boundaries, prefetch, navigation, service worker response interception/cache/versioning, hydration/runtime crashes and any stale build assets. Check whether the **15-second** document timeout replaces an otherwise recoverable slow response.
7. Run independent public-site reachability and web-performance diagnostics **if permitted by the environment**. Verify public DNS and canonical redirects for both `https://goalhint.com/` and locale pages, TLS, external IPv4/IPv6, HTTP statuses and WAF behavior. Attempt mobile and desktop PageSpeed Insights on the public URL and key public routes; if the remote service still reports **“Unable to resolve”**, capture and classify that failure without fabricating scores. Use local Lighthouse/lab analysis only as a clearly labeled fallback, not as proof PageSpeed Insights works.
8. Benchmark total transfer bytes and JavaScript bundles, critical request waterfalls, client hydration time, browser main-thread/long tasks and Core Web Vitals where evidence exists (**LCP, INP, CLS**), plus lab indicators such as **TTFB, FCP, TBT**. Separate field measurements from simulated/lab scores and public vs logged-in pages.
9. Write a concise **root-cause table**: symptom → evidence → cause/confidence → code path → proposed fix → regression test. If a cause is unverified, label it unverified; do not claim it is solved.

### Phase B — Implement confirmed fixes

**Matches and shared backend reads**

- Eliminate proven hot queries and request amplification. Optimize indexed filtering/counting and bounded paging; avoid loading an entire date range or full prediction history merely to display the first batch. Consider safe projection/precomputation only where correctness and freshness can be maintained.
- Preserve period totals, outcome semantics, access restrictions, replay/sealed prediction evidence, deterministic sorting, query URLs and Show More behavior. No fake counts or silently omitted fixtures.
- Keep initial page rendering independent of unrelated slow work where feasible. Stream or progressively reveal meaningful content when appropriate, avoiding layout thrash and duplicate fetches. Avoid expensive work on each render/hydration.
- Audit 30-day/default queries separately from Today and other bounded-date requests. Correct the **real cause** of the documented broad-query 503 rather than restricting users to Today without explanation.

**Shared performance cards (Matches and Best Slips)**

- Reproduce the exact user journey: load Matches until its cards and rows are populated → navigate to Best Slips → return to Matches → switch dates, odds bands and filters → repeat while requests are slow, cancelled, failed or resolved out of order. Include history/back and visibility restoration.
- Trace the shared `PerformanceSummary` source, counts endpoint/aggregation and hooks/state identity. Determine whether the failure comes from a separate statistics read, overly expensive count queries, hydration/route remounts, cached responses, premature clearing, request cancellation/races or mismatched period keys. **Do not assume the list and summary share one fetch.**
- Where list and counts are independently fetched, decouple failure boundaries; a failed stats request must not destroy successfully loaded list content, nor should healthy list content falsely imply valid counts. Preserve last **verified** counts only for the same reporting cohort/viewer, mark stale if appropriate and revalidate safely; do not show numbers from a different date, band, access context or filter scope.
- Preserve Won/Pending/Lost/Others semantics, percentages, full-period totals before outcome filtering/pagination, responsive card count and layout, colors and typography. Do not replace genuine zero values with an unavailable state. Include explicit tests for valid zero, missing data, transient 503, changing filters and stale late arrivals.

**Best Slips and share**

- Fix failed filtered reads, response serialization, oversized queries, session/access dependencies, timed-out calls or request races found by measurement.
- Preserve accepted slips and summary while refreshing compatible data; ensure correct handling of zero results versus unavailable service. Never show an empty archive as a successful result when the read failed.
- Respect published rank, date, odds band, sealed picks, visibility/access, pagination/cursors and history restoration. Keep passive polling bounded and quiet; suspend appropriately on hidden/offline tabs and errors.
- Make share/export reliable on mobile Chrome and the Flutter host. Handle preview-render failure, unsupported `navigator.share`, cancelled sharing, image generation errors and large/cross-origin assets. Offer **copy public link** or approved download/manual-share fallback where authorized; never loosen privacy to make sharing work.

**Login and Admin Users**

- Find and repair service availability failures along the actual authentication path. Preserve rate limits, one-request-at-a-time login, generic invalid-credential messaging, host-only secure cookies and server-side checks. **Do not auto-replay login POSTs** after ambiguous errors; doing so could multiply attempts or confuse session state.
- Distinguish `401` credential failure, `429` retry-after, genuine network failure and `503` dependency outage in the UI without leaking account existence or secrets. A successful response must establish a valid session and correct authorized redirect.
- For Users Refresh, fix heavy directory/count reads or session/network issues and stale-response races. Keep previously accepted data, selected account/tab and filter state while a transient refresh fails. Never cache or expose one administrator's private data to a different viewer.

**Lightweight page delivery and external PageSpeed audit**

- Preserve the **same visual design, spacing, typography, card order, controls, themes and interactions**. Do not pursue a better score by hiding cards, reducing usable functionality, removing data fields, breaking SEO/accessibility, deferring critical information indefinitely or changing the app's look and feel.
- Measurably reduce unnecessary JavaScript, render/hydration work, redundant fetches, oversized API payloads, duplicated image/font requests and layout reflows. Inspect route-level imports and client-component boundaries; prefer existing Next.js platform features (server rendering/streaming where correct, selective dynamic imports, stable component identity, efficient memoization, browser caching of **public static assets only**) based on profiling.
- Investigate why Google PageSpeed Insights could not resolve the public root URL. Fix a **confirmed** DNS/HTTPS/redirect/IPv6/CDN/WAF/reachability issue if within the code/infrastructure change scope; otherwise provide exact evidence and a safe operator action list. Do not alter public DNS, production CDN, firewall or provider configuration without authorization; no disabling of core security merely to satisfy a synthetic crawler.
- Re-run audits on mobile and desktop for the canonical home and representative public routes. Compare **before/after evidence** for LCP, INP, CLS, TTFB, bundle/transfer size, request count, important waterfall blockers, API speed, and real functional success; distinguish PSI/field data from local Lighthouse/lab data. If remote audit is unavailable, document that clearly and still provide reproducible diagnostics.

**Navigation, caching, recovery and low-bandwidth behavior**

- Separate **offline**, **transient network failure**, **server unavailable (502/503/504)**, **auth expiration**, **rate-limit** and **render/runtime failure** paths. Show accurate messages and an actionable retry at the correct boundary; do not blame connectivity when a verified server failure occurred.
- Preserve already confirmed, authorized, query-compatible content on re-fetch and back navigation. Protect against cross-user stale content, expired entitlements and outdated live scores. Clearly label any intentionally shown last-known data as potentially stale; request fresh data when connection resumes.
- Use bounded retries with backoff/jitter for **safe idempotent reads** when justified. Deduplicate concurrent reads, cancel obsolete queries, avoid retry storms, respect `Retry-After` and do not retry security/validation errors. Avoid auto-retrying mutations (login, payment, account actions, share writes where applicable) without proven idempotency.
- Audit service-worker installation, scope, navigation fetch handling, version transitions, 15-second timeout and fallback page. Keep the correct original URL/query for retries, and avoid trapping the browser on a recovery page after network restoration. Any cached assets must be correctly versioned; do not offline-cache protected APIs, subscriptions, private user data or payment information.
- Minimize over-fetch, unnecessary JSON payloads, blocking media/fonts and full component remounts. Retain the persistent navigation chrome and show purposeful loading feedback using existing shared components and theme tokens.

### Phase C — Verify under realistic conditions

Test **before and after** on the same datasets and conditions. Include:

1. Cold open, reload, navigation away and back, history back/forward, page restoration, tab hide/resume and connection loss/recovery for Matches, Best Slips and Account.
2. Matches on a **large observed-sized day (~1,080 entries)**, an ordinary small day, a date range/default 30-day API request, searches/filters, rapid filter changes, Show More and live-status refresh.
3. Best Slips with populated/empty archives, filters, outcome counts, page/cursor continuation, passive polling, access changes and authenticated/guest views. Explicitly check correct summary-card values when moving Matches → Best Slips → Matches multiple times, and test zero counts vs failed counts.
4. Sign-in success, invalid credentials, 429 rate limit, temporary DB outage/503, request timeout and session persistence. Use **synthetic accounts only**.
5. Users directory Refresh, selected-account retention, Show More, slow request, 503 and unauthorized/expired-owner access; test with representative large member datasets.
6. Slip share image/link/download with native share present/absent, cancellation, network interruption and authorized/unauthorized links.
7. Browser and app-shell recovery in **Android Chrome** and the embedded **Flutter WebView** where environment permits; also desktop Chrome and both light/dark themes.
8. Network profiles including normal Wi-Fi, **~5 Mbps mobile throughput**, elevated round-trip latency, variable jitter, packet loss, temporary offline and slow/stalled responses. Include a backend-load case; 5 Mbps alone is not a complete network test.
9. Remote PageSpeed Insights reachability from an external client for `https://goalhint.com/` and representative locale routes, plus mobile/desktop Lighthouse or equivalent lab runs and public DNS/TLS/redirect checks. Record missing remote results explicitly instead of claiming a score. Validate no visual design drift in light/dark and compact/desktop screenshots or DOM checks.
10. Concurrent requests from several viewers, repeated attempts (e.g., 20–50 cold/reload/back-nav cycles where practical), and safe worker overlap to detect intermittent failure rather than only a one-time pass.
11. Security regression checks: private data never appears in guest caches; access changes take effect; login and admin guards work; pagination never duplicates/loses records; no incorrect live or financial values result from recovery logic.

**Performance acceptance:** Establish baseline and post-fix **p50/p95**, failure rate and measured first meaningful content **and first correct performance-card values** for every affected flow. Record page-weight and verified PageSpeed/Lighthouse metrics separately. Aim for useful initial content within **~3 seconds on healthy infrastructure and an ordinary 5 Mbps mobile profile**, with further data progressively available; treat this as a **target to measure**, not a guarantee under all network/backend conditions. No unexplained 503 on representative healthy load, no unhandled browser blank/black screen in covered navigation tests, and no misleading connection message for a known server error. If the goal is not met, report measured limitations and follow-up actions explicitly.

## 5. Non-negotiable constraints

- **Do not change the prediction engine**, betting/market semantics, slip publication algorithm, archived sealed selections, odds, ranking, access/subscription rules or billing logic as a shortcut to faster queries.
- **Do not hide failures** by returning false success, incomplete rows, fake empty results, stale values without labels, or endless spinners.
- **Do not remove useful filters, results, summaries, pages, sharing options or admin actions** to lower server load. **Do not change the current look and feel** for performance score gains.
- No unbounded caching, unbounded retries, broad production queries for debugging, insecure shared caches, infinite polling or secret logging.
- Preserve `AGENTS.md` UI and documentation rules. Use existing theme tokens, radius, common control height, loading/progress conventions and accessible feedback in light/dark themes.
- Prefer minimal migrations and additive indexes backed by `EXPLAIN`/measurements; avoid destructive database operations. Preserve deployment compatibility and existing server environment boundaries.
- Keep current web and native behaviors aligned and avoid adding Flutter business logic.

## 6. Deliverables — required in the coding agent's final response

1. **Root-cause and evidence report** for every reported symptom, **including performance-summary cards and the PageSpeed URL-resolution failure**, distinguishing confirmed fixes, plausible causes and unresolved environment-only concerns. Include timings, status codes, query/route findings and a short before/after table.
2. **Implemented code changes**, with a concise list of affected files and why each changed. Prioritize correctness and root-cause resolution over cosmetic handling.
3. **Automated regression tests and reproduction steps** for all relevant error paths, plus actual command outputs/results for typecheck, lint, focused tests and production build. Report failures truthfully.
4. **Network/browser validation** with platform, latency/throughput profile, data volume, repeated-run count, pass/fail and p50/p95 where feasible. Include performance-card continuity, mobile/desktop page-weight metrics, PageSpeed access/results (or documented inability) and **evidence that the visual design remains unchanged**. State which cases were **not** run.
5. **Deployment guidance**: whether a migration, cache/service-worker update, server configuration, reverse-proxy setting or restart is needed; proposed safe staged rollout and rollback checks. **Do not execute release or production changes without permission.**
6. **Documentation updates** in the same code change: revise affected `implementation-docs/` topics, `APP_OVERVIEW.md`, relevant technical reports, and a numbered `next-js/dev-plan/` entry if the repository convention requires it. Verify docs against post-change code, not assumptions.
7. A brief **remaining-risk list**, including externally controlled failures that cannot be eliminated completely.

**Definition of done:** All listed failures—including missing performance-card counts and PageSpeed inability to resolve the public site—have been investigated with evidence; confirmed causes have tested fixes; affected pages and actions remain functionally and securely correct; performance/reliability improves measurably under realistic mobile and production-sized conditions; and every limitation is explicitly documented. A generic error-page redesign or timeout increase by itself is **not** completion.

---

**End of standalone reliability task.** After completing this task, leave admin feature completion, user-workspace enhancements and payment integration/management for a **separate follow-up implementation prompt**.
