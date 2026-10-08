# 025 Prediction refresh worker

**Feature:** The complete execution of one daily fixture-refresh job.

**Depends on:** [010-research-cost-control.md](010-research-cost-control.md), [011-fixture-evidence.md](011-fixture-evidence.md), [012-ai-predictor.md](012-ai-predictor.md), [013-provider-fallback.md](013-provider-fallback.md), [020-durable-jobs.md](020-durable-jobs.md), [021-daily-selection.md](021-daily-selection.md), [022-revision-publication.md](022-revision-publication.md), [024-schedule-lifecycle.md](024-schedule-lifecycle.md)

**Source:** [app-write-up.md](../app-write-up.md) §§5–8, 10, 11, 14, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and implemented evidence, predictor, fallback, budget and publication services. Implement their orchestration for one manifest-owned refresh job; reuse their validation rather than creating another prediction path.

Load the immutable manifest entry and current fixture/cycle, pin model configuration and check eligibility. Apply the configured nearest-kickoff priority and per-job request/token/time budgets with separate AI/research caps. Gather bounded structured and attributable evidence, retaining missing facts and original timestamps. Treat source text as untrusted data. Execute the primary AI path without exposing ready-made provider predictions to it, validate output, then attempt fallback for invalid/missing groups within remaining time and account quota. Reserve usable time/capacity for fallback.

Preserve valid AI families before fallback; keep match result and derived double chance one source group. Apply shared consistency/conflict rules, retaining provenance and genuinely supported short analysis. No odds conversion, numerical invention, source averaging or percentage-based source selection is allowed. Missing news alone must not force fallback when the agreed evidence threshold is satisfied. Unresolved live provider/model/budget/freshness decisions remain blockers, not guessed defaults.

Before publication, obtain sufficiently fresh status/kickoff evidence and route observations through lifecycle handling. Submit the complete accepted snapshot to the atomic publication service. With no valid family, retain the eligible prior set and its timestamps or record unavailable. Persist published, retained-previous, unavailable, skipped or failed plus precise reasons/costs. An already published refresh returns its original revision. Recover unpublished work only while eligible and update aggregate progress when all jobs reach terminal outcomes.

Do not add hourly/last-minute refreshes, visitor-triggered AI or new manifest membership. Late evidence waits for another eligible daily run.

## Acceptance checks

- Cover valid AI, invalid output, timeout, missing evidence, budget exhaustion, partial fallback and no usable source.
- Simulate provider/AI outages, duplicate delivery, worker death and overlapping daily runs without double publication or source leakage.
- Verify cutoff/freshness rechecks, source-specific costs, retained age and truthful progress totals.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, end-to-end worker checks and blockers in `docs/development-progress.md`; document orchestration decisions in `docs/implementation-decisions.md`.
