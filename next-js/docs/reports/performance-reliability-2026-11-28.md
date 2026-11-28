# Goal Hint performance and reliability

## Baseline evidence

On 28 November 2026 an IPv4 HTTPS probe from the development workstation reached Apache at `104.207.86.22` with certificate verification enabled. HTTP redirected to HTTPS with 301. The apex HTTPS root returned 308 to `/en/matches`. The HTTPS www root returned 308 directly to the apex locale page. Google Public DNS and Cloudflare both returned the apex and staging A record and no AAAA record. The www name returned a CNAME to the apex. An IPv6-only connection could not resolve an address. [Public site](https://goalhint.com/), [Google Public DNS](https://dns.google/resolve?name=goalhint.com&type=A).

| Production request | HTTP | Time to first byte / complete | Encoded response body |
| --- | ---: | ---: | ---: |
| HTTPS root, following the redirect | 200 | 16.31 / 16.88 s | 92,710 B |
| Matches direct | 200 | 15.96 / 16.54 s | 92,757 B |
| HTTPS www root, following the redirect | 500 at Matches | 19.65 / 35.91 s | 14,802 B |
| Today Matches, 50 rows maximum | 200 | 13.82 / 14.02 s | 21,840 B |
| Today Matches summary | 200 | 7.05 / 7.31 s | 208 B |
| Best Slips document | 200 | 3.65 / 6.26 s | 30,814 B |
| Best Slips API | 200 | 13.80 / 13.99 s | 16,657 B |
| Guest account session | 200 | 2.82 / 3.11 s | 151 B |
| Privacy control | 200 | 5.16 / 5.74 s | 34,697 B |

The HTTPS staging Matches document served HTTP 200 in 2.20 seconds and its one-row Today read in 2.12 seconds. These timings are individual observations. The historical broad Matches request returned 503 in 33–40 seconds on 27 November. A later release recorded 200 in 27–33 seconds for the 30-day default with 5,230 predicted fixtures out of 14,010 known fixtures. Production measurements here used bounded requests. [Earlier UI report](ui-performance-2026-11-27.md), [hosted Matches follow-up](../../../implementation-docs/deployment-and-version-control.md).

The last 20,000 Apache TLS log entries produced the following counts for recognized paths. The extraction ran on the host and emitted only path families and status totals. The sample includes different queries and callers and has no phase durations. It contained HTTP 5xx on 10 of 406 Matches documents, 93 of 427 Matches API calls, 20 of 201 summary calls, 69 of 153 Best Slips API calls, 21 of 38 login calls, 9 of 566 session calls and 1 of 2 share calls. The sampled staging logs had five authorized directory responses and four 401s. A directory 401 alone cannot establish why authorization failed.

## Causes and fixes

| Symptom | Evidence and confidence | Change and regression |
| --- | --- | --- |
| Slow or failed Matches document | A successful production header took longer than the 15-second worker deadline. The canonical browser header awaited stored feed work. Production also served genuine 500s. The cause of each hosted failure remains open. | Stream the browser shell where eligible and retain synchronous crawler error semantics. Verify against an intentionally delayed source and failed document fault. |
| Matches return and reload | The reported black wording matches Next’s global runtime boundary. The worker also converted observed 500s into a generic connection message. The exact triggering exception was unavailable. | Use a themed global recovery frame. Preserve server status and distinguish HTTP 5xx, header timeout and offline. Verify the original query, browser history and reconnection with fault injection. |
| Matches performance values | Rows and counts use separate reads. An unavailable server seed disabled automatic recovery for the same cohort. The summary endpoint returned 503 in the production sample. | Retry a bounded read, keep verified counts only under a compatible scope and label stale values. Check zero, failed, cancelled and obsolete results. |
| Best Slips list and counts | The same audited snapshot supplies rows and period statistics. Production logs recorded API failures. Code issued redundant access checks and a failed seed could replace accepted rows. Archive continuation audited further days even after reaching a complete page. | Gate a single audited read with a fresh viewer check, preserve compatible rows and counts, and stop cursor scans once continuation is known. Verify ranks, counts, access change and cursor continuation. |
| Slip share | A failed PNG or artwork blocked access to an already known or authorized canonical link. The two sampled hosted requests included a 503. | Provide the eligible public link independently. Check image failure, clipboard fallback, native cancellation and the sealed link gate. |
| Login and session | Production login and session had 503s. Fault injection reproduced login failing before credentials after an unused prior cookie verification. Login also initialized unrelated subscription and checkout services. | Limit dependencies to authentication, keep login to one POST, report network and throttling separately, and verify a valid issued session with synthetic credentials. |
| Admin Users refresh | Fault injection reproduced a database failure being translated into 401, which clears the workspace. Real 401s still require clearing private state. | Return retryable 503 on unavailable verification and retain the current directory and selection. Keep authorization fail-closed. Check refresh, detail, continuation and actual expiry with synthetic accounts. |
| PageSpeed root URL | The browser UI returned “Unable to resolve” for the apex root, Matches and Best Slips. The six unauthenticated API attempts returned Google quota HTTP 429. DNS and TLS succeeded from other probes. Apache saw two Lighthouse-labeled root redirects and two successful locale responses in the sample. The records cannot identify the exact failed audit or its network origin. | Preserve the valid canonical redirects. Repeat the audits after release and investigate Google crawler reachability with matched timestamps and a quota-enabled API credential. Review edge and Apache logs for real crawler requests before considering a configuration change. |

The affected APIs return an opaque `X-Request-Id` and a total app duration in `Server-Timing`. For failures and reads taking at least two seconds, the application records fixed operation and phase names, elapsed time and status. Input, query values, account identifiers, cookies and exception details are excluded from these records. Browser transfer and server phase timings can be compared using that response ID.

## Isolated benchmarks

| Scenario | Baseline p50 / p95 | Candidate p50 / p95 | Fixture and result |
| --- | ---: | ---: | --- |
| All dates, first Best Slips archive batch | 1,246 / 2,116 ms | 113 / 279 ms | 12 in-process samples per variant, 875 synthetic sealed slips across 35 days. Observed snapshot calls fell from 31 to 6 and adjudications from 775 to 21. Mock storage measures reader work. |
| Sign in with an existing synthetic cookie | 376 / 718 ms | 475 / 735 ms | 30 requests per variant on isolated MySQL 8.4.11, all HTTP 200 with verified cookies. The baseline repeated the previous settings and session prerequisites. The results establish the removed dependency and fault recovery. Host contention limits latency comparison. |
| Issued account session read | — | 15 / 20 ms | 30 requests on isolated MySQL 8.4.11, all successful. |
| Initial Users Refresh | 49 / 55 ms | — | 30 requests on 10,000 isolated synthetic members, zero failures. The access guard outage reproduced as 401 before the fix and 503 afterward. |

On the same member fixture, deep cursor p50/p95 was 52/67 ms and private-note search 302/457 ms. MySQL used an existing index for the count and scanned about 10,000 rows with a sort for the page. A disposable trial of the proposed ordering index retained the scan and showed no consistent benefit. The change adds no migration.

## Reproduction

- Run the pinned runtime in `next-js/`. Run the focused tests for worker, account, administrator, Matches, Best Slips, sharing and request timing. Use the disposable MySQL test fixture for database runs.
- Serve the same synthetic UI fixture at both revisions with `python scripts/benchmark-ui.py --serve`. Compare them with `node scripts/benchmark-feed-delivery.mjs --before <loopback> --after <loopback> --playwright <module-path>`. The defaults produce 20 cold navigations per revision across two routes and two profiles. The mobile profile uses 5 Mbps down, 150 ms RTT and 4× CPU slowdown. Figures are local lab data. PageSpeed field INP requires separate CrUX evidence.
- Run the isolated offline fixture and fault proxy with the instructions in its [fixture README](../../tests/helpers/rendering/offline/README.md). Run `node scripts/verify-navigation-recovery-browser.mjs --origin <proxy> --control <fixture-control> --playwright <module-path>` for the 503, timeout, reconnection, render error and history checks.
- Repeat DNS using independent public resolvers and HTTPS using certificate verification. Run PageSpeed in both modes for the [canonical home](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgoalhint.com%2F), [Matches](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgoalhint.com%2Fen%2Fmatches) and [Best Slips](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgoalhint.com%2Fen%2Fbest-slips). A resolver message or quota refusal yields no Lighthouse score.
