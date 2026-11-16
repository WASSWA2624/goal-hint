# 013 — Configure the supervised runtime for logical workers

**Phase:** Shared ingestion  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Make the existing deployment run durable background work independently of browsers, admin pages and long-running web requests.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Runtime requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 146, 150.*

- Run workers as supervised server processes or durable scheduled jobs suitable for the existing deployment. They must not depend on a browser tab, an open admin page, or a long-running web request.

These are four **logical responsibilities**, not a requirement for four separate servers. Reuse the existing queue/runtime where appropriate.

### Shared worker services

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 101.*

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

## Scope boundary

Configure the runtime and its execution hooks only. Tasks 020–023 add the four worker responsibilities; do not enable unfinished ingestion or forecasting in production.

## Acceptance checks

- [ ] Use supervised server processes or durable scheduled jobs compatible with the inspected deployment.
- [ ] Wire the common queue, client, cache, quota and retry services; expose heartbeat and restart behavior.
- [ ] Treat the four workers as logical responsibilities rather than assuming four separate servers.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md).
