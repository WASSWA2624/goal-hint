# Shared API-Football quota contract

Prompt 006 provides server-only durable reservation and dispatch services. Prompt
007 owns the HTTP adapter, header parsing and provider response normalization;
008 owns evidence from the authorized live account. No fixture verifier or test
account is used in application output.

## Account and evidence identity

`createQuotaLimiter({ accountId, store, verifyEvidence })` binds every caller to
the same account row in the shared MySQL database. IDs are opaque lowercase
64-character hexadecimal values. Hash a trusted canonical account identifier,
not its API key: key rotation, tools, trials, staging, replicas and workers must
retain the account identity. Using separate databases or account IDs would split
the allowance and is unsupported. Uncontrolled calls outside this gateway cannot
be accounted for prospectively; imported provider usage reduces remaining local
capacity conservatively.

The hosted quota router derives one ledger identity from the verified provider
account and UTC provider day. A plan change keeps that day's ledger and
preserves its recorded usage. Existing hosted Mega ledgers retain their stored
identifiers. Updated evidence can tighten an open day. A higher limit can take
effect when the next provider day is verified.

`QuotaPeriodEvidence` supplies a unique period ID, absolute UTC start/end,
subscription expiry, active daily/second/minute limits, daily remaining allowance
and a private evidence reference. A required trusted verifier inspects the actual
snapshot and its purpose (`initial-period`, `candidate-boundary` or
`reset-confirmation`). Reset confirmation also binds the exact probe request ID.
A reference or boundary timestamp alone does not verify anything. Missing,
invalid or rejected evidence fails closed. Persisted verified state survives
process restarts; `initialize` never replaces it or resets its counters.
Reinitialization with verified same-period evidence may only tighten limits,
remaining allowance and expiry; it cannot reopen a period or restore capacity.

## Reservation and dispatch

Use `createMysqlQuotaStore(database)` with the existing guarded `DatabaseRuntime`.
An InnoDB account-row lock encloses all reservation decisions and writes in a
bounded transaction. MySQL UTC time is authoritative. A backwards clock pauses
dispatch until the last recorded instant. External I/O never runs inside a
database transaction.

The application caps dispatch at 10 requests per rolling second, 600 per
rolling 60 seconds, and 120,000 per verified provider day. Live workers can lower
the short-window ceilings with `GOAL_HINT_FOOTBALL_REQUESTS_PER_SECOND` and
`GOAL_HINT_FOOTBALL_REQUESTS_PER_MINUTE`. Verified provider terms can lower the
effective limits further. The confirmed short-window policy uses 80% of the
provider limit as an additional cap. The rolling windows are
`(now - duration, now]`. At the default application ceilings the minimum dispatch
spacing is 100 ms. The day ceiling includes a protected 20,000 essential
allowance, leaving ordinary work at most 100,000 requests and preserving 30,000
requests of headroom on a verified 150,000-request Mega plan. Imported prior
usage and uncertain attempts consume the same ceiling. Smaller verified plans
keep the same one-sixth essential share (`essentialReserveFor`), including 16 of
a 100-request Free day and 1,250 of a 7,500-request Pro day.

| Priority | Order | May consume essential reserve |
| --- | --- | --- |
| Results/cutoff safety, recovery | 0 | Yes |
| Near-kickoff fallback | 1 | Yes |
| Live/date synchronization | 1 | No |
| Daily inputs | 2 | No |
| Live details and enrichment | 3 | No |
| Historical backfill | 4 | No |

The runner budgets `enrichment` and `historical-backfill` together, covering
odds, team codes and other optional collection. Live details have a separate
allowance. An odds job reads the current day's counters before dispatch. The
requested allowance must fit in the remaining spare and leave room for outstanding
ordinary work and the reserve. Resumable price work checks admission one page at
a time. The limiter rechecks every actual attempt atomically, including retries.
Uncertain attempts count toward the budget. Historical backfill can use at most
20% of the effective rolling-minute allowance and yields when the remaining
quota is needed for scheduled critical work. [Live operations](live-operations.md#odds-imports-052)

`QuotaRequest` requires a unique attempt ID, canonical work hash, trusted priority,
absolute UTC deadline and bounded timeout in milliseconds. Job owners supply
these bounds; this feature does not invent the unresolved OP-11 job budgets.
Each retry uses a new attempt ID and reserves fresh capacity. A repeated attempt
cannot launch again. Queue order uses priority, enqueue time and request ID.
Pacing/priority waiters retain their place until their deadline; retry the same
request to claim it, rather than creating fresh queue entries. Budget-ineligible
ordinary entries leave the queue so they cannot obstruct essential work.

Concurrent consumers of a queued or active work hash receive `joined` with the
original request ID and lease boundary. Joining invokes no transport and spends
no new capacity. A more urgent consumer promotes queued work, including essential
eligibility, while preserving its original identity. Joining is an identity
reference: response sharing/storage is the caller's responsibility. An expired
attempt remains spent; a fresh retry may take ownership without the old response
clearing its successor's work key.

`reserve` commits a counted attempt and returns a permit with a freshness window
of at most one second, shortened by its lease/deadline. This window allows durable
coordination to commit. The gateway must obtain `claimLaunch` immediately. It
checks current limits and returns a
single-use claim and remaining lease timeout. Delayed, reused, unauthorized or
expired claims cannot dispatch. Unused reservations, process crashes, timeouts
and aborted requests are never refunded. The gateway also checks elapsed
monotonic time immediately before I/O, bounds transport to the durable lease,
passes an `AbortSignal` and ignores late results. Transports must honor that signal
and perform exactly one request; automatic retries or pagination inside one
callback are prohibited.

## Gateway for prompt 007

The transport callback also receives `observe(feedback)`. The adapter uses it
for numeric quota headers and known HTTP failures received before reading a
bounded response body. A stalled body remains a counted uncertain attempt;
already received lower limits/remaining allowance and rate-limit delays still
reach durable completion. Early observations cannot establish success. Repeated
observations and final feedback preserve the lower numeric terms and longest
retry delay, while known early failures cannot become a successful result.
Observations after abort, elapsed deadline or completion are ignored. This adds
no extra dispatch, refund or automatic retry to the gateway.

`createPolicyQuotaGateway({ limiter, policy, verifyEvidence })` checks the existing
runtime operation/evidence gates. Its `execute(request, transport)` and
`executeResetProbe(evidence, request, transport)` share reservation, claim,
authorization, timeout and completion behavior. The low-level
`createQuotaGateway` requires an explicit trusted authorization callback.

The transport returns `{ value, feedback }`. Normalize HTTP and body outcomes to
`success`, `uncertain`, `rate-limited`, `credential-failure`,
`subscription-expired` or `provider-error`. Only successful, recorded responses
expose a value. Provider errors do not expose the raw response body. Thrown errors
and timeouts become uncertainty; the gateway never retries automatically.
Credential/expiry failures pause the entire account. HTTP 429 or equivalent body
errors set an account-wide delay. Honor a parsed retry delay; if absent, pause for
a conservative rolling minute, which is a local policy rather than a claimed
provider reset time.

Normalized feedback may contain `dailyLimit`, `dailyRemaining`, `minuteLimit`,
`minuteRemaining` and `retryAfterMs`. The HTTP adapter parses header names
case-insensitively and validates integers; it must reject malformed feedback.
The provider's [rate-limit documentation](https://www.api-football.com/news/post/how-ratelimit-works)
describes daily and minute headers, per-account and IP protection, smoothing and
429 handling. It does not establish this application's actual account boundary.

Within a period, higher observations cannot restore capacity. Lower limits take
effect immediately, including before a reserved ordinary attempt claims launch.
Remaining-header floors subtract subsequent reservations and unresolved earlier
attempts. Daily floors only decrease; minute floors constrain a full trailing
60 seconds after observation and remain account-wide across daily boundaries.
Candidate probes inherit unexpired minute protection; late old-period minute
observations can tighten the active period while leaving its daily allowance
unchanged. Late responses may reduce capacity further. Raw
errors, credentials, connection URLs and provider bodies are never logged by
these services. Structured denials include `pacing`, `priority-wait`,
`second-limit`, `minute-limit`, `essential-reserve`, `daily-limit`, `retry-delay`,
`reset-unconfirmed`, `credential-failure`, `subscription-expired` and
`storage-unavailable`. Callers may serve stored data while outbound work pauses.

## Provider period transition

Exhaustion before the verified boundary stops traffic. Reaching that boundary
never opens a fresh daily allowance automatically, including at EAT midnight.
`reserveResetProbe` accepts trusted candidate-boundary evidence adjoining the
current period and commits only one counted probe for that candidate. Rolling
limits, pacing, expiry and retry delays still apply. A crashed, uncertain or failed
probe stays counted and does not permit a second probe or bulk traffic.

The probe must claim launch and record success. `confirmReset(probeRequestId,
evidence)` also requires trusted confirmation of that exact candidate/probe.
Higher quota headers alone do not confirm reset. Counters from old periods remain
intact; a stale old response cannot refill or activate the candidate. The confirmed
new period includes its probe and preserves lower terms/floors learned from it.
Raising previously lowered terms requires a separate verified account-change
process; this feature never upgrades a plan. Unknown boundaries, missed periods,
failed probes and account renewal require operator reconciliation rather than
guessed reset behavior. Actual reset/expiry/probe evidence remains OP-03/008.

## Schema and verification

Migration `20261008182528_api_quota_limiter` adds `ApiQuotaAccount`,
`ApiQuotaPeriod` and `ApiQuotaAttempt`; it preserves the foundational migration.
The account row coordinates processes; period JSON retains counters and evidence;
attempts retain durable sequence, priority, timestamps, lease fencing and outcome.
The migration explicitly selects InnoDB rather than relying on a server default.
Indexed projections support rolling windows, pending priority and header
reconciliation. A nullable unique account/work key deduplicates only owned active
work. Indexed fields and JSON are validated together; corrupt state fails closed.
No cleanup removes attempted usage or old periods. Retention/archive ownership is
deferred to the later operations features.

`npm test` exercises the gateway without provider I/O. `npm run test:quota` starts
an owned isolated genuine MySQL instance, deploys migrations with a separate DDL
role and exercises quota invariants through narrowly scoped DML roles. Set
`MYSQL_TEST_SERVER_BINARY` to an available genuine MySQL `mysqld` binary. Missing
MySQL causes an explicit skip and leaves database acceptance pending. Test clocks,
account terms and reset confirmations are synthetic; MySQL locking, persistence,
concurrency and failure handling are real. See [development progress](development-progress.md)
for actual commands and outcomes.
