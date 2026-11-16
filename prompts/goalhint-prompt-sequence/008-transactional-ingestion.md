# 008 — Persist responses and normalize them idempotently

**Phase:** Shared ingestion  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [007 — Repair the shared server-side provider client](007-shared-provider-client.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the shared receipt-to-normalization transaction path that endpoint importers will call.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Durable ingestion rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 104–108.*

2. **Deduplicate records:** enforce database uniqueness using stable provider IDs or documented composite keys. Use transactional upserts and content hashes. Do not append duplicates on retries.
3. **Preserve corrections:** idempotency must not prevent legitimate score, event, lineup, or schedule corrections. Merge partial responses without erasing known data merely because a field was omitted. Treat explicit authoritative corrections separately.
4. **Persist before advancing:** durably save each validated response/receipt, then transactionally update normalized data and the checkpoint. A restart should replay a stored response rather than repeat its API call when possible.
5. **Prevent overlapping jobs:** durable leases, heartbeats, ownership/fencing checks, and unique active job keys. Expired workers must not overwrite newer committed work.
6. **Maintain temporal integrity:** store event time, provider update time where available, observation time, and the evidence version. Keep UTC in storage; use `Africa/Kampala` for the default local-day scope and display.

### Safe recovery and missing values

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 110, 112.*

8. **Do not equate missing with zero:** preserve nullability. An unknown score/statistic is not 0; missing odds are not 0.00.

10. **Be honest about network limits:** idempotency prevents duplicate effects; it does not let us know that remote data changed without checking. A crash before a response is durably recorded may require repeating a GET. Design for safe recovery, not an impossible exactly-once HTTP guarantee.

### Lossless payload retention

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 33–35.*

**The checklist below is a minimum inventory, not permission to discard other returned fields.** Preserve complete successful response payloads in durable, access-controlled storage, excluding credentials. Normalize useful fields, retain unknown nested fields, and flag schema changes. Every documented response field must be accounted for as normalized, retained raw, unavailable, or not applicable—with a reason.

Use provider IDs and explicit league/season/team/fixture/player relationships. Do not confuse current entity information with historical information applicable at an earlier kickoff.

## Scope boundary

Implement the common persistence/replay mechanism and adapter interface. Resource-specific normalization is wired in tasks 014–019 and 025; no exactly-once HTTP guarantee is permitted.

## Acceptance checks

- [ ] Persist validated responses/receipts before advancing; transactionally update normalized records and checkpoints.
- [ ] Use stable uniqueness keys, content hashes and upserts; retain authoritative corrections while avoiding duplicate effects.
- [ ] Preserve known values when a partial payload omits them; guard commits with current job ownership/fencing.
- [ ] Recover from crashes by replaying durable receipts when available and repeat a GET safely when no receipt survived.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md).
