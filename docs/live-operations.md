# Live operations (real API-Football data)

The live runner connects the existing daily pipeline to the real API-Football account:
daily selection at 00:00 EAT, fallback prediction refreshes, cutoff locks, result
polling, settlement and public-cache maintenance. Visitor requests still never call the
provider. The web app only reads what the runner stores in MySQL.

## Current operating mode

Owner decisions of 10 October 2026, recorded in the ignored `.goal-hint/owner-approvals.json`:

| Decision | Effect |
| --- | --- |
| **Fallback-only** | AI and research stay disabled (prompts 011/012 remain partial). Each refresh publishes the API-Football `predictions.percent` match-result distribution and its derived double chance. Total goals and both-teams-to-score show as unavailable. |
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

## What the runner does

- **Schedule:** it enqueues the daily selection for the latest 21:00 UTC occurrence on start and at each
  occurrence (one durable job per EAT run date). A missed night runs as soon as the runner starts.
- **Selection:** it imports seven dates with `/fixtures?date=`. Every fixture is stored and shown; the nearest
  kickoffs up to the plan's refresh capacity get prediction cycles. Later fixtures are recorded as
  `refresh-capacity` exclusions. After three failed attempts, known coverage is finalized as partial.
- **Refresh:** one job per selected fixture. No evidence or AI dispatch, then one `/predictions` and one fresh
  `/fixtures?id=` status read, then atomic publication before the five-minute cutoff. Jobs wait (retryably)
  instead of spending the reserve kept for result checks.
- **Results:** a leased poller covers the competitions with prediction cycles in the window. Settlement and
  cache reconciliation run every 30 seconds without provider calls.

## Plan-aware workload

Limits come from the provider's own `/status` (free of quota) at startup, every 10 minutes and at each
UTC provider day. Nothing is hard-coded to a plan.

| Plan (daily limit) | Refreshes/day | Workers | Live feed | Date poll |
| --- | --- | --- | --- | --- |
| Free (100) | 23 | 1 | off (date sync shows live status) | ~58 min |
| Pro (7,500) | 2,000 | 2 | off | 1 min |
| Ultra (75,000) | 2,000 | 3 | 15 s | 1 min |
| Mega (150,000; app ceiling 120,000) | 2,000 | 6 | 15 s | 60 s |

**Slow plans (under 60 requests/minute, e.g. Free at 10/minute).** A provider call may have to wait most of a
rolling minute for a limiter slot. Refresh jobs on these plans get a 5-minute timeout and a 200-second reserve, and
each provider call waits up to 75 seconds for the slot the limiter names instead of giving up after 15–20 seconds;
waiting never adds a second dispatch. Selection also skips fixtures whose publication cutoff falls inside the time
the refresh queue needs to drain (`cutoff-too-close`, at most two hours), so the daily capacity goes to matches that
can still be predicted. A refresh whose cycle has too little time left is recorded as skipped (`insufficient-time`)
rather than failed. These settings apply to runs created after the runner restarts.

On upgrade, the runner detects the new plan within 10 minutes and rebuilds its workload from the new limits;
no code change is needed. The essential quota reserve is 20,000 of the 120,000 ceiling (spec) and the same
one-sixth share on smaller plans.

Each account, plan and UTC provider day uses its own durable limiter account, seeded from the provider's
remaining count. Missed days, restarts and upgrades therefore reconcile from verified usage. A new day opens
one minute after 00:00 UTC, so rolling windows cannot overlap.

The free plan's season restrictions are the provider's; a date the plan cannot serve is recorded as failed or
partial coverage, never as "no fixtures".

## Commands

| Command | Purpose |
| --- | --- |
| `npm run live:status` | Readiness and account/plan check (no quota). |
| `npm run live:competitions` | Dry run of competition discovery; add `-- --write` to update `.env.local`. |
| `npm run live` | Long-running live runner (JSON log lines). |
| `npm run test:live` | Unit checks for account parsing, workload sizing, policies and approvals. |

`tests/live-runtime.integration.mjs` runs the real runtime on an owned MySQL with the local role's exact grants
and a synthetic provider: import → publication → public feed → result polling → settlement.

## Not yet live

AI prediction (012), licensed research/news (011), shadow qualification (047), release readiness (048),
hosted deployment and scheduling (046/049), the recovery watchdog binding (043) and monitoring delivery (044).
