# 019 Prediction history

**Feature:** Immutable prediction-cycle and revision persistence.

**Depends on:** [003-mysql-prisma.md](003-mysql-prisma.md), [005-market-domain.md](005-market-domain.md), [009-canonical-football-catalog.md](009-canonical-football-catalog.md), [011-fixture-evidence.md](011-fixture-evidence.md), [012-ai-predictor.md](012-ai-predictor.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4, 5, 7–10, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and current schema. Implement only prediction-history persistence and read repositories. Extend existing entities rather than recreating teams, fixtures, evidence or model versions.

Add `PredictionCycle`, immutable `PredictionSet` and `MarketPrediction` records, schedule/audit history and the minimal run identity scaffolding needed for references. Daily selection and full manifest behavior belong to prompt 021. Model cycle identity, schedule version, cutoff, state, current/locked references, closure times and void reasons. Record fixture/cycle/run ordering, predecessor, model/evidence references, selected picks, complete probability groups, provenance, fallback reasons, settlement-rule version and distinct evidence/generation/publication/provider timestamps. Unknown provider update times remain unknown.

Enforce foreign-key consistency, uniqueness of the run/fixture/cycle refresh identity and at most one accepted publication for that identity. Reuse shared probability validation and include appropriate database constraints/indexes. Preserve full snapshot semantics: unsupported families are explicitly unavailable, never implicitly inherited from an earlier set. Match result and derived double chance retain coherent source provenance.

Provide an idempotent cycle-creation storage primitive with uniqueness and transaction boundaries for later selection/lifecycle services; it does not decide that a postponement occurred. Provide read repositories for current, locked and earlier revisions with stable ordering. Before closure, readers use the current set; after closure, use the locked set or unavailable. Void cycles retain their last available prediction and reason, including when nothing was locked. Read-only historical lookups cannot alter current references or settlement. Restrict immutable payload mutation in application repositories and database permissions/constraints as appropriate; append audit records for later lifecycle changes.

This prompt prepares storage and transaction interfaces; publication eligibility, lock scheduling and settlement behavior are separate subsequent features. Do not expose an incomplete public endpoint or create live predictions through migration seeds. Describe the reversible migration/rollback approach without deleting forecast history.

## Acceptance checks

- Run migrations against an isolated database and test duplicate refresh keys, mismatched fixture/cycle references and invalid probabilities.
- Verify round-trip precision/provenance and chronological history with partial snapshots and cycles closed without a prediction.
- Confirm attempts to mutate immutable forecasts fail through supported write paths.

## Handoff

Record changed files, migration/test results and blockers in `docs/development-progress.md`; document schema invariants and deferred transaction interfaces in `docs/implementation-decisions.md`.
