# 012 — Implement failure classification and quota-aware retries

**Phase:** Shared ingestion  
**Key prerequisites:** [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [007 — Repair the shared server-side provider client](007-shared-provider-client.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement a durable retry policy that distinguishes transient failures, short throttles, exhausted daily quota and configuration/access failures.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Retry and blocking rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 143–145.*

- Network/temporary server failures: retry after **5, 30, then 120 seconds**, with up to 10% positive jitter. Then persist the failure and retry after **one hour**. Respect a longer provider `Retry-After`.
- For rate limits, distinguish short-window throttling from daily exhaustion. Daily exhaustion pauses eligible jobs until the verified reset plus **15 seconds**; do not repeatedly probe an exhausted quota.
- Authentication, access, and invalid-parameter errors require configuration correction, not endless retries. Check the JSON `errors` field even on HTTP 200.

## Scope boundary

Change error handling and retry transitions only. Use the existing shared scheduler and client rather than implementing another request path.

## Acceptance checks

- [ ] Configure transient delays of 5, 30 and 120 seconds with up to 10% positive jitter, then a persisted one-hour retry.
- [ ] Respect a longer Retry-After and pause exhausted-quota work until the verified reset plus 15 seconds without repetitive probes.
- [ ] Block authentication, permission and invalid-parameter failures for corrective action instead of retrying forever.
- [ ] Persist reason, attempt, retry and blocking state in the shared ledger/jobs and verify HTTP-200 error handling.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md).
