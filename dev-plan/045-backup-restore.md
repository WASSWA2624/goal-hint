# 045 Backup and restore

**Feature:** Recoverable durable data with a proven restoration procedure.

**Depends on:** [003-mysql-prisma.md](003-mysql-prisma.md), [019-prediction-history.md](019-prediction-history.md), [043-recovery-watchdog.md](043-recovery-watchdog.md), [044-operations-monitoring.md](044-operations-monitoring.md).

**Source:** [App specification](../app-write-up.md), sections 6, 10, 11, 13–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and the database/hosting/permissions decisions. Implement and document automated MySQL backups and point-in-time recovery where the selected infrastructure supports it, including the required consistent snapshot and binary-log retention/replay strategy. Define owner-approved recovery point/time objectives and retention for predictions, results, evidence, audits and structured provider data within contractual source-reuse permissions. Do not choose arbitrary retention that erases required forecast history or violates permissions.

Provide a repeatable restoration procedure into an isolated disposable target. Preserve immutable revisions, original publication/evidence timestamps, locked references, schedule/result correction history, canonical identities, run manifests and job idempotency. Include schema/migration version compatibility and access grants in the restore design. Keep encryption keys and credentials outside source control and record how authorized operators obtain required secrets. Test that restored database access remains least-privilege and private operations remain protected.

Reconcile restored workers before resuming outbound activity: stale leases, queued work and older quota snapshots cannot create duplicate publications, reopen cycles or restore spent provider capacity. Follow the existing conservative account-wide limiter restart/reset protocol and inspect current upstream capacity before bulk dispatch. Never run a restore against production or delete live data as part of this exercise.

Document rollback compatibility for application releases, including preserving forecast history across schema changes. Configure available backup health/failure telemetry. If hosted backup/PITR capabilities or credentials are unavailable, complete scripts, local restoration evidence and exact infrastructure instructions, then record the missing hosted proof as a release blocker rather than claiming disaster recovery is complete.

Reconcile the existing privacy notice and operating policies with the actual retention and recovery settings. Changes must not leave public claims inconsistent with stored visitor or source data.

## Acceptance checks

- Restore a representative backup into an isolated database and compare counts, foreign keys, immutable payload hashes and locked/current references.
- Exercise audit/result history and source-retention/access controls after restoration.
- Measure restore duration and the demonstrated recoverable point against approved objectives.
- Verify resumed jobs/limiter behavior cannot duplicate forecasts or overrun quotas.

## Handoff

Update `docs/development-progress.md` with changed files, executed restore evidence and actual blockers. Record objectives, retention, ownership and recovery decisions in `docs/implementation-decisions.md` and the runbook.
