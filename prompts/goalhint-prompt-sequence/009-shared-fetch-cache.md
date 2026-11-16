# 009 — Coalesce requests and reuse fresh shared responses

**Phase:** Shared ingestion  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [007 — Repair the shared server-side provider client](007-shared-provider-client.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the canonical request key, shared cache and in-flight coalescing used by all workers.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Shared request deduplication

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 101–103.*

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

1. **Deduplicate requests:** use a canonical key containing provider, endpoint, normalized parameters, page, and freshness window. Coalesce identical in-flight requests across workers. Reuse already-stored team, league, player, and venue data.

### Freshness versus evidence changes

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 109.*

7. **Separate freshness from change:** an unchanged response updates the last-checked timestamp but does not trigger a new forecast. Exclude request timestamps and cosmetic metadata from prediction evidence hashes.

## Scope boundary

Deduplicate fetch work, not legitimate corrections or distinct temporal scopes. A cache cannot detect remote changes without a due check.

## Acceptance checks

- [ ] Key requests by provider, endpoint, normalized parameters, page and freshness window.
- [ ] Coalesce identical concurrent requests across processes and reuse fresh entity data and durable receipts.
- [ ] Update last-checked time for unchanged responses without generating a new evidence hash or forecast trigger.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [010 — Implement documented batching and resumable pagination](010-batching-pagination.md).
