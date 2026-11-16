# 006 — Implement durable job ownership and overlap protection

**Phase:** Shared ingestion  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Reuse or repair the durable job infrastructure so shared ingestion can resume work and prevent stale or overlapping workers from committing changes.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Ownership requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 107.*

5. **Prevent overlapping jobs:** durable leases, heartbeats, ownership/fencing checks, and unique active job keys. Expired workers must not overwrite newer committed work.

### Shared architecture

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 101.*

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

## Scope boundary

Implement job control, not worker-specific schedules or provider request budgeting. Do not introduce competing queues where the existing infrastructure can be repaired.

## Acceptance checks

- [ ] Provide durable leases, heartbeats, ownership/fencing checks and unique active-job keys.
- [ ] Demonstrate that expired workers cannot commit over newer ownership and that overlapping submissions coalesce.
- [ ] Expose persistent job/checkpoint interfaces for importers and the four logical workers using the existing queue/runtime.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [007 — Repair the shared server-side provider client](007-shared-provider-client.md).
