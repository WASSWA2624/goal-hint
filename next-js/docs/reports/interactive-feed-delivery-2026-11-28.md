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
