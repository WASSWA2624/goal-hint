# Live client refresh

The server renders the initial feed and applicable detail snapshot. The same
React tree then owns the browser projection; hydration does not fetch a second
initial copy. Each provider creates its own Redux store. `refreshApi` supplies
only the existing anonymous `GET /api/matches` and `GET /api/matches/{id}` reads,
with schema validation, omitted credentials, no browser HTTP cache and a
30-second deadline. RTK Query deduplicates simultaneous subscribers by canonical
endpoint/query identity. Canceling one consumer unsubscribes it without aborting
another consumer's shared request. No forecast data is persisted in the browser.

## Cadence and lifecycle

Visible relative-date, scheduled/live and updating views refresh at 20-second
intervals. Quiet historical/finished views use 60 seconds, retaining correction
checks. Each view serializes its work; slow responses cannot create overlapping
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
loaded content. A compact Retry message reports the last successful stored read;
card/detail source-sync clocks stay independent. Partial coverage retains its
existing distinct display and cannot establish an authoritative empty result.
Run counts and ordinary successful polls have no live-region announcements.
Identical repeated failures leave the same polite error text unchanged.

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
