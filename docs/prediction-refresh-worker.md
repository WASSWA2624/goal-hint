# Daily prediction refresh worker (025)

`createPredictionRefreshService` exposes a durable job `definition`, `outcome(jobId)`
and repairable `reconcileRun(runId)`. Register the definition in the existing
operator-controlled worker binding and use its type/version in the daily selection
policy. The implementation supplies no live model, provider, spending or freshness
defaults. Public reads never call this service.

## Binding and authorization

Compose the existing MySQL job queue, selection store, evidence service, pinned
model registry, primary predictor, fallback service, lifecycle and atomic revision
publisher. Supply separate AI/research cost services and the reviewed
`createRefreshObservationCollector` using the primary football adapter. All
underlying runtime, rights, model, calibration, rate, account budget, evidence and
publication gates still apply. `configure(member)` must return an explicit
`RefreshPlan`; `authority.verifyPlan` proves its approval. These functions are
trusted server code, never HTTP payloads.

The member loader verifies the sealed daily manifest, committed boundaries and
selection hash, exact entry/envelope/job identity, cycle, canonical fixture/teams,
current rolling window and schedule. It rejects an older run after a newer
accepted revision. Model configuration and all request/cost intents are persisted
once, before outbound work. Restarting a job restores that intent rather than
reading newly selected configuration. A model registry's `verifyPriorPin` and
predictor/fallback/publication authorities must prove the stored pin and stage
receipts. Synthetic test approvals are not production bindings.

## Time, requests and costs

The approved plan allocates evidence and AI time ahead of the durable job's
fallback reserve. That reserve must cover fallback, the bounded final status call
and publication time. Football history, fallback and status request maxima must
fit an explicit total football request limit; one HTTP attempt per adapter call
prevents hidden retry spend. The existing shared football limiter remains the
account-wide quota authority, including essential reserves.

AI/research requests use stable job/phase identities and fixture kickoff priority.
Their own durable cost gateways apply separate account and per-job caps, request,
token, billed-unit and time limits. An interrupted dispatch remains potentially
billable and retains its existing liability. The final operational receipt stores
the separate ledger summaries and references, including estimates, observed and
invoiced spend. Unknown accounting remains explicitly unavailable/uncertain.
`DurableJobUsage` records football, research and AI counts independently, in the
same transaction as each completed stage. Replaying a saved stage does not add
another usage entry.

Parent workflow cancellation reaches evidence, predictor, fallback and final
status collection. Each phase also has a monotonic time bound, rechecks
authorization before I/O and checks the owning lease/current cycle between
phases. Remaining time can narrow a call but cannot expand the approved intent.

## Resolution and publication

Evidence uses the existing bounded, attributable snapshot service, retaining
source timestamps, missingness, rights and limited-news labels. The primary AI
receives only that snapshot through the existing untrusted-evidence prompt.
Ready-made provider forecasts become reachable only in the fallback phase.

The existing predictor validates/calibrates AI output. The existing fallback
service requests only missing/invalid source groups and applies shared
consistency/provenance rules. If the provider attempt times out or was interrupted,
its `resolveWithoutProvider` path applies those same rules to preserve valid AI
families. Match result and derived double chance remain one group. No previous
market is copied into a partial new revision.

The worker collects an original, bounded fixture status response immediately
before publication and sends it through lifecycle handling. Stale safety evidence
can close writes, but cannot prove publication eligibility. Status, schedule and
cycle are checked again. Only the atomic publication service accepts a complete
revision, including strict cutoff/freshness checks inside its transaction.
Zero valid groups therefore retain an eligible previous complete revision with
its original timestamps, or produce unavailable.

## Recovery and progress

`PredictionRefreshIntent`, `PredictionRefreshStage` and
`PredictionRefreshOutcome` are sealed, append-only tables. A stage has a single
started boundary and a single completed receipt. An unfinished boundary after a
crash is uncertain; it never authorizes another outbound attempt in that stage.
Saved results can be reused only while the job remains eligible. An interrupted
evidence/status stage fails conservatively; an interrupted AI/fallback stage can
still resolve through remaining approved fallback capacity or saved AI groups.

A published refresh is read before eligibility/configuration checks and returns
its original publication/revision. A lost publication response does not start
research or prediction again. Non-published final receipts also replay unchanged.
Operational outcomes are published, retained-previous, unavailable, skipped or
failed, with phase reasons and costs.

The durable worker's optional awaited `settled` hook reconciles queue terminal
states and aggregate progress after acknowledgement/failure. Hook errors cannot
change a committed queue outcome. Call `reconcileRun` after recovery/startup to
repair a death between acknowledgement and the hook, or jobs expired before
claim. It reports finished only when every selected job is terminal; successful
queue completion includes correctly skipped/unavailable work and is distinct
from publication success.

The worker database role needs SELECT/INSERT, without UPDATE/DELETE, on the three
new tables and the existing append-only usage ledger, plus the existing component
grants. Apply the migration using the migration role. No new manifest members,
hourly refreshes, visitor-triggered AI, result poller or live activation is included.

## External blockers

Production activation still requires the existing approved football coverage and
quota/rights evidence, research provider/license, AI model and evaluation,
prices/caps/allocations, freshness policies, deployment/worker binding and
authority proofs. Local synthetic checks establish orchestration and persistence
behavior; they do not establish live provider availability or forecast quality.
