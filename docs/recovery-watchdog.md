# Private recovery watchdog

Prompt 043 provides private inspection and reviewed repair through the existing
durable worker. There is no HTTP route, public dashboard or second publication
path. OP-29 remains a live-enablement blocker: no recovery owner, production
thresholds, repair approval authority or independent schedule has been approved.
The numeric settings in tests are synthetic and are not operational defaults.

## Binding and credentials

Supply trusted local operator code exporting
`createRecoveryBinding(runtimePolicy): RecoveryBinding`. Its contract is in
`src/server/recovery/recovery-command.ts`. The binding supplies an explicit
`RecoveryPolicy`, `RecoveryAuthority`, database evidence verifier where required,
and `createServices(database)`. Factories configure services without dispatching
work. Keep bindings and reviewed plan files outside the repository and public
directories; restrict their filesystem and process access to the operator role.
Binding paths are executable local code, never request parameters.

`authorize(permission, plan?)` must validate current service credentials or
workload/hosting identity, expiry/revocation and the named `inspect` or `repair`
permission. An actor string, shell username, environment flag or approval
reference is not authentication. `verifyPolicy` resolves owner approval of the
exact thresholds; `verifyPlan` resolves review of the exact plan, actor and
reason. No permissive implementation or fallback is shipped. Worker startup
also requires the repair permission; each repair and audit write rechecks the
plan authority. Domain authorities must independently enforce current source
rights, budgets, retention, approved selection/model/freshness policy and identity.
If an automatic schedule is approved later, its verifier must bind that grant to
the exact generated plan and allowed actions. Mapping changes require explicit
review, even when routine recovery is automated.

`createServices` binds the existing daily-selection factory, cutoff locking,
market settlement and optional result poller and canonical catalog mapping
service. The selection factory **must use the supplied stored policy**, including
its original refresh envelopes and limits. New runs use `selectionPolicy` only
after its ordinary selection authority approves it. Results require the same
approved provider account in both policy and service. Use the existing adapters
and quota/cost gateways; no direct provider transport belongs in a binding.
Release the poller with `close()` on command shutdown. Do not place credentials
in actor/reason/reference fields; use short incident and approval identifiers.

## Commands

All commands are private, run from the repository root, with the ordinary runtime
database gates and secrets. Examples use operator-supplied files, not shipped
credentials or executable examples.

```powershell
npm run recovery -- inspect --binding D:/private/recovery-binding.mjs --scope runs
npm run recovery -- plan --binding D:/private/recovery-binding.mjs --scope jobs
npm run recovery -- plan --binding D:/private/recovery-binding.mjs --scope locks
npm run recovery -- plan --binding D:/private/recovery-binding.mjs --scope results
npm run recovery -- plan --binding D:/private/recovery-binding.mjs --scope settlement
npm run recovery -- apply --binding D:/private/recovery-binding.mjs --input D:/private/reviewed-plan.json
npm run recovery -- worker --binding D:/private/recovery-binding.mjs
npm run recovery -- audit --binding D:/private/recovery-binding.mjs --job <job-id>
```

`inspect` and `plan` are read-only synonyms: they return findings and a draft,
never acquire leases, audit, import, enqueue, settle or call a provider. A null
draft means no repair was identified in that page. Jobs and locks return `next`
for bounded keyset pagination; continue using `--after <next>`. Audits likewise
return `next` and accept `--after`. Start subsequent sweeps at the beginning so
changed records behind a cursor are detected. Run all five scopes; one scope is
not a health report for the others.

A review takes the returned `draft` object and adds `actor`, `reason` and
`approvalRef`. The verifier must authorize that exact completed object. Do not
edit times, targets or thresholds without new review. Drafts expire; regenerate
them after expiry or state changes. `apply` bounds input to 64 KiB and atomically
persists the durable recovery job and audit intents; it does not execute repairs.
Start the dedicated recovery worker, or register `watchdog.definition` in the
existing authenticated worker registry. Repeated apply of the exact plan returns
the same job. A stalled pending domain job requires its ordinary worker and
registry; it is not copied or given a new budget by recovery.

For a confirmed mapping review, add a strict `mapping` action with numeric
`externalId`, `candidateExternalId`, `observedAt`, approved `evidenceRef`,
`sourceRef` and `retentionEvidenceRef`. No names are accepted. The catalog
authority must verify the proof and retention. An absent alias can resolve to
the proven canonical team. Conflicting existing canonical mappings remain held
with `conflicting-mapping`; the watchdog does not merge teams, move fixtures,
rewrite history or accept a force flag. Escalate such cases for a separately
reviewed canonical migration that preserves historical bindings.

## Required thresholds and bounds

| Setting | Meaning and enforced range |
| --- | --- |
| `evidenceRef` | Reference to approval of this exact version-1 policy. |
| `lookbackDays` | 1–7 EAT dates including today; never scan an unlimited past. |
| `runGraceMs` | 0–86,400,000 ms after midnight EAT before a run is considered missed. Busy selection leases remain owned. |
| `stalledJobMs` | 1,000–86,400,000 ms after `availableAt` before reporting pending jobs needing a worker. |
| Lease expiry | The existing database-clock lease/deadline is authoritative. No grace permits stealing a live lease. |
| `lockGraceMs` | 0–86,400,000 ms after stored cutoff for detection. Observed-play barriers and played canonical statuses are detected immediately. This never extends publication eligibility. |
| `resultGraceMs` | 0–86,400,000 ms for overdue result cadence/work; original result polling/correction horizons still apply. Exhaustion requires review, not a fabricated final. |
| `maxItems` | 7–50 repairs per plan/page. Run lookback is at most seven dates. |
| `planTtlMs` | 1,000–3,600,000 ms; the durable job also expires at the approved plan expiry. |
| `resultAccountId` | Approved shared account hash, or null when result recovery is unavailable. |
| `job` | Explicit queue priority, 1–16 attempts, 1–300 second invocation timeout, 1–120 second lease, and bounded exponential equal-jitter backoff. Existing domain jobs retain their own limits. |

The result poller now applies at most `maxBatchesPerTick` committed batches before
yielding. It drains stored responses before new provider dispatch, honors abort,
and resumes remaining batches on its next tick. Its own fenced account lease,
cadence reservations, essential priorities and shared quota remain authoritative.

## Recovery invariants and audit

Accepted plans are durable `operations.recovery` jobs. The ordinary worker owns
heartbeats, deadlines, fencing, finite attempts and equal-jitter retries. Each
action has a deterministic intent and completion key. After a crash, completed
actions are skipped and an interrupted action invokes the same idempotent domain
operation. A crash after the domain commit but before its audit outcome can
therefore be reconciled without another publication or changed lock. Lost owners
cannot write completion receipts. Repairs are individually committed, not one
transaction across provider calls or an entire plan.

`RecoveryAudit` is INSERT/SELECT only. Each intent contains actor, coded reason,
approval reference, affected IDs and a redacted previous-state snapshot. Outcomes
contain fixed dispositions and receipt IDs. Failed attempts record a sanitized
failure; if ownership has already expired, use the durable attempt/event history
with its intent to establish the interruption. No error text, provider bodies,
job payloads, credentials, lease-owner tokens or free-form notes are copied.
Hashes are checked on reads; audit corruption fails closed. Page through audit
records, then order by timestamp/action in incident tooling. Grant the recovery
role `SELECT, INSERT` on `RecoveryAudit`, never UPDATE/DELETE; reuse the existing
least-privilege domain grants. The migration account alone deploys the incremental
migration and indexes.

Selection resumes unfinished import receipts before dispatch, and uses sealed
manifests exactly as stored. It never enables degradation itself. A finalized
degraded manifest stays partial and cannot admit a later discovery, even when
new catalog data becomes available. Failure is not proof that a date is empty.

Queue recovery compares the inspected version and locks the original job.
Live owners and changed versions are untouched. Expired owners are finalized
through the queue's existing attempt/event transition and jitter calculation.
Failed work without a final refresh receipt may retry only with attempts left
and the original member's full eligibility checks. Attempts, stages, model pins,
cost references and envelopes are never reset. Published receipts reconcile to
the existing revision. Immutable failed/retained-previous/unavailable/skipped
receipts remain final; the watchdog does not erase them to purchase a new attempt.
This deliberately leaves retained output in place until the next ordinary
eligible daily run. Closed cycles, old runs, expired windows and cutoff cannot be
made eligible by a reviewed recovery plan.

Cutoff recovery calls the existing locker directly, including after downtime;
it reconstructs the eligible accepted revision from stored schedule/publication
history and never considers results. Existing close receipts are returned.
Settlement uses only verified stored results and the immutable locked revision;
unresolved results stay pending or unavailable under the ordinary rules.

## Incident procedure and independent route

1. The assigned operator validates identity, database health, rights/budgets,
   clock and the incident's scope. Preserve job, attempt, manifest and audit IDs.
2. Inspect all relevant scopes with the private CLI, independently of hosted
   cron, the web server and visitor activity. Continue keyset pages. Inspect the
   existing worker/poller readiness and original result horizon before repair.
3. Review exact targets, prior state and approval proof. Resolve pending-worker
   incidents by restoring the ordinary worker. Never delete a manifest/outcome,
   reset attempts, disable a quota reserve or reopen a locked cycle.
4. Apply the approved plan and run the private recovery worker. Check both the
   recovery audit and original domain receipts/progress. A queued or attempted
   action alone is not proof the incident is resolved.
5. If a plan expires or an attempt exhausts, inspect again, reconcile any
   intent without outcome against canonical records, and seek a newly reviewed
   plan. Do not blindly replay external provider requests. Preserve history.
6. Close the incident only after stored state and future scheduling are checked.
   Follow the approved monitoring/notification process when one exists.

The CLI is the implemented independent detection/repair route when a hosted
enqueue-only cron is missed or failed. Before live operation, OP-29/32 must name
an independently supervised invocation or on-call CLI process and its frequency;
running the recovery worker alone does not detect a missing plan enqueue.
OP-29 must also assign primary/backup incident owners, allowed automatic actions,
reviewers, thresholds and escalation. OP-30 alert destinations, OP-31 restoration
and retention, OP-32 hosting/workload identity, and provider/model/budget/source
rights remain separate unresolved gates. No production scheduler, provider call,
message, backup restore or operational service commitment is established here.
