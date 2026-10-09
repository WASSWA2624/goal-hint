# Server services

Place database access, provider adapters, validated private configuration and
reusable application services here. Every executable module must include the
side-effect import `import "server-only";`, including re-export modules. ESLint
requires the marker and Next.js rejects transitive imports into client bundles.

Share these services with server routes and durable workers; do not import
worker entry points here. Public response contracts belong in `@/domain` and
must exclude credentials and raw private payloads. Integration begins with
runtime policy in prompt 002 and Prisma in prompt 003.

AI/research callers use `cost-control/cost-policy.ts` and the single-attempt
gateway. Reuse the same durable account/category ledger across processes and
trials; keep provider I/O outside database transactions. Approved rates, periods,
allocations and trusted receipts are mandatory. See the
[cost contract](../../docs/research-cost-control.md) before adding a provider adapter.

Fixture evidence callers use the strict collection service and immutable store
in `evidence/`. Bind canonical team/provider identities and explicit observation
times; supply trusted coverage, source and reuse verifiers. Research uses the
existing cost gateway and an approved provider binding. Text cannot authorize
actions; optional source fetching uses the shared HTTPS/public-address boundary.
See the [evidence contract](../../docs/fixture-evidence.md). No licensed research
provider or live evidence policy has been selected yet.

Primary predictor callers use `predictor/` with an immutable model pin, approved
evidence snapshot and exact cost job/attempt. Supply trusted model, source,
transmission, receipt and semantic explanation verifiers; names or hashes alone
do not authorize paid use. The existing gateway accounts for one attempt before
output validation. Candidates retain valid families, missingness, original
clocks and explicit provisional/calibration state. Read the
[predictor contract](../../docs/ai-predictor.md); actual provider selection and
its concrete transport remain pending.

Refresh callers use `createFallbackService` in `fallback/fallback-service.ts`
with an authenticated original AI result, exact
canonical context and approved remaining football allowance. Its adapter reuses
the existing provider gateway/cache, validates current canonical aliases and
fixture revision, and counts requests against the owning job. Keep match result
and derived double chance together; unsupported fields remain unavailable.
Current output expiry and permissions are rechecked after callbacks. The
[fallback runbook](../../docs/provider-fallback.md) describes candidate/retention
results and the actual source evidence still needed for live operation.

`evaluation/` scores independently verified immutable as-of datasets through
the existing market and settlement rules. Use `createEvaluationHarness` with
explicit bounds and trusted protocol, dataset, original forecast/source, model,
regulation-result and history verifiers. Keep original clocks and matched
fixture/cycle/horizon identities. Evaluation archives do not publish or promote
models; real quality and public claims require the separately frozen gates and
independent final-test evidence in the [evaluation runbook](../../docs/forecast-evaluation.md).

`predictions/` stores immutable prediction sets, explicit market snapshots,
cycles and append-only schedule/audit history. Reuse the
[history transaction and read contracts](../../docs/prediction-history.md).
Later publication/lifecycle services supply verified decisions within the shared
fixture transaction; these primitives do not establish publication eligibility
or enqueue work. Read historical revisions without changing current/locked refs.

`jobs/` provides the shared MySQL queue, typed registry, scoped transactional
enqueue, renewable fenced leases and private trigger adapter. Use the
[durable-jobs contract](../../docs/durable-jobs.md) for worker integration,
usage references, shutdown and deployment blockers. The committed job row is
the delivery record; no post-commit broker send is required. Keep visitor reads
independent of enqueueing and supply trusted service/workload identity to triggers.

`selection/` commits one immutable EAT seven-day cohort and reconciles its durable
refresh jobs. Reuse the canonical importer, queue and history writer in the shared
transaction. Its [runbook](../../docs/daily-selection.md) describes the protected
midnight trigger, recorded degradation/cycle inputs, progress and recovery.
Unchosen competition/status or degradation policy blocks the affected live path.
