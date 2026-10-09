# Durable jobs

Prompt [020](../dev-plan/020-durable-jobs.md) implements a private MySQL-backed
queue, typed registry, worker runner and reusable authenticated trigger adapter.
No public route, production handler, cron schedule or paid queue is activated.
Daily manifests, prediction orchestration, cutoff/lifecycle decisions, the
poller and watchdog remain with 021–026/043.

## Queue choice and deployment status

The local implementation reuses MySQL 8.4/InnoDB and the existing guarded Prisma
runtime. A committed job row is the durable delivery record, an equivalent to
transactional outbox reconciliation: there is no second broker send to lose
after commit. Workers repeatedly claim due rows, including expired leases.
Pending work survives application/database-connection restarts without a
process-local queue or an external notification.

This local choice creates no subscription or hosted runtime. OP-19 deployment
approval, OP-01 target/grants/TLS/capacity, OP-11 per-workload allocations,
OP-12 itemized infrastructure budgets and OP-32 hosting/isolation still require
their owners' decisions and representative workload evidence. No throughput,
01:00 EAT completion or hosted recovery target is established by these tests.
A managed alternative would need an approved adapter and equivalent evidence.

## Identity, payloads and records

`JobEnvelope<Payload>` is versioned and includes handler type/version,
idempotency key, JSON payload, optional refresh identity, availability/expiry,
priority, attempt/time/lease bounds, fallback reserve and exponential backoff.
Envelopes are strict, immutable after enqueue and limited to 64 KiB. Each
registered handler additionally owns its typed Zod payload schema. Validators
must preserve canonical values; transforms cannot silently change a stored
request. Encode exact BIGINT fixture versions as decimal strings in JSON payloads,
with the handler schema validating them. Never enqueue credentials, prompts, source articles or raw responses;
use existing immutable evidence/model and quota/cost references.

`defineJob` type-checks payload/handler pairs; `createJobRegistry` rejects
duplicate registrations and unknown versions and supplies the worker's explicit
claim allowlist. No default prediction handler exists. A rolling deployment
keeps old handler versions registered until its remaining jobs drain; unknown
versions stay durable for a compatible worker rather than being discarded.

| Table | Contract |
| --- | --- |
| `DurableJobEnqueueLock` | 64 migration-created control rows, sharded by refresh identity or job key. They serialize first insertion and conflicting refresh keys without one global queue mutex. They are not operational jobs. |
| `DurableJob` | Stable SHA-256 job identity, unique type/version/idempotency key, sealed envelope, optional run/fixture/cycle binding and mutable delivery state, attempt counter, fence, owner, lease/deadline and terminal reason. |
| `DurableJobAttempt` | One delivery per job/number, distinct attempt ID, monotonic fence, owner, original start/deadline, finish time and structured outcome/reason. Only outcome/reason/finish fields can change. |
| `DurableJobEvent` | Append-only ordered enqueue, claim, renewal, retry, completion, expiry, failure and usage events. No arbitrary error text or payload logging. |
| `DurableJobUsage` | Append-only actual request count/duration and opaque request/cost-ledger references, distinguished as dispatched/completed/uncertain. Idempotent by attempt/request/phase; changed replay conflicts. |

`DailyRun` and `PredictionCycle` gain inverse job relations. Composite foreign
keys require a refresh cycle to belong to its fixture and its run to exist.
A unique run/fixture/cycle key prevents another job/model key from obtaining a
second refresh identity. Put the pinned model and domain references in the
immutable typed payload. Retries retain this job/payload/business identity;
only delivery attempt ID, owner and fence change. Existing prediction-set
refresh uniqueness remains a second independent publication guard.

## Storage and transaction interface

`createMysqlJobQueue(database)` exposes `enqueue`, `claim`, `renew`,
`acknowledge`, `retry`, `recordUsage`, `inspect`, `history`, `attempts`, `usage`
and the transaction integration methods in `src/server/jobs/job-contract.ts`.

- `registry.enqueue(queue, envelope)` validates both envelope and handler
  payload. The lower-level queue validates generic storage fields; workers
  revalidate the typed payload before executing it.
- `queue.withTransaction(async (enqueue, transaction) => ...)` commits business
  rows and durable enqueues together. The scoped enqueue cannot escape the
  callback. Any enqueue failure prevents commit, even if caught by the caller.
  Exact duplicates return the existing job; changed input conflicts. Arbitrary
  callbacks are never automatically retried.
- `claim(ownerId, registry.types)` uses Read Committed and `FOR UPDATE SKIP
  LOCKED`. Competing workers skip held rows. Due order is priority descending,
  then availability and stable ID. Each successful claim creates an actual
  attempt and increments its fencing value before work starts.
- `renew` checks stored owner, fence, attempt identity, lease, hard attempt
  deadline and domain expiry using database UTC time. It cannot extend the hard
  deadline. All finalization and usage writes repeat these ownership checks.
  Equality at any expiry is too late, even before a replacement owner claims.
- `acknowledge` succeeds only for the current owner. `retry` appends the actual
  attempt outcome and either schedules a stored jittered delay or records a
  terminal failure/expiry. The maximum is 16 actual attempts. Equal jitter uses
  half to less than the capped exponential delay and never schedules immediately.
- Claim also reconciles stale running rows in bounded batches of 32. A dead
  owner's attempt records lease expiry or hard timeout, then observes the same
  backoff/cap/domain-expiry rules. It never grants stale ownership back.

For transactional business effects, call `assertOwned(transaction, lease)`
before the effect and `completeInTransaction(transaction, lease)` at the final
decision in that same transaction; propagate failures so everything rolls back.
Later publication uses the existing canonical provider→fixture lock order,
then the job ownership lock, and rechecks its own domain eligibility before
writing the forecast. Do not acquire canonical locks after a job lock. Batch
enqueues must use ascending `jobEnqueueBucket(envelope)` order; callers must roll back
and explicitly resume an idempotent business transaction on other lock conflicts.
Never hold any database lock during provider/network work.

At-least-once execution can repeat an external effect after worker death.
Use the stable job/business key for downstream idempotency and existing durable
quota/cost reservations for dispatch. A queue cannot roll back an external call.
Record dispatch references before I/O; retained dispatched/uncertain records and
the authoritative ledgers support later reconciliation. Late responses cannot
authorize a stale worker's forecast publication or reset paid allowances.

Private inspection is read-only. Event/usage cursors use ascending versions,
default 30/max 100; attempts are chronological and bounded by 16. Operational
payloads are intentionally private and must not be forwarded to visitor APIs.

## Worker deadlines, fallback and shutdown

`createJobWorker` runs one handler at a time per worker instance, outside database
transactions. Deploy additional instances only within the qualified concurrency
and aggregate database/provider limits. It renews at approximately one third of
the configured lease and serializes renewals. Database failure/lost ownership
aborts execution; the durable lease recovers through a later claim.

The handler receives an abort signal, fixed deadline, primary deadline minus
fallback reserve, `remainingMs(reserveFallback)`, `checkpoint` and `recordUsage`.
The time budget accounts conservatively for claim latency using a monotonic
process clock; ownership always uses the database clock. A typed optional
`eligible(payload, signal)` callback is rechecked at checkpoints and before
completion. Later handlers supply fixture/cycle/cutoff policy and reserve both
time and approved quota for fallback; queue bounds do not grant provider rights.

Handler outcomes and thrown failures become fixed structured reasons, including
invalid output/payload, insufficient evidence, timeout, rate limit, budget,
eligibility, worker shutdown and attempts exhausted. Raw thrown text, stack,
credentials and payloads never enter built-in logs or event records. Handler
authors must also keep their own diagnostics redacted.

Timeout/shutdown signals bound the runner's await and disable subsequent context
calls. Handlers/transports must honor abort and bound their own calls. JavaScript
cannot forcibly cancel arbitrary uncooperative in-process code or CPU loops;
deployment needs a supervised process termination/drain policy. Expired/fenced
ownership still prevents supported database finalization after a timeout.
SIGINT/SIGTERM stops new claims, aborts active work, attempts a durable retry
while ownership is valid and disconnects the owned pool. Abrupt death leaves
the committed lease for reconciliation.

## Local startup and internal triggers

Install the pinned dependencies and generate the Prisma client first. Supply
existing approved local database settings and a trusted operator module exporting
`createWorkerBinding(policy): WorkerBinding`, then run:

```text
npm run worker:jobs -- --binding /absolute/path/to/trusted-worker-binding.mjs
```

The binding supplies the registry, a current `authorizeWorker(policy)` verifier,
optional trusted database evidence verifier and polling interval. Authorization
must cover queue/host/workload identity, budgets and workload bounds; a true
literal in production is not qualification. There is no permissive default
binding, generated secret or implicit subscription. An empty/unapproved binding
fails closed. The test-only binding under `tests/helpers` is restricted to the
test policy and is not a production configuration.

The pinned Node 24 runner uses native TypeScript stripping, explicit relative
`.ts` imports and `--conditions=react-server`. It does not depend on Next.js
aliases, a development dependency loader or unsupported emitted TypeScript
syntax. Type-checking remains a separate required repository check.

`createJobTrigger` is a reusable POST adapter, not a mounted route. Supply a
trusted current service/workload identity verifier; validation occurs before
reading any body. The optional bearer adapter compares hashed tokens in constant
time and rereads the supplied secret for rotation. A missing identity rejects.
It accepts only bounded JSON and a registered typed job, returns a small 202
durable acknowledgement and runs no handler/provider work in the request.
No visitor authentication was added. Later schedulers must reconcile delivery
independently; failed Vercel Cron invocations are not assumed to retry.

## Migration, grants and recovery

Migration `20261009123830_durable_jobs` is additive, InnoDB and binary-collated.
Native checks enforce state/owner/deadline coherence, bounded counters, sealed
identity/payload projections and reason enums. It creates the 64 control locks
and no runnable jobs. Existing forecast/evidence rows are untouched.

Use separate migration credentials. Application grants need SELECT/INSERT on
the four job/attempt/event/usage tables; UPDATE only these mutable columns:

```text
DurableJob: state, version, availableAt, updatedAt, attemptCount, fence,
            ownerId, leaseExpiresAt, attemptDeadlineAt, finishedAt, terminalReason
DurableJobAttempt: outcome, reason, finishedAt
DurableJobEnqueueLock: SELECT and UPDATE for locking the existing control rows
```

No job DELETE, immutable envelope/attempt identity UPDATE, event/usage UPDATE or
DELETE, DDL, migration-history access or application lock-row INSERT/DELETE is
required. Production role verification remains a deployment gate.

Rollback stops workers/triggers and restores compatible code while retaining
additive schema, jobs, attempts and all forecast/audit history. Never drop jobs
to clear a failed deployment. Inspect partial MySQL DDL/migration state, repair
with a reviewed forward migration and verify drift before resuming. Database
backup/restore, retention, watchdog thresholds and hosted outage qualification
retain their later prompt owners.

## Verification

```text
npm run test:jobs
npm run test:history
npm run test:catalog
npm run check
```

The integration harness owns a fresh loopback MySQL instance with separate
migration/application credentials and native permission checks. It tests actual
competing clients, abrupt child-process death after a committed idempotent
effect, connection/worker restart, stale fences, capped retries/timeouts,
transaction rollback, usage references and standalone startup/graceful shutdown.
All handlers/data/approvals are synthetic and private to tests. Results and
deployment blockers are in [development progress](development-progress.md).

Implementation references: [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html),
[Node 24 TypeScript execution](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
and [Vercel Cron delivery constraints](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
