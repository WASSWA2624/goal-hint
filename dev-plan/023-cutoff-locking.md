# 023 Cutoff locking

**Feature:** Irreversible cycle closure and selection of the eligible locked revision.

**Depends on:** [004-eat-calendar.md](004-eat-calendar.md), [019-prediction-history.md](019-prediction-history.md), [020-durable-jobs.md](020-durable-jobs.md), [022-revision-publication.md](022-revision-publication.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4, 5, 10, 11, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and publication/history code. Implement cutoff locking only, reusing the publication service's shared eligibility rules and transaction synchronization.

Schedule a durable idempotent close job for each eligible cycle at scheduled kickoff minus five minutes. When executed, lock the latest revision eligible under publication/schedule history, or close with no prediction. Persist closure/lock times and the reason; increment the fixture version and record durable audit/invalidation events. Serialize with publication and schedule changes so a publication at or after cutoff can never win a race. The publication transaction must enforce the cutoff even if this job has not run.

Support delayed job execution and recovery after downtime. Reconstruct eligibility from stored publication, schedule and actual-start evidence only, never outcomes or which forecast would have won. An eligible earlier-day revision remains available for an early-morning match if the newer run did not finish before cutoff. A late lock must not select an ineligible current pointer merely because it is newest. Store the selected reference once and keep its payload, probability, pick, provenance and publication time immutable.

Expose an immediate close path for observed early play, using the same domain operation. Once a cycle is locked/closed it never reopens. Prepare an audited void operation for subsequent schedule-correction handling: invalidation of a locked forecast must not substitute a different pick. Do not implement the full rescheduling coordinator or result settlement here.

Ensure readers distinguish current forecasts for open cycles, locked snapshots for closed cycles and closed-without-prediction. Retry/duplicate lock jobs return the established result without creating a second lock or rewriting its timestamp.

## Acceptance checks

- Test just-before, exactly-at and after cutoff, early start, no eligible revision and an eligible previous-day revision.
- Race lock with publication and duplicate lock deliveries; verify a single stable closed state.
- Delay locking beyond kickoff with varied schedule history and prove final match outcomes do not influence selection.
- Confirm a closed cycle cannot reopen or replace its locked prediction.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, race/recovery checks and blockers in `docs/development-progress.md`; document locking and void-operation contracts in `docs/implementation-decisions.md`.
