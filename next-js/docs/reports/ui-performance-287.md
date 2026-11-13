# UI performance audit — 5 November 2026

## Context and method

The reported environment is the **local development app**. Baseline source is
`66211d77`; performance changes are isolated from concurrent payment, prediction
and authentication/routing work. Existing UI, theme tokens, control geometry,
loading indicators, permissions and business rules are preserved.

Source review covers public feeds/slips/detail/history, member and checkout
flows, admin record workspaces, analytics, shared controls/navigation, media,
offline startup, native hosting, database read paths and the development launcher.
Browser fixtures import the actual application components with synthetic data.
They do not measure the production database, external services or physical phones.

The first production fixture build was stopped after compilation while the host
was paging heavily: free physical memory fell below 400 MiB of 16 GiB during
concurrent Android/web verification. Its 4.4-minute compile is **not** a reliable
before/after baseline. No other chat's processes or the normal port-3000 app were
stopped. Expensive verification is coordinated sequentially.

## Confirmed causes and fixes

| Area | Cause | Change and preserved behavior |
| --- | --- | --- |
| Searchable league/team controls | A full `findIndex` for every displayed option; repeated derived work and row rendering during focus changes | Indexed first-match identity, memoized derived lists and unchanged option rows. Search, selection limits, unknown selected values, keyboard navigation and focus restoration remain. |
| Shared browser startup | Theme/native identification imported the release-catalog schema and its validation library | A schema-free presentation module; old exports remain compatible and all catalog validation stays on its original entry point. |
| Slip background refresh | Every child-list mutation triggered a whole-document navigation scan | Check navigation-related changes only; real pending navigation still cancels polling promptly. |
| Match detail reads | The card projection and detail content loaded the same current archive twice | Reuse a verified display within the same transaction, with fixture/cycle guards and no cross-request cache. |
| Analytics | Breakdown queries started only after all summary, series and heatmap reads finished | Schedule the independent reads together; project shares after totals arrive. Query count and pool limits are unchanged. |
| Offline cached assets | Concurrent chunks repeatedly read/hash the same bundle metadata and snapshot | Share pending validation only; each asset is still hash checked, full and partial checks are separate, and expiry is rechecked after awaiting validation. |

## Controlled measurements

These are operation counts or isolated benchmarks, not whole-app user latency.

| Scenario | Before | After |
| --- | ---: | ---: |
| ID lookup for 2,000 picker options | 2,001,000 option-value reads per render | 2,000 once; 0 additional across 20 focus updates |
| Isolated browser download-helper development bundle | 1,126,569 bytes / 24 modules | 30,546 bytes / 6 modules |
| Same helper bundle, calculated gzip | 255,354 bytes | 10,322 bytes |
| Analytics scheduling, 9 interleaved samples, median | 519.459 ms | 306.220 ms |
| Normal match detail duplicate archive reads | 4 redundant SQL reads | 0 |
| 12 concurrent cached assets: record / snapshot reads | 12 / 12 | 1 / 1 |
| Same cached assets: SHA-256 operations | 48 | 15 |
| Same cached assets: individual integrity checks | 12 | 12 |

The analytics experiment uses deterministic synthetic query delays and a
five-connection queue. Outputs and 36 queries are identical. The helper bundle
comparison isolates that dependency graph; pages importing schemas for other
features still load their needed validation code.

## Existing behavior retained after review

- Feed/history hydration is bounded and batched rather than one query per card.
- Public cache generations and concurrent read coalescing retain freshness;
  private member/payment responses do not enter a shared public cache.
- Authorization is reused within a request where already supported; final
  entitlement checks remain authoritative.
- Match tabs use local history and reuse section requests; sharing loads lazily.
- Background polls are serial, cancellable and quiet; shared header progress
  handles foreground work.
- Fonts are local WOFF2 subsets with swap; offscreen logos are deferred and use
  bounded first-party image processing.
- Native hosting retains its WebView/profile. No measured native rendering
  evidence justified changing the host or its security settings.
- Independent admin metrics and performance sections already stream; transactions
  retain coherent snapshots. Parallel JavaScript inside one database transaction
  would not itself make its SQL connection concurrent.

## Reproduction

- `python scripts/benchmark-ui.py --serve`: production populated fixture, repeated
  complete-HTML timings and script sizes. Import `benchmark-ui-browser.mjs` from
  Playwright CLI to measure actual picker, filter and navigation interactions in
  both themes at 390 and 1440 pixels. Raw data/screenshots stay under ignored output.
- `python scripts/benchmark-development.py`: separate fresh Webpack/Turbopack
  fixtures, first-request compilation, warm response samples and resource context.
  This excludes actual app instrumentation/proxy and cannot qualify a bundler switch.
- The synthetic scheduling comparison ran the archived
  `benchmark-analytics-scheduling.mjs` from the report's source revision against
  a separate baseline checkout. The current scripts folder omits this one-off benchmark.

## Qualification

Focused validation completed:

- 22 client tests and scoped ESLint, including option identity, selection,
  download-version equivalence and polling cancellation/restoration.
- 64 server tests and scoped ESLint, including exact detail projections,
  cross-fixture/cycle rejection, request freshness and analytics totals/failures.
- 21 genuine MySQL integration tests (zero failures or skips) for analytics and
  match detail; disposable databases/processes cleaned up afterward.
- 32 offline-worker tests, including concurrent validation, corruption, expiry,
  failure recovery and different cache versions.
- 8 development benchmark isolation/lifecycle tests.
- Independent cross-review of client, server and offline changes found no
  actionable regression. No styling values or component geometry changed.

Final production/browser/development timings and integrated verification are
recorded after the quiet-window runs. Real hosted query plans, large production
datasets and physical native-device timings are outside these local measurements.
