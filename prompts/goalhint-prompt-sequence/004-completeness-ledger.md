# 004 — Implement resource-level completeness tracking

**Phase:** Data contracts  
**Key prerequisites:** [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R2, R3** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement one durable completeness ledger for resource, scope, endpoint and page/section progress.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Coverage states and interpretation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 93–97.*

Track state per **resource + scope + endpoint + page/section**, using:

`not_requested | queued | fetching | complete | partial | unavailable | not_applicable | retryable_failure | blocked_by_quota | blocked_by_access`.

Record reasons, attempts, timestamps, last successful response, next retry, and known remaining work. A successful empty response is not automatically an error, proof of permanent unavailability, or proof that the entire date is complete. Validate parameters, API body errors, coverage, timing, and pagination first. Coverage is specific to competition and season and is not a guarantee for every match. [R2, R3]

## Scope boundary

Build tracking and state transitions only. Do not launch backfill or infer that an optional missing section should hide a fixture.

## Acceptance checks

- [ ] Represent all ten specified states and retain reasons, attempts, last success, retry timing and remaining work.
- [ ] Distinguish a successful empty response from permanent unavailability, incomplete pagination and whole-date completion.
- [ ] Track coverage at competition-season and section/page scope; expose ledger records for later workers and admin reporting.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [005 — Define the shared versioned market registry](005-market-registry.md).
