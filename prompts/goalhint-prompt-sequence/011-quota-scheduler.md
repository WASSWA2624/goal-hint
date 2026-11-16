# 011 — Implement the shared quota budget and priority scheduler

**Phase:** Shared ingestion  
**Key prerequisites:** [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [007 — Repair the shared server-side provider client](007-shared-provider-client.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R8** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement one request-budget scheduler that reads actual account limits and protects live/current work from historical load.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Account limits and proposed quota policy

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 135–142.*

Read actual account limits and rate-limit headers. Support the application's actual subscription channel. Direct-dashboard daily resets and marketplace subscription resets may differ; do not assume Kampala midnight or one reset rule for every account. [R8]

Use the following proposed policy:

- Central rate limit: at most **80% of documented per-minute/per-second limits**, with all processes sharing the same accounting. Until limits are known/configured, use **5 requests/minute, one concurrent request**, and report degraded operation.
- Priority: **live status/final confirmation → current-day discovery and missing data → current-match enrichment/odds → historical backfill**. Use fair scheduling within a priority so one fixture cannot starve the rest.
- Recompute the request budget hourly and when live load or limits change. Reserve **120% of forecast remaining critical requests until reset**, plus **5% of the daily limit**. Backfill may consume only the positive remainder and at most **20% of the per-minute allowance**.
- If the plan cannot sustain the workload, pause backfill first, then reduce enrichment frequency. Degrade live polling from **60 → 120 → 300 seconds** only as needed; show actual freshness and raise an admin capacity warning. Do not claim unchanged accuracy/freshness under insufficient quota.

## Scope boundary

Implement quota allocation and admission control, not separate per-worker budgets. Retry mechanics are the next task.

## Acceptance checks

- [ ] Use named settings for 80% short-window limits and the unknown-limit fallback of 5 requests/minute with one concurrent request.
- [ ] Apply fair scheduling within the required priority order and budget recomputation hourly or when load/limits change.
- [ ] Reserve 120% of forecast remaining critical demand plus 5% of the daily limit; bound backfill to positive remainder and 20% of minute allowance.
- [ ] Pause backfill, reduce enrichment and degrade live polling only through the stated 60 → 120 → 300-second policy with truthful freshness/capacity warnings.
- [ ] Determine the actual subscription reset rather than assuming Kampala midnight.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [012 — Implement failure classification and quota-aware retries](012-retries-errors.md).
