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
See the [evidence contract](../../docs/fixture-evidence.md). The optional Brave search/article adapter and its exact source allowlist are
described in [research setup](../../docs/prediction-research.md); live source rights
and account support require operator verification.

Primary predictor callers use `predictor/` with an immutable model pin, approved
evidence snapshot and exact cost job/attempt. Supply trusted model, source,
transmission, receipt and semantic explanation verifiers; names or hashes alone
do not authorize paid use. The existing gateway accounts for one attempt before
output validation. Candidates retain valid families, missingness, original
clocks and explicit provisional/calibration state. Read the
[predictor contract](../../docs/ai-predictor.md); the live OpenAI transport and optional research binding are implemented;
credentials, source rights and counted activation checks remain separate.

Refresh callers use `createFallbackService` in `fallback/fallback-service.ts`
with an authenticated original AI result, exact
canonical context and approved remaining football allowance. Its adapter reuses
the existing provider gateway/cache, validates current canonical aliases and
fixture revision, and counts requests against the owning job. Keep match result
and derived double chance together; unsupported fields remain unavailable.
Current output expiry and permissions are rechecked after callbacks. The
[fallback runbook](../../docs/provider-fallback.md) describes candidate/retention
results and the actual source evidence still needed for live operation.
The live runner and new fallback services retain an independent provider baseline
and give a usable AI recommendation precedence through shared qualification.
See the [baseline runbook](../../docs/provider-baseline.md).

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
Route every accepted snapshot through `createRevisionPublicationService` and its
[publication contract](../../docs/revision-publication.md). It checks manifest,
fresh observation, model/evidence/source identity, ownership, order and strict
cutoff inside the shared transaction. History writers remain storage primitives
for that service and later lifecycle decisions. Read historical revisions without
changing current/locked refs. Durable refresh results/events remain separate from
forecast payloads; no schedule or permissive live authority is mounted.

`createCutoffLockingService` schedules durable close jobs, selects an eligible
accepted revision from publication/schedule/start history and closes once through
the same fixture transaction. Pass it as selection's required `cutoff` dependency
and register `createCutoffJob` in the protected worker binding. Reuse its audited
void operation for proven corrections; it preserves the original locked pick.
The [cutoff contract](../../docs/cutoff-locking.md) defines recovery, grants and
the shared durable change stream. Lifecycle detection and settlement remain
separate operations.

`createScheduleLifecycleService` consumes attributable normalized provider
observations through the [schedule lifecycle contract](../../docs/schedule-lifecycle.md).
Bind its coordinator to catalog imports and use `observe` for normalized inputs.
Kickoff corrections, postponement/void transitions, early-start proof, conflict
holds and next-selection handoffs share publication/cutoff synchronization. No
new prediction work or committed membership is created by an observation.

`results/` supplies one account-leased continuous poller and durable normalized
result observations. Reuse the provider adapter/limiter and lifecycle service;
public reads never invoke it. The [result sync contract](../../docs/fixture-result-sync.md)
defines explicit horizons, recovery, fixture versions and result events. Live
activation requires a reviewed operator binding and approved operating settings.

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

`odds/` imports API-Football pre-match odds for one documented bookmaker (prompt
052). Use `createOddsImportService` with the adapter's separate `odds` namespace,
`createMysqlOddsStore` and an `OddsAuthority`. Keep provider I/O before any
transaction and never create fixtures from odds rows. Snapshots are append-only
and content-chained, and each one links to a receipt that recorded its exact
observation. The public price projection is written only while the authority
verifies `football-odds-rights`; without it, `expire()` stales every fresh price.
Job gates use `oddsQuotaAllows`, which gives odds only the day's spare (their own
enrichment dispatches) and never the reserve. Feed and detail read prices through
`odds-read.ts` with the effective `publicPolicy.features.providerOdds` flag, which
stays off until OP-36 display rights are recorded. Odds never reach AI, evidence or
fallback inputs. `storedQuoteSource` feeds `predictions/prediction-quote-store.ts`,
which captures the public price beside each published family inside the
publication transaction, only when the publisher's `quotes.verify` proves both the
flag and the rights. Read the [provider odds runbook](../../docs/provider-odds.md).

`teams/` fills `FootballTeam.code` for tight phone cards from spare quota. Use
`createTeamCodeService` with `createMysqlTeamCodeStore` and the ordinary catalog
importer: it imports `/teams?league&season` for the nearest competition-seasons
with codeless teams and never writes codes itself. The catalog's own teams
receipts are the checked-at markers (30 days, or 1 day after a failed receipt),
so no table of its own exists. `createTeamCodeJobDefinitions` gates each hourly
sweep with `oddsQuotaAllows`; team codes and odds share one spare at
`enrichment` priority. Read the
[football catalog](../../docs/football-catalog.md#team-codes-spare-quota-import).
