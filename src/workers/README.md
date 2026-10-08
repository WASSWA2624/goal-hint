# Durable workers

Reserve this boundary for process entry points, queue consumers and orchestration
introduced by prompt 020 and later. Reuse `@/server` services and `@/domain`
contracts. Every executable module must include `import "server-only";`.
Application routes enqueue through server services; they must not import or run
worker entry points. Never import workers from browser or shared domain code.

Future standalone Node runners and server-service tests need the
`--conditions=react-server` Node option to resolve the server-only marker outside
Next.js. TypeScript path aliases are understood by Next.js, but plain Node does
not resolve `@/*`; the worker prompt must choose its runner/build resolution.
No queue, scheduler, paid operation or worker process is activated here.

Later research/prediction workers must reuse `createPolicyCostService` and
`createCostGateway` from the server cost-control boundary. Stable work identities
and explicit joint allocations preserve job ceilings across retries; account
identity and the ledger must be shared with local trials. Keep fallback within
its approved reserve and the existing football limiter. An unavailable cost
ledger stops paid dispatch while stored forecast reads remain available.

Later analysis workers pass their actual fixture, cycle/run identities, analysis
time and cutoff to `createEvidenceService`. Use explicit null references until
the owning orchestration creates them. Preserve original evidence times during
reuse and verify current rights; immutable archives are not permission for new
analyses. Keep collection within the shared workflow deadline and approved
football/research allowances. The [evidence runbook](../../docs/fixture-evidence.md)
records the caller contract and pending licensed provider/policy decisions.

Later prediction workers resolve an independently approved model pin and invoke
`createPredictorService` with the same immutable evidence and cost intent. Keep
the job's model fixed across retries and restore its verified prior pin after
restart. Preserve candidate provenance and family failure reasons for 013/019;
the predictor performs no fallback selection, publication or durable scheduling.
See the [predictor runbook](../../docs/ai-predictor.md) for actual integration
decisions still required before live use.

After an AI attempt, pass its original verified result into
`createFallbackService` with the same fixture/cycle/run and owning job. Reuse
one provider adapter/account/cache scope and approved remaining bounds across
accesses; a new request ID cannot renew that job's allowance. Preserve complete
candidate snapshots, per-family source/failure provenance and the zero-valid
retention instruction for later publication. Public read routes must never run
fallback. See the [fallback runbook](../../docs/provider-fallback.md).
