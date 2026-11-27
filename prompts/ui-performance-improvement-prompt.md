# GoalHint — Targeted UI, Loading and Performance Improvements

## Role and objective

Act as a senior Next.js/React/TypeScript engineer working in the **existing GoalHint repository**. Improve mobile usability, responsive presentation, error recovery and loading performance **without redesigning the application**. Implement only the specific changes below. Desktop changes apply only where expressly requested. In particular, preserve the existing six-card desktop performance summary exactly; the four-card change applies only at mobile widths.

**Inputs:** Read `APP_OVERVIEW.md`, the files in `implementation-docs/` (especially `ui-implementation.md`), and inspect the **actual current source code** before editing. The source and the deployed version may differ from descriptions in the documents: the checked-out source is authoritative for implementation, and the requirements in this prompt are authoritative for requested behavior. **No screenshots will be supplied to you.** The descriptions below are sufficient: do not block progress while requesting screenshots. Use GoalHint's current themes, colors, spacing tokens, fonts, icon conventions and navigation; do not imitate another application's copyrighted layout.

### Non-negotiable scope guardrails

- Keep the application header, logos, menu structure, routes and existing page layouts unchanged except for the expressly requested spacing and component changes. Preserve the desktop six-card performance layout, labels, ordering, widths, colors and individual status actions exactly as they are.
- Preserve existing match cards, slip cards, search bar, filters, date navigation behavior, access controls/paywalls, subscriptions, payments, prediction logic, odds, settlement, data fetching schedules, live status updates and admin permissions.
- Reuse and improve existing components; **do not create parallel implementations or replace the design system**. Do not change database schemas, API response formats or deployment behavior unless demonstrably necessary; explain any required exception.
- Maintain mobile and desktop support, light/dark themes, accessibility, browser history, filter state and back-navigation. Don't treat loading/error states as a reason to blank existing valid content.
- Do not claim performance gains without measurements. No placeholder content, fabricated metrics or speculative status labels.

## 1. FIRST: Audit and optimize performance safely

Before changing visual UI, inspect and **measure** initial load and common interactions on Matches (`/en/matches`, the homepage), Best Slips (`/en/best-slips`), Builder (`/en/slips`) and other screens using shared components. Assess mobile first, then desktop. Capture baseline and after-change figures where reproducible for: startup/first meaningful content, LCP, INP, CLS, JavaScript/route payload size, avoidable renders, list append latency, API timing and visible responsiveness under slow mobile connections.

Prioritize targeted, low-risk improvements: unnecessary rerenders, overly broad component subscriptions, duplicate fetches, expensive calculations during render, repeated image processing, nonessential JavaScript loaded before use, inefficient large lists, and costly server reads. Review existing SSR, caching, polling, data stores, structural sharing and request cancellation **before** introducing new patterns. The project already uses scoped Redux/state caches, server rendering, passive refresh and a shared progress bar: preserve these mechanisms. Consider safe list windowing only if measured necessary and if it does not break scroll anchoring, item accessibility or live updates. Avoid caching private or paywalled responses where not authorized.

**Important known area to investigate:** documentation records slow full-range Matches feed responses. Measure the current issue before changing any defaults, filters, query semantics or backend behavior. Improve measured bottlenecks only; document what changed and why. Keep visible confirmed results during background refreshes and filter transitions.

## 2. Shared performance cards — Matches and Best Slips (mobile only for card reduction)

The existing shared performance summary displays six cards. **Apply a responsive, presentation-only change:**

- **Desktop (unchanged):** Keep **all six existing performance cards** exactly as currently implemented, including their original labels, ordering, widths, colors, spacing, individual filters and percentages. Do **not** remove, merge, resize or reorder them on desktop. Any slight adjustment to the performance-heading top margin requested below is allowed, but not a redesign of the six-card row.
- **Mobile:** Display **exactly four cards on a single horizontal row**, in this exact order:

  **Won → Pending → Lost → Others**

- On mobile, use **equal-width cards** where feasible, compact gaps and padding, and legible responsive numbers and labels. Keep all four visible on one row even at 320px; do not wrap or introduce horizontal scrolling.
- **Won** covers settled wins; **Lost** covers settled losses. **Pending** covers upcoming, in-play, delayed and unresolved items as defined by the existing domain. **Others** combines **Void + Cancelled** for the mobile presentation and list filter only. The desktop interface continues to display Void and Cancelled as separate cards. Preserve underlying individual statuses and records everywhere, including admin screens. Do not silently group Unavailable or unrelated statuses into Others.
- The existing **All** card remains visible and functional **on desktop**. Hide it **on mobile only**, while retaining the full-period totals and percentage denominators internally. A selected status affects the displayed list, **not** the full-period performance counts of other cards.
- **Pending is the default selected status** for Matches and Best Slips **on both mobile and desktop**, and Reset returns to Pending. Keep existing URL/deep-link/filter behavior where a different status is explicitly specified; preserve Matches' live-first ordering within Pending.
- Slightly reduce excessive top spacing above the performance heading and date (for example, “Today's performance”) on the applicable screens without modifying the global app header. Keep desktop's six-card presentation otherwise untouched.
- Implement the responsive change **through the existing reusable component or existing shared status configuration**; do not create two divergent performance systems or change server settlement rules. Switching between mobile and desktop widths must retain sensible selected status: when returning to desktop, keep the original six filters available; if mobile Others was selected, map to the existing supported combined filter internally without altering the six desktop cards, or safely preserve the last explicit desktop status. Do not mislabel desktop Void or Cancelled as Others.

Suggested source locations from documentation: `src/components/performance/performance-summary.tsx`, `src/components/match/feed-performance-summary.tsx` and feature-specific status handlers. Verify ownership in the actual repository.

## 3. Date selection polish — Matches and Best Slips

Keep the shared date strip, arrows, calendar picker, chosen-date behavior, date ranges, filter synchronization and all handlers as implemented. **Only** improve the calendar-button appearance:

- Provide sufficient **vertical breathing room around the date numeral**; it must not touch the button's top or bottom border.
- Use a visually lighter calendar outline (approximately 1.5–2px stroke if consistent with the existing icon set), aligned with the numeral.
- Maintain tap-target size, focus indication, icon clarity and color contrast in both themes. Do not enlarge the entire control row unnecessarily.

The relevant reusable controls are documented near `src/components/match/feed-dates.tsx`; confirm before editing.

## 4. Best Slips mobile results summary

On **mobile only**, simplify the verbose summary near the results. Show:

- the **currently selected date or date range**; and
- **Odds Range: [active band]**, such as `Odds Range: 2.50–5.00`.

Remove redundant summary text such as the repeated status **Pending**, “All” category, “Total slips published” and “1–20 of 26 slips” (or equivalent visible-record ranges). Keep those values internally where needed for querying, filtering and metrics. The active status remains discoverable from the selected performance card, not a second heading. Keep existing slip cards and date controls unchanged.

Preserve all six existing, selectable odds bands and display the actual active choice accurately: **2.50–5.00, 5.00–10.00, 10.00–20.00, 20.00–50.00, 50.00–100.00, 100.00–200.00**. Preserve existing filters and their state on date changes according to current rules. Do not change the desktop summary beyond changes required by shared components.

## 5. Replace numbered pagination with a reusable “Show More” control — app-wide

Inventory all front-end **list browsing** surfaces currently using numbered pagination, including Matches, Best Slips, Builder result lists, Performance, member/account records and administrative list views. Replace the **visible numbered page-navigation control** with a centered, lightweight **Show More** button featuring a downward arrow, styled using GoalHint's own theme. Preserve the existing server-side page/offset/cursor contracts where possible; this is primarily a user-interface improvement, not a request to fetch all data at once.

**Required interaction:**

1. Show the existing initial page size (Matches currently supports up to **50** fixtures; preserve each other list's established page size).
2. Show **Show More** directly below the displayed items **only if more items exist**. Keep the control compact and clearly tappable on mobile and usable by keyboard on desktop.
3. On click, fetch the next bounded batch **asynchronously**, then **append** it beneath existing items rather than replacing them. The control remains below the **growing list** and moves downward as new items render.
4. Show a subtle, local spinner/“Loading…” state **inside the control only** while fetching. The rest of the screen, previous items, navigation and scrolling remain fully usable. Do not use a full-screen overlay, global blocking spinner, page reload, forced scroll or focus jump.
5. Render additional items as soon as **complete, valid batches are available**. If the existing API returns a whole page as one response, append that page immediately when received; do **not** invent row-by-row streaming or wait to collect hundreds/thousands of records. Smaller sequential batches are preferable to huge requests. Use actual streaming only if already supported and demonstrably beneficial.
6. Prevent duplicate simultaneous requests; preserve stable item keys, correct ordering, filters, sort, access rights, and current scroll location. Handle filter/date/search changes by cancelling or ignoring stale in-flight responses, resetting the loaded cohort safely and never mixing old/new results. Maintain coherent browser Back/Forward and URL behavior.
7. On failure, keep existing results and provide an **inline retry**. On exhaustion, hide Show More (or show a restrained end-of-results indication). Never silently drop items or duplicate rows.
8. Respect the semantics of each list: admin bulk selection must operate only on explicitly indicated/loaded records, never unexpectedly on unloaded records; maintain selected detail pane, action state and permissions. Preserve indexed archive URLs/canonicals and deep links even if the **visual** pager changes.

Use or refactor the existing shared component `src/components/ui/numbered-pagination.tsx` and feature hooks as appropriate, rather than building an unrelated control separately on every screen. If a specialized workflow requires retaining an underlying page concept, preserve it internally and explain any unavoidable visible exception.

**Interaction example:** a visitor sees 50 matches, scrolls to the bottom, taps **Show More**, can immediately scroll upward or downward while the next set loads, sees the newly appended matches without the screen jumping, and can tap Show More again when appropriate. No automatic endless loading is required.

## 6. Improve connection/unavailable-page experience — mobile **and** desktop

There is an existing minimal offline/failure screen shown when a requested page cannot be served. The current mobile screen has the GoalHint wordmark at the top, a small disconnected icon, “Couldn't load this page,” a one-sentence connection hint and a blue **Try again** button, with excessive empty space and weak alignment. **No screenshot is supplied; use this description.** Rework this **existing** fallback into a polished, restrained, accessible interface:

- Preserve GoalHint branding, the current page/URL on retry, the existing fallback service worker, offline asset availability and both themes.
- Create a cohesive message area with a clean, thin-line context icon, a clear heading, 1–2 short helpful sentences and a prominent **Try again** action. Align icons, text and button; use consistent spacing, reasonable line width and existing brand colors/radii. Avoid giant artwork, clutter, external image dependencies, unnecessary animation or excessive blank space.
- **Mobile:** maintain comfortable side padding and a naturally balanced message position beneath the branded header; support small screens, text zoom and safe areas.
- **Desktop:** present the same content centered elegantly in the available viewport, with a **constrained maximum width**, not a tiny element stranded at the left or a stretched full-width message. Keep the existing header intact.
- Use accurate, actionable copy according to **verified** failure information. Examples:
  - **No internet / confirmed offline:** **“You're offline”** — “Check your Wi-Fi or mobile data connection, then try again.”
  - **Confirmed server unavailable (e.g., 503):** **“GoalHint is temporarily unavailable”** — “We couldn't reach the service right now. Please try again shortly.”
  - **Unknown timeout or connection failure:** **“Couldn't load this page”** — “Check your connection and try again. If the problem continues, please try again later.”
- Do not claim the user's internet is down merely because a request timed out: a server failure and a network failure are different. Prefer the neutral message when the cause is unknown. Do not fabricate live server-health detection.
- Keep the single primary **Try again** button functional. A secondary action is optional **only if it actually works** in the target web/Flutter host; do not offer a fake “Open network settings” control in a browser. Short guidance text is preferable.
- Retry the **original URL including relevant query parameters**, with accessible progress and double-tap protection. Where safe, attempt a **bounded automatic recovery** on a genuine connectivity-restored event, avoiding retry loops, repeated mutations or unexpected loss of forms. Never replay payment or other non-idempotent submissions automatically.
- Ensure the offline fallback page and critical styles/icons can render **without network access**. Preserve the service worker's current strict caching scope; do not cache private responses or introduce a general-purpose offline copy of matches/slips.

Documentation identifies `src/components/offline/offline-view.tsx` and `public/offline-worker.js`. Update the existing implementation, not a separate unrelated error page. Test both offline network failure and reachable-network/server-error conditions where the failure category is observable.

## 7. Acceptance tests and delivery

After implementation, verify at minimum:

- 320px, 360px, 390px, tablet and desktop widths; light/dark themes; no horizontal overflow; keyboard focus, screen-reader labels, reduced-motion and touch targets.
- **Mobile:** four equal-width cards on one line in Won → Pending → Lost → Others order, with combined Others filtering; **desktop:** all six original cards and original ordering/layout/actions unchanged. Check accurate full-period counts/percentages, Pending default/reset on both sizes, and distinct underlying Void/Cancelled records.
- Shared date picker opens/applies exactly as before, with visibly improved icon weight and numeral padding.
- Mobile Slips shows only the selected date/range and active Odds Range in its compact summary; all six bands still work.
- Show More across every audited list: append, no duplicates/missing rows, no scroll jumps, quick repeat clicks, empty list, last batch, slow network, failed request and retry, search/filter/date changes during loading, browser Back/Forward, live status updates, admin bulk actions and permissions.
- Offline fallback works with **no connection at all**; server failure is not mislabeled as definite offline; Try Again restores the original route and filters; mobile and desktop have balanced layouts; no automatic payment/request replay.
- The app still passes existing lint/type/build/test suites and applicable feature/UI tests. Record the baseline and final performance measurements; state improvements and any tradeoffs factually.

**Final deliverable:** implement the changes, report changed files and why, summarize tests with pass/fail results, provide before/after performance metrics where measured, and explicitly identify any scope exception or unresolved risk. **Do not modify anything that was not requested.**
