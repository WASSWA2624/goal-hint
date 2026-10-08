# 006 Shared API-Football quota limiter

**Feature:** Enforce account-wide durable API-Football dispatch limits.

**Depends on:** [002 Runtime policy](002-runtime-policy.md), [003 MySQL and Prisma runtime](003-mysql-prisma.md).

**Source:** [App specification](../app-write-up.md), sections 10–11 and 14–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing persistence/policy contracts. Implement the shared limiter that every API-Football request must use, including trials, manual tools, replicas, pollers, retries and future workers. Add the incremental durable usage-state schema, atomic reservation operations and account-scoped coordination needed to enforce limits across processes.

At dispatch, reserve capacity atomically and pace requests evenly: at most 12 per rolling second, 720 per rolling 60 seconds and 120,000 per verified provider quota day. The daily ceiling contains a protected 20,000-request essential reserve; ordinary work cannot consume it. Preserve 30,000 headroom below the stated Mega quota. Use the lower effective limits if active account terms change. Model priority classes for results/cutoff safety, live/date sync and near-kickoff fallback, daily inputs and optional enrichment.

Count uncertain network attempts conservatively; a timeout is not permission to refund an attempted dispatch. Reconcile daily and minute provider headers against durable reservations and in-flight work. Out-of-order responses must not restore spent capacity. Support deduplicated in-flight work without counting it as fresh unreserved dispatches. Keep rate-limit timing separate from EAT reporting days.

Implement restart and reset behavior: preserve old counters, stop outbound work when exhausted before the expected boundary, and permit only a counted probe against a candidate new period at that boundary. Resume bulk requests only after reliable reset confirmation. Unknown reset behavior must remain unresolved until verified by the provider trial. Honor 429/retry delays and body-level errors. If shared state is unavailable, fail closed and allow callers to serve stored data. Surface structured reasons for budget delays, expired subscription and credential failure without logging secrets.

Do not purchase a subscription, change the plan or make uncontrolled live calls. Provide a reusable gateway contract for prompt 007.

## Acceptance checks

- Database-backed concurrent dispatch tests prove second/minute/day limits, even pacing and reserve separation across callers.
- Tests cover retries, uncertain attempts, stale headers, lower plan limits, crashes, unavailable storage and contention.
- Reset tests prove that a candidate probe is counted, stale responses cannot reset allowance and unconfirmed reset never enables bulk traffic.
- Prioritization preserves essential capacity and returns observable delay/denial reasons.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record schema changes, concurrency evidence and every limit/reset check in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with provider-boundary evidence still required. Clearly distinguish simulated reset validation from a confirmed account reset.
