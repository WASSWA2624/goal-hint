# Research and AI cost control

The private services in `src/server/cost-control` reserve and reconcile separate
AI and research budgets. They share the 003 MySQL runtime and 002 operation gates.
The API-Football limiter and its US$45 subscription ceiling remain independent.
Stored public forecasts need no ledger access; an accounting outage stops paid
work without deleting or replacing forecasts.

## Configuration and authority

Use `createPolicyCostService` for application workers, then `createCostGateway`
for one outbound attempt. The generic `createCostService` is the accounting engine
for isolated contract tests and trusted integrations. An application must not
substitute permissive test authority for verified runtime approvals.

There is no selected live provider, model, rate card, currency conversion,
accounting period, cap, job allocation or fallback allowance. OP-09–11 in the
[decision register](implementation-decisions.md) remain unresolved. References
alone do not authorize work. Every paid operation checks the existing runtime
scope, capability, credentials and trusted budget/license evidence, followed by
the exact period, rate, job, request and usage verification hooks. `NODE_ENV=test`
cannot authorize paid operations.

The runtime monthly USD-cent cap must equal the approved period's exact cap.
Periods explicitly supply account/category identity, UTC start/end boundaries,
opening charges and an approval reference. A verifier must confirm the real
provider billing window, reservation assignment rules, exchange-rate coverage,
taxes/fees and opening charges from every process/environment using that account.
No automatic calendar reset, currency assumption or free allowance is applied.
Calls must fit entirely inside both the period and rate validity windows.
Verified opening debt above the cap is recorded and blocks paid work.

The policy factory also requires an independently verified immutable joint
allocation. Each enabled category supplies `costCapUsdPicos`, `requestLimit`,
`inputTokenLimit`, `outputTokenLimit`, `billedUnitLimit` and `primaryTimeLimitMs`.
Disabled categories have a null allocation. Requests and input/output tokens sum
across categories within the existing runtime job ceilings. Primary times sum
with one explicitly positive `fallbackReserveMs` inside the job timeout. Each
category's job time limit is its primary allowance plus that fallback reserve;
its other limits cannot exceed its allocation. Research-only work can explicitly
allocate zero tokens without an AI token limit. No default allocation is inferred.
Later orchestration must give both categories stable identities for the same
logical job and preserve these allocations on every retry.

## Exact pricing

Money uses integer USD picodollars (`bigint`, 10^12 per USD) and MySQL
`DECIMAL(38,12)`. Caps, opening charges and usage amounts require `bigint`
picodollars. Rate amounts and `costUsdPicosFromDecimal` accept nonnegative decimal
strings with at most twelve fractional digits; `costUsdPicosFromCents` converts
the existing integer-cent runtime settings exactly. Floating-point money and
silent truncation are rejected.
Individual amounts must fit the storage representation; invalid/overflowing
accounting fails closed. Counts remain exact integers and aggregate counters
remain `bigint`.

An immutable versioned rate card identifies provider/model, ISO currency,
validity, billing rule and independently verified evidence. Its four dimensions
are requests, input tokens, output tokens and provider-defined billed units.
Each rate is a decimal amount per explicit positive number of units; null means
unpriced, while an approved zero is explicit. The USD conversion is a positive
rational numerator/denominator with its own evidence reference. USD requires a
one-to-one conversion. Conservative arithmetic rounds upward per component
under the explicitly selected `ceil-per-component` rule. A trusted rate verifier
must establish that this represents the provider's actual billable maximum,
including any relevant overhead. This engine does not guess billing units.

`estimateCost` labels its result `estimated`. Summaries keep estimated, observed
and invoiced amounts separate from liability and remaining budget. An estimate
is never presented as a paid invoice. Reconciliation uses the approved rate
snapshot rather than a subsequently changed price with the same version.

## Durable operations

The migration adds `CostBudgetAccount`, `CostBudgetPeriod`, `CostBudgetJob` and
`CostBudgetAttempt`. The account/category row lock serializes every queue choice,
reservation, claim and reconciliation across application replicas and local
trials. Transactions contain database work only and are never automatically
replayed. Provider I/O occurs after a successful durable dispatch claim.

Account, period, job, work and attempt identities are opaque SHA-256 keys.
Use `costIdentity` with a stable namespace and account identity to avoid storing
raw account details. Every environment sharing a provider account must use the
same durable account ledger; separate databases do not create more spend.
The unique job `workKey` prevents replacing a job ID to reset its ceiling.
An attempt ID binds immutable request and rate fingerprints. Each retry needs
a new attempt ID and a new reservation; a duplicate never dispatches twice.

1. `initialize(period)` records a verified immutable, nonoverlapping active
   period. Starting a subsequent approved period retains prior accounting and
   job ceilings. Historical billing overages continue blocking paid work.
2. `queue(job, request)` records intent. Explicit fixture priority uses nearest
   kickoff, then queue time; background work follows eligible fixture work.
   Queueing does not pick fixtures or start predictions. Ineligible entries stay
   audited without permanently starving affordable work.
3. `reserve(job, request)` atomically holds maximum money, requests, tokens,
   billed units and elapsed time. Aggregate/category and job caps both apply.
   The returned owner permit has a short one-second claim window; this fencing
   interval is a technical dispatch safeguard, not an approved spending timeout.
4. `markDispatched(permit)` consumes the single-use permit, rechecks approval,
   timing and overages and commits the potentially billable marker.
5. `reconcile(permit, usage)` accepts independently verified receipts. A repeated
   reconciliation ID is idempotent only for the identical receipt. Changed
   content is rejected. Known historical charges and usage remain conservative.

`cancelBeforeDispatch` releases a confirmed unclaimed reservation. It cannot
release a claimed, timed-out or ambiguous network attempt. Unknown/partial
usage holds the original maximum, raised to any larger verified charge. An
`invoice-required` rate keeps the money reservation until a verified complete
invoice arrives. A complete measured receipt can settle according to its
approved billing rule; estimates alone cannot satisfy invoice-required billing.
An invoice with unknown counts cannot release token/unit/time reservations.
Unpriced actual units or actual amounts/counts/time above the reservation are
recorded conservatively and block later paid work, including pending permits.
They are not hidden by moving to a new period.

The MySQL store uses native indexed sums for caps. Each strictly parsed attempt
and its computed projection share a JSON envelope and SQL SHA-256 integrity
seal. Reads validate the envelope against native attributes, and aggregates
check the seal and exact native monetary/count projections before returning
capacity. Corrupted accounting returns `service-unavailable`. This detects
storage inconsistency; it is not an authorization mechanism for database admins.
Native identity bindings prevent moving charged rows to a different accounting
scope, and period bindings protect recorded opening debt. Store updates fence
immutable intent/ownership, enforce lifecycle transitions and preserve receipt
history; they cannot reset a completed attempt to uncharged intent.
Least-privilege application credentials remain required.

## Transport, reuse and private reporting

`createCostGateway({service, authorize, clock?}).execute(job, request, transport)`
calls one transport callback after reservation and claim. It supplies the
approved maximum quantities, timeout, owner permit and `AbortSignal`. The
provider adapter must enforce those maxima and return `{value, usage}` with
attributable billing evidence. A response is returned only after trusted
reconciliation. Transport failures and ambiguous timeouts retain liability;
the gateway does not fabricate provider receipts or automatically retry.
Deadline checks use absolute job time and monotonic elapsed time. Late promises
are drained, values are withheld after timeout and accounting completion does
not authorize another call. Later orchestration handles fallback using its
reserved time and the separate football quota gateway.

`reuseCostEvidence(entry, {authorize, verifyReuse, now})` demonstrates a verified
cache hit with `requestsDispatched: 0`. It retains the original `retrievedAt` and
nullable `providerUpdatedAt`; reuse never changes them to the current time.
Expired, future-dated or unapproved entries return an explicit miss. The caller
must verify source rights, evidence sufficiency and freshness independently.
Evidence storage, retention and provider adapters belong to 011–012; this helper
creates no additional cache backend or source entitlement.

`summary(periodId?)` and `jobSummary(jobId)` are private exact ledger projections.
`costSummaryRecord` provides a JSON-safe allowlist for logging aggregate amounts
and counts, currency, opaque account/period IDs and the overage flag. It copies
no prompts, source bodies, credentials, owner tokens or driver exceptions.
No automatic logger, monitoring destination or public cost endpoint is enabled.
The ledger retains only normalized billing metadata, quantities, timestamps and
attributable references; actual retention rules still need approval.

Operational denials include `budget-exhausted`, `job-budget-exhausted`,
`request-limit`, `token-limit`, `billed-unit-limit`, `time-limit`,
`fallback-time-reserved`, `timeout`, `unpriced`, `uncertain-usage`,
`priority-wait`, `unverified-policy` and `service-unavailable`. Callers must
preserve these distinctions without copying private exceptions into logs.

## Local acceptance

Run `npm run check` with pinned Node 24.18.1/npm 11.16.0. Run
`npm run test:cost` with a genuine MySQL 8.4 binary available through
`MYSQL_TEST_SERVER_BINARY`. The isolated helper owns a new loopback server/data
directory and verifies ownership before mutation or cleanup. Migration DDL and
application DML roles remain separate. Synthetic prices and approvals prove
accounting behavior only; no test makes an AI, research or football request.

Read [development progress](development-progress.md) for final check results and
[operation policy](implementation-decisions.md#002--separate-private-shadow-and-production-gates)
for existing scope/approval configuration.
