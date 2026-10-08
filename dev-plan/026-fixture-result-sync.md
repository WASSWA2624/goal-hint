# 026 Fixture result sync

**Feature:** Shared provider polling and durable score/status observations.

**Depends on:** [004-eat-calendar.md](004-eat-calendar.md), [006-api-quota-limiter.md](006-api-quota-limiter.md), [007-api-football-adapter.md](007-api-football-adapter.md), [009-canonical-football-catalog.md](009-canonical-football-catalog.md), [020-durable-jobs.md](020-durable-jobs.md), [024-schedule-lifecycle.md](024-schedule-lifecycle.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4–6, 10, 11, 14, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and existing provider/lifecycle services. Implement shared result synchronization only. Add versioned `Result`/provider-observation persistence as needed; market settlement follows separately.

Run one long-lived poller under a renewable account-wide lease. While covered matches are active or approaching kickoff, share `/fixtures?live=all` approximately every 15 seconds and filter coverage locally. Pause that loop when idle; every-60-second EAT date sync detects when to resume. Validate provider date boundaries and actual pagination. Track cross-midnight and missing-live fixtures every 60 seconds during their active/result window, batching up to 20 unresolved IDs not refreshed by another request. A missing live entry never proves full time.

Normalize status, score and provider timing through the existing adapter and apply schedule observations through lifecycle handling. Persist regulation-score verification separately from extra-time/shootout totals; unknown regulation scores remain unresolved. Increment fixture-data versions for material changes and retain actual last-sync times, source timestamps and prior observations. Emit durable result-change events for later settlement and cache consumers. Do not create refresh jobs, call AI, alter a committed manifest or rewrite a locked forecast.

Use bounded, progressively slower polling for corrections and long-unresolved results, according to recorded horizons. Preserve visible unresolved records beyond midnight and outside the forecast window. Route every request/retry through the shared limiter, deduplicate in-flight/fresh responses and prioritize final results/cutoff safety above optional work. Under pressure or outages, slow work and expose delays while serving stored data; never exceed account caps for freshness. Undefined polling horizons/approach thresholds remain explicit live-configuration blockers.

## Acceptance checks

- Use a controlled clock to verify cadence, idle pause/resume and only one active poller across replicas/restarts.
- Cover missing live entries, cross-midnight fixtures, >20 unresolved IDs, extra-time scores, corrections and provider outages.
- Confirm no visitor multiplication of provider polls, no AI calls and conservative quota/reserve enforcement.
- Verify durable observations survive interruption and actual sync times do not imply fresh unchanged provider generation.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, cadence/recovery results and blockers in `docs/development-progress.md`; document polling horizons and result-event contracts in `docs/implementation-decisions.md`.
