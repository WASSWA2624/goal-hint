# Fixture and result synchronization

Prompt 026 provides a continuous private poller, durable original observations
and versioned result snapshots. Settlement belongs to 027, public projections
to 028–030 and event consumption/cache invalidation to 031.

## Binding and activation

Start `npm run worker:results -- --binding /absolute/path/to/trusted-binding.mjs`.
The trusted module exports `createResultSyncBinding(runtimePolicy)` with
`authorizeWorker`, optional `verifyDatabaseEvidence` and `createPoller(database)`.
The command owns database initialization/disconnection; SIGINT/SIGTERM cancel
provider work and release a still-owned lease. No HTTP route imports the worker.

Construct `createResultSyncService` with an account ID shared with the provider
adapter/limiter, a unique process owner, explicit approved policy, synchronous
authority verifiers, `createMysqlResultSyncStore`, and the existing adapter's
evidence methods. Give the store the existing lifecycle and cutoff services.
Keep policy, response/retention, status mapping, regulation-score and provider
operation approvals independent. Production uses `createPolicyApiFootballAdapter`
with the account-wide durable limiter.

No production binding, credentials or polling horizons are supplied here.
`parseResultSyncPolicy` refuses missing approach thresholds, active windows,
unresolved/correction tiers, resource bounds, lease or outage bounds. Synthetic
test policies do not select operating values. Approved competition/season
coverage, retention and provider rights, batching support, account evidence,
hosting/worker identity and existing lifecycle policies remain live gates.

## Cadence and quotas

| Work | Normal cadence | Request and safety |
| --- | --- | --- |
| Live | 15 seconds during the approved approach/active window | One `/fixtures?live=all&timezone=Africa/Kampala`; filter canonical coverage locally. Pause outside the window. |
| Current EAT date | 60 seconds, including while live is idle | `/fixtures?date=YYYY-MM-DD&timezone=Africa/Kampala`; validate boundaries and paging. |
| Missing-live/cross-midnight | 60 seconds during the active/result window | At most 20 IDs per group, excluding fixtures refreshed by another response or catalog caller. |
| Long unresolved | Approved progressively slower tiers after the active window | Finite horizon; retain visible records after checks stop. |
| Final/correction | Approved progressively slower tiers after first observed final | Fixed anchor survives restart and corrections; existing catalog final observations retain their original anchor. |

Tier `untilAgeMs` boundaries are exclusive; intervals strictly increase and are
at least 60 seconds. Unresolved tier age starts after `activeWindowMs`, measured
from kickoff or first tracking when kickoff is unknown. Final age starts at
`firstFinalAt`, including canceled/abandoned/awarded statuses, whose results
remain ineligible for played-match settlement. Exhaustion records
`polling-horizon-exhausted` with a null next check. No row is deleted or status
invented. Shared date responses can still supply corrections without extra
individual requests. Missing live entries never establish full time.

IDs use `results-cutoff`; historical finals run before optional feeds. Date
requests carrying covered finals within their correction horizon also use that
priority. Other live/date work uses `live-date-sync`. Every attempt/retry passes
through the existing adapter/limiter: 12/second, 720/minute, 120,000/day and the
protected 20,000 essential reserve. Batches and operation requests are bounded.
Unverified batching falls back to bounded single-ID adapter requests.

Failures and quota denials retain sanitized reasons, use capped exponential
backoff and honor longer provider/limiter retry times. Per-channel backoff and
fixture attempts survive restart. Private `health()` exposes channel errors/due
times; result state exposes actual sync, attempt, next check, failures and delay
reason. Stored projections remain usable during outages.

The provider's [optimization guide](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)
documents centralized reuse and at most 20 hyphen-separated IDs. Its
[World Cup integration guide](https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports)
documents `live=all` and approximately 15-second fixture updates. These contracts
do not prove account-specific coverage or rights. The existing fixtures adapter
expects paging `1/1`; unexpected multi-page responses remain incomplete instead
of adding an unsupported `page` parameter.

## Lease and recovery

`ResultPollerLease` is keyed by the existing quota account with an owner,
monotonic fence, database-time expiry and durable schedules. The permanent
account row serializes cold-start lease creation. Renew before work; request
deadlines fit within the lease, and monotonic elapsed time guards dispatch even
if the wall clock stalls. Persistence rechecks ownership/expiry under row lock.
Slow application renews between fixture transactions. Late old owners cannot
save, apply, renew or release a replacement owner's lease. No database lock is
held over provider I/O.

Reserve the next cadence before dispatch. Save `ResultSyncBatch` before applying
fixtures. Its sealed body retains normalized lifecycle projections, original
retrieval/update clocks, policy hash, requested IDs/date, request count and error.
No raw payloads or secrets are stored. Only `completedAt` is mutable. Recovery
drains pending batches before new requests; a different policy hash holds
recovery for reviewed configuration.

Each fixture applies under the existing provider → fixture locking order inside
the lease-owned transaction. `observeProjection` reuses lifecycle validation,
identity checks, schedule/start/conflict decisions and cutoff handling. Its
receipt, result, observation, state and events commit together. An interruption
between fixtures replays committed observations without duplicate results/events.
Response-loss retries recover original records and clocks.

`ResultProviderObservation` retains unchanged/stale/conflicting supplied evidence
with a composite FK to the same fixture's lifecycle receipt. Unknown fixtures
remain catalog ingestion's responsibility. Polling does not map by names, create
refresh jobs or add committed manifest members. Absent rows produce attempt
state rather than invented provider observations.

`FixtureResult` appends material status, elapsed time, reported goals, verified
regulation and separately labeled extra-time/penalty totals. Unknown regulation
remains unresolved; other totals cannot establish it. Lifecycle may preserve a
known verified score after a missing-score response for the unchanged status.
Corrections append a predecessor-linked result. Results retain original clocks;
unchanged responses advance actual `lastSyncAt` without new result/generation
time. Replaying cached/old responses preserves their retrieval age.

## Result event contract

`PredictionChangeEvent` extends the existing per-fixture cursor:

- `kind = fixture-result`; `fixtureResultId = FixtureResult.id`.
- `(fixtureId, version)` equals the result's `(fixtureId, fixtureVersion)`.
- `at` is database application time, separate from provider retrieval/update.
- Exactly one refresh result, cycle operation, lifecycle receipt or fixture
  result binds an event, enforced by shape checks and foreign keys.

Material result changes advance `FootballFixture.dataVersion`. Lifecycle and
result changes may emit separate versions in one transaction. Consumers must
be idempotent, order by the fixture cursor and read a coherent stored projection.
An event does not authorize forecast mutation or settlement without independent
final-status/regulation verification. 027 will settle the same locked selections;
031 owns delivery/acknowledgement and cache invalidation.

## Grants, verification and rollback

Grant SELECT/INSERT/UPDATE on `ResultPollerLease` and `FixtureResultState`;
SELECT/INSERT plus UPDATE(`completedAt`) on `ResultSyncBatch`; SELECT/INSERT only
on `FixtureResult` and `ResultProviderObservation`. Reuse existing lifecycle,
history, cutoff and quota grants. No DELETE or immutable-body UPDATE is needed.
New tables use InnoDB and binary identity collation; account FK columns match
the existing quota account's collation.

Run `npm run test:results` with the owned disposable genuine MySQL harness;
set `MYSQL_TEST_SERVER_BINARY` if discovery is unavailable. Clocks, transports
and approvals are synthetic. No live provider, subscription, application
database or installed service is used.

Rollback stops the binding and preserves additive schema, observations, result
revisions, manifests and forecasts. Inspect actual DDL state and repair forward.
Disabling polling does not disable publication/cutoff protection or permit locked
forecasts to change.
