# 046 Reproducible staging deployment

**Feature:** A production-like staging environment with repeatable infrastructure configuration.

**Depends on:** [042-seo-discovery.md](042-seo-discovery.md), [043-recovery-watchdog.md](043-recovery-watchdog.md), [044-operations-monitoring.md](044-operations-monitoring.md), [045-backup-restore.md](045-backup-restore.md).

**Source:** [App specification](../app-write-up.md), sections 5, 9, 11–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and established hosting/runtime decisions. Implement reusable deployment configuration for the web app, MySQL, durable queue/workers, shared limiter and long-lived leased poller. Keep environment-specific values separate from reusable configuration. Build using pinned compatible versions and server-only secrets. Add safe migration/release and rollback commands, health checks and deployment documentation.

Configure staging's daily scheduler at `0 21 * * *` UTC for 00:00 EAT, protected enqueue operations and independent watchdog recovery. Verify that continuous polling is supported by the selected runtime instead of pretending a request-bound function runs indefinitely. Configure canonical production metadata separately from staging origin and prevent staging indexing. Use private infrastructure access controls where necessary without adding visitor-auth code to the product.

Isolate staged fixture/history data from production. If trial, staging, production or manual tools share one API-Football account, they must share its same durable account-wide limiter, quota counters, reserves and cost allocation; separate application databases do not create extra provider budgets. Alternatively use genuinely separate authorized provider accounts with their own validated limits. Coordinate polling/deduplication to prevent unnecessary shared-account calls. Do not reset counters when deploying. A shared poller lease must not leave an enabled environment without observations: designate one polling environment for qualification and transfer ownership explicitly at release, or provide a tested shared-observation path.

Use already authorized infrastructure and credentials. Do not purchase services, create billable subscriptions or deploy production here. If access is missing, complete local/container deployment, configuration templates, dry-run commands and a precise blocker list. Clearly distinguish those checks from an actual hosted staging deployment.

## Acceptance checks

- Run the production build in the configured environment and inspect SSR/styles, health checks and protected job endpoints.
- Verify scheduler timezone, worker recovery, single poller ownership and account-wide dispatch across replicas/environments.
- Test migrations and a compatible rollback without losing forecast history.
- Record real staging URL/deployment evidence only if deployed; confirm secrets and staging data are not public artifacts.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, deployment/check evidence and blockers. Record hosting/account isolation decisions in `docs/implementation-decisions.md` and the deployment runbook.
