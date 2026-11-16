# GoalHint — ordered improvement prompts

**61 focused implementation prompts · run from 001 to 061**

This package splits the supplied GoalHint improvement prompt into one-task Markdown
files. It reorganizes the work; it does not claim the application has been changed,
provider details have been freshly verified, or model accuracy has improved.

## How to use

1. Extract the ZIP and make the entire folder available to your coding agent alongside the existing GoalHint repository.
2. Start with `001-audit-baseline.md`, then run each numbered file in order. Every prompt loads the shared rules and names its key prerequisites, source requirements, scope boundary and acceptance checks.
3. Keep each completed task's evidence and handoff available to the next task. Resolve real prerequisites before continuing; do not fill missing source data, tests or implementation with invented results.

Each numbered file owns one focused task; implementation, its related checks and its
handoff belong together. Supporting documents below are context/indexes, not extra
prompts. When using a chat-only agent, provide the selected prompt together with the
shared rules, the referenced source context and relevant prior handoffs.

The broad sequence remains audit → data contracts → imports/workers → odds →
predictions → publication → interface → testing/rollout. A shared market-registry
contract is established before its consumers. Endpoint import handlers are
implemented before workers schedule them. Worker-to-prediction/odds/settlement
interfaces are completed by later named tasks and kept out of global production
use until validated.

## Supporting files

- [Global rules](support/GLOBAL-RULES.md): preserved boundaries and execution/handoff protocol.
- [References](support/REFERENCES.md): all original R1–R11 and user-supplied reference notes.
- [Requirement map](support/REQUIREMENT-MAP.md): source-line to prompt/context coverage.
- [Package validation](support/PACKAGE-VALIDATION.md): numbering, dependencies, links and exact-source checks; not application test results.
- [Original prompt](support/source/goalhint-improvement-prompt.md): unchanged uploaded source.

## Execution index


### Audit

| Step | Prompt | Focus |
|---|---|---|
| 001 | [001-audit-baseline.md](001-audit-baseline.md) | Audit the existing application and record the baseline |

### Data contracts

| Step | Prompt | Focus |
|---|---|---|
| 002 | [002-endpoint-inventory.md](002-endpoint-inventory.md) | Build the versioned provider endpoint inventory |
| 003 | [003-record-contracts.md](003-record-contracts.md) | Define lossless, temporal provider-data contracts |
| 004 | [004-completeness-ledger.md](004-completeness-ledger.md) | Implement resource-level completeness tracking |
| 005 | [005-market-registry.md](005-market-registry.md) | Define the shared versioned market registry |

### Shared ingestion

| Step | Prompt | Focus |
|---|---|---|
| 006 | [006-durable-job-control.md](006-durable-job-control.md) | Implement durable job ownership and overlap protection |
| 007 | [007-shared-provider-client.md](007-shared-provider-client.md) | Repair the shared server-side provider client |
| 008 | [008-transactional-ingestion.md](008-transactional-ingestion.md) | Persist responses and normalize them idempotently |
| 009 | [009-shared-fetch-cache.md](009-shared-fetch-cache.md) | Coalesce requests and reuse fresh shared responses |
| 010 | [010-batching-pagination.md](010-batching-pagination.md) | Implement documented batching and resumable pagination |
| 011 | [011-quota-scheduler.md](011-quota-scheduler.md) | Implement the shared quota budget and priority scheduler |
| 012 | [012-retries-errors.md](012-retries-errors.md) | Implement failure classification and quota-aware retries |
| 013 | [013-worker-runtime.md](013-worker-runtime.md) | Configure the supervised runtime for logical workers |

### Endpoint ingestion

| Step | Prompt | Focus |
|---|---|---|
| 014 | [014-catalog-imports.md](014-catalog-imports.md) | Implement reference and competition catalog ingestion |
| 015 | [015-entity-imports.md](015-entity-imports.md) | Implement team and venue identity ingestion |
| 016 | [016-team-context-imports.md](016-team-context-imports.md) | Implement complete standings and team-statistics ingestion |
| 017 | [017-fixture-data-imports.md](017-fixture-data-imports.md) | Implement complete fixture-scoped data ingestion |
| 018 | [018-player-data-imports.md](018-player-data-imports.md) | Implement the complete player-data import handlers |
| 019 | [019-career-data-imports.md](019-career-data-imports.md) | Implement coaching, transfer and career-history ingestion |

### Coordinated workers

| Step | Prompt | Focus |
|---|---|---|
| 020 | [020-live-worker.md](020-live-worker.md) | Implement Worker 1: live match updates |
| 021 | [021-daily-refresh-worker.md](021-daily-refresh-worker.md) | Implement Worker 2: current-day refresh and reconciliation |
| 022 | [022-historical-worker.md](022-historical-worker.md) | Implement Worker 3: resumable historical backfill |
| 023 | [023-prediction-worker.md](023-prediction-worker.md) | Implement Worker 4: the durable prediction lifecycle |

### Odds

| Step | Prompt | Focus |
|---|---|---|
| 024 | [024-odds-catalog-mapping.md](024-odds-catalog-mapping.md) | Reconcile bookmaker and separate pre-match/live market catalogs |
| 025 | [025-odds-ingestion.md](025-odds-ingestion.md) | Implement full, independent odds-price ingestion |
| 026 | [026-odds-reference-prices.md](026-odds-reference-prices.md) | Select and label the correct displayed reference odds |

### Prediction mechanism

| Step | Prompt | Focus |
|---|---|---|
| 027 | [027-fixture-evidence.md](027-fixture-evidence.md) | Build one bounded, sourced evidence package per fixture |
| 028 | [028-relationship-features.md](028-relationship-features.md) | Implement direct and indirect triangulation features |
| 029 | [029-probability-confidence-gates.md](029-probability-confidence-gates.md) | Separate probability, confidence and evidence eligibility |
| 030 | [030-local-goal-model.md](030-local-goal-model.md) | Implement the regularized local result/goal baseline |
| 031 | [031-coherent-score-distribution.md](031-coherent-score-distribution.md) | Derive goal-market probabilities from a coherent score distribution |
| 032 | [032-period-and-half-models.md](032-period-and-half-models.md) | Implement dependence-aware period and half models |
| 033 | [033-player-models.md](033-player-models.md) | Implement evidence-supported player outcome models |
| 034 | [034-statistic-models.md](034-statistic-models.md) | Implement separate cards, corners and statistic models |
| 035 | [035-context-adjustments.md](035-context-adjustments.md) | Integrate supported contextual effects into model features |
| 036 | [036-model-calibration.md](036-model-calibration.md) | Validate, calibrate and version the forecasting models |
| 037 | [037-provider-prediction-adapter.md](037-provider-prediction-adapter.md) | Correct the API-Football forecast adapter |
| 038 | [038-engine-routing.md](038-engine-routing.md) | Enforce AI → local → provider routing with validated fallback |
| 039 | [039-market-evaluation.md](039-market-evaluation.md) | Evaluate each supported parameterized market |
| 040 | [040-probability-invariants.md](040-probability-invariants.md) | Enforce probability and settlement-state invariants |
| 041 | [041-forecast-version-storage.md](041-forecast-version-storage.md) | Persist forecasts with immutable pre-match history |
| 042 | [042-top-pick-ranking.md](042-top-pick-ranking.md) | Choose the match-card recommendation by win probability |
| 043 | [043-slip-integrity.md](043-slip-integrity.md) | Preserve slips without misleading independence claims |

### Publication and administration

| Step | Prompt | Focus |
|---|---|---|
| 044 | [044-publication-repair.md](044-publication-repair.md) | Publish valid fixtures independently of forecast and odds availability |
| 045 | [045-status-separation.md](045-status-separation.md) | Separate match, freshness, forecast, publication and settlement states |
| 046 | [046-settlement.md](046-settlement.md) | Settle and correct predictions using exact market rules |
| 047 | [047-admin-coverage-counts.md](047-admin-coverage-counts.md) | Reconcile admin fixture totals and publication exclusions |
| 048 | [048-operational-dashboard.md](048-operational-dashboard.md) | Expose truthful worker, quota and completeness health |
| 049 | [049-performance-metrics.md](049-performance-metrics.md) | Correct performance metric denominators without changing the panel layout |

### Interface

| Step | Prompt | Focus |
|---|---|---|
| 050 | [050-desktop-match-rows.md](050-desktop-match-rows.md) | Refine desktop match rows without increasing their height |
| 051 | [051-mobile-match-cards.md](051-mobile-match-cards.md) | Refine mobile cards within the existing compact structure |
| 052 | [052-status-display.md](052-status-display.md) | Render compact, accurate and accessible match status |
| 053 | [053-sorting-filters.md](053-sorting-filters.md) | Apply shared server-side Live first sorting before pagination |
| 054 | [054-market-details.md](054-market-details.md) | Show supported market forecasts and correctly sourced bookmaker prices |

### Testing

| Step | Prompt | Focus |
|---|---|---|
| 055 | [055-ingestion-resilience-tests.md](055-ingestion-resilience-tests.md) | Test idempotent ingestion, recovery and quota coordination |
| 056 | [056-prediction-validation-tests.md](056-prediction-validation-tests.md) | Test forecasting evidence, fallback, invariants and queue scale |
| 057 | [057-publication-settlement-tests.md](057-publication-settlement-tests.md) | Test complete public coverage and authoritative settlement |
| 058 | [058-responsive-regression-tests.md](058-responsive-regression-tests.md) | Verify responsive layouts and existing application behavior |

### Rollout preparation

| Step | Prompt | Focus |
|---|---|---|
| 059 | [059-quota-capacity-check.md](059-quota-capacity-check.md) | Measure request demand against the actual account plan |

### Rollout

| Step | Prompt | Focus |
|---|---|---|
| 060 | [060-staged-rollout.md](060-staged-rollout.md) | Deploy reversibly and verify the first operating cycles |

### Handoff

| Step | Prompt | Focus |
|---|---|---|
| 061 | [061-completion-report.md](061-completion-report.md) | Deliver the evidence-backed completion and handoff report |

## Completion standard

The sequence is not complete at the audit, after a partial import, or when code merely compiles. Finish with the requested acceptance checks, measured quota/model evidence, authorized staged rollout and truthful completion report. Where provider access, historical evidence or deployment permissions are unavailable, retain explicit limitations rather than claiming verified completion.
