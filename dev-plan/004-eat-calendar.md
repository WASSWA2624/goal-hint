# 004 East Africa calendar

**Feature:** Centralize reporting dates, prediction windows and cutoff calculations.

**Depends on:** [002 Runtime policy](002-runtime-policy.md).

**Source:** [App specification](../app-write-up.md), sections 2, 4–5, 9, 12 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing shared contracts. Implement a reusable time-domain module using `Africa/Kampala` for reporting days and UTC instants for persistence. Inject the current clock into decision-making services so boundary behavior is deterministic; do not depend on the execution host's local timezone.


Provide strict date parsing, EAT reporting-date derivation, date increments, current-window boundaries, date/range validation, kickoff display inputs and scheduled publication-cutoff calculation. For run date D, the selection window is `[D 00:00, D+7 00:00)` in EAT: today plus six days, with an exclusive seventh-day boundary. Historical results remain addressable outside this forward window. Keep a run's original boundaries immutable; expose calculations that later publication code can use to require both original-manifest eligibility and the current rolling window.

Represent the daily trigger as 00:00 EAT, equivalent to `0 21 * * *` in UTC on the preceding date. Document this scheduling contract without installing or deploying a live scheduler. Calculate the standard cutoff as scheduled kickoff minus five minutes; eligibility requires publication strictly before cutoff. Actual-start observations and schedule-history decisions belong to the later cycle service, but the temporal contract must support an earlier closing instant without weakening the standard rule.

Keep optional visitor-local kickoff formatting separate from reporting dates, run identity and eligibility. Use language-neutral domain values and `Intl`-compatible formatting inputs. Reject impossible dates and unbounded or inverted query ranges rather than normalizing them silently. Avoid duplicating date arithmetic in components or adapters.

## Acceptance checks

- The 7 October 2026 run begins at 6 October 21:00 UTC and covers 7–13 October EAT only.
- Tests cover exact start/end boundaries, EAT midnight rollover, month/year/leap-day transitions and hosts configured in different timezones.
- Publication exactly at cutoff is ineligible; one instant before remains temporally eligible.
- Historical-date validation works independently of prediction-window eligibility, and local display never changes the EAT date contract.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record the shared API, changed files, boundary-test results and unresolved dependencies in `docs/development-progress.md`. Add any required implementation decision to `docs/implementation-decisions.md`; do not create production schedules in this feature.
