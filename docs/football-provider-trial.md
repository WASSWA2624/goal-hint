# Football provider trial

Prompt [008](../dev-plan/008-football-provider-trial.md) provides a private,
bounded evidence tool for the selected direct API-Football Mega plan. Offline
reports work without credentials or a database. Recorded real responses and
verified account or rights records are required to qualify live suitability.
Synthetic contracts remain labelled development evidence.

Initial competition IDs/seasons and the trial request allowance are still
unresolved in OP-05 of the [decision register](implementation-decisions.md).
Account, reset, expiry, private-use entitlement, payable price, redistribution,
logo rights and freshness evidence remain subject to OP-03–08. The command does
not supply an allowance, purchase or renew a plan, change subscriptions, fetch
remote images, publish forecasts or qualify AI quality.

## Commands and private files

Use the pinned Node.js 24.18.1 and npm 11.16.0 runtime. Commands load optional
`.env.local`; `init` and `report` do not construct live services or validate live
environment policy.

```sh
npm run trial:football -- init --directory .tmp/provider-trial-offline
npm run trial:football -- report --directory .tmp/provider-trial-offline
```

Without a plan, initialization creates an unresolved offline baseline. The
default directory is `.tmp/provider-trial` when `--directory` is omitted. Keep
plans, authority modules, account records, journals and reports in ignored private
storage such as `.tmp/`, outside `public/` and browser-accessible paths. The
journal retains normalized structured responses under the approved private
retention policy; report prose omits raw payloads, holder names and email.

Each directory contains:

| File | Purpose |
| --- | --- |
| `provider-trial-journal.json` | Immutable plan, durable task reservations and labelled observations. |
| `provider-trial-report.md` | Requirement table with status, source/fixture, UTC timestamp, result, limitation and follow-up. |
| `provider-trial-report.json` | Structured findings, budget counts and qualification gates. |
| `provider-trial.lock/` | Exclusive invocation ownership; normally removed on completion. |

The report distinguishes `confirmed`, `failed` and `untested`. Missing fields,
incomplete imports, unverified records and unsupported markets remain visible.
`liveSuitability` is `incomplete`, `failed` or `qualified`; successful command
execution alone does not establish suitability. Catalog implementation may
proceed with pending live evidence. Launch remains blocked independently of the
provider report and still requires later quality/release work.

| Exit code | Meaning |
| --- | --- |
| `0` | `init`/`report` generated their outputs, or `run` completed its planned tasks. Inspect the report's qualification result separately. |
| `2` | `run` stopped with `waiting`, `incomplete`, `budget-exhausted`, `deadline-exceeded`, `blocked` or `dependency-unavailable`; a report was generated. |
| `1` | Invalid arguments/input/authority or an unavailable journal/report operation prevented normal completion. Diagnostics are redacted. |

## Preparing an immutable plan

The strict version-1 schema is implemented in
[`provider-trial-input.ts`](../src/server/football/provider-trial-input.ts);
[`provider-trial-contract.ts`](../src/server/football/provider-trial-contract.ts)
defines the public server-side shapes. This unresolved JSON is valid for offline
report generation:

```json
{
  "version": 1,
  "id": "provider-trial",
  "accountId": null,
  "competitions": [],
  "maxRequests": null,
  "deadlineAt": null,
  "bounds": null,
  "freshness": null,
  "tasks": [],
  "evidence": []
}
```

Before initializing an executable trial, resolve these fields from approved
operator decisions and actual evidence:

| Field | Required meaning |
| --- | --- |
| `accountId` | Stable 64-character lowercase SHA-256 account identity used by all callers and credential rotations; never hash the secret as account identity. |
| `competitions` | Explicit `{ id, season }` selections, approved before sampling. Endpoint access does not enable worldwide coverage. |
| `maxRequests` | Positive cumulative trial allowance within `GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT` and ordinary shared capacity. |
| `deadlineAt` | Absolute UTC epoch milliseconds, retained across all resumes. |
| `bounds` | Explicit `priority` (`daily-inputs` or `enrichment`), `timeoutMs`, `maxPages`, `maxRows`, `maxResponseBytes`, `retry` (`maxAttempts`, `baseDelayMs`, `maxDelayMs`) and `cacheMaxAgeMs`. |
| `freshness` | Trusted `maxRetrievalAgeMs`, `maxSourceAgeMs`, `unknownUpdateTime` (`reject` or `retrieval-only`) and `evidenceRef`; required for fallback sampling. |
| `tasks` | Ordered, uniquely identified observations, each with `case`, `operation` and `maxRequests`; optional `notBefore` and prior `fixtureTaskId`. |
| `evidence` | Scoped source records with `id`, `requirement`, `kind`, `source`, `recordedAt` and bounded primitive `value` fields. A record label is not verification. |

Supported operations are `account-status`, `fixtures`, `live`, `fixture-ids`,
`teams`, `competitions`, `player-statistics`, `statistics`, `lineups`, `injuries`
and `predictions`, plus the prompt 052 odds operations `odds` (query
`{ "date", "bookmakerId" }` or `{ "fixtureId", "bookmakerId" }`), `odds-bets` and
`odds-bookmakers` described under [odds qualification](#odds-qualification-prompt-052).
Query shapes use the [adapter contract](api-football-adapter.md).
Use supported date/range/round filters for fixtures; only documented paginated
operations use page loops. Task IDs must precede any task that references them.
Competition/season query pairs must belong to the selected competition list.

Plan representative league, cup, low-coverage, postponed, cross-midnight,
extra-time, shootout, pre-match, status-transition and identity cases where real
fixtures exist. A case label does not prove the returned status or competition.
Separate timed tasks can observe the same fixture's status, aliases and stable
IDs across approved seasons/competitions. `notBefore` uses UTC epoch milliseconds;
the command returns `waiting` instead of sleeping until that observation.

Store the approved JSON privately before the first initialization:

```sh
npm run trial:football -- init --plan .tmp/approved-provider-plan.json --directory .tmp/provider-trial-mega
```

The journal hashes the entire plan, including tasks, evidence, deadlines and
bounds. Changing an initialized plan is rejected. Reports and resumes normally
read the persisted plan without `--plan`. An offline baseline cannot later be
edited into a live plan in the same directory. A separately approved protocol
needs its own plan/directory and allowance reconciliation; creating a directory
does not authorize fresh spending or reset account-wide quota state.

## Trusted live authority

`run` requires an operator-owned local module supplied with `--authority`. It
must export a **named** `trialAuthority` object matching
[`TrialAuthority`](../src/server/football/provider-trial-command.ts). The module
is privileged executable code. Its verifiers must check actual authorized
records, identities, scope, dates, limits and provenance. Constant `true`
callbacks, successful API responses and reference strings are not evidence.

The required export shape can assemble an existing, reviewed verification module:

```js
import {
  verifyRuntimeEvidence, verifyQuotaEvidence, quotaEvidence, authorizeTrial,
  verifyEvidence, verifyObservation, verifyFreshness,
} from "./approved-trial-verifiers.mjs";

export const trialAuthority = Object.freeze({
  verifyRuntimeEvidence, verifyQuotaEvidence, quotaEvidence, authorizeTrial,
  verifyEvidence, verifyObservation, verifyFreshness,
});
```

This illustrates the export contract; it does not supply a verification
implementation or an approved account. Keep the backing records and module
private. Optional `verifyLogo`, `verifyRegulationScore`, `batchEvidence` and
`verifyBatchEvidence` can supply independently verified mappings and permissions.

| Authority member | Evidence it must verify |
| --- | --- |
| `verifyRuntimeEvidence(reference, requirement)` | Applicable runtime entitlements, account, approved budgets and database access. |
| `quotaEvidence` / `verifyQuotaEvidence(evidence, purpose, probeRequestId?)` | Account/period IDs, UTC period boundaries, subscription expiry, active limits, remaining allowance and evidence reference. Published reset prose alone does not confirm an active period. |
| `authorizeTrial(plan, task)` | Exact approved plan, competitions/seasons, task scope, cumulative allowance, private evidence use and structured retention; throw when authority is absent or revoked. |
| `verifyEvidence(record)` | The actual source of a claim and its account, scope and period; reject fabricated invoices, unreviewed rights claims and synthetic substitutes. |
| `verifyObservation(observation)` | Original recorded real response provenance and its task/query association; a `live-provider` label alone does not establish authenticity. |
| `verifyFreshness(policy)` | Approved source-specific age bounds and explicit treatment of missing provider update/generation times. |

Live construction requires `GOAL_HINT_OPERATION_SCOPE=trial`, a non-test runtime,
authorized MySQL/database access, football enablement and private key, account and
private-use evidence, approved payable total, selected competition IDs and
`GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT`. Plan IDs/cap must fit those settings and
`quotaEvidence.accountId` must match the plan. Read [.env.example](../.env.example),
[runtime decisions](implementation-decisions.md) and the
[database runbook](database.md) for all applicable gates. Keep credentials in
secret storage or ignored `.env.local`, never in plan values, URLs or reports.

After the approved inputs and verifiers are available:

```sh
npm run trial:football -- run --directory .tmp/provider-trial-mega --authority .tmp/trusted-provider-authority.mjs
npm run trial:football -- report --directory .tmp/provider-trial-mega --authority .tmp/trusted-provider-authority.mjs
```

The second command verifies existing evidence and generates reports without
performing provider retrieval. Omitting authority still permits an offline
report, with evidence requiring verification left untested.

Verified evidence records use the following `value` fields. Account records also
include `accountId` matching the plan. Each record needs its real source and UTC
`recordedAt`; these fields are claims until the trusted verifier checks them.

| Requirement | Record kind and value fields |
| --- | --- |
| `candidate-competitions` | `operator-record`: `competitions` is the sorted comma-separated `id:season` list matching the plan. |
| `trial-allowance` | `operator-record`: `allowance` matches the approved cumulative `maxRequests`. |
| `account-plan` | `account-record`: `provider: "api-football"`, `plan: "Mega"`. |
| `account-limits` | `account-record`: positive actual `dailyLimit` and `minuteLimit`, independently checked against available recorded account responses and headers. |
| `provider-reset` / `subscription-expiry` | `account-record`: `resetAtUtc` in `HH:mm` plus `observedBoundary: true`; expiry uses `expiresAt` in UTC epoch milliseconds. |
| `payable-total` | `account-record`: `currency: "USD"`, integer `baseUsdCents`, `taxUsdCents`, `paymentChargesUsdCents`, `totalUsdCents`, and both `taxesIncluded`/`paymentChargesIncluded: true`. Components must sum exactly and total must be at most 4500 cents. |
| Private/public/logo rights | `rights-record` or verified `official-source`: `permitted: true`, `restrictionsReviewed: true`, and applicable `scope`: `private-use`, `data-redistribution`, `prediction-redistribution` or `remote-logo-display`. |
| `media-host-restrictions` | `rights-record` or verified `official-source`: the exact `host`, `permitted: true` and `restrictionsReviewed: true`. Independently verify audience and throttling restrictions. |
| `regulation-scores` | Verified source record: `sourceField: "score.fulltime"`, `period: "regulation-including-stoppage-time"`, applicable `providerStatus` (`FT`, `AET` or `PEN`) and `independentlyVerified: true`. |
| `fallback-match-result` | Verified source record: `sourceField: "predictions.percent"`, `probabilityUnits: "percent"`, `period: "regulation-including-stoppage-time"` and `completeProbabilities: true`. Actual observations must also pass shared validation. |
| `odds-display-rights` | `rights-record` or verified `official-source`: `permitted: true`, `restrictionsReviewed: true` and `scope: "odds-display"`. Private import and retention rights stay under `private-use-rights`. |
| `odds-coverage` | Optional verified `official-source` records (for example, the plan's endpoint inclusion) are cited as sources; the status comes only from recorded `/odds` observations. |

## Requests, resume and fallback rules

Every outbound attempt uses the shared MySQL quota limiter and single-use
gateway, including retries, player pages, diagnostics and `/status`. The provider
documents `/status` as quota-free, but this trial counts its attempts locally and
grants no special allowance. Its object response may omit paging; provenance
then preserves null page fields. Normalization retains plan, expiry, active state
and request counts while discarding account holder identity. Status observations
do not automatically activate a new quota period or reset local counters.

The journal durably writes each task's full bounded reservation before I/O.
Completed tasks retain their recorded dispatch count. Running/uncertain tasks
retain the full reservation; crash recovery marks unfinished tasks uncertain and
never replays them. A quota denial or joined shared request with **zero** dispatched
requests may be recorded as `deferred`: it charges zero and can retry on the next
manual run. Any result that performed I/O stays immutable; terminal task failures
return `incomplete`. Resume skips completed and uncertain tasks. A malformed counter,
failed durable write, revoked authority, clock regression or expired deadline
cannot release an uncertain reservation. Repeating `run` does not refresh the
absolute deadline or refund spent shared capacity. Review uncertainty against
the original journal and shared limiter before approving further work.

An already queued shared work owner can keep a deferred task waiting until its
original deadline. A new adapter cannot bypass that owner with another request
ID. Inspect the shared limiter before approving a separate follow-up protocol;
the command does not claim to recover a foreign queued owner automatically.

An exclusive local lock prevents concurrent journal updates. Recovery requires a
provably dead process on the same host; a live, foreign-host or malformed owner
remains locked. Preserve journals and ownership records for investigation rather
than deleting them to obtain another allowance. File replacement is atomic and
synced; unsafe files/symlink paths fail closed. Windows filesystem ACLs remain
the operator's responsibility for private storage.

Predictions require an earlier verified fixture observation from the same source,
matching the fixture ID, with complete retrieval, scheduled status and a known
kickoff. Context freshness and authority are checked again before dispatch.
The task deadline is the earlier of the plan deadline and **kickoff minus five
minutes**. A stale, live, final, mismatched or missing context blocks fallback
retrieval. Each fallback cache scope belongs to its trial/task. The CLI does not
approve structured caching; its live adapter uses no cache permission callback.

Retrieval, observation, provider update and report-generation times remain
separate UTC values. `providerUpdatedAt: null` stays unknown. `unknownUpdateTime:
"reject"` disallows those inputs; `retrieval-only` requires explicit verified
policy and still reports the missing source time. Date selections use
Africa/Kampala reporting days; kickoff timestamps are not update times. Only
`/odds` rows publish their own `update`, which is kept per row and evaluated by
`odds-update-times`; the core `provider-update-times` finding excludes odds
observations.

Fallback assessment reuses the shared [market validators](markets.md): complete
home/draw/away percentages require a verified regulation-period mapping for
`predictions.percent`, are converted to probabilities and validated without
normalization; double chance derives from an accepted match-result group.
Under/over threshold strings, goal picks, advice and winner selections do not
provide complementary 2.5-goal or BTTS probabilities. Those groups remain
unsupported by the current normalized payload. Enabling them requires separately
verified complete inputs or a documented derivation validated by the shared
contract. Extra-time/shootout totals cannot replace independently
verified regulation scores; settlement uses the existing shared adjudicator.

## Odds qualification (prompt 052)

Prompt [052](../dev-plan/052-provider-odds-import.md) adds a counted odds sample
to the same command, journal and shared limiter. It qualifies the real `/odds`,
`/odds/bets` and `/odds/bookmakers` envelopes before any odds schedule runs. The
trial has **not** been run: it needs a plan that includes `/odds` and enough
spare daily capacity, so it waits for the owner's plan upgrade. Scheduled
imports stay off (`GOAL_HINT_ODDS_IMPORT_ENABLED=false`) until it passes, and a
passing report never switches them on by itself.

### Allowance and plan

The owner-authorized allowance is **20 counted requests**. Set
`GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT` to at least 20, keep the trial scope
and runtime gates described above, and record a matching `trial-allowance`
operator record (`allowance: 20`). Use a separate plan and directory, such as
`.tmp/provider-trial-odds`, rather than an initialized core trial. `D` is the
first Kampala reporting date of the sample and `B` is the candidate bookmaker.

| Task | Operation | `maxRequests` | What it establishes |
| --- | --- | --- | --- |
| `account` | `account-status` | 1 | Plan, limits and quota headers on the same account. |
| `bets` | `odds-bets` | 1 | The full bet catalog, including the ids and exact names of the four launch bets. |
| `bookmakers` | `odds-bookmakers` | 1 | The bookmaker catalog that `B` must belong to. |
| `odds-d0` | `odds` `{ "date": D, "bookmakerId": B }` | 2 | Page 1 and page 2: echoes, page size and page traversal. |
| `odds-d1` … `odds-d6` | `odds` `{ "date": D+1…D+6, "bookmakerId": B }` | 1 each | Page 1 per day of the seven-day horizon: coverage and update times. |
| `odds-fixture` | `odds` `{ "fixtureId": F, "bookmakerId": B }` | 1 | The `fixture=` selector for a catalog fixture `F` kicking off inside the window. |

That is at most 13 requests. The remaining 7 allow one more candidate
bookmaker's page-1 sweep for comparison (one `odds` task per date, 1 request
each). Use plan `bounds` such as:

```json
{
  "priority": "enrichment",
  "timeoutMs": 30000,
  "maxPages": 150,
  "maxRows": 1500,
  "maxResponseBytes": 8000000,
  "retry": { "maxAttempts": 1, "baseDelayMs": 1000, "maxDelayMs": 10000 },
  "cacheMaxAgeMs": 0
}
```

Bound each odds sample with its task `maxRequests`, not with `bounds.maxPages`.
A sample stopped by its own request allowance (`request-budget-exhausted`) is a
valid truncated sample. A `maxPages` or `maxRows` stop is reported as
`pagination-incomplete`, the same reason as a genuine page-size violation. With
`maxAttempts: 1` a failed attempt is not retried inside the allowance. Truncated
samples are partial by design, so `run` ends `incomplete` (exit code 2); read
the odds findings, not the exit code.

```sh
npm run trial:football -- init --plan .tmp/approved-odds-plan.json --directory .tmp/provider-trial-odds
npm run trial:football -- run --directory .tmp/provider-trial-odds --authority .tmp/trusted-provider-authority.mjs
npm run trial:football -- report --directory .tmp/provider-trial-odds --authority .tmp/trusted-provider-authority.mjs
```

### Findings

The journal keeps normalized rows only, under `.tmp/`; never copy its payloads
into tests or documentation. Odds observations are evaluated only by these
findings:

| Requirement | Confirmed when | Failed when |
| --- | --- | --- |
| `odds-pagination` | Every odds sample passed the adapter's echo checks (`bookmaker`, `date` or `fixture` and `page` echoed exactly; `timezone` equal when echoed), recorded exactly the planned selectors, has ordered pages with a stable total, no rejected rows, rows inside the requested bookmaker and Kampala date or fixture, exactly 10 rows on every non-final page, and at least one sample spans two pages. | Any sample is incomplete for a reason other than its own request allowance, has rejected rows, or breaks the page, echo or scope rules. |
| `odds-update-times` | Every accepted `/odds` row published a strict offset `update` no later than its retrieval. | Any accepted row omits `update`. Malformed or future updates are rejected rows and fail `odds-pagination`. |
| `odds-bet-catalog` | The complete `/odds/bets` catalog and every sampled row name bets 1, 12, 5 and 8 exactly as `launch-odds-v1` pins them (Match Winner, Double Chance, Goals Over/Under, Both Teams Score). | The catalog is incomplete or empty, or a pinned id is missing or named differently. Revise the versioned mapping from the recorded catalog. |
| `odds-coverage` | At least one sampled fixture in a selected competition carries all four complete launch groups for a sampled bookmaker. The result lists `bookmaker B: complete of sampled` counts used to choose `GOAL_HINT_ODDS_BOOKMAKER_ID`. | The provider refused an odds endpoint with a coverage error (the plan lacks `/odds`), or a sampled bookmaker is missing from a recorded `/odds/bookmakers` catalog. |
| `odds-display-rights` | A verified `odds-display` rights record (table above). | The record does not permit that scope. |

Rejected rows are not kept in the journal, so a failed `odds-pagination` points
to a difference to investigate in the envelope, the Kampala date scope, row
identity, the `update` format or the price format. A common cause would be a
provider that ignores `timezone` on `/odds?date=`: kickoffs between 21:00 and
24:00 UTC then fall outside the requested Kampala date and are rejected. The
report does not measure response bytes per page; `maxResponseBytes` bounds them
and a `response-too-large` failure means the bound is too small.

`oddsSuitability` (also printed by the command) is `qualified` only when the four
import findings are confirmed and no odds task is running, uncertain or
deferred. It is `failed` when any of them failed and `incomplete` otherwise.
Odds findings never decide the core `liveSuitability` or `liveOperations`, because
odds are optional and separately gated. `odds-display-rights` gates only public
prices (`GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` and `publicPolicy.features.providerOdds`),
not private import. The four launch bet ids come from the documented examples
and stay provisional until `odds-bet-catalog` is confirmed; a mismatch with the
stored catalog only withholds prices.

## Published terms and actual qualification

The following public sources were checked on 8 October 2026 UTC:

| Primary source | Published information | Remaining actual evidence |
| --- | --- | --- |
| [Direct pricing](https://www.api-football.com/pricing) | Mega US$39/month and 150,000/day; all endpoints/competitions; prepaid expiry returns to free. | Active account plan/expiry and itemized payable total including taxes/payment charges within US$45. |
| [Rate limits, 12 June 2026](https://www.api-football.com/news/post/how-ratelimit-works) | Mega 900/minute, 15/second; daily/minute headers and account/source-IP protections. | Actual headers, remaining allowance, egress restrictions and observed reset behavior; application ceilings stay 12/second, 720/minute and 120,000/day. |
| [Terms, updated 21 May 2025](https://www.api-football.com/terms) | Direct dashboard reset is described as 00:00 UTC; publication licenses and third-party data/logo permissions are the user's responsibility. | Verified account/reset records, source-specific private/public permissions, attribution, retention and remote-logo rights. |
| [Beginner guide, 13 March 2026](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) | Home/draw/away percentages, goal/advice picks, indicative hourly prediction updates and separate media throttling. | Real per-market coverage, pre-match availability, freshness, provider update times and numeric media limits for the expected audience. |

Payable-total evidence must identify the account, currency USD, base price, taxes,
payment charges and the reconciled inclusive total. Public advertising is not a
checkout or invoice. Rights evidence must cover each actual use and restriction;
private entitlement does not establish public data/prediction redistribution or
remote-logo display rights. URL safety checks inspect approved credential-free
HTTPS strings only; the trial never downloads, proxies or stores image binaries.

Record verified findings and unresolved follow-ups in
[implementation decisions](implementation-decisions.md) and actual commands,
private report paths and blockers in [development progress](development-progress.md).
Local tooling acceptance permits further catalog implementation with these gates
explicit. Provider qualification, paid live behavior and public launch stay
incomplete until their actual evidence passes; AI quality belongs to prompt 014.
