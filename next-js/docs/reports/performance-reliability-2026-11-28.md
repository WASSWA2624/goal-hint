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

A read-only MariaDB 11.4.14 status snapshot showed 14 connected threads, two running threads, 20 peak connections against a limit of 151, and zero current InnoDB row-lock waits. Historical row-lock counters were nonzero. The snapshot gives no evidence of an exhausted database connection limit at that instant. It cannot attribute earlier failures, proxy timing or concurrent worker pressure.

## Request paths

- **Navigation and Matches.** Apache/Passenger sends the Next HTML or RSC shell. A controlled document opens through the service worker, and valid static assets load separately. The feed resolves its viewer, reads the scoped cache and SQL membership, totals and visible-page projections, and hydrates the browser. The period summary reads its own audited cohort. Numbered pages and live polling call the list or summary API for the applicable query.
- **Best Slips and share.** Initial rendering and the browse API read published dates, sealed rank records and original-leg settlement, followed by viewer projection. The same audited snapshot provides list rows and counts. Visible polling can recheck membership and game states. Share resolves publication and current access when required. The drawer can copy an eligible link or load artwork and render a PNG for file sharing, download or the Flutter bridge.
- **Account.** The page resolves account and display state. Login POST validates and throttles, reads the phone-indexed account, verifies the password and creates or rotates the session in its locked write. The following document and session reads validate the issued cookie. The session API also resolves settings and access or offer state where applicable.
- **Admin Users.** The owner guard verifies the current session. The page loads directory, selected detail and plans independently. Refresh POST repeats the filtered count, bounded ordered page and access aggregation in one database snapshot. Detail and continuation requests retain the same authorization rules.

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
| Matches, 1,080-fixture day | — | 128 / 155 ms | Five uncached samples. Stable, nonoverlapping 50-row pages matched the reporting cohort. |
| Matches, 14,010 known fixtures across 30 days | — | 2,039 / 2,533 ms | Five uncached list samples. The summary measured 733 / 1,026 ms and matched the list generation. The disposable MySQL fixture had sparse published forecasts. |

On the same member fixture, deep cursor p50/p95 was 52/67 ms and private-note search 302/457 ms. MySQL used an existing index for the count and scanned about 10,000 rows with a sort for the page. A disposable trial of the proposed ordering index retained the scan and showed no consistent benefit. The change adds no migration.

Chrome exercised the actual login and Users components in isolated development fixtures in light and dark at 390 and 1440 px. The mobile profile used 5 Mbps down and 160 ms RTT. Login displayed the expected 401, 429, 503, network and timeout states with one POST per manual attempt. Users retained the same rows through 503 and manual retry, preserved the selected Devices tab on desktop and left the protected view on a real missing-cookie 401. The login success response in Chrome was simulated. Issued cookies and sessions were verified separately against MySQL.

Best Slips first-page rendering and its share drawer passed in production-mode fixtures. Four Chrome profiles covered compact and desktop light and dark layouts, filter and history failures, stale counts, exact-query retry and reconnect. The share checks copied the canonical link while an artwork request failed, then downloaded the PNG after retry. The earlier full browser harness stopped at an unchanged calendar numeral geometry assertion. The targeted checks completed with no viewport overflow or uncaught errors.

The production-mode fault proxy and Chrome 158 verified a worker-served HTTP 503, the same original URL on manual retry, a real browser offline-to-online recovery, back and forward, and a deliberately thrown render error. Light desktop and dark compact cases passed. The compact case also verified the separate timeout message with a 17-second header stall. The worker unit tests verified that streaming can continue after headers and that authorization and rate-limit statuses stay authoritative.

### Paired browser delivery

Chrome ran five cold loads per route and profile at each revision. All 40 completed with the expected first-page rows and Won figure. The matched UI fixture used 37 visible Pending fixtures from a 55-fixture cohort and three Best Slips rows. The isolated database results above cover larger cohorts. The browser samples ran on a contended workstation and bypassed the connection worker to measure comparable browser delivery from the fixture.

| Route and profile | First rows p50 / p95, seconds | First correct cards p50 / p95, seconds | p50 transfer | Encoded JS |
| --- | ---: | ---: | ---: | ---: |
| Matches mobile | 4.60 / 8.20 → 3.44 / 5.44 | 12.41 / 12.51 → 11.07 / 13.65 | 526 → 528 kB | 421.3 → 423.7 kB |
| Best Slips mobile | 2.44 / 3.86 → 2.33 / 3.92 | 2.44 / 3.86 → 2.33 / 3.92 | 491 → 493 kB | 409.9 → 412.1 kB |
| Matches desktop | 3.47 / 5.82 → 3.46 / 5.50 | 3.69 / 6.33 → 3.85 / 5.89 | 532 → 534 kB | 421.3 → 423.7 kB |
| Best Slips desktop | 1.29 / 1.81 → 1.39 / 1.71 | 1.29 / 1.81 → 1.39 / 1.71 | 495 → 497 kB | 409.9 → 412.1 kB |

Mobile Matches p50 TTFB, FCP and LCP moved from 0.91, 2.43 and 2.87 seconds to 0.47, 1.92 and 2.30 seconds. Mobile Best Slips moved from 0.16, 1.34 and 2.59 seconds to 0.15, 1.31 and 2.96 seconds. Median request counts were 25–27 before and 26–28 after. Median CLS stayed under 0.004 in all profiles. Matches mobile and desktop p50 time above 50 ms in sampled long tasks fell from 9.30 to 8.22 seconds and 1.23 to 0.99 seconds. JS transfer rose about 2.2–2.4 kB on both pages. The mobile Matches fixture exceeded the three-second content target and had a slower p95 for correct counts. These measurements give no field INP or Google PageSpeed score.

A separate screenshot run waited for the requested theme to hydrate before capture. All eight baseline/candidate pairs matched pixel for pixel at 390 and 1440 px in light and dark for Matches and Best Slips. This comparison covers the populated initial view on the fixed fixture data.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0 |
| `npm run db:validate` | Exit 0 |
| `npm run test:theme:contract` | Exit 0 |
| `npm run package:cpanel -- --commit 6a02057d399684312f295bdb460fee783342da5b` | Exit 0. Clean pinned-runtime Next.js production build, offline manifest and 8,754-entry verified ZIP. |
| Focused Node tests for request timing, offline worker, login, Users, Matches, Best Slips, sharing and SEO status | 186 passed, zero failed or skipped |
| Isolated MySQL authentication and administrator integration | 22 passed, zero skipped |
| Isolated Matches scale case | Passed with 1,080 and 14,010 known fixtures |

Full physical-device acceptance, independent packet-loss and jitter runs, and production-equivalent replay density remain open.

## Hosted release

Staging activated commit `6a02057d399684312f295bdb460fee783342da5b`, Next build `hIA42rDNw6Q4C8Hg49WRp`, from ZIP SHA-256 `f377548ab9afdef0744aaa15d2a792e6c6b7efeb48a55ab3b08311fdab8714da`. The receiver verified the unchanged 95-migration ledger and its HTTPS cutover checks. All 14 additional probes passed, including the 30-day Matches API at 1.78 seconds, the account session and the guest Users API’s 401. The staged baseline is sparse. Chrome showed a genuine zero in the first Matches cards at 3.29 seconds on mobile and 2.98 seconds on desktop, then exercised Best Slips, Account and history without an uncaught page error.

The first production cutover passed the migration check and failed the old 15-second complete-document smoke on Matches. Apache recorded HTTP 200 for the curl attempts at intervals matching the deadline and retry delay. The receiver restored commit `64aba48b`. The revised verifier requests the browser document, enforces the 15-second response-header budget, checks that the full response contains the intended build, accepted list and ready summary, and separately verifies the bounded Today API's guest payload. The document body has a bounded 40-second data budget. A production response with unavailable coverage fails the gate. Staging can report its known coverage limitation while its provider jobs are disabled. The crawler response behavior and captions retain their independent regression coverage.

## Reproduction

- Run the pinned runtime in `next-js/`. Run the focused tests for worker, account, administrator, Matches, Best Slips, sharing and request timing. Use the disposable MySQL test fixture for database runs.
- Serve the same synthetic UI fixture at both revisions with `python scripts/benchmark-ui.py --serve`. Compare them with `node scripts/benchmark-feed-delivery.mjs --before <loopback> --after <loopback> --playwright <module-path>`. The defaults produce 20 cold navigations per revision across two routes and two profiles. The mobile profile uses 5 Mbps down, 150 ms RTT and 4× CPU slowdown. Figures are local lab data. PageSpeed field INP requires separate CrUX evidence.
- Run the isolated offline fixture and fault proxy with the instructions in its [fixture README](../../tests/helpers/rendering/offline/README.md). Run `node scripts/verify-navigation-recovery-browser.mjs --origin <proxy> --control <fixture-control> --playwright <module-path>` for the 503, timeout, reconnection, render error and history checks.
- Repeat DNS using independent public resolvers and HTTPS using certificate verification. Run PageSpeed in both modes for the [canonical home](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgoalhint.com%2F), [Matches](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgoalhint.com%2Fen%2Fmatches) and [Best Slips](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fgoalhint.com%2Fen%2Fbest-slips). A resolver message or quota refusal yields no Lighthouse score.
