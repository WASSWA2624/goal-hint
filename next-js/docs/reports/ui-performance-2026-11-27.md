# GoalHint UI and connection performance

The baseline is development commit `714c44c9`. The browser used Chromium with three cold contexts per route. The 390px profile used 4× CPU slowdown, 150 ms network latency, 200,000 bytes per second download and 100,000 bytes per second upload. The 1440px profile ran without throttling. Routes came from the existing isolated production UI fixture and used synthetic rows. First visible content is the relevant route region observed at the next two animation frames. Script size counts same-origin encoded JavaScript response bodies. These are local lab measurements. Browser event timing does not establish field INP.

## Baseline

| Route | Mobile first content / LCP | Desktop first content / LCP | JavaScript transfer |
| --- | ---: | ---: | ---: |
| Matches | 1,664 / 1,256 ms | 441 / 432 ms | 422,207 B |
| Best Slips | 1,033 / 992 ms | 219 / 236 ms | 411,133 B |
| Builder generated results | 1,442 / 1,116 ms | 296 / 316 ms | 398,966 B |
| Performance | 996 / 1,104 ms | 255 / 284 ms | 373,702 B |

The numbered Matches page change took 5.23 seconds on throttled mobile and 154 ms on desktop, measured from click to the first paint after the returned page became visible. The sampled click interaction durations were 2,376 ms and 56 ms respectively. Mobile CLS medians were below 0.001 across the four routes. The desktop Builder fixture had two 0.821 CLS samples and one 0.00009 sample. The variability limits conclusions about its layout shift.

## Candidate browser sample

| Route | Mobile first content / LCP | Desktop first content / LCP | JavaScript transfer |
| --- | ---: | ---: | ---: |
| Matches | 2,023 / 1,172 ms | 611 / 620 ms | 421,046 B |
| Best Slips | 1,138 / 1,388 ms | 455 / 476 ms | 410,149 B |
| Builder generated results | 1,803 / 1,380 ms | 521 / 532 ms | 395,701 B |
| Performance | 1,181 / 1,196 ms | 549 / 588 ms | 371,562 B |

Encoded JavaScript fell by 984–3,265 bytes per tested route. Observed mobile CLS medians remained below 0.001. The candidate desktop Builder samples were all approximately 0.00009. The two startup runs took place under different host load and the candidate showed slower first visible content in all four scenarios. The measurements support the byte comparison and show mixed latency and layout outcomes.

The direct HTTP Matches fixture response fell from 645,265 to 523,294 uncompressed bytes. The initial list held 50 fixtures before the change and 37 Pending fixtures in the candidate. The warm complete-response median moved from 592 to 316 ms in that fixture. Best Slips moved from 262 to 269 ms, Builder from 232 to 326 ms and Performance from 334 to 215 ms.

## Paired Matches pagination sample

Three interleaved runs per mode and width selected All in both builds. The numbered control replaced the first 50 cards with the next five. Show More kept the 50 cards and appended those same five. Click-to-painted-batch medians were 4.48 → 3.01 seconds at 390px under mobile throttling and 409 → 423 ms at 1440px. Candidate next-batch API durations had medians of 221 ms and 13 ms. The old control used route navigation, so there was no comparable list API request. The candidate had a 13.14-second throttled outlier and a 2.35-second desktop outlier. These small samples include browser automation and are sensitive to host load.

## Hosted feed observations before the change

| Request | Status | End-to-end |
| --- | ---: | ---: |
| Production default 30-day Matches, two samples | 503, 503 | 32.87 s, 39.53 s |
| Production Today Matches, pages 1 and 2 | 200, 200 | 21.89 s, 10.49 s |
| Production Today/Pending Matches | 200 | 13.55 s |
| Staging Today/Pending Matches | 200 | 1.24 s |
| Production Best Slips API | 200 | 10.58 s |

The existing standalone Matches API keeps its 30-day default, exact filtering and bounded pages. The hosted samples included connection overhead and concurrent site activity. They establish that a long or failed read can occur while the server is reachable. They do not isolate a database operation or establish an improvement to the broad query. Staging returns a small cohort and cannot qualify populated production latency.

## Implementation

The shared Show More control replaces the numbered pager and limits loads to the next bounded batch. Existing rows keep their keys. Builder reuses rendered result cards with stable props when another slice opens. Passive Matches and finite Best Slips refreshes each read one loaded page per tick and update matching rows. A validated rebase applies changes to ordered membership. A failed Matches read can retry the applied query in place. The request has a 40-second whole-response budget and supports one quiet automatic attempt. The document-level fallback keeps its limited offline bundle and original retry URL.

## Local verification

The focused suite passed all 99 tests. Lint, the theme contract and Prisma schema validation passed. Chromium checked 24 responsive layouts across Matches and Best Slips, all six odds bands in both themes, and the original desktop card appearance. Append checks covered bounded requests, retry, stable rows, scroll, focus, history, stale-request cancellation and archive continuation. The owner rendering harness passed, including permission and review guards. Performance passed 11 rendering scenarios. Both in-page and document recovery passed fault-injected browser checks, including true disconnection, a reachable 503 and the original URL. Installed Flutter hosts were outside the browser run.

The wider JavaScript run was interrupted after recording failures. The unchanged checkout reproduced the authentication vocabulary and search metadata failures. The Python suite ran 216 tests and reported one migration test failure and one Windows listener error. The release changes contain no database migration.

## Release

Staging and production activated commit 88ea84ceaa90422a2a2a20ca2b3118b3f32d3f4c with Next build pK0Pu4HCNXFOn9cIe1tes. Both used the ZIP with SHA-256 c8e4dcd9021909d92a640560b7e6acd73753821166a440e2436fc9ed6598e8e8. The deployment receiver verified all 95 required migrations in each environment. The existing verified SSH pin from the same day's prior deployments was used for both targets.

Staging passed 15 independent HTTPS checks before promotion. Matches, Best Slips, Builder and Performance served the expected build with noindex. Today/Pending Matches returned HTTP 200 in 1.27 seconds. The session API and all six Best Slips bands returned HTTP 200. The offline page loaded and the worker and manifest matched the bundled bytes.

Production passed nine independent HTTPS checks. The four app routes served the expected build, all tested assets and endpoints returned HTTP 200, and the offline worker and manifest matched the ZIP. Today/Pending Matches took 12.55 seconds in one production sample. The default 30-day endpoint still returned HTTP 503 after 38.36 seconds. Slow-query latency remains open independently of the recovery and pagination changes.
