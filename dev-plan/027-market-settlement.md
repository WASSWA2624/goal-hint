# 027 Market settlement

**Feature:** Audited settlement against immutable locked forecasts.

**Depends on:** [005-market-domain.md](005-market-domain.md), [019-prediction-history.md](019-prediction-history.md), [020-durable-jobs.md](020-durable-jobs.md), [023-cutoff-locking.md](023-cutoff-locking.md), [024-schedule-lifecycle.md](024-schedule-lifecycle.md), [026-fixture-result-sync.md](026-fixture-result-sync.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4, 8, 10, 11, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and current market/result services. Implement settlement only. Extend persistence with settlement/correction records while reusing verified results, locked revisions and shared regulation-time rules.

Consume durable result/lifecycle changes and reconcile missed work after interruption. Settle each available market's locked selected pick independently using regulation time including stoppage time and excluding extra time/penalties. Match result, double chance, over/under 2.5 and BTTS must follow the domain rules. Never settle from a live score. Extra-time/shootout fixtures require a separately verified regulation score; otherwise remain pending. If optional exact scores were explicitly approved and validated earlier, keep their results separate from four-family headline metrics.

Use Correct, Incorrect, Pending, Void and Unavailable distinctly. Preserve missing families as unavailable; void ineligible cycles/games with reasons, including cancellations, abandonments, administrative awards and cutoff-invalidated locks. A closed cycle without a valid selection has no manufactured prediction. Keep old postponed void cycles as historical records while marking the applicable fixture cycle for downstream counting.

Enforce one active settlement per cycle/market with idempotency against result/rule versions. For provider corrections, append an audited correction and atomically update the active settlement against exactly the same locked pick. Retain the prior badge, reason, verified result and visible correction time. Do not change probabilities, replace a lock or choose the best historical revision. Increment fixture versions and commit durable invalidation events with the change.

Keep hit-rate aggregation outside this feature, but expose a repository contract that identifies the applicable fixture/cycle and excludes alternatives/superseded revisions. A retry or duplicate event cannot multiply settled predictions or correction history.

## Acceptance checks

- Cover draws, 0–0, BTTS boundaries, exactly two/three goals, extra time and penalties with/without regulation evidence.
- Exercise unavailable families, no prediction, postponements, abandoned/awarded games and early-start voids.
- Replay duplicate events, crash/recovery and score corrections; verify immutable picks, one active settlement and preserved audit history.

## Handoff

Record changed files, rule/correction/concurrency checks and blockers in `docs/development-progress.md`; document settlement and applicable-cycle contracts in `docs/implementation-decisions.md`.
