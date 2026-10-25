# Live operations (real API-Football data)

The live runner connects the existing daily pipeline to the real API-Football account:
daily selection at 00:00 EAT, primary/fallback prediction refreshes, cutoff locks, result
polling, settlement and public-cache maintenance. Visitor requests still never call the
provider. The web app only reads what the runner stores in MySQL.

## Current operating mode

Owner decisions through 13 October 2026, recorded in the ignored `.goal-hint/owner-approvals.json`:

| Decision | Effect |
| --- | --- |
| **OpenAI primary, API-Football fallback (13 October 2026)** | The live AI binding is implemented. Activation requires the private key and exact owner references. With AI disabled, the existing fallback-only path needs no AI key. AI failures retain valid independent families and request API-Football for supported missing families. Research stays disabled. |
| **Publish now, provisional** | Forecasts are published before shadow qualification (047) and release gates (048/049). Every API-Football forecast carries the existing *Provisional estimate* label, and no accuracy claim is made. |
| **All available competitions** | `GOAL_HINT_COMPETITION_IDS` lists every league with a current season on the plan (`npm run live:competitions`). |
| **Local only** | Production scope may run in development mode **only** against a loopback database. Remote or hosted targets still need `NODE_ENV=production` and verified TLS. |

Confirm API-Sports terms for public display/redistribution before any public deployment.

## Setup

1. Put the API-Football key (from dashboard.api-football.com) in `API_FOOTBALL_KEY` in `.env.local`.
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

## What the runner does

- **Schedule:** it enqueues the daily selection for the latest 21:00 UTC occurrence on start and at each
  occurrence (one durable job per EAT run date). A missed night runs as soon as the runner starts.
- **Selection:** it imports eight EAT dates with `/fixtures?date=` on plans that support them. The edge day covers
  today plus six visitor-local dates across time zones. Every fixture is stored and shown; the nearest
  kickoffs up to the plan's refresh capacity get prediction cycles. Later fixtures are recorded as
  `refresh-capacity` exclusions. After three failed attempts, known coverage is finalized as partial.
- **Refresh:** one job per selected fixture. When AI is enabled, up to two bounded team-history imports finish
  before the immutable analysis cutoff; the pinned OpenAI attempt uses stored verified regulation history and
  derived form. API-Football supplies supported missing families on primary failure. A fresh
  `/fixtures?id=` status read precedes atomic publication before the five-minute cutoff. Jobs wait (retryably)
  instead of spending the reserve kept for result checks.
- **Results:** a leased poller covers the competitions with prediction cycles in the window. Settlement and
  cache reconciliation run every 30 seconds without provider calls.

## Plan-aware workload

Limits come from the provider's own `/status` (free of quota) at startup, every 10 minutes and at each
UTC provider day. Nothing is hard-coded to a plan.

| Plan (daily limit) | Refreshes/day | Workers | Live feed | Date poll | Odds floor / spare per day |
| --- | --- | --- | --- | --- | --- |
| Free (100) | 10 | 1 | off (date sync shows live status) | ~58 min | 97 / 3 — never eligible |
| Pro (7,500) | 1,214 | 2 | off | 1 min | 7,497 / 3 — never eligible |
| Ultra (75,000) | 2,000 | 3 | 15 s | 1 min | 34,266 / 40,734 |
| Mega (150,000; app ceiling 120,000) | 2,000 | 6 | 15 s | 60 s | 50,016 / 69,984 |

This table assumes AI is enabled and reserves four football requests per
refresh: two history imports, fallback and status. Fallback-only refreshes
reserve two. The odds column is explained in [Odds imports](#odds-imports-052) below.

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

On upgrade, the runner detects the new plan within 10 minutes and rebuilds its workload from the new limits;
no code change is needed. The essential quota reserve is 20,000 of the 120,000 ceiling (spec) and the same
one-sixth share on smaller plans.

Each account, plan and UTC provider day uses its own durable limiter account, seeded from the provider's
remaining count. Missed days, restarts and upgrades therefore reconcile from verified usage. A new day opens
one minute after 00:00 UTC, so rolling windows cannot overlap.

The free plan's season restrictions are the provider's; a date the plan cannot serve is recorded as failed or
partial coverage, never as "no fixtures".

## Odds imports (052)

Odds imports are built but **off**. The storage, mapping and rights rules are in
[provider-odds.md](provider-odds.md).

**Switches.** These are runner-only settings, so put them in the ignored `.env.operations`, not `.env.local`:

| Key | Default | Effect |
| --- | --- | --- |
| `GOAL_HINT_ODDS_IMPORT_ENABLED` | `false` | The owner switch. Even when `true`, the runner imports odds only on an eligible plan. |
| `GOAL_HINT_ODDS_BOOKMAKER_ID` | empty | The one documented bookmaker. Required when imports are enabled; no bookmaker is ever assumed. |
| `GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` | empty | The odds display-rights reference (OP-36). It never blocks the runner. Without an owner-recorded `football-odds-rights` approval for this exact reference, every price stays private. |

**Eligibility.** Odds run only when all three hold: the switch is `true`, a bookmaker is configured, and the
verified plan is eligible. A plan is eligible when its pacing is standard (60 or more requests per minute) and
at least 200 requests per day remain above the odds floor. The floor is every ordinary need of the provider day:
the results share, the reserve, every refresh job (capacity × 4 with AI, × 2 without AI) and the 16 selection requests. Refresh
jobs run 21:00–24:00 UTC, at the end of the UTC provider day, so the floor protects all of them, not just the
refresh floor. The Free plan (1 spare request per day, 10 per minute) is never eligible. On upgrade, the runner
rebuilds its workload and picks up eligibility without a code change.

**Schedule.** At each 3-hour UTC slot (00:00, 03:00 … 21:00) the runner enqueues the UTC day's `odds.catalog`
(`/odds/bets` and `/odds/bookmakers`, one durable row per day), then one `odds.import` per EAT date in the
window: today first, up to `min(7, importDays)` dates. The catalog has the highest priority, so it is stored
before that day's sweeps. Each sweep is one `/odds?date=…&bookmaker=…` walk of up to 150 pages at the
`enrichment` quota priority, uncached. A job expires when its slot ends, and the next slot sweeps again.
Enqueueing is idempotent, so restarts and plan rebuilds re-enqueue the same rows.

**Quota gate.** Odds have their own budget: the spare. Before any provider call the job reads the open
provider day's durable counters and needs both:

- **Spare left:** odds requests already dispatched today (the period's `enrichment` attempts in
  `ApiQuotaAttempt`, uncertain dispatches included) plus the operation's ceiling must fit in the spare. The
  ceiling is 154 for a sweep (150 pages plus four retries) and 3 for a catalog import.
- **Ordinary need covered:** after the ceiling, `remaining` must still cover the ordinary need left today
  (the floor minus the ordinary requests already used) and never drop below the reserve.

Ordinary requests already spent count once, not twice, so the one-minute date poll on Pro no longer closes the
gate by midday. On Pro odds can spend up to 861 requests a day, and the last sweep starts while at least 154 of
them are unspent. The second check binds only when the provider reports fewer requests left than the limiter
counted, or when ordinary work has run past its plan.

A refused job **expires** with `eligibility-expired`. It does not fail and makes no provider call: the gate's
slack never grows during a provider day, and a slot never spans two. Odds therefore stop for the rest of the day
once the spare is spent, nearest dates first. The limiter's essential reserve (one sixth of the day) still
applies on top. Between 00:00 UTC and the moment the new provider day opens (about one minute later), a job
waits and retries within its slot.

**Freshness on Pro.** A price stays fresh for 12 hours after its last reconfirmation. Evening kickoffs
(18:00–24:00 UTC) are reconfirmed by the 06:00–21:00 slots only while the spare lasts. How many slots it covers
depends on pages per date: seven dates of ten pages (70 requests a slot) cover all eight slots, but large
`/odds?date=` responses spend the spare in the morning. Late fixtures then go stale before kickoff and get no
closing price. The counted trial's pages-per-date evidence decides whether league-scoped queries are needed.

**Time budget.** Each odds job has 300 seconds. The provider walk ends 180 seconds after the attempt starts (or
at the slot's end), so the receipt and the per-fixture writes keep at least two minutes. The store verifies the
receipt once per import and writes each fixture's changed bets in multi-row statements. A job aborted during the
writes keeps the fixtures already applied. Its retry walks the pages again, and those requests count against
the spare.

**Worker.** `npm run live` starts one dedicated enrichment worker beside the refresh workers; it runs the odds
and [team-code](#team-codes) jobs one at a time (log events `enrichment-job-*`). When idle it polls every 10
seconds instead of every second, since sweeps run at most hourly. Odds jobs (priority 8 to 1) claim before
team-code jobs (priority 0). These job types are registered only on that worker, so they never occupy a refresh
or cutoff worker. The worker runs even while odds are off, so any queued odds job expires instead of stalling. Write-time staleness (`expire`) runs on every
maintenance tick and makes no provider call. Without verified display rights it also stales every fresh price,
closing prices included ([provider-odds.md](provider-odds.md#public-projection)).

**Failures.** Transport, 429, deadline and pacing failures retry within the slot (at most eight attempts). An
essential-reserve or daily-limit denial expires the job. Credential, subscription, authorization and
malformed-request failures fail the job, so the failed-jobs alert fires. Schema, coverage, pagination and size
failures keep their failed or partial receipt and do not repeat. A partial sweep never withdraws fixtures.

**Attribution.** Every odds request is counted three ways: `OddsImportBatch.requestsDispatched`,
`DurableJobUsage` rows (provider `football`, no cost reference) and `ApiQuotaAttempt` rows at priority 3
(`enrichment`). Odds and team codes are the only live callers at that priority, so the gate counts them
together against one spare. Monitoring reports the odds lookback total as `odds-requests`. Football money stays the flat plan price (`API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS`, at most
US$45 a month): odds add requests, not spend, and never enter the AI or research ledgers.

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
200 spare requests and standard pacing. They are therefore off on Free and slow plans whatever the switch says.
On Free (100 a day, 10 a minute) the ordinary floor is 99 requests, so the spare is 1 and pacing is slow: no
import runs until the plan upgrade, and phone cards use their fallback for codeless teams meanwhile
([match card](match-card.md)). The owner asked for "slow on Free", so "off on Free" is an open owner decision.
The options are to accept it, or to add a separately gated trickle of one league a day after the day's refresh jobs.
See "Owner actions" under team codes in [development progress](development-progress.md). On a 7,500-a-day plan the
spare is 859 in fallback-only mode, so team codes can take up to 8 requests an hour (about 96 leagues a day) beside odds. The `ready`
log line reports `teamCodes` (running) and `teamCodesSwitch`; `npm run live:status` prints a `teamCodes` block with
`enabled`, `eligible` and `imports`.

**Schedule and gate.** At each new UTC hour the maintenance loop enqueues one `teams.codes` job for that slot
(`team-codes-scheduled`); the job expires when its slot ends. The enrichment worker runs it after any odds job.
Before any provider call it applies the odds gate (`oddsQuotaAllows`) with the slot's whole ceiling of 8
requests (four leagues, one page plus one retry each). Team codes and odds share the day's spare, so together
they never exceed it, and neither ever takes the ordinary reserve. A refused slot expires with
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
| `npm run live:competitions` | Dry run of competition discovery; add `-- --write` to update `.env.local`. |
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

## Not yet live

Counted OpenAI activation, licensed research/news (011), shadow qualification (047), release readiness (048),
hosted deployment and scheduling (046/049), the recovery watchdog binding (043) and monitoring delivery (044).
