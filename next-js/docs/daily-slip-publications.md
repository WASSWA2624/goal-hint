# Immutable daily slip publications

The public Best Slips page now reads the first stored editorial publication for
its EAT reporting day. Page/API reads do not generate or publish slips. Completed
editorial slips appear on `/en/performance`, independently of member saves and
account erasure. Personal saved slips retain their separate privacy lifecycle.

## Publication boundary

`createDailySlipPublisher` takes one bounded Kampala-day cohort from the stored
Matches forecast and exact featured-pick reader. It requires a currently
qualified joint model and verified public odds rights. Inputs are Local Engine
featured selections that use the configured primary bookmaker and have
exact original-cycle settlement support. Daily Best Slips adds no per-pick
probability minimum. The launch
markets and a verified regulation Over/Under 1.5 selection are supported. A
book or market mismatch leaves that fixture out. All legs of a slip must share
one bookmaker. The worker records the original quote snapshot and sealed import
receipt, and rechecks the exact offer under lock before publication.

The six bands are lower-inclusive and upper-exclusive, except the last band
includes 200.00. The engine multiplies the full leg prices and assigns the
band from the combined product before formatting the total to two places. A display value that rounds onto a
boundary retains its stored band. The engine considers higher model probabilities
first and uses higher exact prices to break ties. Historical evidence affects ties only where comparable, priced
original decisions have sufficient verified settlement samples in both training
and validation. Worker summaries report sample counts and evidence availability.
The final stored rank uses qualified joint probability, exact total, fewer legs
and stable identity. Disjoint fixtures within a band remain the diversity rule.
Band selection prefers combinations with fewer previously published fixtures
where the bounded search finds alternatives. Identical selection sets cannot
be published twice on the same day.

`createPublishedSlips.publish` validates the original quoted total, marginal
average, joint estimate, daily odds target, diversity and current EAT day. It
holds shared locks on all fixture IDs in sorted order, then binds every leg to its exact sealed
pre-match cycle, revision and original publication timestamp. Forecast, price or
cycle changes produce a new builder ID; an obsolete custom save returns 409
instead of quietly substituting another forecast.

The publication, slip snapshots and normalized cycle/revision membership commit
together. The first successful write for each reporting day and band is final.
Concurrent retries retain that publication, even if a later cohort differs. An ignored
insert is considered a replay only after a current locking read proves that the
original publication exists. Model rights, day and cutoff eligibility are
rechecked after membership writes, so a slow operation crossing a deadline rolls
back rather than leaving a partial publication.

Published snapshots retain the complete original criteria, odds, probabilities,
source revision references, model identity, calibration/correlation references
and publication time. Reading them does not reinterpret current defaults or
require the old model to remain active. Model expiry never replaces an already
published forecast. Changes to model qualification affect future publications.
Version three permits up to 10 distinct slips per band. Sparse bands contain
only the qualifying combinations found. Versions one and two keep their
original limits and rank addresses. The public rank stride remains 20.
The stored model identity hashes its immutable qualification references and
validity window; the trusted verifier must bind those references to the exact
reviewed implementation and artifacts.

## Schema and operation

Migration `20261025113516_daily_slip_publications` adds three InnoDB tables with
binary identity collation. Composite foreign keys bind each leg to the same
fixture/cycle/revision. Update/delete triggers protect every publication and its
membership. The six triggers have `BEGIN … END` bodies, so a mysqldump backup of
them restores (see [backup and restore](backup-restore.md)). The tables have no member/account foreign key. Grant the publisher
SELECT/INSERT on the new tables and SELECT on the required canonical history;
read-only web roles need SELECT. No publication UPDATE/DELETE grant is needed.
Shared fixture/duplicate-publication reads prevent concurrent mutation without
requiring an UPDATE grant on the canonical fixture or append-only publication
tables. See the [MySQL locking-read contract](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

Apply the reviewed migration using the existing migration-role procedure before
promoting this worker. The `20261122180000_daily_best_slip_combinations`
migration adds the immutable same-day combination key and extends the versioned
publication check. Give the dedicated publisher `SELECT, INSERT` on
`DailyBestSlipCombination` and the existing archive tables, and read access to
sealed forecast, odds and settlement evidence. The web worker retains its
existing archive grants.

The private worker accepts an explicitly supplied trusted local module:

```powershell
npm run worker:slips -- --binding C:\private\daily-slips-binding.mjs --once
npm run worker:slips -- --binding C:\private\daily-slips-binding.mjs
```

The module exports `createSlipPublicationBinding(runtimePolicy)` returning
`authorizeWorker`, `verifyEvidence`, and `createPublisher(database)`. The latter
constructs `createDailySlipPublisher` with its reviewed joint model,
`verifyModel` and `verifyPublicOdds`. The worker rechecks the existing publication
and database operation gates. A reference string or a verifier hardcoded to true
does not establish calibration, rights or promotion evidence.

The hosted web runtime reads the archive when the matching
`GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` is verified in its private owner register.
Today and archived dates show the selected band and whether a publication was
found. A date or interval can be combined with odds band, average pick
probability, match count and result. Aggregate counts cover the selected
numeric and date filters before the result filter and pagination.

Without `--once`, the supervised worker checks the current EAT day once a minute,
including after midnight or restart. It retries sparse or unavailable bands and
skips every committed band. The private worker emits status and coverage changes.
The page and API are read-only. Hosted deployment still requires a trusted
supervised binding and independently reviewed temporal whole-slip calibration
and dependence evidence. See the
[November 21 hosted check](reports/best-slips-publication-evidence-2026-11-21.md).

## Original-cycle results and public access

New personal saves and editorial publications carry original forecast identity.
Outcome resolution grades the saved selection at its saved probability, even
when another pre-cutoff revision later became the locked forecast. Cutoff
eligibility still applies. Original void cycles stay void during replacement
scheduled/live matches; their replacement scores cannot regrade old selections.
The latest unresolved correction keeps previously published history visible as
pending without restoring an older winning score.

Legacy personal snapshots remain explicitly unbound. Their missing identities
are not guessed or backfilled from current forecasts.

The active Best Slips page and API show every viewer each slip's rank, selection
count, total odds and estimated joint probability. Those aggregate facts remain
public when route/API access is checked again. The expanded match list, fixture
identifiers, individual predictions, per-match prices and probabilities remain
restricted to viewers with full access.

Public completed history has its own release boundary: every original leg must
be terminal before its match details and original quotes are included. Pending
aggregate counts are allowed; pending/void quotes are excluded from return and
average-odds statistics. Making the daily slip summary public does not release
an active slip's match details through the completed-history response.

History accepts at most 31 EAT publication dates and reads up to 120 legacy
banded slips per day,
then paginates completed records. Statistics use the whole selected period,
including pending counts, before slicing the page. A corrupt seal, inconsistent
membership or incomplete publication produces unavailable, never a fabricated
empty or winning history. See [public performance](public-performance-dashboard.md)
for flat-stake illustration and streak conventions.

Result resolution caps input at 24,800 selections. Larger cohorts prefetch sealed
cycles, schedules, revisions and markets in 100-identity batches and reuse the
existing history validators. This avoids a separate database round trip for
every market of every original slip leg.

## Verification

`npm run test:publications` covers immutable first publication, original references,
active-pick privacy, full-period pagination, loss/void outcomes, revocation,
cutoff rollover, model expiry and original criteria retention. Its genuine MySQL
acceptance test installs the actual migration, races two writers, verifies
append-only triggers and rejects cross-fixture membership. It passed against an
owned genuine MySQL Community Server 8.4.13 instance on 25 October 2026, with no
skip. Saved-slip original-cycle acceptance also passed all nine database tests.
Synthetic model fixtures approve no production model and establish no forecast
accuracy.

The verified portable test dependency is retained locally, outside Git. To reuse
it from the Next.js application root (`next-js/`):

```powershell
$env:MYSQL_TEST_SERVER_BINARY = (Resolve-Path '.tmp/mysql-tools/portable-8.4.13-20261025/mysql-8.4.13-winx64/bin/mysqld.exe').Path
npm run test:publications
npm run test:storage
```

The official ZIP checksum and detached release signature were verified; download
provenance is retained beside the archive. The test harness validates genuine
MySQL, starts a new owned loopback instance and verifies ownership before cleanup.
It does not reuse an application database or installed service. The paid fixture
formats raw connector Date parameters as UTC SQL strings; production already
uses the Prisma adapter's UTC formatting.
