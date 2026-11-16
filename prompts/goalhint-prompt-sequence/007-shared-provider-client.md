# 007 — Repair the shared server-side provider client

**Phase:** Shared ingestion  
**Key prerequisites:** [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R8** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Provide a single server-side API-Football transport used by every ingestion consumer, with validated endpoint parameters and secure account/usage access.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Account endpoint

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 43.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Account and usage | `/status` | Subscription/access information and request usage; keep account details admin-only. |

### Client-sharing and security constraints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 101, 111.*

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

9. **No frontend provider calls:** browsers read GoalHint's database/cache. API keys stay server-side and out of logs and AI prompts.

### Response-error inspection

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 145.*

- Authentication, access, and invalid-parameter errors require configuration correction, not endless retries. Check the JSON `errors` field even on HTTP 200.

## Scope boundary

Build transport and error classification only. Central caching, quota scheduling and retry timing are implemented by tasks 009, 011 and 012 rather than duplicated inside each endpoint handler.

## Acceptance checks

- [ ] Return full payloads, headers and structured transport/provider errors to the shared ingestion layer; inspect JSON errors even after HTTP 200.
- [ ] Support the actual credential/subscription channel without leaking credentials in browser requests, logs or AI inputs.
- [ ] Expose /status information only to authorized admin consumers; reject invented/unsupported endpoint parameters.
- [ ] Verify the client with mocked or replayed responses before production calls are enabled.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md).
