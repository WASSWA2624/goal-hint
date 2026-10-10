# Private operations monitoring

Prompt 044 implements private read-only operational inspection and a bounded,
durable alert outbox. **The owner explicitly chose local verification only.**
There is no approved incident owner, destination, monitoring/hosting provider,
live threshold, notification schedule or telemetry retention policy. OP-26,
OP-29/30/32 and infrastructure/billing evidence remain release/activation blockers.
No external message, paid account, provider request, visitor tracker or public
monitoring interface is enabled. Synthetic test settings approve nothing live.

## Operator interface and activation

The trusted local `MonitoringBinding` contract is in
`src/server/monitoring/monitoring-command.ts`. An operator-owned `.mjs`/`.ts`
module exports `createMonitoringBinding(runtime)`, supplying:

- A complete strict `MonitoringPolicy`: coded approval reference, incident
  owner and destination, retention evidence, finite retention/reminder/evidence
  freshness windows, 1–7 EAT days, one shared provider-account ID and every
  threshold. Unset fields are rejected. Thresholds are owner decisions, not the
  synthetic settings in `tests/helpers/monitoring-fixtures.mjs`.
- An authority that verifies the exact policy and current workload credential
  on inspection and notification. Policy text/owner names alone grant no access.
- An authorized sink whose coded destination exactly matches the policy, and
  optional verified cost readers. Sink code owns destination authentication and
  idempotency; it must honor abort/deadline signals. Do not log its raw errors.
- Production database approval evidence where the runtime requires it, and an
  optional cleanup callback. Binding paths are trusted local code, never HTTP
  input; approval must include importing this code and its recipients.

After these decisions and the privacy review, the command forms are:

```powershell
npm run monitoring -- inspect --binding <private-approved-binding.mjs>
npm run monitoring -- notify --binding <private-approved-binding.mjs>
```

`inspect` reads canonical records and prints JSON. It does not write outbox,
quota, ownership or forecast records. `notify` commits conditions to the outbox,
then delivers at most eight pending messages per invocation. Neither command
repairs anything. Use [recovery-watchdog.md](recovery-watchdog.md) for separately
reviewed canonical recovery. No permissive live binding or scheduler is shipped.
An independently supervised invocation/heartbeat route is still required:
process termination, web/DB outage and failed scheduling cannot reliably alert
through the same failed process/database. Private command failures exit nonzero
with a static sanitized diagnostic; do not treat absent output as health.

Migrate with the dedicated schema account. A dedicated monitoring role needs
SELECT on the inspected canonical tables and SELECT, UPDATE (`stateJson`) on
`OperationsMonitorState`; it needs no provider secret or writes to canonical
data. The migration creates and seeds exactly one row (`id=1`), enforced by a
database check. Application runtime must not receive INSERT/DELETE/DDL on it.

## Measurements and interpretation

The collector uses database time and a repeatable-read snapshot, indexed time
windows, aggregate counts and at most 50 correlation breadcrumbs. Fields are
strictly allowlisted. IDs for EAT run/date, fixture, cycle, job and model version
stay as bounded breadcrumbs; they are never metric labels. There are no team
names, search text, URLs, HTTP headers, owner tokens, raw evidence, job payloads,
provider bodies or exception messages in telemetry.

| Signal | Meaning / first response |
| --- | --- |
| Availability | A failed usable database snapshot reports unavailable, with other values unknown. Inspect database/runtime health and independent host supervision. |
| Runs | Missing/uncommitted daily runs after approved grace; partial manifests and unfinished work stalled beyond the configured interval. Review EAT selection/import receipts; preserve committed membership. |
| Jobs | Failed/stalled counts, completed count, total completed-attempt duration and sample count. Duration is elapsed database time, not model latency alone. Use original job/attempt receipts; do not reset attempt budgets. |
| Reasons/source failures | Separate allowlisted job reasons, refresh outcomes and refresh reasons; unknown codes map to `other`. Import failures and current-period provider errors are classified occurrences, not unique failed network requests. |
| Cutoff/locks/stale data | Due active cycles with no accepted set, missing closure after approved grace or observed play, and old retrieval clocks for active nearby scheduled/live fixtures. Current time never extends publication eligibility. |
| Poller/results | Current lease ownership is reduced to present/missing (no token); overdue date polling and unapplied batches are separate counts. Unresolved state is separate from overdue, already-kicked-off tracking. Reliable final results whose available locked markets have no current settlement beyond the approved delay are counted as final-badge delays. A future fixture or a completed approved polling horizon is not automatically a final-result outage. |
| Recovery | Original recovery audit outcome/failure counts; inspection never creates new recovery work. |
| Shared football quota | Active shared-account reserved/conservatively charged count, actual launch records, rolling second/minute launches across period boundaries, uncertain attempts, effective remaining allowance, essential use/consumed reserve/remaining protected capacity, 429/provider-error counts, reset pending, credential/subscription failure and expiry. Counts cover the whole shared ledger, not one caller. |

Quota reservation is not proof of network dispatch. Reconciled external usage
can exceed locally observed launches; conservatively charged requests are not
refunded by monitoring. Remaining capacity is the lower provider/local allowance.
The essential reserve remains within the 120,000 daily ceiling; it is not an
extra allocation. Expired/unconfirmed provider periods remain pending and never
gain capacity from an EAT-day rollover. Separate external callers must still use
the same account-wide limiter/ledger; undisclosed callers cannot be measured
exactly from repository data. Reset/credential/expiry findings require provider
and account review, not unbounded retry or a new plan.

## Costs and missing evidence

Eight fixed budget categories remain distinct: football, AI, research, database,
hosting (including workers/queues), monitoring, network and domain. Football is
a **monthly payable maximum of US$45**, including tax, FX and fees; a lower
approved cap still binds. Football evidence must cover a 28–31 day billing
period and cannot configure a higher cap. It cannot borrow unused AI or hosting
budget. No alert purchases, upgrades, increases caps or overrides the existing
quota/cost gateways.

`monitoringCostFromSummary` reuses the canonical AI/research ledger: opening
charges plus conservative liability, with invoiced amounts separate. It labels
that coverage estimated, not final payable spend. `monitoringCostFromUsage`
accepts verified integer usage, decimal USD rates, fixed charges (including
verified fees), invoice evidence and explicit coverage; fractional picodollar
liabilities round upward. Infrastructure/domain/football billing adapters and
their source approvals are pending. These functions do not invent rates or prove
that an incomplete bill includes every tax/fee. Bindings must validate actual
billing exports, approved periods/caps and evidence authority before supplying
records. Stale/absent/partial evidence stays visible; it is never a zero bill.
Known lower bounds can raise pressure/cap alerts; incomplete evidence cannot
clear a previously firing cost alert. Warning percent is required below 100;
expiry warnings require a positive approved lead time. These are detection
controls, not spending authorization or a guarantee against sudden usage spikes.

## Alert lifecycle, severity and retention

Rules and scope labels are fixed: application plus the eight budget categories.
The single state row holds at most 64 slots and 128 KiB; no append-only telemetry
table is introduced. Detection/claim/ack transactions serialize on this row,
while notification I/O occurs outside the transaction. The same condition is
deduplicated until resolution, reopening, severity change or the approved
reminder interval. Unknown evidence cannot resolve an existing incident.

Every message carries a stable delivery ID, incident ID, firing/resolved state,
coded owner/destination/policy reference, severity, times, value, at most five
correlations and this runbook path. Outages, missing runs, failed jobs, cutoff
misses, missing locks, credential/subscription failures and cost caps are
critical; degradation, staleness, pressure, impending expiry and pending evidence
are warnings. An approved sink maps these severities to an approved channel and
an actual primary/backup response procedure. No response-time promise exists.

Delivery claims are fenced for 30 seconds and have a five-second transport
deadline signal. Successful ack applies only to the claimed delivery version;
a stale owner cannot ack a newer alert. A crash after external send and before
ack can repeat the **same ID**, so external sinks must deduplicate that ID.
This is at-least-once delivery, not a cross-system exactly-once guarantee.
Unknown transport outcomes retry after the claim expires. A different approved
policy hash is refused rather than silently redirecting existing incidents;
review/drain or retire the old state under explicit database maintenance approval
before changing ownership/destination/policy.

At every authorized state transaction, resolved slots expire by change time and
unobserved firing/pending slots expire by last observation under the approved
finite retention (at most seven days). An actively observed incident remains one
bounded slot; reminder delivery replaces its payload. Expiry can drop an old
undelivered notification; independent supervision must detect prolonged delivery
failure. If monitoring stops entirely, stored bytes remain until the next
authorized transaction/approved maintenance. This is not a physical deletion or
backup-retention guarantee. Canonical job, quota, audit and forecast history is
not deleted by this policy; OP-31 still owns its retention.

`createLocalMonitoringSink` is a bounded in-memory, ID-deduplicating sink with
explicit TTL/capacity, expiring on reads/writes. It has no network/file output
and does not survive process exit. Tests use this sink and synthetic incident
owners only. Notification destinations and live retention remain unresolved.

## Performance, discovery and privacy

Public stored-read API handlers and the shared cache have reusable measurement
hooks. They start disabled. A separately approved private server bootstrap can
install `installServerMeasurements` for that process only, after verifying its
policy/retention reference. There is no client beacon, analytics SDK, cookie,
visitor ID or upload. It aggregates latency histograms and cache outcomes for
five fixed route families, at most 25 series, within an explicit window of at
most one day. The window expires on access; closing the collector clears it.
It records neither request objects nor parameter values. Cache lookup failure
falls back to stored reads even if telemetry fails. Private process histograms
are not fleet-wide latency or mobile field CWV evidence; host collection and
recipients must be approved before activation. API latency excludes SSR rendering
and browser/network/image performance.

`summarizeMobileVitals` accepts only approved bounded mobile aggregate samples
and preserves laboratory/field and local/staging/production labels. Targets are
p75 LCP ≤2500 ms, INP ≤200 ms and CLS ≤0.1, using nearest-rank p75. A local
synthetic/laboratory sample cannot become production field evidence. No actual
production samples exist, so no production percentile/target-passed claim is
made. A real field source, its sampling/aggregation methodology, minimum sample
qualification and traffic evidence still require approval. Aggregate inputs are
not accepted through a public endpoint.

Search impressions, indexed pages and CTR remain explicitly pending an
authorized search-source integration. Returning visits and match-detail use
remain disabled pending the analytics decision; server cache hit counts are not
unique visitors or return visits. No search service, property or traffic is
invented. See the updated flow register in [privacy-page.md](privacy-page.md).
The public prelaunch privacy summary remains accurate: no visitor tracker has
been activated, and hosting/monitoring/log recipients and retention are unknown.
Reconcile and owner-approve those facts before enabling hosted telemetry or any
browser measurement. Existing OP-27/28 operator/privacy contact blockers remain.

## Local verification

```powershell
$env:MYSQL_TEST_SERVER_BINARY = <absolute-owned-genuine-MySQL-8.4-mysqld-path>
npm run test:monitoring
```

Tests use an identity-checked disposable database, synthetic clocks, policies,
usage and provider responses, and a local sink. They exercise concurrent scans
and delivery, durable restart deduplication, redaction, permission failures,
expiry/retention, missing locks/staleness, quota reconciliation and single-pool
inspection. They never target the installed database or call a provider.
The handoff in `development-progress.md` records actual check results and
measurement overhead; local tests do not establish uptime, owner availability,
real-traffic performance, production billing accuracy or approved live alerts.
