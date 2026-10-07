# 020 Durable jobs

**Feature:** Durable, idempotent background job execution.

**Depends on:** [002-runtime-policy.md](002-runtime-policy.md), [003-mysql-prisma.md](003-mysql-prisma.md), [019-prediction-history.md](019-prediction-history.md)

**Source:** [app-write-up.md](../app-write-up.md) §§9–11, 13–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions, current schema and recorded infrastructure decisions. Implement the durable job execution feature only. Use the approved queue strategy; a provider choice or paid infrastructure decision that remains unresolved must remain an explicit deployment blocker, not an invented subscription.

Create a reusable typed job envelope and registry with durable idempotency keys, payload validation, job/attempt records, renewable leases, fencing or equivalent ownership checks, bounded timeouts, capped exponential backoff with jitter and structured terminal reasons. Support at-least-once delivery and safe lease expiry after worker death. Separate delivery attempts from the business refresh identity so retries cannot acquire a second publication identity. Keep service credentials, worker modules and operational payloads server-only.

Provide enqueue, claim, renew, acknowledge, retry and inspect operations with database-backed evidence of state transitions. Make enqueue/recovery reliable across a transaction commit followed by process failure, through an outbox or equivalent durable reconciliation. Persist actual attempts, timing and cost/request references without logging credentials or raw sensitive payloads. Handlers must be able to reserve time for fallback and stop when their domain eligibility expires; the specific prediction handler arrives later.

Add a small deterministic test handler or harness for queue validation, isolated from production public routes. Internal triggers validate existing service/workload identity, enqueue promptly and return rather than performing long work in a web request. Document local worker startup and graceful shutdown. If using Vercel Cron later, do not assume failed cron delivery is automatically retried.

Do not implement the daily manifest, prediction orchestration, watchdog, full monitoring dashboard or visitor authentication in this prompt. Make the queue usable by those later features through one shared interface.

## Acceptance checks

- Simulate duplicate delivery, two competing workers, worker death after a side effect and an expired lease; only the valid owner can finalize a job.
- Restart the worker/database connection and show durable pending work resumes without disappearing.
- Verify bounded retries, non-retryable failures, redacted logs and unauthorized trigger rejection.

## Handoff

Record changed files, commands, recovery checks and blockers in `docs/development-progress.md`; document queue choice, ownership and idempotency contracts in `docs/implementation-decisions.md`.
