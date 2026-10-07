# 024 Schedule lifecycle

**Feature:** Audited fixture rescheduling and prediction-cycle transitions.

**Depends on:** [007-api-football-adapter.md](007-api-football-adapter.md), [009-canonical-football-catalog.md](009-canonical-football-catalog.md), [021-daily-selection.md](021-daily-selection.md), [022-revision-publication.md](022-revision-publication.md), [023-cutoff-locking.md](023-cutoff-locking.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4, 5, 6, 10, 11, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and lifecycle services. Implement schedule-change handling only. Consume normalized provider observations through a shared service that future polling will call; do not build the polling loop here.

Persist schedule versions and attributable scheduled/actual-start observations. Distinguish formal postponement before play from an ordinary kickoff adjustment using the validated provider mapping. A formal postponement voids the old cycle, preserving its last prediction, immutable locks and explicit reason. Permit a new cycle under the same fixture only in the next eligible daily selection; never append it to an already committed manifest. Preserve one canonical fixture/team identity throughout.

For a simple kickoff adjustment on an unlocked cycle, revise its cutoff and associated lock scheduling without creating another prediction-refresh job. If the revised cutoff has already passed, close using only eligible historical publications under the corrected schedule. Serialize this decision with publication and locking. A locked cycle cannot reopen. If later kickoff or actual-start evidence proves its locked forecast breached the cutoff, void it with an audit reason and retain the same locked reference; never choose another forecast retroactively.

Handle canceled, abandoned and administratively awarded statuses as ineligible/void lifecycle outcomes while preserving result observations for later settlement. Avoid interpreting missing live-feed entries as any terminal status. Moving outside the rolling forward window stops eligibility for prediction refresh but does not discard result tracking. Increment monotonic fixture versions and persist durable change events for every material visible transition.

Keep transition logic deterministic and idempotent under duplicate or out-of-order provider observations. Apply the configured evidence/conflict policy; unresolved mappings or conflicting status evidence must remain explicit instead of inventing a schedule.

## Acceptance checks

- Test repeated postponements, an ordinary delay, an earlier cutoff already passed and early-start corrections before/after lock.
- Race rescheduling with publication/lock execution and verify closed cycles never reopen or replace locked picks.
- Verify no schedule update adds an extra AI job or changes committed manifest membership.
- Confirm old void cycles remain readable without duplicating the fixture's active identity.

## Handoff

Record changed files, lifecycle/concurrency checks and blockers in `docs/development-progress.md`; document transition/evidence policies in `docs/implementation-decisions.md`.
