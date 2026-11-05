# Local prediction intelligence — execution report

Date: 5 November 2026 (EAT). Baseline: `93a36cebc318a635906117f06d6037419c27629d`.
Scope: approved revised local-only prompt, phases 0–4. Phase 5 release is not
authorized. The primary checkout's UI development server was preserved; all
implementation and disposable database work used an isolated worktree.

## Implemented behavior

- Independent regularized Poisson goals model, coherent existing markets,
  point-in-time league/team history, reproducible configuration/data identity,
  sample/convergence uncertainty and sparse-data abstention.
- Separate provider forecast, authorized contextual facts and validator output;
  chronological out-of-sample ensemble weighting, league/cohort shrinkage and
  provisional calibration diagnostics. AI supplies no numerical probability.
- Semantic monitoring, configurable check planning, simultaneous day/month
  admission, bounded retry/circuit helpers and a durable shadow job available for
  explicit registration. Defaults off; no automatic live source binding.
- Transactional shadow state, immutable revisions and compact replay receipts;
  unchanged checks, concurrent restarts, outage recovery, evidence dependency
  changes and execution-time cutoff protection.
- Conservative joint-slip selection and evaluation across six unchanged odds
  bands, global fixture exposure limits and verified whole-set independence.
- Offline readiness/demo/verified-data report command and local dev/production
  benchmark. Public prediction UI, payments, source precedence and history remain
  unchanged by this implementation. The owner separately approved three missing
  trial audit labels and the associated regression-test repairs described below.

Every forecast remains `publish: false`. No real predictive accuracy or
production-readiness claim follows from the implementation.

## Verification

| Check | Observed result |
| --- | --- |
| Baseline prediction/evaluation/worker/slip tests | 250 passed, zero failed/skipped; 34.1 seconds |
| Independent baseline slips/performance tests | 73 passed, zero failed/skipped |
| Final combined new-feature suite | 77 passed, zero failed/skipped; 13.17 seconds |
| Final durable job / shadow-state coverage | Eight job tests and eleven shadow-state tests passed, included in the combined suite |
| Joint selection/evaluation tests after review | 19 passed; targeted lint clean |
| Contextual extraction/review tests | 8 passed, including final identity, freshness and actual budget-reservation hardening |
| Genuine MySQL shadow migration/integration | Final strengthened test passed, zero skipped; MySQL 8.4.11, 109.83 seconds (110.88 seconds total) |
| Shadow encrypted backup and restore | Passed: five revisions, twelve unique checks, exact real-model probabilities/441 score states, original hashes, latest pointer and immutable triggers preserved |
| Prisma generate and validate | Passed; owned worktree client only, no application database connection |
| Full lint | Final full rerun passed, zero warnings |
| Flutter host regression | 79 passed using existing cached dependencies, no package update |
| Full web regression run | 2,860 passed, seven failed, one Windows POSIX-permission skip; 434.4 seconds; every failure diagnosed below |
| Authorized unrelated regression repairs | Final combined rerun: 24 passed, zero failed/skipped; 9.87 seconds |
| Isolated dependency-layout reruns | Seven boundary/render tests passed from primary dependency layout; no test assertions changed |
| Full application TypeScript | Production build passed; final `tsc --noEmit` also passed after freshness/archive fixes |
| Full application production build | Passed with Webpack; compile 64 seconds, TypeScript 2.7 minutes, 28 static pages, offline bundle with 35 pinned assets |

New MySQL testing proved concurrent two-connection retry deduplication, unchanged
check/no-version behavior, recovery eligibility, database cutoff rollback and
no public `PredictionSet` writes. The first migration attempt exposed a new
foreign-key collation mismatch; the new migration was corrected to match the
catalog's `utf8mb4_bin`, then passed. No historical migration was edited.

A strengthened real-model roundtrip exposed MySQL JSON normalization changing
some double-precision probabilities by one representable value. Shadow payloads
now preserve the exact canonical serialized content inside versioned JSON
envelopes; hash validation and forecast values are not rounded or weakened.
The acceptance checks actual model probabilities, all 441 retained score states,
model/history identity and complete hashes after storage and encrypted restore.

Final review also found that unchanged monitoring observations could skip
component expiry/revocation checks. The durable job now includes stable validity
states and a retained local-fit renewal deadline in its dependencies, rechecks
authority before persistence, and tests expiry/recovery without duplicate
clock-only revisions. Quote expiry clears value estimates independently.

Earlier full backup attempts were inconclusive: one ran while the migration set
was being authored (schema compatibility changed), one exposed that corrected
new migration defect, and one exceeded the existing 90-second migration harness
timeout under concurrent build/test load. No assertions were weakened and no
unrelated backup implementation was changed. The new isolated shadow backup/
restore acceptance uses an explicit longer migration-startup allowance.
The repository's deployment helper independently retains its existing 120-second
subprocess timeout; concurrent load can still exhaust that limit before reaching
the new migration. No application migration timeout was changed for this task.

The full web run's four source/test failures reproduced on unchanged main before
repair. The owner explicitly authorized these four repairs on 5 November:
missing trial audit labels/categories; a slip-performance test that still treated
rank 101 as invalid after capacity grew to 120; and two route-render tests with
stale component/session mocks and missing native Node Next-navigation handling.
The repairs add the three trial labels under Access, derive the tested rank cap
from shared band constants, and reuse one current server-route loader with precise
component mocks. Authorization/Suspense/read-order assertions were retained.
No unrelated business logic or test assertion was removed to force a pass.

Three other failures were verification-layout issues: Turbopack deliberately
cannot resolve a `node_modules` junction outside the isolated workspace root.
The unchanged boundary and not-found rendering tests passed from the primary
checkout's real dependency layout. Source code and test assertions were unchanged.
The production fixture/full application builds use Webpack in the isolated
worktree for that reason. The one full-suite skip checks POSIX permission bits
on Windows; it does not hide a failed implementation test.

## Measured local page behavior

The same shared slip components ran within identical synthetic fixture routes
in separate development and production servers on owned loopback ports. The
benchmark did not execute the full live page orchestration.

| Route / TTFB | Development | Local production |
| --- | ---: | ---: |
| Best Slips, first request | 42,200.6 ms | 773.8 ms |
| Best Slips, median of five warm requests | 517.2 ms | 32.4 ms |
| Generated slips, first request | 16,073.8 ms | 93.3 ms |
| Generated slips, median of five warm requests | 792.9 ms | 62.1 ms |
| Union JavaScript bytes on these pages | 15,866,174 | 1,315,591 |
| Computed gzip JavaScript bytes | 3,674,312 | 393,881 |
| Owned process-tree RSS after requests | 1,594,044,416 bytes | 272,183,296 bytes |
| Owned process-tree cumulative CPU | 76.266 seconds | 2.766 seconds |

Production fixture build passed in 200.873 seconds. These observations identify
development compilation/bundle overhead as a major contributor in the measured
fixture. They do not isolate a production database bottleneck, prove a backend
speed improvement, or justify unrelated refactoring. No existing backend path
was changed on the basis of synthetic latency alone.

Absolute measurements were affected by concurrent sessions on the same computer.
Database/entitlement reads, browser hydration, actual mobile networks and hosted
staging were not measured. The script is reproducible with
`npm run intelligence:benchmark`; raw local evidence is
`.tmp/slips-5c6e17e1/benchmark.json` and its build/server logs. Generated output is
not committed. The primary port-3000 server was untouched.

## Costs and remaining work

Provider requests: **0**. Paid AI/research requests: **0**. No paid activation,
production configuration/data write, deployment or service purchase occurred.

Real point-in-time data and original provider captures remain unavailable for
this execution. Provider/AI comparisons, calibrated public win probabilities,
whole-slip independence, empirical improvement and prospective qualification
remain unproven. New diagnostic artifacts do not authorize themselves. A live
collector/scheduler and authenticated archive binding require verified account
coverage, caching/transmission rights and owner-approved operating configuration.

The new day/month guard checks supplied balances before the existing atomic
cost/quota gateway; it is not a replacement spending ledger. Contextual dispatch
is optional and uses that gateway only after authorization. Compact check
receipts currently remain retained; automated receipt archival is not implemented.
Forecast and publication audit evidence must never be pruned as ordinary logs.

The existing exact hundredth band gaps are deliberately preserved (for example,
4.9952 is outside the first band's 4.99 maximum and the next band's 5.00 minimum).
Existing UI average-probability labels/sorting remain unchanged. Any presentation
change needed for a future joint-probability release is an owner approval gate.
Illustrative slip ROI uses the original captured two-decimal total quote, with
void/cancelled/pending/unavailable excluded; no bookmaker payout is assumed.

Staging/deployment, native signing, real push delivery, backups on the eventual
deployment target and applicable legal/responsible-gambling review remain release
work. Local tests cannot qualify those external systems.

The pre-existing schema snapshot also omits four fields present in the primary
schema and existing migration `20261104140000_manual_providers_and_opt_in_trials`:
`trialEligibleAt`, `trialForfeitedAt`, `mtnEnabled` and `airtelEnabled`. This change
adds only the new shadow schema to both files and does not repair that unrelated
metadata discrepancy.

## Migration and rollback

Only `20261105100000_intelligence_shadow` was added, with three shadow tables,
fixture/time/model indexes, unique receipt/revision identity and immutable revision
triggers. Applied only in disposable owned MySQL tests. No production or ordinary
development application database was migrated.

Rollback: leave the new mode off/unregister its job, stop only its owned worker,
and revert the source commit. Preserve the additive tables, original forecasts,
published slips, receipts and evaluation artifacts. Dropping tables or destructive
data rollback requires separate owner approval and a verified backup. See the
[operating guide](../prediction-intelligence.md) and [phase audit](../../dev-plan/280-local-prediction-intelligence.md).

## Changed-file inventory

Paths below are repository-relative and enumerate this implementation, excluding
other chats' independently committed UI work.

Phase 0 audit and shared documentation:

- `APP_OVERVIEW.md`
- `next-js/dev-plan/280-local-prediction-intelligence.md`
- `next-js/docs/prediction-intelligence.md`
- `next-js/docs/reports/local-intelligence-280.md`

Phases 1–2 evidence, local model, context, validator and monitoring:

- `next-js/src/server/intelligence/intelligence-contract.ts`
- `next-js/src/server/intelligence/evidence-adapter.ts`
- `next-js/src/server/intelligence/local-goals-model.ts`
- `next-js/src/server/intelligence/contextual-review.ts`
- `next-js/src/server/intelligence/forecast-validator.ts`
- `next-js/src/server/intelligence/monitoring.ts`
- `next-js/tests/helpers/intelligence-fixtures.mjs`
- `next-js/tests/intelligence-evidence-adapter.test.mjs`
- `next-js/tests/local-goals-model.test.mjs`
- `next-js/tests/contextual-review.test.mjs`
- `next-js/tests/forecast-validator.test.mjs`
- `next-js/tests/intelligence-monitoring.test.mjs`

Phase 3 persistence, durable jobs, slips and evaluation:

- `next-js/prisma/schema.prisma`
- `next-js/prisma/schema.snapshot.prisma`
- `next-js/prisma/migrations/20261105100000_intelligence_shadow/migration.sql`
- `next-js/src/server/intelligence/shadow-store.ts`
- `next-js/src/server/intelligence/shadow-service.ts`
- `next-js/src/server/intelligence/shadow-job.ts`
- `next-js/src/server/intelligence/walk-forward-evaluation.ts`
- `next-js/src/server/slips/conservative-joint-model.ts`
- `next-js/src/server/slips/shadow-slip-selection.ts`
- `next-js/src/server/slips/shadow-slip-evaluation.ts`
- `next-js/scripts/intelligence-report.mjs`
- `next-js/tests/helpers/intelligence-shadow-fixtures.mjs`
- `next-js/tests/helpers/shadow-slip-fixtures.mjs`
- `next-js/tests/intelligence-shadow.test.mjs`
- `next-js/tests/intelligence-shadow-job.test.mjs`
- `next-js/tests/walk-forward-evaluation.test.mjs`
- `next-js/tests/conservative-joint-model.test.mjs`
- `next-js/tests/shadow-slip-selection.test.mjs`
- `next-js/tests/shadow-slip-evaluation.test.mjs`
- `next-js/tests/intelligence-command.test.mjs`

Phase 4 performance, database resilience and executable checks:

- `next-js/package.json`
- `next-js/scripts/benchmark-local-pages.py`
- `next-js/scripts/test-intelligence-mysql.mjs`
- `next-js/tests/intelligence-shadow.integration.mjs`

Four explicitly authorized pre-existing regression repairs:

- `next-js/src/domain/admin-audit.ts`
- `next-js/tests/slip-performance.test.mjs`
- `next-js/tests/app-loading-performance.test.mjs`
- `next-js/tests/page-loading-performance.test.mjs`
- `next-js/tests/helpers/server-route-loader.mjs`

Only phase 3 introduces a migration. Phases 1–4 use source reversion with the
shadow mode disabled; preserve all audit tables and artifacts as described above.
All phases used local synthetic fixtures with zero provider/paid requests.
