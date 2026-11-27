# GoalHint — Backend Scheduler and Worker Reliability Implementation Prompt

## Objective

Review GoalHint's existing football-data schedulers and background workers. Make only the **necessary canonical backend changes** to improve the accuracy, completeness, freshness, reliability, and efficiency of collecting and persisting fixtures, pre-match odds, bookmaker markets and prices, live scores, match events, statistics, lineups, and results.

**The codebase is the source of truth. Respect every existing working implementation, repository rule, and established business process. Do not reinvent the wheel.** This task is restricted to backend collection, scheduling, persistence, monitoring, and worker reliability. **Do not modify any user interface.**

## 1. Non-negotiable boundaries

- Audit before making changes. Verify the implementation as it exists rather than assuming the documentation exactly matches production.
- Follow repository instructions, architecture, coding conventions, dependency patterns, environment configuration, deployment procedures, database practices, and business rules.
- Reuse the canonical scheduler, workers, queues, API client, storage services, retry facilities, logging, and deployment infrastructure. Repair or extend them instead of introducing duplicate mechanisms.
- Do **not** change UI components, pages, styling, mobile or desktop layouts, frontend polling logic, browser behavior, or existing frontend contracts.
- Do **not** change prediction formulas, probability calibration, market-selection algorithms, slip-selection criteria, Best Slips generation logic, Slip Builder rules, access controls, payment/subscription flows, authentication, or other unrelated features.
- Preserve existing and historical fixtures, odds, results, predictions, published slips, settlement records, and audit history. Do not destructively reset or backfill data without an explicit documented need and safeguards.
- Maintain compatibility with all existing consumers, database contracts, service interfaces, and production behavior except for the approved improvements to backend data freshness and correctness.
- Prefer minimal, focused edits and existing dependencies. No parallel implementation of an already functioning service.
- If a desired outcome requires a frontend change, **do not make it**. Document the limitation for separate approval.

## 2. Inventory and root-cause audit (mandatory first step)

Inspect the codebase, available operational data, worker configuration, scheduler definitions, logs, deployment manifests, API quota ledger, and relevant documentation. Produce an accurate inventory of:

1. The exact production processes/launchers and their internal schedulers, workers, queues, cron jobs, and service ownership.
2. Each job's purpose, cadence, trigger, processing horizon, dependencies, page/batch ceilings, concurrency, retry behavior, checkpoints, and locks.
3. The existing pipeline for fixture discovery, pre-match and in-play odds, odds mapping, lineups, statistics, events, live scores, results, and publication dependencies.
4. Where incomplete or absent prices occur: API-Football availability, incomplete pagination, failed requests, partial bookmaker/market/selection records, incorrect mappings, persistence errors, filtering, or stale downstream reads.
5. Actual request volume, peak rates, rate-limit responses, freshness, job duration, partial runs, missed intervals, and restart recovery.
6. Existing API-Football endpoints and constraints. Confirm endpoint-specific bulk querying, fixture batching, response pagination, bookmaker coverage, and update frequency against current documentation and observable responses. Do not assume that all endpoints can batch 20 fixtures.

Separate **confirmed issues** from hypotheses. Retain mechanisms already working correctly and document why any changed mechanism is necessary.

## 3. Target operating schedules

Treat the following as **initial targets**, not a justification for duplicate jobs or wasteful requests. Where the existing canonical implementation provides equal or better verified behavior, preserve it. Make intervals configurable and coordinate jobs so slow runs do not overlap.

| Responsibility | Target / policy |
|---|---|
| Fixture discovery | Comprehensive daily import around midnight Kampala time; hourly incremental discovery; reconcile newly added or rescheduled fixtures |
| Fixture/odds coverage horizon | Align fixture discovery with the existing odds horizon (review approximately 15 days); prefer lightweight incremental discovery |
| Broad pre-match odds collection | Every 3 hours, with full supported pagination and durable completion tracking |
| Selective pre-match odds recovery | Every 30 minutes for new, failed, missing, or incomplete eligible fixtures/markets; skip unnecessary redundant checks |
| Live fixtures, scores, status and available events | Target a 10-second refresh when eligible matches are live, using the most efficient supported endpoint |
| Live match statistics | Target every 60 seconds for eligible live matches, using supported batching where available |
| Pre-match lineups | Check roughly every 15 minutes starting around 90 minutes before kickoff, stopping when definitive or ineligible |
| In-play odds | Preserve/refine existing collection according to actual provider support, freshness requirements, and quota; do not conflate with pre-match odds |
| Results / final scores | Verify when a match finishes and retry unresolved finalization appropriately |
| Best Slips publication | Preserve the existing 30-minute publication cadence and business logic; improve upstream readiness only |
| Historical recovery / backfill | Lowest priority, opportunistic and quota-aware |

For new fixtures, perform an initial eligible odds check promptly after discovery. Prioritize approaching kickoffs and missing prices required by existing consumers. Maintain observed freshness metrics rather than assuming that configured intervals equal successful intervals.

## 4. Odds completeness: bulk collection plus selective reconciliation

Implement or repair the existing canonical flow:

1. **Discover and persist fixtures.** Match each odds response to a canonical fixture and its actual schedule/status.
2. **Perform comprehensive collection** at the planned interval. Follow all supported response pages; detect pagination gaps, unexpectedly short runs, stale cursors, and partial results. Do not mark a run complete until completion is proven.
3. **Persist prices correctly** across available bookmaker, market, selection, and quote dimensions using existing mappings and storage. Preserve historical/provenance behavior and do not overwrite valid data with empty/invalid responses.
4. **Reconcile completeness.** Distinguish a fixture with *some* odds from one with the specific markets and priced selections required by GoalHint. Track missing fixture odds, missing markets, missing selections, failed imports, and genuinely unavailable provider data separately.
5. **Selective checks every 30 minutes.** Recheck newly discovered fixtures, transient failures, incomplete pages, and unresolved missing prices using efficient fixture-specific queries when supported. Do not refetch already-complete fixtures in every selective cycle merely because they exist.
6. **Refresh existing odds.** A price captured once is not permanently complete or current. Revisit existing bookmaker prices in the comprehensive 3-hour cycles and prioritize near-kickoff updates; handle changed, suspended, or withdrawn odds safely.
7. **Paced retries.** Retry transient failures sooner using bounded exponential backoff/jitter. Space out confirmed empty provider responses using the provider's likely update cycle, fixture proximity, and remaining quota. Never permanently declare unavailable after one empty response.
8. **Prove and monitor coverage.** Report available-provider-odds capture, usable market/selection coverage, price age, collection latency, and the reason for every unresolved gap. Aim for **at least 99% of eligible odds demonstrably available through the provider**, without promising odds that API-Football does not supply.

Audit current page ceilings and targeted batch limits. If they truncate eligible data, remove the silent truncation through safe pagination/continuation rather than by arbitrarily increasing load.

## 5. Live match-data pipeline

- Determine the canonical live-fixture set and use the most efficient verified API-Football bulk/list endpoint for scores, statuses, and available events. Avoid individual requests when a valid single request yields the necessary data.
- Target 10-second live summary polling **only while eligible live fixtures exist**. Do not create a 24-hour high-frequency loop when unnecessary.
- Target 60-second detailed statistics collection. Batch only if the specific endpoint actually supports it; otherwise use bounded parallelism and priority selection.
- Detect starts, goals, cards, substitutions, status changes, suspensions, match completion, and relevant available statistics without assuming equal coverage for every competition.
- Persist each changed response promptly, consistently, and idempotently through the existing database pathway. Do not use direct browser-to-provider requests.
- Stop or reduce live-frequency collection when the fixture is no longer active; verify final results, delayed events, and final settlement prerequisites with controlled follow-ups.
- Reuse existing server-side notification or change-distribution mechanisms **only if they already exist** and fit the allowed backend scope. Do not implement frontend WebSocket/SSE clients or alter UI polling.
- Measure provider-received-to-database latency. The **15-second UI freshness objective** is a *target*, not a guarantee: provider update delay, network latency, rate limits, and existing frontend refresh timing can prevent it. Explicitly report any frontend limitation rather than silently changing UI code.

## 6. Shared API-Football quota and scheduling protection

The user's working subscription is **Mega**, planned at **150,000 daily requests**. Validate the active account limit and the actual provider response headers at runtime rather than relying solely on a static assumption.

Initial configurable controls:

- Shared request pacing target: **at most 10 requests/second** and **600 requests/minute** across all relevant workers, subject to observed provider limits.
- Daily planning target: **120,000 requests**, with approximately **30,000 requests of contingency** within the reported 150,000 allowance; these are operating targets, not permission to ignore an active provider cap.
- Do not assume a separate hourly provider limit unless verified. Still measure and monitor hourly load.
- Use one existing/canonical coordinated quota-control mechanism, with safe concurrency, shared counters, rate-limit handling, queue priorities, and bounded backpressure. Ensure multiple worker processes cannot independently exhaust the same quota.
- Priority under pressure: live scores/status/events, time-sensitive result verification, approaching kickoffs and critical odds, then routine odds and fixture checks, followed by historical recovery.
- Avoid bursts at midnight, simultaneous 3-hour sweeps, overlapping targeted checks, and coordinated restarts. Use schedule staggering where needed.
- Log and monitor actual usage per second, minute, hour, and provider-reset day; include 429 responses, failed attempts, batch efficiency, backlog, and skipped/deferred work.
- After implementation, **calculate daily consumption from actual measured rates and fixture volumes**, not only optimistic arithmetic examples. Do not assume every request returns useful data.

## 7. Reliability, concurrency, and safe restarts

- Restart cleanly after crashes, deployments, VPS restarts, process restarts, and network interruptions.
- Persist durable checkpoints for unfinished jobs and odds pagination where justified; resume without needlessly repeating already completed pages or creating duplicate data.
- Prevent two instances of the same job from executing concurrently using existing leases/locks or equivalent canonical coordination.
- Use bounded retries, exponential backoff with jitter, quota-aware deferral, and the provider's rate-limit signals.
- Make writes idempotent and atomic where appropriate. Ensure partial API responses cannot be silently recorded as a complete collection.
- Give jobs distinct states such as completed, partial, retryable failure, provider-unavailable, and deferred. An exited job is **not** automatically a successful job.
- Include monitoring/alerts for stuck jobs, repeated failures, excessive lag, missing odds, stalled checkpoints, and inaccurate quotas.
- Preserve any existing external backup, Git history, migration, and deployment policies. Avoid creating unnecessary duplicate server copies or unrelated infrastructure.

## 8. Integration and compatibility checks

Validate that collected data flows correctly to existing match listings, match details, prediction consumers, slip generation, and settlement processes **without modifying those consumers' UI or business rules**. Preserve Best Slips publication behavior and historical records. If a DB change is truly required, use the smallest compatible migration according to repository standards, and include an upgrade/rollback assessment. Do not introduce schema changes merely for convenience.

## 9. Testing, staging, and rollout

Add or update focused tests for complete pagination, interrupted pages, missing and partial market prices, updated/suspended odds, provider-empty vs provider-error responses, targeted retries, rate limits, concurrent schedulers, process restarts, idempotency, active/live transitions, multi-match load, final result verification, compatibility with prediction and slip services, and sustained quota usage.

Verify behavior **in staging** with realistic fixture volumes and controlled provider access. Validate actual scheduling and persistence, not just process startup. Confirm no UI files or unrelated application logic changed. Respect the repository's established staging, deployment, migration, Git, and documentation workflows.

**Do not deploy to production without the required authorization.** If this task is being executed as a direct implementation request and production deployment is separately authorized, verify service health, job continuity, migrations, and API use after rollout.

## 10. Completion report

Provide:

1. Inventory of the actual existing launchers, schedulers, workers, and their final schedules.
2. Confirmed root causes and the evidence supporting each fix.
3. Minimal changes made, with file paths and reasons; explicitly confirm unchanged UI/business logic.
4. Scheduler settings, worker concurrency, quota safeguards, retry and restart/checkpoint behavior.
5. Before/after odds coverage, unresolved provider gaps, data freshness, and live latency evidence.
6. Measured requests per second/minute/day, projected daily consumption under normal/heavy loads, and potential quota saturation points.
7. Tests performed and results, migrations if any, and staging verification.
8. Remaining limitations requiring separate authorization, especially UI-related freshness constraints.
9. Git/deployment status; clearly state whether production was changed.

## Final instruction

**Make only the canonical, necessary backend scheduler/worker changes. Respect everything already working in GoalHint. Do not reinvent the wheel, change user interfaces, alter predictions or slip logic, or introduce competing implementations. Correct data fetching, prove odds completeness, keep live information fresh, safeguard API quotas, and make workers reliably restartable.**
