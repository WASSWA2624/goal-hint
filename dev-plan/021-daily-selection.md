# 021 Daily selection

**Feature:** One immutable seven-day selection manifest per EAT run date.

**Depends on:** [002-runtime-policy.md](002-runtime-policy.md), [004-eat-calendar.md](004-eat-calendar.md), [006-api-quota-limiter.md](006-api-quota-limiter.md), [007-api-football-adapter.md](007-api-football-adapter.md), [009-canonical-football-catalog.md](009-canonical-football-catalog.md), [019-prediction-history.md](019-prediction-history.md), [020-durable-jobs.md](020-durable-jobs.md)

**Source:** [app-write-up.md](../app-write-up.md) §§5, 6, 10, 11, 14, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and existing services. Implement only the daily run selection feature. Extend the existing run identity scaffold into `DailyRun`/`RunFixture` manifest persistence and reuse the canonical catalog, provider limiter and durable queue.

Schedule or configure a protected trigger at 00:00 EAT (`0 21 * * *` UTC). Derive the unique run date and ordered identity from `Africa/Kampala`, independent of invocation/retry time. Under an exclusive renewable lease, retrieve all required pages for the seven dates in `[D 00:00, D+7 00:00)` and apply the configured competition/status eligibility. Preserve exclusions and coverage evidence. Do not infer an empty date from a failed or incomplete import.

Commit an immutable manifest containing boundaries, fixture/cycle identities, known coverage, exclusions and deterministic nearest-kickoff budget priority. Retry incomplete imports before dispatch. Only an explicit, recorded degraded-finalization policy/action may commit the known subset with missing coverage; mark it partial. Unchosen competition/degradation policy remains a blocker for the affected live path. Use the history storage primitive for initial cycles and reuse eligible open cycles. Support a later new cycle only from an explicitly recorded eligible postponed/void state; test that input directly here. Prompt 024 owns detecting formal postponements and supplying those transitions. Never reopen a closed cycle.

After commit, durably enqueue one refresh per run/fixture/cycle. Use reconciliation to recover a crash between commit and dispatch. A repeated run resumes the same manifest and enqueues only missing work. Late discoveries wait for another eligible daily selection. Persist total, completed and terminal job outcomes for future UI progress without modifying membership. Do not execute AI here or let score polling add jobs.

## Acceptance checks

- Prove the 7 October 2026 EAT run starts at 6 October 21:00 UTC and includes 7–13 October but excludes the next boundary.
- Test concurrent triggers, pagination failure, restart before/after commit, duplicate enqueue and explicit partial finalization.
- Verify degraded dates cannot become false No fixtures responses and committed membership cannot change with late discoveries.

## Handoff

Record changed files, schedule setup, manifest/recovery test results and blockers in `docs/development-progress.md`; document selection/degradation decisions in `docs/implementation-decisions.md`.
