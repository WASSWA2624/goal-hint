# Immutable daily slip publications

The public Best Slips page reads the immutable published slips for each
Kampala reporting day and combined-odds band. Page/API reads do not generate or publish slips. Completed
editorial slips appear on `/en/performance`, independently of member saves and
account erasure. Personal saved slips retain their separate privacy lifecycle.

## Publication boundary

`createDailySlipPublisher` takes one bounded Kampala-day cohort from the stored
Matches forecast and exact featured-pick reader. Forecast and quote rights,
original-cycle settlement support, and verified bookmaker offers still apply.
The automatic publisher accepts exact featured full-time match and team goal
totals on the lines supported by Builder when the Local Engine forecast and
the same bookmaker offer can be verified. The original goal line, team and
selection are retained through settlement.
New slips require scheduled fixtures at least 30 minutes from kickoff at
selection and commit. A closed or expired prediction cycle, a sealed early-play
barrier, or a trusted start in that occurrence rules out the fixture even if
the fixture feed still says scheduled. The worker uses prices from one verified
bookmaker per slip. It considers eligible priced picks without adding a
minimum pick probability. Combined odds are a guide for band placement.

The six bands are lower-inclusive and upper-exclusive, except the last band
includes 200.00. The engine multiplies leg prices before rounding the displayed
total. It ranks eligible new combinations using a conservative whole-slip
probability bound derived from the original pick probabilities. No assumption
of independence is needed, and the bound is used internally for ranking. Each
fixture can appear in one new automatic slip across all six bands for the same
Kampala day. Earlier published appearances count even if a slip later becomes
unavailable or void. Historical overlap remains in the archive.

At midnight and every 30 minutes in Kampala, the worker checks every band
with capacity. Ten per band is the existing ceiling. Sparse bands can finish
the day with fewer slips or none. A combination waits until its earliest leg
is within the configured release window, six hours by default. Within an
eligible slot, the worker prefers cohesive kickoff times among otherwise
comparable combinations. It appends qualifying
slips at new ranks after the last stored rank. Earlier slips,
ranks, prices and forecast revisions stay sealed. Full bands skip generation
for the rest of the day. An empty or sparse band can accept later batches
until the reporting day ends. The public page shows the accumulated count
for the selected band, plus separate filter counts where applicable.

The first anchor, the append batch, slip snapshots and normalized original
forecast membership commit together. Each band can commit one nonempty
batch per half-hour slot. The transaction checks the slot, current fixture
eligibility and kickoff, odds rights, exact stored offers, and existing daily
fixture membership before committing. Both publication paths lock the Kampala
date in the existing indexed combination ledger before reading prior
membership. A conflicting transaction rolls back with its batch and fixture
allocations. The combination identity also guards exact duplicates.
Settlement uses the original sealed picks and updates visible outcomes.
New slips show combined odds and average pick probability. Archived
slips keep their previously verified whole-slip estimate and rank. The
private model qualification study continues separately.

## Schema and operation

Migration `20261122190000_hourly_best_slip_appends` adds
`DailyBestSlipAppendBatch` and associates appended slips with its immutable
hour and rank range. Versions one and two retain their existing limits and
rank links. Version three can append to an incomplete current-day band with
the old snapshot untouched. Version four anchors new hourly bands. Each
current band holds up to ten slips. The public rank stride remains 20.

Migration `20261124120000_half_hour_best_slip_appends` replaces the append
slot validation trigger in both MySQL and MariaDB. It admits half-hour slots
and retains the historic hourly envelope. It changes no rows or table shape.

Use the verified migration role and a current backup of the affected archive
tables. The dedicated publisher needs SELECT and INSERT on
`DailySlipPublication`, `DailyBestSlipAppendBatch`, `PublishedSlip`,
`PublishedSlipLeg` and `DailyBestSlipCombination`, plus SELECT on the
required forecast, odds and fixture evidence. The web role needs read access
to the batch table. Archive triggers also enforce immutability.

Run the stored-data publisher from a matching source release with the
approved database profile and private owner approvals. The one-shot service
uses the first-party binding and invokes the current Kampala slot.

```sh
node --conditions=react-server src/workers/slips.ts --stored --once
```

The stored binding verifies database approval and public odds rights against
the private register. The worker reads existing data and consumes no provider
quota. A trusted local binding can be supplied with `--binding` instead.
Schedule the one-shot command at `*-*-* *:00,30:00 Africa/Kampala`. A continuous
`--stored` process waits for the same boundaries and sleeps to the next
reporting day after all bands fill. Pause the old publisher before changing
the trigger and switching writers. Verify both boundaries and archive reads
on staging before enabling the production schedule. Archive pages and APIs
read committed data.

To roll back cadence alone, return the one-shot timer to `:00` and keep the
updated publisher and readers. To roll back generation behavior, pause the
publisher and keep the readers running until a compatible writer is ready.
Readers must support already committed half-hour batches. Preserve the
archive, fixture membership and migration ledger during rollback.
For the early-start eligibility release, the previous append-aware web and
publisher releases can also be restored using their existing release link and
launcher. The change adds no migration and writes no historical records.

## Original-cycle results and public access

New personal saves and editorial publications carry original forecast identity.
Outcome resolution grades the saved selection at its saved probability, even
when another pre-cutoff revision later became the locked forecast. Cutoff
eligibility still applies. Original void cycles stay void during replacement
scheduled/live matches; their replacement scores cannot regrade old selections.
The latest unresolved correction keeps previously published history visible as
pending without restoring an older winning score. The stored slip stays visible
after kickoff. Its operational status also reflects an early start when a
trusted lifecycle record or sealed publication barrier arrives before the
fixture status feed catches up.
Cancellation and postponement follow the original cycle's recorded evidence.
The archive retains original odds. Forecast-cycle voids alone cannot establish
a bookmaker refund, multiplier, or effective settled price.

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

### Targeted optimization audit

| Requirement | Baseline finding and change |
| --- | --- |
| Matches forecasts, market definitions, display and permissions | **Compliant — leave untouched.** Slip generation consumes stored fixture, forecast and quote evidence. The Matches engine, its publication cutoff, public routes and screen components remain unchanged. |
| Automatic odds bands and price checks | **Compliant — leave untouched.** Exact odds determine membership before rounding. Same-book prices, the current rights checks, and the six public band definitions remain in force. |
| Automatic cadence, candidate ranking and kickoff buffer | **Partially compliant — minimal fix.** The baseline already checks half-hour Kampala slots, applies the 30-minute buffer and configured release window, and ranks on a conservative bound. The stored cohort and write-time binder now reject trusted starts even while the fixture still appears scheduled. The existing featured recommendation supplies the pick qualification policy. |
| Automatic fixture reuse | **Compliant — leave untouched.** The append transaction enforces daily fixture ownership across six bands, including earlier publications. Retries and simultaneous writers share the same allocation scope. |
| Published snapshots, availability and settlement | **Partially compliant — minimal fix.** The archive already seals original legs and odds and resolves results against their original cycles. The operational projection now also uses trusted early-start evidence while the fixture is still scheduled. **Conflicting/unclear.** The app lacks bookmaker settlement evidence to establish a canceled or postponed leg's payout or effective odds. |
| Builder filters and reuse | **Partially compliant — minimal fix.** The search already keeps reuse request-local and enforces selected bounds, markets and exact quotes. The Builder now filters closed, expired and already-started fixtures before the bounded cohort read and rechecks selected fixtures once after the search. Unaffected slips remain in the result. **Conflicting/unclear.** `0.01` is the editing step. The existing decimal-odds minimum is `1.01`, and the existing server-side pick qualification floor still applies. |

The baseline at `507ed247` passed 201 slip tests. The stored-data study on
the local snapshot at 06:30 Kampala found no eligible forecasts, priced
fixtures or slates across 14 fit dates and eight holdout dates. Coverage was
incomplete on every date. The early-start fix changes fixture admission only.
The study cannot measure its effect on win rate, calibration or ROI.

The earlier reproducible prediction baseline used the existing Best Slips historical
study on the owned local football snapshot. It uses only sealed forecasts and
exact bookmaker quotes available by 06:30 Kampala on each day, then reads
verified outcomes after selections have been frozen. From November 1 through
14, 2026 it inspected 675 occurrences across 14 incomplete dates and verified
zero eligible forecasts. From November 16 through 23 it inspected zero
occurrences on eight dates. Both windows recovered zero priced fixtures and
zero qualifying slates. The snapshot held 3,268 price rows and zero published
slips. Those rows cannot establish which prices were usable at the decision
clock. The same study returned identical coverage after the changes. The
[historical study runbook](best-slip-qualification-study.md#historical-four-match-study)
gives the command. The fitted and holdout windows used here have exclusive
ends of November 15 and November 24 respectively.

This evidence cannot support a before-and-after holdout for accuracy,
calibration, by-band hit or loss rates, intraday live coverage, or ROI. Use
timestamped pre-match evidence and subsequent original-cycle results when a
matched holdout is available. Regression tests cover eligibility and integrity
on controlled data. On a controlled 32-fixture replay, the old hourly selector
generated 60 slips, reused fixtures 153 times, and included a leg inside the
30-minute buffer on eight slips. The half-hour selector produced 18 slips
with 29 distinct fixtures, zero repeated uses, and zero buffer breaches.
The old selector published every slip before 06:00. The revised selector
published 12 before 06:00, four from 06:00 to 12:00, and two from 12:00 to
18:00. It left the four higher bands empty on that input. No fixture had
started at generation in either run. This measures the selection trade-off
on a controlled input without assigning outcomes.

MySQL 8.4.11 acceptance installed the trigger migration and exercised the
publisher role with its existing grants. It verified same-band retries,
cross-band claims for different markets on the same fixture, and archive
immutability. A scoped MariaDB 11.4.13 test applied the overlay, accepted
historic and half-hour slots, and rejected invalid slots. Competing writers
produced one commit and one rollback on both an empty and a populated date
range. The retry saw the existing fixture allocation.

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

## Hosted hourly rollout

Staging and production promoted the same verified package from `51c1aa0b` on
November 21, 2026. Both migration ledgers verified 89 required migrations.
The scoped backups covered the affected publication tables and the migration
ledger. Browse, filters, archived dates, Builder and Matches passed over HTTPS.
An isolated MariaDB verification exercised concurrent retries, legacy snapshot
preservation and immutable append constraints.

Each hosted account uses a dedicated TLS database role with SELECT on
fixture and forecast evidence and SELECT/INSERT on the five publication tables.
The staging one-shot run read its configured cohort and found zero qualifying
picks. The production preflight read 173 fixtures from the same-day cohort.
Both hourly timers are enabled. Their first automatic slot was scheduled for
20:00 Kampala time on November 21. The 06:30 private model study stays
separate from the hourly publisher.

Older web builds can still serve the migrated schema before any hourly batch
exists. Once hourly batches are present, recovery needs an append-aware read
build so the archived ranks and counts remain readable.

On 24 November 2026, production moved the publisher to the `ghprod` crontab on
`server2.goalhint.com` and disabled the former production timer. The crontab runs
`~/goal-hint-slip-publisher/private/run-stored-publisher.sh` at `:00` and `:30`.
The launcher holds a private lock, reads stored odds through the dedicated TLS
database role, and writes its run result to `~/goal-hint-slip-publisher/private/publisher.log`.
The first production run published four slips in the 2.50–5.00 band. The public
API served all four, and the 14 stored selections satisfied fixture uniqueness
and the 30-minute kickoff buffer.
