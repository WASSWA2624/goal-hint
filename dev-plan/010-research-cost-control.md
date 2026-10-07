# 010 Research and AI cost control

**Feature:** Enforce independent, durable research and AI spending budgets.

**Depends on:** [002 Runtime policy](002-runtime-policy.md), [003 MySQL and Prisma runtime](003-mysql-prisma.md).

**Source:** [App specification](../app-write-up.md), sections 7, 10–11 and 14–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and current policy/persistence code. Implement reusable server-side budget reservation and usage accounting for research and AI calls. Keep these budgets independent from API-Football request quotas and its US$45 subscription ceiling. Resolve provider rates, currency, accounting periods, approved caps and per-job request/token/time limits from the decision register before enabling paid dispatch. Do not invent a free allowance or silently treat unpriced work as affordable.

Add the minimal durable ledger, uniqueness and atomic operations needed to reserve a conservative maximum cost before dispatch, settle measured usage afterward and reconcile reservation differences under documented provider billing rules. Track job/attempt, provider/model/rate version, tokens or billed units, requests, elapsed time and monetary cost with exact representations. Account for retries and uncertain network outcomes conservatively; an ambiguous timeout cannot simply release all reserved spend. Separate confirmed cancellation-before-dispatch from potentially billable work.

Enforce caps across concurrent workers and processes, including local trials using the same account budgets. Support per-job ceilings and reserved time for fallback. Return structured budget-exhausted, unpriced, timeout and service-unavailable reasons that later orchestration can distinguish. Prioritize nearest kickoffs through an explicit priority contract; do not initiate predictions or select fixtures here.

Expose concise internal usage/cost summaries and safe logs without prompts, secrets or unnecessarily retained personal/source data. If accounting storage is unavailable, stop paid dispatch and retain stored public forecasts. Demonstrate how cached evidence reuse avoids additional calls while retaining its original source timestamps. Estimated cost arithmetic must be clearly labeled and separate from invoiced/observed cost.

## Acceptance checks

- Database-backed concurrent reservations cannot overspend aggregate or per-job caps.
- Tests cover completion, retries, partial/unknown usage, duplicate reconciliation, process restart and missing pricing/configuration.
- Token/request/time limits and fallback-time reservations return distinct operational outcomes.
- AI/research and API-Football accounting cannot consume or reset one another's allowances.

## Handoff

Record changed files, ledger invariants and concurrency/accounting test results in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with approved rates/caps or the exact decisions still blocking live paid calls.
