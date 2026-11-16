# 061 — Deliver the evidence-backed completion and handoff report

**Phase:** Handoff  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [005 — Define the shared versioned market registry](005-market-registry.md); [036 — Validate, calibrate and version the forecasting models](036-model-calibration.md); [047 — Reconcile admin fixture totals and publication exclusions](047-admin-coverage-counts.md); [048 — Expose truthful worker, quota and completeness health](048-operational-dashboard.md); [049 — Correct performance metric denominators without changing the panel layout](049-performance-metrics.md); [055 — Test idempotent ingestion, recovery and quota coordination](055-ingestion-resilience-tests.md); [056 — Test forecasting evidence, fallback, invariants and queue scale](056-prediction-validation-tests.md); [057 — Test complete public coverage and authoritative settlement](057-publication-settlement-tests.md); [058 — Verify responsive layouts and existing application behavior](058-responsive-regression-tests.md); [059 — Measure request demand against the actual account plan](059-quota-capacity-check.md); [060 — Deploy reversibly and verify the first operating cycles](060-staged-rollout.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Compile the final implementation report from actual changes, measured validation and observed rollout evidence.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Required completion report

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 423.*

**Completion report:** provide changed files, migrations/configuration, actual worker schedules, batching matrix, coverage/mapping manifest, explained publication exclusions, before/after quota estimates, test results, measured forecasting validation, remaining provider limitations, and exact rollback/run commands. Do not claim live-site fixes or improved forecasting accuracy without verification.

## Scope boundary

Report and hand off the completed sequence only. Do not add unrelated features or invent tests, live verification, publication coverage or accuracy gains.

## Acceptance checks

- [ ] List changed files, migrations/configuration, actual schedules, batching matrix and coverage/market-mapping manifest.
- [ ] Explain publication exclusions and before/after quota demand; include exact test commands/results and measured forecasting validation.
- [ ] Document remaining provider/data/access limits, approved deviations and unresolved work without declaring them complete.
- [ ] Provide exact run/rollback commands and clearly distinguish implemented, tested, deployed and live-verified outcomes.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

This is the final prompt. Close the sequence only with the evidence-backed completion report.
