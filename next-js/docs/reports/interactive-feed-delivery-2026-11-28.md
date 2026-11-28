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

## Follow-up for live data changes

The reported production failures included a visible list with unavailable Matches counts, a blank content panel during navigation, a stalled second Matches append, and a Best Slips append with inline retry. The production access-log window around the report contained 81 successful summary API responses and four successful Best Slips second-page responses. These statuses only establish server delivery. In an independent throttled mobile run, Matches showed 50 rows after 6.85 seconds, showed ready counts after 14.46 seconds, and the first scripted continuation failed to increase the rows within 35 seconds.

Matches now renders the controls during the initial read, begins the summary earlier on the homepage and accepts a newer audit for the exact public cohort after checking the viewer. The API counts response does not wait for the optional generation-checked cache write. Next-page requests check the displayed fixture prefix and hydrate only the new rows if it still matches. In a populated browser fixture, both themes loaded all 293 Matches over five appends. The third page recovered from a 503, the fourth rebased after a 409, and a manual retry recovered from two interrupted connections without hiding the 200 accepted rows.

The archive can return up to three numbered Best Slips pages from one current snapshot when an outcome changes between clicks. For unchanged membership, it transfers only the requested next page. An isolated MySQL test confirmed current counts and guest redaction through shrink and continuation. Across 60 paired warm reads, a 100-revision stored forecast workload reduced p50/p95/p99 from 503/771/1,833 ms to 55/109/217 ms with equal results. Warm reads checked the current evidence seals and omitted about 790 KB of raw forecast and market bodies. Changed metadata and altered evidence did not qualify.

A separate owned MySQL workload used 50 historical fixtures, 3,600 snapshots and 13 receipts. Across 18 alternating reads per variant, the sealed path returned the same odds and reduced returned evidence from 7.50 MB to 2.66 MB. Median latency was similar at 2.60–2.62 seconds. The slowest sample fell from 13.32 to 5.55 seconds in that run. These are isolated data-path results. [Next.js response lifecycle](https://nextjs.org/docs/app/api-reference/functions/after)

### Follow-up staging

The checksummed package for `fe3a3f6e` serves Next build `mzekNoNtqE71MmomQYtGb`, with ZIP SHA-256 `b5a9c33e71412e6c68c136c34e18b68f76f9f2fca60087deb56d317bc3abe086`. Staging transferred 4,278,263 bytes for 553 changed or added files. The HTTPS smoke, 95-migration check and desktop and throttled mobile Chrome flows passed. The mobile fault check recovered from an injected Best Slips 503 in 940 ms. The repeated same-origin HTTP workload served all 80 requests and completion p50/p95/p99 moved from 333/426/779 ms to 340/372/746 ms. A sampled cold staged Matches summary still took about 8.3 seconds in both browser profiles.

Populated production-mode fixtures independently qualified behavior absent from the hosted staging cohort. The Matches shell and controls reached the fixture browser document in 137 ms while its deliberately delayed list arrived in 1.94 seconds. Chrome verified four theme and viewport combinations, a single summary request, legacy generation reconciliation, and two newer public count observations without a list refresh. Best Slips recovered an injected next-page failure without discarding the first 20 slips. The stable append showed 40 slips in 227–289 ms. A changed membership used one response to show 60 unique slips and the revised pending count in 357–391 ms. A separate shrink case showed the remaining 15 slips and removed the continuation control. These timings describe isolated fixture runs.

### Follow-up production

Production activated `fe3a3f6e` after the staging checks. The desktop Chrome gate passed, including two consecutive Matches appends, one available Best Slips append, ready counts and no page errors. Independent checks found matching hosted receipts, no open deployment journals and 95 required migrations on each database. Both monitoring timers were active.

| Observed desktop phase | Prior build | `fe3a3f6e` |
| --- | ---: | ---: |
| Cold Matches counts ready | 14.57 s | 11.09 s |
| Matches history rows | 0.49 s | 0.16 s |
| Matches first append, 50 to 100 | 8.73 s | 8.32 s |
| Matches second append, 100 to 150 | 15.14 s | 26.51 s |
| Best Slips in-app rows | 11.87 s | 15.60 s |
| Cold Best Slips counts ready | 8.06 s | 5.04 s |
| Best Slips first append | 2.87 s | 3.93 s |

These are individual flows with changing live data. In the slow desktop append, Apache recorded a rejected page-three prefix after the pending fixture order changed, then a second request for the three-page window. A separate throttled mobile run reached ready Matches counts in 10.29 seconds, down from the prior observation of 14.46 seconds. It appended 50 to 100 and 100 to 150 in 4.53 and 2.44 seconds, each in one request on an unchanged prefix.

From 20:39 to 20:49 Kampala time, Apache recorded 138 HTTP 200 summary responses. Its Matches checked-continuation and window requests recorded 11 HTTP 200 and six HTTP 409 responses. The conflict indicates a changed list prefix and establishes the frequency of the extra-read path in this sample.

### Single-request refresh after a live reorder

The follow-up request opts into rebuilding a changed Matches window of up to 300 records with the IDs already selected by the prefix check. It makes this decision within the same repeatable-read transaction. Stable membership still hydrates only the next page, and older requests retain the existing conflict response. The focused checks exercised a genuine reorder with one snapshot transaction, a stable 50-row continuation, lists shrinking to 12 and zero rows, and the oversized-window conflict. The numbered Best Slips limit also covers up to six pages within the same response byte ceiling. An application test verified a six-page authorized response with 120 unique slips and exact period counts.

In the populated production-mode fixture, Chrome verified the reordered Matches window in one request in 571–734 ms across mobile light and desktop dark. Both ran through all 293 fixtures and exercised recovery from a temporary service failure and interrupted connections. Both Best Slips profiles continued to the fourth page and checked that a shrink to 15 published slips ended pagination. All 24 owned MySQL Matches integration checks passed, including the single-request replacement and the legacy conflict response.

Hosted staging verified `fdf14c3b`, Next build `Y6oFkddSijoo97YOQCwVC`, from ZIP SHA-256 `e9c370dd374e7209b907608962cb9b98031a80bbad8ab47d4012cb1a87376e46`. The delta transferred 3,181,811 bytes for 152 files and the 95-migration inventory passed. Desktop and mobile Chrome passed. The deliberately outdated continuation returned one coherent empty page in one response against the staging cohort. Mobile Chrome separately recovered from injected 503s on Best Slips in 871 ms and Matches counts in 10.04 seconds.

The matched 80-request staging workload completed without failures. p50/p95/p99 was 334/436/509 ms in the final staging sample, compared with 340/372/746 ms in the previous staging sample.

Production then activated the identical artifact and passed the provisional desktop gate with zero page errors. An independently submitted outdated request for the populated Today All cohort returned three pages and 150 unique fixtures in a single HTTP 200. The observed completion was 7.60 seconds, including 6.26 seconds in the application. The production mobile test used 150 ms of simulated latency and a 190 KB/s downlink. Both environments' active receipts matched the ZIP and build. Each migration ledger verified all 95 required migrations, neither environment had an open deployment journal, and both monitoring timers were active.

| Observed production phase | Desktop Chrome | Throttled mobile Chrome |
| --- | ---: | ---: |
| Cold Matches counts ready | 17.09 s | 12.23 s |
| Matches first append, 50 to 100 | 11.04 s | 4.05 s |
| Matches second append, 100 to 150 | 4.63 s | 13.38 s |
| Best Slips in-app rows | 20.16 s | |
| Cold Best Slips counts ready | 6.16 s | |
| Best Slips append, 20 to 30 | 5.33 s | |

Both production profiles finished the available checks. The updated path completes bounded order changes in one request. First loads and individual appends still vary with live data and request timings.

### Initial Matches cards and Best Slips navigation

A later control run on `fdf14c3b` showed cold Matches cards at 12.93 seconds and in-app Best Slips rows at 5.62 seconds. The previous run on that same build showed 17.09 and 20.16 seconds respectively. The application traces also showed that the Matches list could spend several seconds recovering historical odds after the independent count request completed.

Matches now uses a separate streamed boundary in the homepage loading shell for the verified period audit. The settled view can reuse that response after checking the date, filters, viewer, scope and generation. A briefly older exact public audit stays visible while it revalidates. The production-mode fixture delivered counts at 175 ms and held the list until 1.90 seconds. The Chrome fixture separately verified both themes with no second aggregate request. Best Slips now commits its controls using the navigation response and requests the viewer-gated archive separately, once. Native document visits still stream the archive and retain the recovery path.
