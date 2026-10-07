# 043 Private recovery watchdog

**Feature:** Detect and recover missed or stalled background work safely.

**Depends on:** [020-durable-jobs.md](020-durable-jobs.md), [021-daily-selection.md](021-daily-selection.md), [023-cutoff-locking.md](023-cutoff-locking.md), [025-prediction-refresh-worker.md](025-prediction-refresh-worker.md), [027-market-settlement.md](027-market-settlement.md).

**Source:** [App specification](../app-write-up.md), sections 5, 9–11, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing job/lease/publication services. Implement a private watchdog that identifies missed EAT runs, stale leases, stalled jobs, missing cycle locks and unresolved result work using documented thresholds. Reuse durable services and idempotency keys for repair; do not introduce a second publication path or a public admin dashboard.

Resume committed manifests exactly as stored. Incomplete imports may resume before dispatch; finalized degraded manifests remain immutable. Late discoveries cannot be appended. Expire/reclaim leases through fenced, transactional ownership rules and use bounded backoff with jitter. Failed or retained-previous refresh work may resume only while its original job/cycle/window remains eligible. Published jobs return the existing revision and remain final. Recovery cannot publish at/after cutoff, reopen locked cycles, replace locked picks or bypass status freshness, run ordering, essential reserves or spending limits.

Provide documented private operator commands for inspection, dry-run planning and approved repairs, including an audited path for resolving confirmed mapping errors through existing canonical identity services. Require validated service credentials/workload identity or hosting controls for every mutation. Capture the actor, reason, affected records, previous state and outcome in audit records; redact secrets and sensitive payloads. Restrict destructive/ambiguous repairs to reviewed input and never infer team identity from a name alone.

Make the watchdog itself resumable and bounded. If hosted cron only enqueues work, ensure missed/failed invocations have an independent detection/recovery route. Reuse existing quota dispatch controls for any necessary provider calls. Document incident steps and the remaining ownership/threshold decisions required before enabling it live.

## Acceptance checks

- Simulate worker crashes, duplicate deliveries, stale lease owners, missed cron and locks arriving after cutoff.
- Confirm recovery preserves manifest membership, publication uniqueness and immutable locked forecasts.
- Check unauthorized mutations fail and dry runs perform no repair writes.
- Verify incomplete/degraded imports and unresolved results recover without false emptiness or fabricated settlement.

## Handoff

Update `docs/development-progress.md` with changed files, checks/results and blockers. Record recovery thresholds, ownership and commands in `docs/implementation-decisions.md` and the operator runbook.
