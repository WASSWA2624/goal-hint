# 022 Revision publication

**Feature:** Atomic, ordered publication of a complete prediction revision.

**Depends on:** [004-eat-calendar.md](004-eat-calendar.md), [005-market-domain.md](005-market-domain.md), [007-api-football-adapter.md](007-api-football-adapter.md), [019-prediction-history.md](019-prediction-history.md), [021-daily-selection.md](021-daily-selection.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4, 5, 7, 9–11, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and implemented storage/manifest contracts. Implement the publication service only. It must be the single path for accepting a revision, regardless of its AI/provider composition.

Accept a validated full snapshot, pinned model/evidence identity and a provider status/kickoff observation that meets the configured freshness bound. Revalidate domain/source consistency. Use a cycle lock or compare-and-swap in one database transaction to confirm membership in the original committed manifest/window and the current rolling window, current open cycle, eligible status, accepted schedule version and publication strictly before cutoff. Observed early play closes eligibility immediately. Use an authoritative transaction time, preserve separate generation/retrieval/update timestamps and reject stale evidence of eligibility. Missing freshness policy blocks live acceptance.

Atomically save set/markets, move the current reference, increment the fixture's monotonic version and persist an audit/invalidation event. Order by run identity and cycle, never completion time or source confidence. Reject older-run output after a newer accepted revision. Enforce one accepted revision per refresh key; a retry returns the original publication, including after an ambiguous network/transaction response. A newer fallback revision may replace an older AI revision.

A partial new revision replaces the entire snapshot; unsupported families become unavailable. If no family is valid, create no replacement: retain an eligible previous revision with its original timestamps and Update delayed, or report unavailable. Record the refresh result distinctly from the forecast. Expose durable change events for later caching without depending on that future implementation; uncached readers remain correct.

## Acceptance checks

- Race same-key jobs and older/newer runs; assert one publication per refresh and no rollback of the current reference.
- Reject exactly-at-cutoff, early-start, stale-observation, wrong-cycle and out-of-window attempts.
- Test partial replacement, zero-valid-family retention and crash-after-commit retry with immutable timestamps/provenance.
- Race publication with a simulated cycle close/update using the same transaction boundary.

## Handoff

Record changed files, concurrency/eligibility checks and blockers in `docs/development-progress.md`; document transaction and durable change-event contracts in `docs/implementation-decisions.md`.
