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
