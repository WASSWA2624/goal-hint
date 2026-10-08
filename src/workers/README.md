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
