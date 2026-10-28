# Responsive feeds and shared slip match cards

## Scope

- Make Matches, Live and Results return their available records promptly instead
  of spending the request budget on repeated reads and rendering an unavailable
  state.
- Render selections in Best Slips, custom builds and saved slips with the same
  match-card components as the feeds. Preserve the original selection, price,
  probability and recorded outcome of a saved slip.
- Keep entitlement checks, publication validation, correction handling and
  request-owned clocks intact.

## Findings

- Before changes, local development document requests took 66.185 seconds for
  Matches and 32.611 seconds for Live. Both returned an unavailable state with
  zero match cards, rather than a genuine empty cohort.
- The feed hydrates rows individually inside a single database transaction even
  though a partial batch reader already exists. Live and settled cycles need the
  same validation when extending the batch reader.
- The default 30-day view contains 16,800 prepared fixtures. MySQL selected
  archive/provider scans, and repeated recommendation extraction read large
  forecast documents throughout that cohort. Preserve the default and use a
  compact generated projection derived from the original sealed document.
- Development demo preparation state is module-local while the database runtime
  survives module reloads. Concurrent route bundles should share preparation.
  A fresh-module preparation took 12.440 seconds; its immediate repeated call
  took 7 milliseconds.
- Slip selections duplicate the feed's match presentation in a separate table.
- The homepage refresh timer can fire during pending navigation. Its refresh
  must wait for the real router lifecycle and the previous refresh to finish.

## Implementation and verification

1. Batch fixture, prediction, settlement, update and price reads while retaining
   existing validation and ordering.
2. Coalesce development preparation across concurrent callers and module reloads;
   prevent homepage polling from replacing pending navigation.
3. Adapt immutable slip selections to the shared match-card presentation without
   fabricating forecast distributions or replacing saved prices with live prices.
4. Run focused unit and SQL integration checks, lint, type checking and a
   production build. Inspect desktop and phone layouts and measure repeated
   navigation between Best Slips, Matches, Live and Results against the local
   prepared dataset.
5. Record actual results, commit the intended changes and push `main`.

## Completed result

- Lean list reads preserve the default 30-day scope, exact filters, sorting and
  pagination. The full-period audit loads through a separate gated summary API;
  it never holds the cards or the route's loading indicator open.
- Summary reads have a separate 90-second budget and reuse generation-checked,
  validated batches of at most 500 fixtures. Default page/API summaries warm
  during ordinary demo preparation. List transaction budgets remain 30 seconds.
- Shared in-flight reads retain their original freshness and permission bounds.
  Waiting consumers fall back at their deadline; no completed in-memory cache or
  failed response is retained.
- Slip selections reuse `MatchCard` and `MatchCardList`, including desktop table
  presentation and phone cards. Original saved values and outcomes stay intact.
- Both database migrations were applied to the owned local demo. Apply
  `20261028120000_compact_feed_recommendation` and
  `20261028121000_feed_choice_covering_index` before deploying the updated server.

## Verification

- 188 focused unit tests passed; the final summary, startup warming and cache
  tests also passed. All 132 Python script tests passed.
- Genuine MySQL: 19 feed integration tests, seven handoff/capture tests and four
  backup/restore tests passed without skips. A 50-fixture completed-match batch
  exactly matched the scalar reader, including disabled-price behavior.
- Fresh-schema verification found no application schema drift. An independent
  HEAD/current SQL comparison proved one fuzzy-search expectation was stale;
  its correction also asserts the exact ordered fixture identities.
- Full lint, TypeScript checking and the optimized production build passed.
  Production rendering passed 37 feed scenarios, 29 slip cases and four saved,
  gated, redacted and offline snapshot variants.
- Desktop and phone inspection found the expected cards, square shared layouts,
  working statistics and no horizontal overflow. An injected 25-second navigation
  delay produced zero homepage refreshes while navigation was pending; the
  destination loaded and its progress indicator stopped.

Local development HTTP measurements (50-card page size):

| View | Before | First updated visit | Repeat visit | Visible cards |
| --- | ---: | ---: | ---: | ---: |
| Matches | 66.185s, unavailable | 14.967s | 5.115s | 50 |
| Live | 32.611s, unavailable | 3.197s | 3.216s | 42 |
| Yesterday's Results | Broad finished view failed after 99.762s | 3.309s | 3.404s | 50 |

Cold development compilation remains additional work on the first visit. A cold
16,800-fixture statistics audit took 52.056 seconds; its warm repeat took 5.991
seconds, independently of list navigation. These are local development
measurements, not a production latency guarantee.
