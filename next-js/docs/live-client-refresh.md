# Live client refresh

The server renders the initial feed and applicable detail snapshot. The same
React tree then owns the browser projection; hydration does not fetch a second
initial copy. Each provider creates its own Redux store. `refreshApi` supplies
feed reads; `detailApi` supplies match and section reads through the same anonymous
transport. Match pages use a cache-only store, without feed drafts or preferences.
Their response validators load alongside the first request, preserving schema
validation without adding a network waterfall. Both APIs use omitted credentials, no browser HTTP cache and a
30-second deadline. RTK Query deduplicates simultaneous subscribers by canonical
endpoint/query identity. Canceling one consumer unsubscribes it without aborting
another consumer's shared request. No forecast data is persisted in the browser.

The 12 October 2026 cleanup reduced the match-detail route's application chunks
from 472,785 to 336,084 bytes (138,912 to 100,889 bytes gzip, a 27.4% compressed
reduction). These measurements sum unique client-reference chunks from production
builds, excluding shared framework bootstrap files; they are not total page weight
or a field Core Web Vitals score. The initial detail import test rejects eager
validation-library or feed-state imports, and response validation remains covered
by the detail cache tests.

## Cadence and lifecycle

Visible feeds refresh at 20-second intervals only while something can change
soon: an updating run, a live match, or a scheduled kickoff within 30 minutes
either side of now (`feedRefreshInterval`). Every other view, relative dates
included, uses 60 seconds and retains correction checks; the loop still wakes at
EAT midnight for rollover. Details poll fast while live or updating, and for a scheduled match within 30
minutes of kickoff; a detail poll re-renders only when something shown changed.
Feed polls and Load more send `leagues=0`, since they never read filter options.
Each view serializes its work; slow responses cannot create overlapping
batches. Hidden or offline pages schedule no reads. Visibility restoration,
reconnection and a persisted browser-cache `pageshow` resume safely. The initial
`pageshow` does not trigger a duplicate hydration request. Unmount and query
changes cancel the consumer; late results cannot commit to a different view.

A feed batch reads its entire loaded prefix, at most ten pages, and commits
atomically. Every boundary must have a consistent cohort marker and total,
contiguous pages and no overlap. A changed cohort may replace ordered membership
only after the full prefix passes. An unstable batch retains every loaded card
and retries on the next interval or explicit Retry. Background refresh does not
move focus or deliberately scroll. Existing Load more, direct page links and
Back checkpoints retain their bounded contracts.

## Ordering and clocks

Fixture versions are unsigned decimal BIGINT strings. Whole records move only
forward. Cycle ordinals/identities, persisted run sequences, revision references
and publication times provide additional checks; opaque UUIDs are never sorted.
Closed/void cycles cannot reopen, and a locked revision cannot change inside its
cycle. A detail response must agree with its applicable card projection and keep
probabilities, source, alternatives, explanations and outcomes from one revision.
An earlier read envelope cannot undo newer run/coverage metadata. Equal versions
retain forecast content while allowing newer observation/job metadata: actual
sync time, delay, coverage and window labels. This matters because an unchanged
score and a failed job do not necessarily increment the material fixture version.
Permission-expired analysis can be withdrawn without replacing probabilities.

Details reuse `storedFeedRun` in the same read transaction as the fixture. Counts
represent the shared daily manifest/jobs, independent of filters or the selected
fixture. Incremental publications replace complete snapshots. Retained forecasts
keep their original generation/publication clocks and display Update delayed.
The detail cache projection is versioned; progress invalidation and the existing
five-second mutable cache bound still apply.

History remains a separately server-rendered, read-only subtree with its selected
revision, anchors, cursors and source times. Current polling never requests a
history selection or promotes a historical snapshot into current state. History
labels display their original read time; latest-history navigation obtains a new
history view without losing the distinction from the live main forecast.

## EAT rollover and failures

The loop also wakes at the exact next `Africa/Kampala` midnight. Server refresh
recomputes the shell/date links and relative today/tomorrow/seven-day window.
Relative page URLs reset to page one when necessary; valid filters remain in the
URL. Explicit historical dates/ranges and loaded extent remain selected. Redux
receives the explicit forward-only `calendarChanged` event. On return from a
hidden/offline tab, rollover runs before fetching an obsolete relative range.

Failed transport, busy search, malformed, stale and unstable responses retain
loaded content. The owner removed the visible refresh warning, last-read timestamp
and retry strip on 12 October 2026. Scheduled polling continues to retry, while
card/detail source-sync clocks retain their original meanings. Partial coverage
retains its distinct display and cannot establish an authoritative empty result.
First-load failures and pagination errors keep their separate error/retry behavior.
Run counts and ordinary successful polls have no live-region announcements.

## Separate offline-cache preparation

[Anonymous offline startup](offline-startup.md) adds a separate service-worker
bundle, not persistence for RTK Query or the live feed. It stores no forecasts,
private/no-store responses, account state or queued writes. One visible-document
coordinator verifies bounded same-origin manifest/projection reads. Failures use
5/15/30/60-second retry delays, then a five-minute cadence; healthy checks also
use five minutes. Online/foreground hints coalesce and cannot bypass failure
backoff. Hidden/disposed owners cancel their timers and owned worker lease.
This is separate from the live feed and creates no provider request loop.

Complete candidates are validated before activation; failed downloads or storage
retain a valid previous bundle. Preparation does not replace the current React
tree or reload forms, navigation, focus or scroll. Later offline startup renders
the dedicated dated Saved matches view, limited to a 24-hour anonymous snapshot;
normal online refresh keeps the ordering, authorization and reconciliation rules
above. Public status metadata distinguishes an available old cache from a failed
refresh; legacy 004 replies receive an actual expiry check. The saved view's
Check for updates action requests a read, while Try online again explicitly
controls a reload. Worker code waits for old clients to close before activation.

## Verification

`npm run test:live-client` covers reversed publications/locks/results/corrections,
earlier cycles/runs, partial snapshot replacement, unchanged observation metadata,
query cancellation, endpoint deduplication/isolation, visibility/reconnect and
deterministic EAT midnight. Genuine MySQL detail acceptance verifies shared run
counts and repeated independent visitor reads with writes/network blocked and
job/reference/result/version invariants compared before and after.

`npm run test:live-client:rendering -- --serve` builds an isolated production app
from genuine MySQL-captured projections. Its generated test-only clock enables
browser rollover checks. Controlled response variants are synthetic acceptance
data, never production switches. Browser checks use Playwright CLI and installed
Chrome. The public application never creates a provider poller or prediction job;
the existing leased worker remains the sole provider-refresh owner. This feature
does not activate workers, deployments or external release gates.
