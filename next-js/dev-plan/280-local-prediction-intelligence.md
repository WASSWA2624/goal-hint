# 280 — Local prediction intelligence

Approved 5 November 2026. Baseline: `93a36cebc318a635906117f06d6037419c27629d`.
Implementation branch: `codex/prediction-intelligence-local`; isolated checkout:
`D:/coding/apps/nextjs/goal-hint-intelligence`.

## Boundaries and coordination

The primary checkout was clean on main, with its development server running on
port 3000. Active Package, Pay and Details chats were subsequently discovered and
file ownership coordinated. Their separately approved UI work remains outside
this implementation. Leave that server, detached linked worktrees and both
existing stashes intact. Model/evaluation, monitoring/persistence,
slips/performance and integration/documentation have separate file owners.
Recheck shared Git state before merge.

Follow the approved revised prompt in `prompts/`. No UI files, labels, sorting
presentation, payments, entitlement rules or native host behavior change. New
predictions remain shadow-only. No production target, paid-service activation or
destructive migration is authorized. Test databases must be disposable and owned.
Pre-existing failures are evidence to report, not authority to repair unrelated code.

The owner subsequently authorized four reproduced pre-existing failures on
5 November: missing trial audit labels/categories, an obsolete slip-rank limit
assertion, and two route test-loader failures. These narrow repairs are included;
the three trial audit labels are the sole approved user-facing exception to this
task's UI freeze. Other chats' UI changes have independent owner authorization.

## Audit and acceptance matrix

| Requirement | Baseline source evidence / state | Implementation and acceptance |
| --- | --- | --- |
| Provider forecasts and prices | Implemented: `server/fallback/`, `server/odds/`, `predictions/prediction-quote-store.ts`; binary probabilities unavailable where provider supplies advice only | Preserve originals and missing markets; never infer probabilities from advice or odds. Reuse receipts. |
| Independent football model | Missing. `evidence/baseline-evidence.ts` supplies eligibility checks; `evaluation/evaluation-baselines.ts` has frequency/Elo baselines | New regularized, recency-weighted Poisson model. Fit attack, defence, home advantage from verified league results before cutoff; coherent four-market probabilities; sparse-data and convergence abstention. |
| Context versus forecast | Partial: `predictor/` currently produces AI probabilities with citation/cost checks | Separate timestamped contextual claims and factual vetoes from local/provider probabilities. No numerical AI adjustment. Missing/rumour/credible/verified evidence remain distinct. |
| Calibrated ensemble | Missing as requested: live fallback uses reviewed source precedence | New chronological out-of-sample weighting and calibration diagnostics; league shrinkage; separate uncertainty, reliability, value and qualification. Agreement never grants approval. |
| Collection schedule | Seven-day EAT baseline exists in `selection/` and `live/` | Bounded configurable daily/hourly/distant checks with capability and budget gates; no calls from user page views. Actual account endpoint access/caching terms remain unverified. |
| Semantic monitoring | Partial: `refresh/refresh-observation.ts` validates lifecycle, but full refresh is not a semantic-change check | Classify critical/significant/minor/unknown, provisional five-point trigger, locally recompute, deduplicate unchanged checks. Unknown updates never mean unchanged. |
| Durability and budgets | Implemented foundations: `jobs/`, `football/quota-*`, `cost-control/`, `refresh/` | Reuse lease/idempotence contracts; explicitly gate both daily/monthly capacity; outage/backoff/restart tests. No paid dispatch in local validation. |
| Versioning/storage | Immutable sources, stages, sets and publication history in Prisma; no independent shadow archive | Add compact check state and append-only meaningful shadow revisions with atomic latest pointer. Repeated checks/retries create no new version. Migration and rollback documented. |
| Forecast lock/history | Implemented `predictions/cutoff-*`, lifecycle/publication barriers | Preserve five-minute lock and original published selections, odds, references and settlement. Test changed/suspended fixture handling. |
| Slips | Six exact odds bands implemented; joint model deliberately unbound in `slips/joint-model.ts`; per-band reuse controls | Shadow selector requires validated marginals and independently evidenced whole-set dependence assumptions, excludes unknown combinations, globally limits fixture exposure and leaves bands empty. |
| Display sorting | Existing cards/lists use average match probability | UI freeze blocks relabeling or changing interactions. Preserve existing UI; shadow joint ranking stays private. Activation requires resolving presentation with owner. |
| Evaluation | Existing `evaluation/` provides chronology, metrics, seals and independent promotion gates | Add walk-forward local/provider/ensemble comparison with lead times, coverage and missingness. AI incremental value and real quality remain unavailable without authorized original data. Synthetic tests prove behavior only. |
| Performance | Existing `matches/` and history reads have batching/bounded queries; reported cold-page delay not yet measured | Measure owned local development/production and worker behavior. Change only measured in-scope backend defects. Hosted/staging and mobile device qualification remain separate. |
| Operations | Backup/restore, migration/deploy scripts and Flutter source foundations exist | Exercise disposable MySQL backup/restore and regression suites. Real credentials, native signing/push, staging, legal approval and production qualification remain owner release gates. |

Paths in the table are relative to `next-js/src/` unless otherwise noted.

## Phases and evidence

0. Audit/baselines: targeted existing prediction/evaluation/worker/slip suite
   **250 passed, 0 failed, 0 skipped** (34.1 seconds). Independent slips/performance
   baseline **73 passed, 0 failed, 0 skipped**. No live calls or service spend.
1. Data/local model: new internal contracts and statistical model, no UI exposure.
2. Context/validator/monitoring: separate factual output, learned artifacts and
   semantic checks, defaults disabled/shadow.
3. Persistence/slips/evaluation: additive shadow storage, immutable history,
   conservative selection and reproducible local commands.
4. Performance/resilience: owned benchmarks, disposable database tests, regression
   checks, full changed-file report and rollback.
5. Release: not authorized. Prospective qualification and owner approval required.

Final commands, measurements, changed files and remaining limitations belong in
`docs/reports/local-intelligence-280.md`. Do not equate source presence or synthetic
test success with production readiness or predictive accuracy.
