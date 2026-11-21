# Immutable daily slip publications

The public Best Slips page reads the immutable published slips for each
Kampala reporting day and combined-odds band. Page/API reads do not generate or publish slips. Completed
editorial slips appear on `/en/performance`, independently of member saves and
account erasure. Personal saved slips retain their separate privacy lifecycle.

## Publication boundary

`createDailySlipPublisher` takes one bounded Kampala-day cohort from the stored
Matches forecast and exact featured-pick reader. Forecast and quote rights,
original-cycle settlement support, verified bookmaker offers, and the
publication cutoff still apply. The worker uses prices from one verified
bookmaker per slip. It considers eligible priced picks without adding a
minimum pick probability. Combined odds are a guide for band placement.

The six bands are lower-inclusive and upper-exclusive, except the last band
includes 200.00. The engine multiplies leg prices before rounding the displayed
total. It ranks eligible new combinations using their original pick
probabilities and exact combined prices. The same combination can appear once
per Kampala day across all bands. Each slip uses unique fixtures. Different
slips can share a fixture when their combinations differ.

At the start of every Kampala hour, the worker checks every band with fewer
than ten published slips. It appends only what qualifies within the remaining
capacity. It assigns new ranks after the last stored rank. Earlier slips,
ranks, prices and forecast revisions stay sealed. Full bands skip generation
for the rest of the day. An empty or sparse band can accept later batches
until the reporting day ends. The public page shows the accumulated count
for the selected band, plus separate filter counts where applicable.

The first anchor, the hourly batch, slip snapshots and normalized original
forecast membership commit together. Each band can commit one nonempty
batch per hour. A durable day-level combination identity prevents duplicates
across bands and retries. The transaction checks the current hour, the actual
publication cutoff, odds rights and exact stored offers before committing.
Settlement uses the original sealed picks and updates visible outcomes.
New hourly slips show combined odds and average pick probability. Archived
slips keep their previously verified whole-slip estimate and rank. The
private model qualification study continues separately.

## Schema and operation

Migration `20261122190000_hourly_best_slip_appends` adds
`DailyBestSlipAppendBatch` and associates appended slips with its immutable
hour and rank range. Versions one and two retain their existing limits and
rank links. Version three can append to an incomplete current-day band with
the old snapshot untouched. Version four anchors new hourly bands. Each
current band holds up to ten slips. The public rank stride remains 20.

Use the verified migration role and a current backup of the affected archive
tables. The dedicated publisher needs SELECT and INSERT on
`DailySlipPublication`, `DailyBestSlipAppendBatch`, `PublishedSlip`,
`PublishedSlipLeg` and `DailyBestSlipCombination`, plus SELECT on the
required forecast, odds and fixture evidence. The web role needs read access
to the batch table. Archive triggers also enforce immutability.

Run the stored-data publisher from a matching source release with the
approved database profile and private owner approvals. The hourly service
uses the first-party binding and invokes one Kampala-hour slot.

```sh
node --conditions=react-server src/workers/slips.ts --stored --once
```

The stored binding verifies database approval and public odds rights against
the private register. The worker reads existing data and consumes no provider
quota. A trusted local binding can be supplied with `--binding` instead.
Schedule the one-shot command at `*-*-* *:00:00 Africa/Kampala`. A continuous
`--stored` process also waits for hour boundaries and sleeps to the next
reporting day after all bands fill. Test an isolated staging run before
enabling the production schedule. Archive pages and APIs read committed data.

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
