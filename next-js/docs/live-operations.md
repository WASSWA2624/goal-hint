# Live operations (real API-Football data)

The live runner connects the existing daily pipeline to the real API-Football account:
daily selection at 00:00 EAT, primary/fallback prediction refreshes, cutoff locks, result
polling, settlement and public-cache maintenance. Visitor requests still never call the
provider. The web app only reads what the runner stores in MySQL.

## October 2026 operating record

Owner decisions through 13 October 2026, recorded in the ignored `.goal-hint/owner-approvals.json`:

| Decision | Effect |
| --- | --- |
| **OpenAI and API-Football (13 October 2026)** | The live AI binding is implemented. Activation requires the private key and exact owner references. With AI disabled, the existing fallback-only path needs no AI key. Research stays disabled. |
| **Provider baseline with optional AI shadow** | API-Football supplies validated provider groups; every AI family remains private, including provider outages. Both original forecasts are sealed for private evaluation. A source-order/reference configuration cannot bypass the independent publication guard; AI-first startup remains unavailable pending a verified frozen promotion binding. |
| **Publish now, provisional** | Forecasts are published before shadow qualification (047) and release gates (048/049). Every API-Football forecast carries the existing *Provisional estimate* label, and no accuracy claim is made. |
| **All available competitions** | `GOAL_HINT_COMPETITION_IDS` lists every league with a current season on the plan (`npm run live:competitions`). |
| **Local only** | Production scope may run in development mode **only** against a loopback database. Remote or hosted targets still need `NODE_ENV=production` and verified TLS. |

Confirm API-Sports terms for public display/redistribution before any public deployment.

## Setup

The current hosted football launcher, dedicated database role and staging
isolation are documented in the deployment runbook. Use simulated provider
responses for worker qualification on staging. [Hosted worker runbook](deployment/how-to-deploy.md#vps-live-football-worker)

1. Put the API-Football key (from dashboard.api-football.com) in `API_FOOTBALL_KEY` in `.env.development`.
2. `npm run db:deploy` applies the migrations, including `20261010170000_fallback_only_refresh_intent`.
3. `npm run live:status` checks configuration, owner approvals and the account without spending quota.
4. `npm run live:competitions -- --write` records the competition list (one provider request).
5. Restart `npm run dev` so the web app reads the new competition list.
6. `npm run live` starts the runner. Keep it running; stop it with Ctrl+C.

`.env.operations` (ignored) holds the runner-only settings: production scope, football enabled and
the owner-approved references. The web dev server never loads it.

### OpenAI activation

The [AI runbook](ai-predictor.md#live-openai-binding) describes the reviewed
`gpt-6.1-sol` Responses contract and provisional evidence policy. Set the private
key through `AI_API_KEY`; runner-only choices include `GOAL_HINT_AI_ENABLED`,
provider/model, calibration reference and `GOAL_HINT_AI_BILLING_MODE=usage-based`.
Usage-based mode has no application monthly AI cap; it keeps request, token,
time and per-job reservations with durable measured-cost accounting. The
structured football evidence requires separate owner approval for the exact
`${GOAL_HINT_EVIDENCE_POLICY_REF}#openai-transmission` reference. Readiness rejects
missing approvals or an unreviewed model before provider I/O.

The prepared runner configuration leaves `GOAL_HINT_AI_ENABLED=false` until the
private key is installed, with provider `openai`, model `gpt-6.1-sol`, usage-based
billing, a blank monthly AI cap, 100,000 job tokens and a 300-second job time
limit. The calibration reference records **no calibration, provisional**, not
an evaluated artifact. Installing the key does not itself enable dispatch:
set the AI switch to true and restart the runner after readiness succeeds.
Previously committed seven-day runs retain their original intent and model
pin; new daily selections use the eight-day edge window.

The account check on 13 October 2026 reports **Free**, 100 requests/day and
10 requests/minute. The current Free workload imports two dates; the remaining
forecast dates stay explicitly unavailable. Full seven-day coverage requires a
plan with the necessary fixture dates and history access. The runner adapts when
the verified account plan changes. OpenAI cannot fill missing fixture schedules.

### Forecast source order

New pre-match intents on the authorized production worker and owned local
football worker pin `qualified-local-provider-v2`. The Local Engine uses the
established regularized Poisson baseline, cutoff-bound regulation results and
minimum effective sample sizes. The worker checks each launch market against
the baseline's coherent probabilities. Only API-Football match-result
probabilities and double chance derived from them are eligible for fallback.
Provider identity, mapping, time and authority remain independently verified.
Local evidence gaps and local execution failures have distinct abstention reasons.

Set `GOAL_HINT_API_PREDICTION_FALLBACK_ENABLED=false` in the worker profile and
restart it to seal new Local Engine first intents without a provider prediction
allowance. It defaults to `true`. Changing it creates a new forecast job identity
for subsequent selection. A previously sealed intent keeps its original provider
allowance. The final fixture status check remains required before publication.

`GOAL_HINT_FORECAST_SOURCE_ORDER` defaults to `ai-first` and continues to govern
legacy execution. The original evidence, source order and policy proofs still
validate older sealed plans and revisions. New Local Engine first intents use
stored football evidence and skip remote AI and research. Fitted replacements,
period models and context effects require independent chronological qualification.

## What the runner does

- **Schedule:** it enqueues the daily selection for the latest 21:00 UTC occurrence on start and at each
  occurrence (one durable job per EAT run date). A missed night runs as soon as the runner starts.
- **Selection and discovery.** Eligible plans keep the eight-date forecast window
  and the hourly reconciliation job. The authorized extended odds setup uses
  the same catalog path to discover fixtures through Kampala day 14, including
  an incremental forward check after the hourly schedule commits. The odds
  horizon adds stored fixtures beyond the existing forecast selection window.
- **Refresh:** one job per selected fixture. When AI is enabled, up to two bounded team-history imports finish
  before the immutable analysis cutoff; the pinned OpenAI attempt uses stored verified regulation history and
  derived form. The API-Football prediction is then always requested (inside the job's reserved fallback
  request) and, under the default provider-first order, publishes the match result. A fresh
  `/fixtures?id=` status read precedes atomic publication before the five-minute cutoff. Jobs wait (retryably)
  instead of spending the reserve kept for result checks.
- **Results.** A leased poller covers the configured competitions, including
  fixtures without forecasts. The coordinated runner targets a 10-second live
  summary, a one-minute approach poll and a five-minute idle poll. The detail
  poller targets one-minute live statistics. Settlement and cache maintenance
  use stored data on the 30-second maintenance tick. [Result cadence](fixture-result-sync.md#cadence-and-quotas), [Detail cadence](live-match-details.md#central-collection-and-request-budget)

## Plan-aware workload

The runner validates the plan and account usage from `/status` at startup,
approximately every 10 minutes, and after provider day rollover. It applies
observed quota headers and shared local ceilings of 10 per rolling second, 600
per rolling minute, and 120,000 per verified provider day. The short-window
ceilings can be lowered in the private runner profile. Uncertain reservations
count toward the budget. [Quota contract](quota-limiter.md)

| Plan (daily limit) | Refreshes/day | Workers | Live feed | Date poll | Odds floor / spare per day |
| --- | --- | --- | --- | --- | --- |
| Free (100) | 5 | 1 | Off | 58 min | 97 / 3 |
| Pro (7,500) | 326 | 2 | Off | 1 min | 6,749 / 751 |
| Ultra (75,000) | 2,000 | 3 | 15 s | 1 min | 57,266 / 17,734 |
| Mega (150,000, app ceiling 120,000) | 2,000 | 6 | 15 s | 1 min | 82,016 / 37,984 |

These are base work-plan values with eligible live details enabled. The
coordinated runner applies its own poll cadence and assigns dedicated schedule,
forecast, cutoff and enrichment workers. Measured requests depend on fixture
coverage, quota and actual worker outcomes. [Odds allowance](#odds-imports-052)

**Slow plans (under 60 requests/minute, e.g. Free at 10/minute).** A provider call may have to wait most of a
rolling minute for a limiter slot. Refresh jobs on these plans get a 5-minute timeout and a 200-second reserve, and
each provider call waits up to 75 seconds for the slot the limiter names instead of giving up after 15–20 seconds;
waiting never adds a second dispatch. Selection also skips fixtures whose publication cutoff falls inside the time
the refresh queue needs to drain (`cutoff-too-close`, at most two hours), so the daily capacity goes to matches that
can still be predicted. A refresh whose cycle has too little time left is recorded as skipped (`insufficient-time`)
rather than failed. AI-enabled jobs instead allow five minutes on standard
pacing and eight minutes on slow pacing, keeping the same fallback reserves;
history imports and primary generation must fit before that reserve. These
settings apply to runs created after the runner restarts.

When the provider plan changes, the runner rebuilds its workload from verified
limits. The account keeps the same durable UTC provider-day ledger, so recorded
usage survives restarts and same-day plan changes. A reverified open day can
tighten capacity. A higher limit can apply after the next verified provider-day
reset. The essential reserve is 20,000 at the 120,000 ceiling, with the same
one-sixth share on smaller plans.

The free plan's season restrictions are the provider's; a date the plan cannot serve is recorded as failed or
partial coverage, never as "no fixtures".

## Odds imports (052)

Odds imports default to **off**. The storage, mapping and rights rules are in
[provider-odds.md](provider-odds.md).

**Switches.** These are runner-only settings, so put them in the ignored `.env.operations`, not `.env.development`:

| Key | Default | Effect |
| --- | --- | --- |
| `GOAL_HINT_ODDS_IMPORT_ENABLED` | `false` | The owner switch. Even when `true`, the runner imports odds only on an eligible plan. |
| `GOAL_HINT_ODDS_SWEEP_HOURS` | `3` | Broad date sweep interval in hours. Accepts `2`, `3`, `4` or `6`. |
| `GOAL_HINT_ODDS_RECONCILIATION_MINUTES` | `30` | Selective odds check interval in minutes. Accepts `15`, `30` or `60`. |
| `GOAL_HINT_SLIP_ODDS_REFRESH_ENABLED` | `false` | Enables the `:25`/`:55` Kampala targeted refresh on the odds-enabled football worker. Set it separately on the publisher to wait for the paired job. |
| `GOAL_HINT_ODDS_BOOKMAKER_ID` | empty | The verified primary bookmaker. Required whenever imports are enabled. |
| `GOAL_HINT_ODDS_BOOKMAKER_SCOPE` | `primary` | Use `all` to acquire all bookmakers in the same bounded date sweep. The primary bookmaker still supplies Matches and Best Slips. |
| `GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` | empty | The odds display-rights reference (OP-36). It never blocks the runner. Without an owner-recorded `football-odds-rights` approval for this exact reference, every price stays private. |

**Eligibility.** Odds require the owner switch, a verified bookmaker and a
verified plan with standard pacing and at least 200 requests per day above
the odds floor. The floor accounts for results, reserves, forecast refreshes,
selection and the eligible live-detail allocation. Free remains ineligible.

**Schedule.** At two minutes past each nominal three-hour slot, the runner
enqueues the UTC day's catalog and one `odds.import` per Kampala date. The base
horizon is today through day six. Authorized recovery extends it through day
14. The catalog job has priority over the date imports. The primary scope
adds a bookmaker filter. The all-bookmaker scope uses the date and reporting
timezone. The default recovery-enabled selective check runs at `:05` and `:35`
for new fixtures and unresolved or stale prices. Historical work starts no
earlier than 30 minutes after the broad slot and yields under quota pressure.
The optional Best Slips refresh still runs five minutes before each half-hour
publication, through the same enrichment worker. [Provider odds runbook](provider-odds.md#import-flow), [Best Slips refresh](daily-slip-publications.md#targeted-odds-refresh)

**Quota gate.** Broad price work checks the spare and remaining ordinary need
before starting or resuming. It admits pages incrementally. Catalogs check
their bounded request allowance. The shared MySQL limiter then checks each
attempt atomically against the day, rolling windows and workload reserves.
The live runner counts optional collection and historical backfill together
against the spare. Uncertain attempts are included. Essential-reserve and daily
quota exhaustion defer or end the odds slot. [Quota contract](quota-limiter.md#reservation-and-dispatch)

**Freshness.** Price availability depends on the provider's update clock,
fixture and bookmaker coverage, and when the worker reconfirms it. A slot can
run out of the spare before reaching every date. The targeted check prioritizes
approaching kickoffs; closing prices still require eligible stored evidence.

**Time budget.** Each broad attempt has 300 seconds, including up to 180 seconds
for provider pages. A page receipt and its prices commit together. A retry or
restart continues from the first uncommitted page while the slot and checkpoint
remain valid. A verified full page chain is required for a complete receipt.

**Worker.** One enrichment worker serializes odds, team-code and eligible
archive jobs and polls every 10 seconds when idle. The queue keeps this work
off the forecast and cutoff workers. Write-time price staleness runs on each
maintenance tick using stored data. Missing display rights stale fresh prices,
including closing prices. [Public price projection](provider-odds.md#public-projection)

**Failures.** Transport, 429, deadline and pacing failures retry within the slot (at most eight attempts). An
essential-reserve or daily-limit denial expires the job. Credential, subscription, authorization and
malformed-request failures fail the job, so the failed-jobs alert fires. Schema, coverage, pagination and size
failures keep their failed or partial receipt and do not repeat. A partial sweep never withdraws fixtures.

**Attribution.** The quota ledger records dispatches and their outcomes. Odds
receipts and `DurableJobUsage` record scoped collection work. Current odds use
`enrichment` and historical odds use `historical-backfill`. The worker logs
receipt status, requests and continuations for broad imports, and coverage,
backlog and price age for selective checks. Monitoring reports the odds lookback
total as `odds-requests`. [Operations monitoring](operations-monitoring.md)

`npm run live:status` prints the odds block: `enabled`, `eligible`, `bookmakerConfigured`, `imports` (all
three together), `displayRightsRecorded`, the floor, spare and reserve per day, sweep hours, dates and pages per date.

**Owner steps after the plan upgrade.** First run the counted odds trial
([football-provider-trial.md](football-provider-trial.md)). Then choose the bookmaker, set the two switches in
`.env.operations`, and run `npm run live:status`. Check that `imports` is `true`, then restart `npm run live`.

## Team codes

Phone cards show a team's provider code in place of its name (else a derived abbreviation). `/fixtures` carries no code, so the
runner fills `FootballTeam.code` through `/teams?league&season`
([football catalog](football-catalog.md#team-codes-spare-quota-import)).

**Switch and eligibility.** `GOAL_HINT_TEAM_CODES_IMPORT_ENABLED` defaults to `true` (set `false` in
`.env.operations` to keep imports off). Imports also need the odds eligibility: a verified plan with at least
200 spare requests and standard pacing. Free and slow plans stay ineligible.
Team codes use up to eight requests per eligible hourly slot from the same
spare as odds. The `ready` log reports `teamCodes` and `teamCodesSwitch`.
`npm run live:status` reports `enabled`, `eligible` and `imports` in its
`teamCodes` block.

**Schedule and gate.** At each new UTC hour the maintenance loop enqueues one `teams.codes` job for that slot
(`team-codes-scheduled`); the job expires when its slot ends. The enrichment worker runs it after any odds job.
Before any provider call it applies the odds gate (`oddsQuotaAllows`) with the slot's whole ceiling of 8
requests (four leagues, one page plus one retry each). Team codes and odds share
the day's spare and preserve the ordinary reserve. A refused slot expires with
`eligibility-expired`, without a provider call, and the next hour checks again.

**What a sweep does.** It takes up to four competition-seasons with codeless teams kicking off from 3 hours
ago to 8 days ahead, nearest kickoff first, and imports each through the ordinary catalog teams import. Leagues
with a stored answer under 30 days old are skipped (codes or not), and a failed answer backs a league off for
a day. A failed receipt ends the sweep. Storage unavailability retries within the slot. A refused import
(authorization, retention, an invalid result) fails the job, so the failed-jobs alert fires. A new code bumps
the version of every fixture that renders the team (publication accepts a refresh whose fixture version has
since moved forward, so in-flight refreshes are unaffected). Requests are attributed by the teams receipt
(`FootballImport.requestsDispatched`), `DurableJobUsage` (provider `football`) and the enrichment limiter
attempt. Monitoring reports the lookback total as `team-code-requests` (informational, no alert rule).
Recovery repair expires a stalled `teams.codes` job once its slot has ended.

## Country flags

Cards show the competition's country beside its flag. The flag URL arrives with the fixtures the daily
selection already imports (`league.flag` on `/fixtures?date=`), so it costs no requests and has no switch.
It needs migration `20261011075627_competition_country_flag` (`npm run db:deploy`; it adds one nullable column to
`FootballCompetition`). Until then the web app and the runner fail on the missing column, so deploy it before
restarting either. After the migration, flags fill in at the next daily selection (21:00 UTC, or at runner start
when that night's run is missing) for every competition with a fixture in its seven dates; international
competitions have none. A flag displays under the same public-rights reference as logos
([football catalog](football-catalog.md#country-flags)).

## Commands

Current/final match statistics and events are implemented by a separate fenced
poller in the same runner. They default off under
`GOAL_HINT_LIVE_DETAILS_ENABLED`; eligible paid plans reserve their bounded share
before optional odds/team-code work. See [match details](live-match-details.md)
for migrations, grants, limits, coverage and final retention.

| Command | Purpose |
| --- | --- |
| `npm run live:status` | Readiness and account/plan check (no quota). |
| `npm run live:competitions` | Dry run of competition discovery; add `-- --write` to update `.env.development`. |
| `npm run live` | Long-running live runner (JSON log lines). |
| `npm run test:live` | Unit checks for account parsing, workload sizing (including the odds floor and spare), policies and approvals. |
| `npm run test:live-details` | Collector, source/coverage, stored-reader, quota-budget and owned MySQL snapshot checks. |
| `npm run test:odds` | Odds domain, import and job units plus the odds persistence integration (owned MySQL). |
| `npm run test:team-codes` | Team-code validation, selection, envelope and gate units plus the team-code persistence integration (owned MySQL). |

`tests/live-runtime.integration.mjs` runs the real runtime on an owned MySQL with the local role's exact grants
and a synthetic provider: import → publication → public feed → result polling → settlement. It also covers odds.
With the switch off, the dedicated worker expires queued odds jobs without a provider call. With it on, a
Pro-sized day runs the catalog first and then one sweep per date, and each request is attributed by receipt, job
usage and enrichment limiter attempt, with no public price. Below the floor, the gate makes zero `/odds` requests.
Team codes are on by default on that Pro-sized plan. A queued sweep runs only on the enrichment worker,
imports the one league with codeless clubs, and is attributed by receipt, job usage and limiter attempt; odds
attribution then counts both. Past the reserve, the live gate refuses before any `/teams` request.

## October 2026 release checklist

The October operating record left counted OpenAI activation, licensed
research/news (011), shadow qualification (047), release readiness (048), hosted
deployment and scheduling (046/049), the recovery watchdog binding (043) and
monitoring delivery (044) pending. The current hosted status and deployment
history are maintained separately. [Deployment history](../../implementation-docs/deployment-and-version-control.md)
