# Matches and Best Slips interactive delivery

## Baseline

The previous candidate failed its production browser gate once while navigating to Best Slips and once while returning to Matches. A successful comparison on the restored build measured first cold Matches rows at 10.0 seconds and ready counts at 10.4 seconds. Best Slips in-app navigation committed in 147 ms and displayed 20 rows after 23.8 seconds. Matches history took 10.5 seconds to display its rows. The cold Best Slips list took 19.7 seconds. These are individual production browser observations. [Previous rollback and traces](vps-optimization-2026-11-28.md#production-trial)

Hosted staging served all 80 requests in an equal Today Matches, summary, Best Slips and guest session workload at 1.315 requests/s. Overall completion p50/p95/p99 was 327/369/481 ms. A second 64-request workload included both continuation endpoints and the Performance, Builder, Account, Help, Contact and Privacy pages. All succeeded at 1.320 requests/s, with overall p50/p95/p99 of 371/690/1,034 ms. Hosted staging has sparse data and production shares the VPS, so these workloads measure bounded route behavior.

## Changes

Matches starts its in-app route boundary independently of the stored list. A compatible guest history snapshot remains usable while stale data revalidates. The continuation cache holds complete bounded pages from one snapshot and checks source generations before reuse. The list and summary can share exact completed membership work and eliminate repeated unique-key lookups. Fixed timing phases expose odds and upcoming featured-pick overlays separately.

Best Slips starts its stored archive read while the controls reach the browser. A gated Flight seed fills the list and performance cards, with the existing browse API as recovery. The archive can reuse a bounded immutable projection of an original goal-market extension after verifying the current row seal and binding. Changed or cold evidence follows the full verifier. Performance dashboard headings and controls stay mounted while reports update, and Match Details fills optional pricing and insights after its primary content.

The shared navigation chrome can reuse its header and tabs across filter changes. Foreground reads keep the existing progress indicator and semantic busy regions. The deployment verifier checks populated rows, counts, history, recovery and available **Show More** controls without extending its deadlines. [Browser gate](../../scripts/verify-hosted-feed-browser.mjs)

## Isolated measurements

For 60 alternating warm Matches window reads with 105 records, completion p50/p95/p99 changed from 22/98/191 ms to 10/70/137 ms with equal results at both generations. The 73-call fixture sequence used two stored snapshot transactions after the change, down from 73. An owned MySQL fixture checked the 14,010-fixture cohort and passed all 28 list, summary, consistency and settlement checks. These measure the data path separately from network and browser work.

A 20-revision sealed Best Slips workload under MySQL 8.4.11 measured p50/p95/p99 of 2,552/2,882/2,882 ms across 12 complete rederivations and 107/200/275 ms across 100 warm reads. The pairs returned equal projections. About 2.07 MB of extension bodies per read were omitted on a verified hit. The database still verifies every current body seal. A corruption check rejected an invalid warm row. The production archive sample held 93 slips and 451 original revisions for the current date, with a goal extension present for every revision. That count describes available evidence and does not establish each leg's market or production latency.

The populated browser fixture exercised light and dark themes. A light mobile Best Slips visit displayed controls in 612 ms and verified rows and period counts in 2.25 seconds with an intentionally delayed 1.8-second archive. Its initial data arrived without a browse GET. With an unavailable Flight seed and an injected API 503, the desktop dark case recovered after an explicit retry. Best Slips appended 20 to 25 unique rows in 228–282 ms under the fixture's held-request checks. Matches kept 50 ready rows during matching guest history revalidation and appended to 55 unique rows in 474–691 ms. Restoring a saved two-page Matches view sent one request for the verified window.

The production monitor recorded a separate forecast refresh backlog with repeated handler retries while host CPU and memory retained headroom. The application uses the existing Passenger processes and job runner. These measurements favor reducing repeated web reads and validation work.

## Hosted staging

Staging activated commit `0588238e` and Next build `tPzLJ1CF6-qMgsifX6IwN` from ZIP SHA-256 `d39da2f0f2d15aa69fe4483cc4c11796c5f41cd6c1888b441dcf7445c2d896cc`. The incremental release transferred 3,579,092 bytes for 240 files and verified all 95 MariaDB migrations. The HTTPS smoke and desktop Chrome gate passed. On mobile with simulated latency, Chrome dismissed the community invitation and recovered from an injected Best Slips 503 in 1.12 seconds. Both runs reported zero page errors.

| Browser phase | Desktop list / counts | Mobile with simulated latency list / counts |
| --- | ---: | ---: |
| Cold Matches | 2,350 / 5,008 ms | 2,349 / 5,672 ms |
| Best Slips in-app | 1,162 / 1,171 ms | 1,306 / 1,314 ms |
| Matches history | 81 / 381 ms | 179 / 592 ms |
| Cold Best Slips | 546 / 625 ms | 673 / 803 ms |

Best Slips navigation committed after 77 ms on desktop and 157 ms on mobile. Hosted staging verified its expected limited fixture and odds states. Populated browser fixtures supplied the two continuation and real-count checks.

The repeated feed workload served all 80 requests at 1.321 requests/s. Completion p50/p95/p99 was 331/351/356 ms. The broader workload served all 64 requests at 1.267 requests/s with p50/p95/p99 of 402/802/1,931 ms. Its longest response was one Account request. Performance page completion stayed below 780 ms for its eight measured requests, down from the baseline maximum of 1,034 ms. The small broader sample shows different tail behavior across routes.

Chrome opened Performance, Builder, Account, Help, Contact and Privacy on the candidate in desktop light and mobile dark. The selected primary content or controls became visible in 0.62–2.14 seconds across the 12 visits. The checks also confirmed the released build and absence of uncaught page errors.

## Production

Production promoted the same archive from `d291c0c4` with Chrome verification and automatic rollback available during the cutover. The incremental release transferred 3,618,541 bytes for 245 files. Chrome verified populated lists, coherent counts, history, both **Show More** controls, and the release build with zero page errors. The receiver committed the promotion. Independent VPS verification found matching staging and production receipts, no pending release journal, and all 95 required migrations in both ledgers.

| Browser phase | List | Counts |
| --- | ---: | ---: |
| Cold Matches | 6,411 ms | 10,593 ms |
| Best Slips in-app | 7,291 ms | 7,334 ms |
| Matches history | 166 ms | 1,058 ms |
| Cold Best Slips | 7,847 ms | 8,067 ms |
| Matches Show More | 8,492 ms (50 to 100 unique rows) | |
| Best Slips Show More | 5,906 ms (20 to 38 unique rows) | |

The production comparison contains one complete browser flow per build. Matches history rows improved from 10.5 seconds to 166 ms and Best Slips in-app rows from 23.8 seconds to 7.3 seconds. Cold Matches counts were roughly unchanged at 10.4–10.6 seconds. Recent application timing samples measured Matches odds work around 2.6–3.3 seconds and Best Slips archive forecast evidence around 1.4–5.4 seconds on individual requests. These reads still limit full readiness. Both monitoring timers were active after promotion.
