# 060 — Deploy reversibly and verify the first operating cycles

**Phase:** Rollout  
**Key prerequisites:** [055 — Test idempotent ingestion, recovery and quota coordination](055-ingestion-resilience-tests.md); [056 — Test forecasting evidence, fallback, invariants and queue scale](056-prediction-validation-tests.md); [057 — Test complete public coverage and authoritative settlement](057-publication-settlement-tests.md); [058 — Verify responsive layouts and existing application behavior](058-responsive-regression-tests.md); [059 — Measure request demand against the actual account plan](059-quota-capacity-check.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Prepare and, with the required repository/deployment access and authorization, execute the staged rollout of the completed improvements.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Rollout requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 421.*

Deploy with reversible migrations, backups, feature flags and a staged rollout. Validate representative live, upcoming, completed, sparse-data and odds-missing fixtures before enabling globally. Observe the first hourly cycle and backfill checkpoint/resume cycle.

## Scope boundary

Execute rollout only after blocking tests/capacity issues are resolved. Do not claim a live-site fix, an observed cycle or improved accuracy without direct evidence.

## Acceptance checks

- [ ] Confirm backups, reversible migrations, feature flags and exact run/rollback procedures before production changes.
- [ ] Validate representative live, upcoming, completed, sparse-data and odds-missing fixtures before global enablement.
- [ ] Observe the first hourly cycle and a backfill checkpoint/resume cycle; verify actual schedules, health, visibility and access controls.
- [ ] Record observed outcomes and rollback criteria; when deployment access is absent, supply exact verified preparation steps and mark live deployment/observation unverified.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [061 — Deliver the evidence-backed completion and handoff report](061-completion-report.md).
