# Deployment and version control

## Purpose and scope

This document follows the shared web app through local development, GitHub, artifact packaging, database migration, incremental deployment, and recovery. The dated rollout entries record the hosting procedures used at the time.

## Environments and dependencies

The Next.js application owns the shared web UI, routes, and server operations. The checked-in package pins Node.js 24.18.1 and npm 11.16.0. The scripts also require Python 3.11 or later. The app uses Prisma with MySQL for local development and MariaDB on the hosted VPS. Flutter releases build and distribute a separate host for the shared web application. [Package manifest](../next-js/package.json), [dependency lockfile](../next-js/package-lock.json), [development guide](../next-js/docs/deployment/development.md), [Flutter releases](../flutter/docs/releases.md), [UI implementation](ui-implementation.md).

| Environment | Supported setup |
| --- | --- |
| Development (`development`) | `npm run dev` selects the configured local MySQL dataset. `npm run dev:live` checks the configured database's migrations before starting. Test fixtures use a separate guarded target. |
| [Hosted staging](https://test.goalhint.com) (`staging`) | Apache/Passenger serves the staging installation under `ghprod`, using the persistent `ghprod_test` database and the private `goal-hint-test-private` directory. Staging HTTPS checks require `noindex`. Live football-provider jobs are disabled. |
| [Production](https://goalhint.com) (`production`) | Apache/Passenger serves the production installation under `ghprod`, using the persistent `ghprod_prod` database and the private `goal-hint-private` directory. Scheduled jobs use private worker configuration and dedicated database grants. |

[Local launcher](../next-js/scripts/development.py), [database target guards](../next-js/scripts/database.py), [VPS staging and production runbook](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion), [Best Slips worker operations](../next-js/docs/daily-slip-publications.md).

## Git, checks and packaging

- GitHub `origin` holds code history. Develop on `development`, fast-forward `staging` to the approved commit, then fast-forward `production` after the staging deployment passes. Local and automated SSH operators use the same deploy command and strict host verification. [GitHub repository](https://github.com/WASSWA2624/goal-hint), [release runbook](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion).
- From `next-js/`, `npm ci` installs the locked dependencies and runs the Prisma-client and OCR-asset setup. Use `npm run check` for schema validation, theme contract checks, lint, type checking, the default JavaScript and Python suites, and build. Named suites in `package.json` provide additional integration and rendering coverage. `npm run build` builds the web app and offline manifest, and `npm start` runs the built app. [Package commands](../next-js/package.json), [development setup](../next-js/docs/deployment/development.md).
- Package a clean Git commit with `npm run package:cpanel`. A fresh build uses the pinned Node version and `npm ci`, and includes traced dependencies, the Passenger launcher, static assets, and the migration inventory. An approved build with unchanged build inputs can reuse the verified standalone files. The ZIP and SHA-256 stay with the operator and the same archive selects the staging and production build. The VPS receives only changed packaged files and requires no npm install. [Release packaging script](../next-js/scripts/package-cpanel.py), [connection recovery](../next-js/docs/offline-startup.md), [VPS release promotion](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion).
- The theme contract and rendering suites cover shared UI rules. Feature-specific suites exercise payment and wallet invariants, referral attribution and review, and publication behavior. Rendering suites provide account, owner payment and referral review fixtures for browser checks. Hosted HTTPS probes confirm the served artifact and public route behavior in the environment being promoted. [Package test commands](../next-js/package.json), [UI implementation](ui-implementation.md), [Payments](payments.md), [Wallet and referrals](wallet-and-referrals.md).

## Private configuration

| Key names | Purpose |
| --- | --- |
| `GOAL_HINT_DEPLOYMENT_ENVIRONMENT`, `GOAL_HINT_OPERATION_SCOPE` | Select the environment and govern the permitted operational scope. |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL`, `GOAL_HINT_DATABASE_ENABLED` | Provide separate application, migration, and test connections and control database-backed functionality. |
| `GOAL_HINT_DATABASE_CONNECTION_MODE`, `GOAL_HINT_DATABASE_TLS_MODE`, `GOAL_HINT_DATABASE_TLS_CA_FILE`, `GOAL_HINT_DATABASE_ACCESS_REF` | Govern transport, certificate trust and the approved access policy. |
| `GOAL_HINT_FOOTBALL_ENABLED`, `API_FOOTBALL_KEY`, `GOAL_HINT_COMPETITION_IDS`, `GOAL_HINT_FOOTBALL_PRIVATE_USE_REF`, `GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF`, `GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` | Govern football provider use, competition scope and public data/odds rights. |
| `GOAL_HINT_SLIP_ODDS_REFRESH_ENABLED` | Enables the targeted refresh in the football worker and the slot completion check in the stored Best Slips publisher. Default is false. Enable it in both worker profiles for coordinated operation. |
| `GOAL_HINT_AI_ENABLED`, `AI_API_KEY`, `GOAL_HINT_RESEARCH_ENABLED`, `RESEARCH_API_KEY`, `GOAL_HINT_BUDGET_APPROVAL_REF`, `GOAL_HINT_RELEASE_APPROVAL_REF` | Configure optional integrations and reference operational approvals. |
| `GOAL_HINT_ADMIN_PHONES`, `GOAL_HINT_ADMIN_PASSWORD`, `GOAL_HINT_ANALYTICS_SECRET`, `GOAL_HINT_TRUSTED_PROXY_CIDRS` | Configure administrator authentication, keyed server protections including reset-link encryption, and trusted proxies. |
| `GOAL_HINT_FLUTTERWAVE_PUBLIC_KEY`, `GOAL_HINT_FLUTTERWAVE_SECRET_KEY`, `GOAL_HINT_FLUTTERWAVE_ENCRYPTION_KEY`, `GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET`, `GOAL_HINT_FLUTTERWAVE_WEBHOOK_URL` | Supply hosted payment settings for the intended target. The server's Flutterwave Standard integration uses the secret key. Webhook verification and status reconciliation use the configured environment and provider evidence. |

Hosted staging and production load distinct private web env files through the Passenger launcher. Local development and worker settings have separate files. `npm run env:check` validates local layouts, and `npm run env:sync` previews eligible hosted web settings. The latter requires an explicit apply option for writes. Database credential and grant changes, approval records, and football-worker configuration have their own operator procedures. [Environment template](../next-js/.env.example), [runtime policy](../next-js/src/server/config/runtime-policy.ts), [private settings synchronization](../next-js/scripts/sync-hosted-env.mjs), [hosted environment runbook](../next-js/docs/deployment/how-to-deploy.md#update-hosted-web-settings), [payment configuration](payments.md#records-access-and-controls).

Billing feature availability also depends on the target's stored sales and payment settings. An artifact promotion verifies the app build and migrations. Payment collection evidence, payment approval operations, notification-worker setup and wallet or referral activity use their own checks and records. [Hosted Flutterwave settings](../next-js/docs/deployment/how-to-deploy.md#update-hosted-web-settings), [Payments](payments.md), [Wallet and referrals](wallet-and-referrals.md).

## Database and release sequence

1. Provision or restore the target database and separate least-privilege application and migration accounts. Put credentials in the target's private configuration. Keep integration and restore rehearsals isolated. Local demo setup has its own scripted provisioning. Hosted migrations and grants use verified TLS and a dedicated migration account. [Local database runbook](../next-js/docs/local-database.md), [database tools and permissions](../next-js/docs/database.md), [hosted database runbook](../next-js/docs/deployment/how-to-deploy.md#database-updates-on-mariadb).
2. Update `prisma/schema.prisma` and run `npm run db:migrate -- --name <migration_name>` to generate a SQL diff from the committed schema snapshot and advance it. Review the generated SQL and any required MariaDB overlay or grants. On a suitable MySQL target, `npm run db:deploy` applies reviewed Prisma migrations, `npm run db:status` checks the ledger, and `npm run db:verify` checks ledger and Prisma-representable schema drift. Check engine-specific constraints and grants separately. [Schema](../next-js/prisma/schema.prisma), [schema snapshot](../next-js/prisma/schema.snapshot.prisma), [migration creation and verification](../next-js/scripts/database.py), [MariaDB compatibility runbook](../next-js/docs/deployment/how-to-deploy.md#database-updates-on-mariadb).
3. Preview the deployment to report file additions, changes and removals. On apply, the receiver locks the environment, hard-links unchanged package files into a temporary installation, verifies transferred files, binds the private settings, and checks `_prisma_migrations` on the pinned database. Review pending DDL and pause any affected writers before opting in with `--apply-migrations`. MariaDB checks the ledger after each apply. An interrupted overlay requires schema and ledger reconciliation. External backup management stays outside the deployment. [Deploy client](../next-js/scripts/deploy-hosted.py), [VPS receiver](../next-js/scripts/receive-hosted.py), [MariaDB runner](../next-js/scripts/deploy-mariadb.py).
4. The receiver switches Passenger atomically and checks the build, its release probe, Matches, the one-day API and the account session API over HTTPS. Staging also checks `noindex`. It removes the superseded installation after verification. Production requires the staging receipt for the same commit, archive and build. Scheduled football refresh and Best Slips publication continue on their own private launchers. [Promotion and smoke-test runbook](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion), [Best Slips worker runbook](../next-js/docs/daily-slip-publications.md).
5. A failed cutover reselects the prior application when the temporary installation is still being verified. After a successful promotion, use `--restore` to deploy an earlier GitHub commit through staging and production when its inventory accepts the current migration ledger. For schema failures, inspect the actual schema and recorded migration before resuming writes. [VPS promotion and recovery](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion), [migration recovery](../next-js/docs/deployment/how-to-deploy.md#database-updates-on-mariadb).

The targeted odds refresh is a worker-only rollout. The football worker needs its existing durable-job and odds permissions. The publisher needs read access to the durable job ID and state. Deploy and enable the football worker first, then enable the publisher check once the targeted schedule is active. To roll back, disable the publisher check first and then disable the targeted job. [Worker rollout and verification](../next-js/docs/daily-slip-publications.md#targeted-odds-refresh).

## Football worker reliability

The worker candidate uses the existing five-minute VPS launcher, durable job queue and shared quota ledger. The launcher starts one long-lived football process when the host lock is free. Inside it, coordinated mode runs a selection worker, a cutoff worker, one configurable set of forecast workers and one enrichment worker. Separate database leases fence result and detail polling. The independent Best Slips publisher runs twice per hour. The staging worker verification path uses simulated provider responses and a disposable database. Hosted staging keeps the shared production provider schedule disabled. [VPS football launcher](../next-js/docs/deployment/how-to-deploy.md#vps-live-football-worker), [Worker schedules](../next-js/src/server/live/live-runner.ts).

The optional `GOAL_HINT_FOOTBALL_*_POLL_SECONDS`, `GOAL_HINT_FOOTBALL_LIVE_STATISTICS_SECONDS`, `GOAL_HINT_FOOTBALL_LINEUP_*_MINUTES`, and `GOAL_HINT_ODDS_*` interval settings are documented in the environment template. The request ceilings can be lowered with `GOAL_HINT_FOOTBALL_REQUESTS_PER_SECOND` and `GOAL_HINT_FOOTBALL_REQUESTS_PER_MINUTE`. Verified account status and response headers can lower effective limits further. The worker defers historical work under quota pressure and staggers broad odds, fixture-specific odds, and historical recovery. The candidate uses the existing schema and private worker grants. [Environment template](../next-js/.env.example), [Quota policy](../next-js/docs/quota-limiter.md), [Odds coverage](odds-and-market-updates.md).

On 27 November 2026, staging activated `db2f8ea5` with Next build `KW8j4zJ6eUXiNCeHNpDBf` after strict verification of the host key. The checksummed deployment transferred 5,753,357 bytes for 282 files. MariaDB verified the unchanged inventory of 95 required migrations. Independent HTTPS checks returned HTTP 200 for Matches, the bounded Matches API, and the guest session API. Matches served the expected build with `noindex`. The release ZIP SHA-256 is `f3bcb57f9890e50615af9509c1c28962109708b929110cb00629eb3b78622f5b`.

The runtime, odds, quota, result, detail and queue suites passed against disposable genuine MySQL with simulated provider responses. The selection suite verified a 2,000-fixture cohort. On the hosted staging server, all 71 synthetic live binding, odds, coordinated result and match-details tests passed against the exact release source with Node 24.18.1, the matching dependency lock and the matching generated Prisma client. The rehearsal used a temporary workspace with read-only Node permissions, no credentials and no provider traffic or database writes. Hosted staging keeps provider collection disabled. [Fixture and live baseline](fixtures-and-live-data.md#production-observations-2627-november-2026), [Odds baseline](odds-and-market-updates.md#production-observations-2627-november-2026).

The earlier 24-hour quota sample recorded 35,918 dispatches, a peak of 53 per minute and zero throttled dispatches. The 26–27 November sample recorded 697 retained broad live batches and 11,357 detail dispatches. A planning scenario uses six times the recorded broad batches, twice the detail dispatches, and the earlier measured results, discovery and enrichment volumes. Adding up to 168 daily extended-date reads and 1,152 initial selective checks yields roughly 33,000 requests per day. A heavy scenario with all-day live polling, the 24,000-request Mega detail allowance, and double the measured auxiliary workload yields roughly 44,000 before additional retries. Both scenarios project demand from prior deployment measurements. Active forecast backlogs, provider errors or larger cohorts can increase demand. The limiter defers lower-priority work before the application ceiling or a lower verified provider cap. [Quota baseline](../next-js/docs/reports/football-improvement-rollout-2026-11-20.md), [Live baseline](fixtures-and-live-data.md#production-observations-2627-november-2026), [Capacity admission](../next-js/src/server/live/live-detail-quota.ts).

A fresh read-only production baseline at 13:07 Kampala time found 32,137 counted requests and 87,863 remaining under the application ceiling. The preceding account check verified Mega with a 150,000-request provider allowance. At the observed provider-day average, roughly 53 requests per minute, sustained demand would reach about 76,000 in 24 hours. This rate reflects the prior worker and can vary across kickoff windows. The result and detail pollers were attached, and the existing Best Slips odds refresh had a pending job for its slot. [Worker schedule](../next-js/src/server/live/live-runner.ts), [Quota reporting](../next-js/docs/operations-monitoring.md).

After owner approval, production promoted the same verified `db2f8ea5` ZIP and served Next build `KW8j4zJ6eUXiNCeHNpDBf`. The production MariaDB ledger verified all 95 required migrations. Matches, the bounded Matches API, and the guest session API returned HTTP 200 over HTTPS. [Production Matches](https://goalhint.com/en/matches).

The matching football source passed the existing launcher's read-only production preflight, including the new odds reconciliation query under the worker's existing MariaDB role. The host console verified the worker's release through its CageFS mount and signaled the old process at 13:44:38 Kampala time. It held the lock past the 13:45 cron check and drained before 13:46:04. The 13:50 tick started `db2f8ea5`, which logged ready at 13:50:03 and attached both pollers at 13:50:21. The crontab checksum matched throughout the handoff. [VPS worker runbook](../next-js/docs/deployment/how-to-deploy.md#vps-live-football-worker).

In the first nine completed nonempty live polls, the median completion gap was 15.48 seconds and the 95th percentile was 15.89 seconds. Median provider receipt-to-database latency was 1,021 ms and the 95th percentile was 1,586 ms. The worker stored ten changed timelines. In a 20-minute sample before the handoff, the prior worker's median nonempty batch gap was 91.1 seconds across 13 completed live batches.

The first selective slot deferred one request before launch when the shared limiter denied it. The retry imported the available offers and recorded a schema error on one fixture. All 381 eligible bookmaker-market records in five verified fixture-scoped pages matched stored content. Startup reused jobs from the 12:00 broad slot. The first fresh sweep queued all 15 dates at 15:02:28 Kampala time. At 15:24, ten of those jobs had succeeded and five were waiting for retry after pagination inconsistencies. The preceding 12:00 sweep had 13 complete and two partial receipts. The fresh sweep had 667 fixture receipts over 74 accepted pages. All 4,750 sampled eligible bookmaker-market records matched stored values across 19 sealed pages and 11 dates. The full 99% capture goal remains unverified. [Dated odds and remaining gaps](odds-and-market-updates.md#worker-rollout-27-november-2026).

At 13:52:33 Kampala time, the open UTC provider day recorded 9,682 physical launches. The conservative quota ledger counted 32,938, with 87,062 available below the 120,000 application ceiling. The worker verified the 150,000 Mega allowance and effective short-window caps of 10 per second and 600 per minute. The first 61 physical launches after startup peaked at four per rolling second and 30 per rolling minute, with zero provider errors or HTTP 429 responses. [Quota reporting](../next-js/docs/operations-monitoring.md).

At 14:00, Best Slips skipped publication because its paired odds job stopped on a local quota admission refusal before sending its eleventh request. The live-detail poller had attached without making a detail request. Production MariaDB 11.4 rejected the due-fixture query's typed `JSON_VALUE` syntax. The corrected worker casts the JSON result with SQL supported by MySQL and MariaDB. Fixture-scoped odds use bounded backoff for transient local admission delays, with at most one physical request in each eight-second fixture deadline. The fixes are confined to the worker's detail selection and odds admission. [Detail query](../next-js/src/server/live-match/live-match-mysql-store.ts), [Fixture odds bounds](../next-js/src/server/live/live-plan.ts).

The 14:00 hourly selection finished on its first attempt at 14:07:15 after 365 seconds. Verified fixture discovery completed all seven extended dates, 5–11 December, with seven physical launches and 2,585 imported fixtures. At 14:09:04 the initial worker had made 273 physical launches, peaking at five per rolling second and 61 per rolling minute, with zero provider errors or HTTP 429 responses. For the open provider day, 9,894 physical launches and 33,150 conservative charges left 86,850 under the application ceiling. [Fixture and live observations](fixtures-and-live-data.md#worker-rollout-27-november-2026).

Hosted staging passed 155 synthetic tests for worker hotfix `c84cb0a8` with the exact source, Node 24.18.1 and the matching lock and generated Prisma client. Staging ran with provider collection disabled and had no provider cron entries. Production's inactive candidate passed the existing launcher check without calling the provider. Under the production worker role, the corrected due query selected 20 live fixtures across 429 configured scopes, including three with known statistics coverage. The verified candidate archive SHA-256 is `e8ea10b674532bdb61dbeb956bba13b3b5e829425e1616664749dbe983851843`. The staging and production Git refs advanced to the worker hotfix. The web artifact stayed on `db2f8ea5`. The active worker reuses the lock-matched installed dependencies in the `ea35f7c2` production package and contains its own verified generated Prisma client.

The production selector changed directly from `db2f8ea5` to `c84cb0a8` at 14:11:45 Kampala time. The previous process drained before the next cron tick. The existing 14:15 cron started the hotfix at 14:15:03, which reused the already-succeeded 14:00 hourly selection. The process ran three ordinary workers for selection, cutoff and forecasts, plus the dedicated enrichment worker and the two leased pollers. Matches, its bounded live feed, Match Details, the guest account session and Best Slips returned HTTP 200. At 14:31:25, the hotfix had made 755 physical launches, including 607 detail requests, with rolling peaks of six per second and 75 per minute. It recorded zero upstream rate limits in that window. The UTC provider-day ledger showed 10,692 physical launches and 33,955 conservative charges, leaving 86,045 below the application ceiling. If sustained, that short active window would imply about 66,000 physical launches per day. Its detail request rate would reach the 24,000-request detail allowance before exhausting the global cap. At 15:24, the hotfix window had 2,894 physical launches, with peaks of six per rolling second and 100 per rolling minute and zero HTTP 429 responses or provider errors. The UTC provider-day ledger had 12,831 physical launches and 36,103 conservative charges, leaving 83,897 of the 120,000 application allowance.

The paired odds job for the 14:30 publication slot completed on its first attempt at 14:25:27. The publisher consumed the successful refresh and returned `no-qualifying` after evaluating 96 eligible selections within its existing search limit. It added no new slip for that slot. The 15:00 paired refresh also succeeded. Its publisher checked 92 eligible selections and published one slip in one band. [Best Slips publisher](../next-js/docs/daily-slip-publications.md#targeted-odds-refresh).

## Incremental web promotion, 27 November 2026

The environment branches were seeded at the verified live commit `32613d5f`. Staging first verified `3388ae4d`, and production then promoted the same ZIP with SHA-256 `1c66d6e07706cde485410209f2cc403390cf3bf890129cb43c9a5baa229b920a`. Git verified that the build inputs were unchanged. The build reused the same 7,072 standalone files and Next build `bKFSD5C4otx_JULR_W-CO` without compilation or dependency installation.

Each hosted deployment transferred 54,763 compressed payload bytes for 41 changed files. Repeat deployments on staging and production transferred zero application files. A restore preview selected the previous compatible GitHub artifact and reported its file delta. Both hosted deployments verified the release-specific probe, Matches page, bounded Matches API, account session API and Next static manifest over HTTPS. Staging returned `noindex`. Both checked all 95 migrations over TLS with zero pending. Staging matched 8 member accounts, 1 member session and 0 payment submissions. Production member accounts increased from 1,319 to 1,332 and sessions from 1,342 to 1,355 during the rollout. Payment submission counts stayed at zero.

The staging release root went from 22 web installations and four abandoned incoming directories to one installation, falling from 3.1 GiB to 141 MiB. Production went from 28 web installations to one, falling from 4.5 GiB to 150 MiB. A further 52 audited private web archive and checksum files totaling 1,120,359,560 bytes were removed. The release runner created no database dump or historical web archive. The football and Best Slips launchers use the same stable web path after promotion. The native Flutter shell continued to use the production website from the existing build.

The VPS audit found inherited production grants on both staging logins. The two production grants were revoked through cPanel while holding both release locks. All four distinct web and migration logins reached their designated database and were denied cross-environment table access over TLS. cPanel listed exactly the two designated application databases. Both sites still run under the provider's shared `ghprod` Unix account, with environment-specific private directories and database accounts.

The initial worker cleanup stopped when the live football worker held its lock across 26 attempts and two scheduler ticks. The current, shadow, and fallback launchers reference several retained worker packages. Publisher handoff archives and mixed staging candidate directories have unverified dependencies. [Worker cleanup procedure](../next-js/docs/deployment/how-to-deploy.md#vps-live-football-worker).

The follow-up audit matched 14 old database dumps to eight Goal Hint migration workspaces from the host cutover, operational slip windows, password recovery, and Community invitations. The operator verified filesystem ownership, recorded checksums, and current launcher references, then removed the 14 payloads. The operator also removed the superseded `ecd8d319` staging ZIP, archived production migration package, and its exact extracted source copy. These removals reclaimed 45,615,789 bytes. Both sites passed Matches, the bounded Matches API and the guest session API before and after removal. Both ledgers verified all 95 migrations afterward. The dated directories retain their private migration receipts and decryption material.

The standard development launcher selects the owned `goal_hint_football_202611` MySQL snapshot. Its three pending migrations applied successfully. Prisma status and schema drift checks passed with all 95 required migrations complete. Exact row counts matched in all 141 pre-existing application tables, totaling 4,602,266 records. A repeat deploy was a no-op. The older optional `.env.development` database and the primary snapshot's pre-existing historical checksum discrepancy were preserved.

Schema, type, lint, theme and focused deployment checks passed. The full Python script suite passed 215 of 216 tests. Its historical November replay trigger assertion reproduced against the unchanged migration SQL.

## Priced-only featured picks rollout

On 27 November 2026, staging and production activated the same checksummed web package for `32613d5f` with Next build `bKFSD5C4otx_JULR_W-CO`. Both verified all 95 migrations before and after activation. Matches and the one-day API passed HTTPS checks in both environments, and the production Match Details API passed. Staging retained `noindex`. TypeScript, focused tests including disposable MySQL, and mobile and desktop rendering in light and dark themes passed. The previous web release `0c6824d2` remains available. The ZIP SHA-256 is `593ba1de3c75adc89845a5bb784491906eb20fe7efccba2af3109984d46f9b41`.

The fixture-scoped odds refresh completed all 244 targeted checks for 27 November. API-Football returned odds for 133 fixtures and empty results for 111. At 02:32 Kampala time, the production audit applied v5 to 325 upcoming fixtures. It found 209 priced featured picks, 104 fixtures without stored odds and 12 without a current accepted forecast. The audit used the shared upcoming selector and exposed no unpriced featured picks.

The v5 football and Best Slips releases passed their production preflights. The football release selector points to `32613d5f` for the next natural worker start. The existing worker still holds the lock, and the first v5 cutoff and paired publisher readiness remain pending. The current publisher continues serving during the handoff. The production crontab checksum matched before and after selection.

## Targeted Best Slips odds refresh rollout

On 27 November 2026 at 01:58 Kampala time, production selected worker release `af233216` for the next natural football-worker restart. Both versioned worker releases passed checksum and read-only production preflight. The live role read the targeted fixture cohort, and the publisher role read the durable job state with its existing grants. Isolated MySQL covered pricing, scoped empty imports and candidate selection. The production crontab checksum matched before and after the handoff.

The existing worker holds an exclusive lock and runs in a separate process namespace. Its watchdog is expected to release the lock for the 20:00 Kampala cron start on 27 November. The publisher launcher checks the new worker's readiness before switching automatically to the gated publisher. At 02:00, the deferred launcher ran the original publisher, which reported zero eligible selections. The football heartbeat still reported the 03:00 broad sweep. Production verification of the first paired refresh and publication remains pending. Both previous launchers and the previous football release are available for rollback.

## Default Matches API rollout

On 27 November 2026, the bare production Matches request returned HTTP 503 after 31.48 seconds. The indexed replay query in `f9a3cba2` reduced SQL time in a bounded comparison, but the hosted request still timed out. A read-only trace saw full replay hydration batches and another candidate query at 29.9 seconds, before the exact count.

Release `0c6824d2` reads sealed picks and abstentions for list membership and hydrates full display evidence for the visible page. A read-only production MariaDB comparison matched 78 selections and 22 abstentions across 100 rows. The compact result used 44,607 bytes of serialized output, down from 6,501,196 bytes. The populated MySQL integration verified both feeds, exact membership across three pages, and guest redaction. The 97 focused feed tests, scoped lint, type checking and production-mode build passed.

Staging served Next build `nANwyh9XR4eESxofBCMq1`, with `noindex` on Matches. The 30-day feed from 29 October to 27 November returned HTTP 200 in 515 milliseconds. The one-day feed for 27 November returned HTTP 200 in 1,142 milliseconds. Both returned the expected response contract and reported unavailable coverage for the empty staging fixture cohort.

Production promoted the exact staging ZIP and served the same build. Two serial 30-day requests returned HTTP 200 in 32.65 and 27.40 seconds, each with 50 records on page one and 5,230 matches among 14,010 known fixtures. The one-day feed returned HTTP 200 in 3.17 seconds with 50 records on page one and 322 matches among 334 known fixtures. Both feeds returned the expected ranges, pagination and private caching headers. These timings include the HTTPS request and response body transfer.

Both databases verified all 95 required migrations with zero pending before and after activation. The packaged Prisma inventories matched the prior release after normalizing line endings. Release `f9a3cba2` remains available for rollback. The ZIP SHA-256 is `04be77628a69c6456f9b9ee0c9dfc54fd74fd16f7a900c341fb48c90d54895d4`.

## Merged main and Pending Slips rollout

On 27 November 2026, staging activated `029c2e50` and production promoted the same checksummed ZIP after staging validation. Both served Next build `fBk4utQDKsGtbSZcnWvJM` and verified all 95 migrations with zero pending before and after activation. The packaged Prisma inventories matched after normalizing line endings. The prior release `a567f8e1` remains available in each environment. The deployed football and Best Slips workers already include the merged odds and featured-goal changes.

The production role check confirmed the intended administrator on the active release. HTTPS smoke checks passed for Slips, Matches, the one-day Matches API, Builder, Login, Community and the guest account boundaries. Chromium verified Pending on entry, All slips after reload, and Reset in mobile dark and desktop light on both hosts. Today had no published slips in the production default band during the checks. The prior day returned 11 slips with All and two with Pending. The production default 30-day Matches API again returned HTTP 503.

The merged checkout passed 122 focused tests, scoped lint and a production-mode build. The release ZIP SHA-256 is `fceab387556241ccd7718578a0c450d72f6b0f62eb085600b8caa4545d925237`.

## Community invitations release checks

Apply `20261126194240_community_invitations` before activating the Community invitation release. It adds nullable invitation, attempt and confirmation fields to `MemberAccount`. Verify the migration inventory and ledger and check that the staging application account can read and update these columns. Test the guest and signed-in flows with synthetic destinations and accounts. The automatic invitation requires at least one enabled, configured WhatsApp destination. Production promotion follows owner review of staging. [Community behavior](authentication.md#community-invitations), [Migration](../next-js/prisma/migrations/20261126194240_community_invitations/migration.sql).

### Community invitations staging verification

On 26 November 2026, staging activated `a567f8e1` with Next build `BtSbhJ1ircHCIp_qdWPIl`. A full encrypted staging backup passed checksum verification and matched the schema, triggers, migration ledger and table data on an isolated restore. The nullable-column migration passed on that restore before activation. Staging MariaDB verified all 95 required migrations with zero pending. The application account verified read and update access to all four new columns over TLS with zero rows changed. The prior web release `59faf6e1` remains available for rollback.

Public HTTPS smoke checks passed for Matches, staging `noindex`, the released build manifest, the Privacy disclosure, public Community settings, the private guest session response and guest denial from the account Community endpoint. Neither WhatsApp destination was configured on staging. Chromium verified the guest Group and Channel handoffs, return confirmation, and same-day suppression in phone dark and desktop light using intercepted destinations. Local Chromium and isolated MySQL covered the signed-in flow, the exact 24-hour boundary, cross-device confirmation, concurrent claims and reconciliation after actual signup and login. Lint, schema validation, the theme contract and the production-mode build passed. The broader test run was stopped after four failures reproduced on the pre-change branch.

The release ZIP SHA-256 is `822ca3755311f58e1be3399b3f1f013828c7a48c6c8e071fd463f7978d32361a`.

### Community invitations production verification

On 26 November 2026, after owner review of staging, production activated `a567f8e1` from the same checksummed ZIP and served Next build `BtSbhJ1ircHCIp_qdWPIl`. The encrypted production backup covered the complete schema and triggers, plus all member account and migration ledger rows. The isolated restore matched those backups, and `20261126194240_community_invitations` passed on the restore before production activation. Production MariaDB applied the migration and verified all 95 required migrations with zero pending. The four nullable columns matched the migration. The application role passed SELECT and a rolled-back zero-row UPDATE over verified TLS. The prior web release `59faf6e1` remains available for rollback.

Production HTTPS returned HTTP 200 for Matches, Best Slips, Builder, Login, the released build manifest, Privacy, public Community settings, the guest session and the one-day Matches API. Privacy included the Community disclosure. The public Community settings matched preflight, with both configured WhatsApp destinations enabled. The private account endpoint denied guest and cross-origin requests with HTTP 403. Chromium verified the configured Channel and Group handoffs in phone dark and desktop light, the confirmation on return, the No and Yes responses, and same-day suppression. The browser intercepted those WhatsApp requests. The default 30-day Matches API returned HTTP 503 before and after promotion.

## Users route compatibility

The current source serves the renamed directory at `/admin/users` and its collection, detail and bulk endpoints under `/api/admin/users`. Permanent redirects preserve bookmarked queries and legacy API methods and bodies. The earlier rollout below predates this rename. [Route configuration](../next-js/next.config.ts).

Local Chromium checks covered light and dark themes at desktop and phone widths, including the narrow desktop list pane. The directory fixture processed 201 selected users in three bounded requests. Isolated MySQL checks covered administrator authorization, grant retries, device logout, reset and data retention.

On 28 November 2026, staging activated `3d1e6031` and served Next build `wOFTSVP5ET04G-Sywp862`. The release ZIP SHA-256 is `d4b025017a575e80563f0fc50a5bf3dac9391323f9fd986e10bae65df402ffa8`. The migration inventory was unchanged and MariaDB verified all 95 required migrations. Seventeen staging HTTPS checks verified the build, Matches, the bounded Matches API, the guest Account session, administrator guards and cache headers, legacy redirects, bookmarked queries and the public design gallery.

After owner approval on 28 November, production activated `3d1e6031` from the same ZIP and served the same Next build. MariaDB verified all 95 required migrations with the unchanged inventory. All 17 production HTTPS checks passed, including Matches, the bounded Matches API, the guest session, administrator access and cache headers, legacy redirects, bookmarked queries and the design gallery.

## User administration staging verification

On 26 November 2026, staging activated clean commit `59faf6e1` over `1afee350`. HTTPS served Next build `EaIreorAnFdT0fwnToEpI` with noindex. MariaDB verified all 94 migrations with zero pending before and after activation. The existing schema and application grants cover this change.

Hosted smoke used synthetic accounts to verify current-admin authorization, rejection of cross-site calls, count confirmation, partial results, grant replay, blocking and unblocking, device revocation, secure password reset, personal-data erasure and eligible permanent deletion. The reset used the ownership-verification and single-use link flow, with no external message. The erased fixture lost identifying data and retained its access record. Bulk and individual deletion removed eligible fixtures and wrote unlinked operation audits. Replaying the synthetic credentials after sign-out failed. Financial and provider-retention cases were verified in isolated MySQL with populated records.

The local checks passed 85 focused tests, 18 restricted-MySQL admin tests, and seven bulk and reset integration tests. The final focused MySQL deletion run passed eight cases. The User HTML/API fixture and Playwright passed on desktop and phone in light and dark, including page-local selection, cancel, exact confirmation count and partial failures. Schema validation, lint, TypeScript, the theme contract and the production-mode build passed. The unchanged Subscribe suite has two pre-existing loading fixture failures reproduced with the baseline tests.

The release ZIP SHA-256 is `a1ff833a20cb3e427b64ec08cf3a47d809ce387bbfee0e31900686219f729ba2`.

<details>
<summary>Changed files</summary>

- `APP_OVERVIEW.md`
- `implementation-docs/authentication.md`
- `implementation-docs/deployment-and-version-control.md`
- `implementation-docs/payments.md`
- `implementation-docs/subscriptions.md`
- `next-js/docs/subscriptions.md`
- `next-js/scripts/verify-user-directory-rendering.py`
- `next-js/src/app/(owner)/admin/password-requests/page.tsx`
- `next-js/src/app/(owner)/admin/users/page.tsx`
- `next-js/src/app/api/admin/users/bulk/route.ts`
- `next-js/src/components/admin/code-tools.tsx`
- `next-js/src/components/admin/password-requests-editor.tsx`
- `next-js/src/components/admin/user-action-menu.tsx`
- `next-js/src/components/admin/user-bulk-actions.tsx`
- `next-js/src/components/admin/user-detail.tsx`
- `next-js/src/components/admin/user-directory-parts.tsx`
- `next-js/src/components/admin/user-directory.tsx`
- `next-js/src/components/admin/user-workspace.tsx`
- `next-js/src/domain/admin-audit.ts`
- `next-js/src/domain/user-actions.ts`
- `next-js/src/domain/user-directory.ts`
- `next-js/src/server/admin/audit.ts`
- `next-js/src/server/admin/codes-http.ts`
- `next-js/src/server/admin/delete-user.ts`
- `next-js/src/server/admin/user-directory.ts`
- `next-js/src/server/admin/users-http.ts`
- `next-js/src/server/admin/users.ts`
- `next-js/src/server/members/access-codes.ts`
- `next-js/src/server/members/checkout.ts`
- `next-js/src/server/members/password-recovery.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/(owner)/admin/password-requests/page.tsx`
- `next-js/tests/helpers/rendering/owner-payments/app/api/admin/users/[id]/route.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/api/admin/users/bulk/route.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/api/fixture/users/route.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/fixture.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/user-actions.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/user-directory-query.ts`
- `next-js/tests/members-admin.integration.mjs`
- `next-js/tests/page-loading-performance.test.mjs`
- `next-js/tests/user-bulk.integration.mjs`
- `next-js/tests/user-directory.test.mjs`

</details>

## User administration production verification

On 26 November 2026, production promoted `59faf6e1` from the same SHA-256-verified ZIP used on staging. HTTPS served Next build `EaIreorAnFdT0fwnToEpI` and its static build manifest. MariaDB verified all 94 migrations with zero pending before and after activation. The application’s existing permissions for the financial-retention reads were verified over TLS. The prior release `1afee350` remains available for rollback.

Read-only HTTPS smoke returned HTTP 200 for Matches, Best Slips and Builder. Guest requests for User list, selected-account and Password Requests pages redirected to login. User search, detail, bulk and password request APIs returned HTTP 401 for guests. A cross-origin bulk request returned HTTP 403. Administrative responses were private and no-store. Staging covered signed-in account changes, secure reset, erasure and eligible deletion. Isolated MySQL covered the financial and pending-checkout retention cases.

## Access-control staging verification

On 26 November 2026, staging activated `1afee350` from a clean, checksummed ZIP based on the previous staging release `67ee51c6`. HTTPS served Next build `7PguZ4HEuf3vwnGVtSAcY` with staging noindex headers. MariaDB verified all 94 migrations with zero pending before and after activation. This change uses the existing schema.

Paid Access stayed Off with a two-day trial setting. Guest Matches and Best Slips responses returned the free tier. Direct Builder requests showed login, while protected probability sorting and slip match-state requests returned HTTP 403. A new synthetic member with no access period received full Matches and Best Slips access and a server Builder result. Logout cleared the cookie, and replaying the previous cookie across the session API, Matches and Builder restored guest access. Both feeds sent private, no-store and Vary: Cookie headers. Staging had no populated fixture and slip payloads for comparison.

Local verification used populated MySQL fixtures in both Paid Access modes for trial, admin grant and wallet subscription boundaries, entitlement changes, and direct API access. The focused candidate suite passed 135 tests, with another 33 Match Card and completion tests after the phone card fix. The development rendering fixture passed 1,069 HTML, Flight and API checks across 13 viewer states. Chromium checks covered desktop and phone in both themes. The production-mode package build, lint, type checks and theme contract passed. A broader member suite still reports an existing managed-support assertion failure.

The release ZIP SHA-256 is `498005ee1864858bc6e82d586455fc6e7173201cf0ffdef4ec8a78fc231f70ac`.

## Access-control production verification

On 26 November 2026, production activated `1afee350` from the same staging ZIP and served Next build `7PguZ4HEuf3vwnGVtSAcY`. Production MariaDB verified all 94 migrations with zero pending before and after activation. The prior compatible release, `67ee51c6`, remains available for rollback. The production settings showed Paid Access Off with seven configured trial days.

Read-only HTTPS smoke checks returned HTTP 200 for Matches, Best Slips, Builder and the guest session API. The protected probability sort and slip match-state requests returned HTTP 403, and the admin settings API returned HTTP 401 for guests. All 10 sampled unfinished Matches withheld forecast fields. Best Slips returned 5 completed slips and 6 unfinished previews with protected picks withheld. The same completed Match retained its score and published forecast, and the completed-feed page rendered public cards. Direct Builder opened its login action with no generated result. Access-sensitive responses used no-store headers and the feeds varied on Cookie. Production smoke used guest requests. Staging covered signed-in access and logout.

## Manual password recovery prerequisites

Apply `20261126123000_manual_member_password_recovery` and verify the application account can read and write `MemberPasswordResetRequest` before activating the release. Apply the table grant for accounts with table-scoped privileges. Confirm the environment has a working public support contact configuration. Smoke-test the manual request, admin queue, link, and session revocation with a synthetic account. The administrator sends any external message from their own device. An updated Flutter host is required for the in-app browser to hand SMS and WhatsApp draft links to native apps. [Recovery workflow](authentication.md) · [Database grants](../next-js/docs/deployment/manual-account-grants.sql).

## Password recovery staging verification

On 26 November 2026, staging activated `8d2e3204` from a clean, checksummed ZIP, retaining the Matches changes from the previous release. An encrypted staging backup restored successfully in an isolated database. Its schema, triggers, migration ledger and table data matched the source. The recovery migration passed in the restore and was then applied on staging. MariaDB verified all 94 required migrations with zero pending. The staging app account's existing database grants cover the new table. The previous compatible web release is `12b13b9a`.

Hosted smoke checks covered the Matches page and default feed, private reset-page headers, guest denial from the admin API, the pending count, duplicate requests, ownership confirmation, link expiry and retrieval, manual declaration, replacement, repeated opens, completion and revocation of both old sessions. A synthetic member logged in with the new password. The smoke run sent no external messages.

Local verification passed 126 focused tests, isolated MySQL concurrency and exact-expiry checks, member and admin Chrome flows in both themes, and 29 Flutter tests including simulated native handoffs. The repository-wide test command reproduced unrelated baseline failures and one timeout that passed on rerun. The script suite flagged an unchanged historical November replay trigger. The production-mode web build passed.

The release ZIP SHA-256 is `79717c6e01b0a634cd25e9b4c1a0269ea90457c1f1dc5f46bc7e4f11caf5e4e5`.

## Password recovery production verification

On 26 November 2026, after the owner reviewed staging, production activated `8d2e3204` from the same ZIP. The encrypted production backup covered the schema and triggers plus data from the migration ledger, member accounts, member sessions and verification codes. An isolated restore matched the production inventory and the backed-up data. The new recovery table migration also passed on that restore before production activation.

MariaDB verified all 94 migrations with zero pending in production. The production app account accessed `MemberPasswordResetRequest` over verified TLS. The table has the expected indexes and its foreign key to `MemberAccount`. The previous compatible web release is `12b13b9a`.

Production HTTPS served the expected build. Login, the reset page, the guest session API, Matches and the one-day Matches API returned HTTP 200. The reset page sent `no-store`, `noindex` and `no-referrer`. Guests were redirected to Login from the admin queue and received HTTP 401 from its API. Chrome verified opening and cancelling the request dialog on desktop light, and the missing-link message and new-request dialog on mobile dark. These production browser checks were read-only. A synthetic account exercised the full password-reset journey on staging. The default 30-day Matches API returned HTTP 503 both before and after promotion.

## Mobile account logout staging verification

On 26 November 2026, staging activated `ef1b3663` from a clean, checksummed ZIP. MariaDB verified all 94 migrations before activation. Chrome fixture tests covered member and administrator logout in light and dark themes, ordinary and failing native alert bridges, network retry, old-token rejection and the native HTTP redirect fallback with JavaScript disabled. The 115 focused tests, type checking, lint for changed files and the production-mode build passed.

Hosted HTTPS smoke checks confirmed the new build on Login and Matches. A synthetic account used the visible mobile Chrome menu with a throwing native alert bridge. One logout POST returned HTTP 200, the browser reached Matches and displayed the guest header, and the old cookie no longer resolved to an account.

The release ZIP SHA-256 is `a65829796fd29c05d90d33f73a4d70173cfd5c7f8183e5e3f985e0ab4917c940`.

## Mobile account logout production verification

After owner approval on 26 November 2026, production activated `ef1b3663` from the same staging ZIP. The two releases share the same migration inventory. The production MariaDB ledger verified all 94 migrations with zero pending before and after activation. The previous compatible web release is `8d2e3204`.

Production HTTPS served the expected build. Login, Matches, the guest session endpoint, the password reset page and the one-day Matches feed returned HTTP 200. The reset page kept its privacy headers. Read-only touch Chrome checks showed the guest header in light and dark. The signed-in logout and old-cookie revocation were verified with a synthetic account on staging.

## Mobile logout form staging verification

The reported mobile Chrome error appeared while the earlier account menu remained open. Staging recorded HTTP 200 for both logout requests in the reported time window. The browser-side error was unavailable. The updated flow closes the menu on submit and uses the server's form redirect after revoking the session.

On 26 November 2026, staging activated `e43ec537` from a clean, checksummed ZIP based on the active Matches and Slips release `4de9046f`. MariaDB verified all 94 migrations with zero pending. Login, Matches, Best Slips and the guest session endpoint returned HTTP 200 with `noindex`. The pages served build `-uCqH9D4_dXyawOfxyJ-I`. The previous compatible staging release is `4de9046f`. The performance cards rollout preflight subsequently found `e43ec537` active in both environments.

On hosted staging, touch Chrome without a native bridge closed the header menu while the synthetic account's single form POST was held. The server then returned HTTP 303. Matches opened with the guest Login control and the old session cookie resolved to an anonymous session.

The combined release passed 144 focused tests, type checking, lint for the changed files and a production-mode build. All 19 isolated browser journey checks passed, including menu closure before the held response, rejection of the old session, another tab updating to the signed-out state and the restricted Back to Login redirect. Focused touch Chrome checks covered both themes and failing or stalled native alert cleanup.

The release ZIP SHA-256 is `65f52770599f9cb59c30d068d3bd024fca8e335ac813fbbc8035689df6c33eaf`.

## Mobile logout form production verification

On 26 November 2026, the owner confirmed on the affected phone that logout closed the menu and returned to Matches as a guest. Production then activated `e43ec537` directly from the same verified staging ZIP. The migration inventory matched the previous release and MariaDB verified all 94 migrations with zero pending. The previous compatible web release is `4de9046f`.

Production HTTPS served the expected build on Matches, Login, Best Slips and the password reset page. The reset page kept `noindex`, `no-store` and `no-referrer`. The guest session and one-day Matches feed returned HTTP 200. A guest logout form POST returned HTTP 303 to Matches with expired session cookies. Signed-in mobile logout and old-session revocation were verified on staging.

## Connection recovery staging verification

On 26 November 2026, staging activated `67ee51c6` (`zGp9X5QC6Y-hmunxB3tW2`) after verifying the release ZIP and all 94 migrations. The migration inventory matches the previous compatible release, `1d97a0c7`. Matches, Login, Best Slips, the guest session, the connection page and its worker and V2 manifest returned HTTP 200. The staging pages retained `noindex`.

Hosted touch Chrome verified all 27 cached entry and asset digests in light and dark. Opening filtered Matches offline showed the connection message. Restoring connectivity and selecting **Try again** reopened the live page with the full original query. The worker made no fixture snapshot or write request. A separate signed-in test showed **Login** while the single logout POST was held. The server returned HTTP 303 to Matches and rejected the old synthetic session cookie.

Local verification passed 164 focused web tests, six proxy checks, 19 Chrome authentication journey checks and 94 Flutter unit tests. Browser checks covered slow and stalled requests, exact-URL retry, guest header during logout, and the connection page at phone and desktop widths in both themes. Type checking, lint for changed files and the production-mode build passed. The updated native multi-process WebView scenarios require separate device or installed-host execution.

The ZIP SHA-256 is `29df4039f8f4bf36c0f942df2d09a4031d9a251f59ab7a85eddd48fa68327177`.

## Connection recovery production verification

On 26 November 2026, the owner confirmed the connection message, retry and logout on staging. Production activated `67ee51c6` directly from the same verified ZIP. The migration inventory matched `1d97a0c7`, which remains the previous compatible release. MariaDB verified all 94 migrations with zero pending.

Production HTTPS served the expected build on Matches, Login, Best Slips, password reset and the connection page. The guest session and one-day Matches feed returned HTTP 200. The connection page, worker and V2 manifest matched staging. A guest logout form POST returned HTTP 303 to Matches with expired session cookies. Signed-in mobile logout and old-session revocation were verified on staging.

Production touch Chrome verified all 27 cached entry and asset digests in a fresh dark-theme guest profile. Filtered Matches showed the connection message offline. After reconnecting, **Try again** reopened the live page at the exact original URL. The worker made no fixture snapshot request and cached no API data.

## Authentication rollout

On 26 November 2026, staging and production activated `acb7ce34` from the same checksummed ZIP. Both MariaDB databases verified all 93 migrations with zero pending. Production's previous compatible release, `a1e61cde`, is available for rollback.

Staging Chrome checks verified signup cancellation and confirmation, duplicate signup handling, session persistence after a browser restart, signed-in password confirmation and rotation, logout, and denial of revoked sessions. The Matches page returned HTTP 200 with `noindex`. Its feed and the guest session endpoint returned HTTP 200. The configured staging administrator was provisioned from its private profile and verified through shared login and logout. Two synthetic staging accounts were used across the smoke runs. Desktop light and mobile dark fixture checks, focused authentication tests, MySQL selected-session revocation tests, lint, and typecheck passed locally.

The production verification found the configured default administrator in the active private profile and database. One existing active administrator session matched the configured credential version. This read-only check preserved existing sessions. Guests received a login redirect from Admin and HTTP 401 from its settings API.

Production verified signup confirmation and cancellation using one reserved synthetic account. The server recorded HTTP 200 for signup and the subsequent Matches navigation after the initial browser wait failed. The same account verified duplicate-number feedback, session persistence after Chrome reopened, password confirmation, a one-character password change and login, and rejection of revoked sessions. The synthetic account remains signed out with its sessions revoked. Matches, Best Slips, the guest session endpoint, and the one-day Matches feed returned HTTP 200. The default Matches feed returned HTTP 503 both before and after promotion.

The release ZIP SHA-256 is `8bd4d0400aa3da369ea67b9bfcae4d6604a28783e360f9f0ba1c29b2b12c7dbc`.

## Default Matches API staging verification

On 26 November 2026, the default 30-day API hit the application deadline in production, while the one-day request succeeded. Comparing opaque fixture IDs under different collations prevented efficient historical exclusion. The fix uses byte comparisons and avoids replay reads for fixtures without matching pointers. A populated MySQL test reduced the 30-day exact count from 138.3 seconds to 258–438 milliseconds, returning 2,033 matches. A staging MariaDB check with 14,173 temporary fixture IDs reduced combined historical membership from over 10 seconds to 36 milliseconds. A smaller MariaDB check verified equal counts for the old and new queries.

The checksummed `21068d1b` ZIP ran in a private staging instance with `ghprod_test`, which verified all 93 migrations. Two requests each to the default and one-day feeds returned HTTP 200 with the expected 30-day and one-day bounds, 50 per page, and private caching headers. The first requests took 246 and 35 milliseconds. Both responses reported no fixtures and unavailable coverage in the staging database. The public staging slot served the separate Match Details release `816ffbbc` during these checks.

The candidate ZIP SHA-256 is `1e36e69dddcb02ea54e24055fa367a7f7352b85e64c3af314d12bc6da56ebb18`.

The combined release `12b13b9` applies the verified feed changes to `816ffbbc` with the desktop Match Details source intact. Shared staging activated the combined ZIP and verified all 93 migrations. Public HTTPS checks returned HTTP 200 for the 30-day feed from 28 October to 26 November in 2,003 milliseconds, and the one-day feed for 26 November in 1,731 milliseconds. The responses had the expected page size and private caching headers. The staging cohort was empty with unavailable coverage. The Matches page returned HTTP 200 with `noindex`. Feed, Match Details, and MySQL integration checks passed, along with lint, typecheck, and the build.

The combined ZIP SHA-256 is `b0e0025f699077cd79562f8a028e587ff3339d268ca0abf834595c376d41be9e`.

After owner approval, production activated the same combined ZIP with all 93 migrations verified and zero pending. The served Matches page contained the candidate's build identifier. The one-day production feed returned HTTP 200 in 6.38 seconds, with 50 records on page one and 122 matches among 143 known fixtures. The bare 30-day request returned application HTTP 503 after 31.46 seconds with `Retry-After: 5` and no feed payload. [Follow-up rollout](#default-matches-api-rollout).

A bounded diagnostic request also returned HTTP 503 after 32.43 seconds. Read-only database sampling found 13 replay projection statements on the connection that matched the timing. A replay read was still active at 31.22 seconds, and the optimized count and page statements were absent from the sample. These observations point to the replay work before counting. The sampling had no request identifier.

Desktop browser checks on a populated fixture verified the two independently scrolling Match Details panes in light and dark. The checks also covered Markets & Odds, Match Statistics, Back navigation and a direct Pick History link. [Production fixture used for verification](https://goalhint.com/en/matches/fd15442b-526e-8c2e-bf40-ae9c6e7ff4d6/gent-vs-fk-crvena-zvezda).

## Matches and Slips staging verification

On 26 November 2026, the checksummed `8867ad87` release ran in a private staging instance against `ghprod_test`. The staging activation guard detected the public slot's switch to the separate mobile logout release `ef1b3663` during upload. The private instance used the existing staging profile and verified all 94 required MariaDB migrations. The Matches, Slips and Builder pages returned HTTP 200 with `noindex`. The one-day Matches feed, Slips API and guest session endpoint returned HTTP 200 with JSON responses.

Local Chromium checks verified the responsive controls in both themes, the desktop live clock, and share retry and PNG export. Chromium also verified date selection on private staging in dark mode at mobile and desktop widths. The staging profile lacks public odds approval and its archive offered no shareable slips during verification. Isolated fixtures supplied valid odds and published slips for the Builder and sharing checks. Production activated the mobile logout revision while this candidate was under review, so the combined release includes that revision before its own promotion.

The private candidate ZIP SHA-256 is `246c705750b806b093d4345a6b77e97a1f750905d0541eefdc662e55a1e4daaa`.

Public staging activated the combined release `4de9046f`, which includes the production mobile logout revision. The host verified all 94 required migrations before and after activation. Matches, Slips and Builder returned HTTP 200 with `noindex`. The one-day Matches feed, Slips API and guest session endpoint returned HTTP 200 with JSON. Chromium verified that applying a date updates the Slips calendar numeral and archive URL at 390px and 1440px in dark mode. The combined build, lint and focused account and sharing tests passed.

The public staging release ZIP SHA-256 is `10918c1b83d1ef3cfd6f198b6892d91c6b235a861cb4977ec4b1b073b081c697`.

## Matches and Slips production verification

On 26 November 2026, after owner approval, production activated `4de9046f` from the same checksummed ZIP used on staging. The active build metadata matched across the two environments. Production verified all 94 required MariaDB migrations before and after activation. The previous compatible release `ef1b3663` is retained for rollback.

The public Matches page served the expected build identifier. Matches, Slips and Builder returned HTTP 200, as did the one-day Matches feed, the Slips API and the guest session endpoint. A bounded Builder request returned HTTP 200 and displayed one generated slip.

Production Chromium checks covered both pages at 390px and 1440px in light and dark mode. The date controls, filter labels, performance cards and Matches search placement passed. The browser opened and dismissed the calendar and filter dialogs in light mobile and dark desktop layouts.

Sharing a completed public slip returned HTTP 200 from the production share endpoint. The browser decoded the generated 1080px PNG preview and enabled Download image and Share.

## Performance cards rollout

On 26 November 2026, staging and production activated `1d97a0c7` from the same checksummed ZIP. The earlier layout package `53d846ca` passed isolated staging while the mobile logout follow-up was rolling out. The promoted package includes the already active logout revision `e43ec537`, which remains available for rollback. Both hosts verified all 94 required MariaDB migrations before and after activation.

Both environments served the new build. Matches rendered performance, date controls and search in that order. Slips rendered performance followed by the date controls. Those pages, Builder, the one-day Matches feed, the Slips API and the guest session endpoint returned HTTP 200 in both environments. Staging retained `noindex`.

Sixteen Chromium layout cases passed at 320px, 390px, 768px and 1440px on both pages in both themes. Mobile and desktop keyboard checks passed for control order and dialog focus restoration. Targeted lint, the release build and 101 focused tests passed.

The release ZIP SHA-256 is `d4e210a36379b26eb929ddd47faf1e7d0e2b5c184ba238a2bc0d750309ac415d`.

## Verification limits

The rollout entries record the build, environment and checks observed for each release. Use the checked-in scripts to establish the current deployment workflow, and verify the active receipt, migration ledger, worker launcher and applicable runtime settings for a new promotion. Staging fixture supply and provider approvals can differ from production. [Deploy client](../next-js/scripts/deploy-hosted.py), [VPS receiver](../next-js/scripts/receive-hosted.py), [release and worker runbooks](../next-js/docs/deployment/how-to-deploy.md).

## Best Slips selection staging release

On 27 November 2026, staging activated `0b7d1f7d` and served Next build `6Z5klNMZIB555yj-7hM9C`. The release ZIP SHA-256 is `f590e1745d223e80e811ae146c6efd4b087b261b0ea9432d02caf0f111f7ea7f`. The migration inventory was identical and the host verified all 95 required migrations. The exact previous staging ZIP from `db2f8ea5` was preserved and its immutable files matched the prior hosted receipt.

Matches, Best Slips and Builder returned HTTP 200 with `noindex`. The Matches and guest session APIs returned HTTP 200. All six Best Slips band queries returned HTTP 200 with the existing staging `odds-unavailable` status. The corresponding staging-private publisher passed 213 focused tests. Its read-only preflight verified the staging database and exercised the closed odds gate. Eligible publication was exercised on isolated MySQL and in the replay, because staging had no operational fixtures or public odds approval. [Baseline and replay](../next-js/docs/reports/best-slips-canonical-selection-2026-11-27.md).

This release was the initial staging trial with a 30-minute span maximum. If a cutoff worker starts sealing `local-featured-pre-match-v6`, use a rollback web release that accepts both v5 and v6 sealed decisions. The v5-only reader predates that format.

## 15-minute Best Slips staging release

On 27 November 2026, staging activated `ddc66aa7` and served Next build `EBs1EuMV0yd8U5PnNwNWm`. Its ZIP has SHA-256 `9ad229a676d94ccad20ba20622507e8257d8fab11258ee9cf0467f7fd56dae13`. The migration inventory was identical and the host verified all 95 required migrations. The exact prior staging ZIP from `0b7d1f7d` was preserved for rollback. Production release `db2f8ea5` was verified by a read-only check at that time. The later carryover release included the 15-minute policy in production.

Matches, Best Slips and Builder returned HTTP 200 with `noindex`. The Matches and guest session APIs returned HTTP 200, as did all six Best Slips band queries. The matching private staging publisher passed 220 tests. Its read-only preflight confirmed the closed odds gate, with zero operational fixtures and zero append batches. Eligible publication was verified against isolated MySQL. The stored-cohort replay selected three simulated slips at 0-, 30- and 60-minute spans. [Selection replay and validation](../next-js/docs/reports/best-slips-canonical-selection-2026-11-27.md#15-minute-widening-replay).

## Distant carryover staging release

On 27 November 2026, staging activated `68436794` and served Next build `MeeJr6HnIAsb94iXb0AHW`. Its ZIP has SHA-256 `0cc9c6265de4ae49ba3fbab25e20d7613f03925f706c7aeab02730ea7c15e714`. The host verified all 95 required migrations. The exact `ddc66aa7` staging ZIP is available for rollback.

Matches, Best Slips and Builder returned HTTP 200 with `noindex`. The Matches and guest session APIs and all six Best Slips band queries returned HTTP 200. The matching private staging publisher passed 227 tests, including the same-band upcoming comparison regressions. Its read-only preflight found zero operational fixtures and append batches and confirmed the closed staging odds gate. [Carryover replay and verification](../next-js/docs/reports/best-slips-canonical-selection-2026-11-27.md#distant-carryover-comparison).

## Distant carryover production release

After owner approval on 27 November 2026, production activated `68436794` from the same checksummed staging ZIP and served Next build `MeeJr6HnIAsb94iXb0AHW`. Its migration ledger verified all 95 required migrations. The previous production web ZIP `db2f8ea5` and publisher release `32613d5f` were retained for rollback. The football cutoff writer on `c84cb0a8` still seals v5 decisions, which both web builds read.

At 17:29 Kampala time, the dedicated production Best Slips publisher switched to the matching `68436794` source under its existing lock. The launcher wrapper, football scheduler, half-hour cadence and paired refresh gate checksums matched their pre-promotion values. The 17:30 refresh succeeded. The publisher evaluated 58 fixtures and 187 exact offers, then sealed two slips in the 2.50–5.00 odds band. Their kickoff spans were 15 and 30 minutes. The five other bands yielded zero eligible alternatives in this slot. The result recorded bounded search.

The production app, Matches and session APIs, and all six Best Slips band queries returned HTTP 200 in the completed smoke checks. Initial band probes returned intermittent HTTP 503s and passed on retry. A read-only comparison preserved the fingerprints of all pre-promotion rows across the five publication tables, including 121 sealed slips. The first slot added one append batch, two slips and 15 distinct fixture legs. [Publication and archive verification](../next-js/docs/reports/best-slips-canonical-selection-2026-11-27.md#production-promotion).

## UI performance and connection recovery release

On 27 November 2026, staging and production activated commit 88ea84ce and Next build pK0Pu4HCNXFOn9cIe1tes from the same checksummed ZIP. The migration ledger verified all 95 required migrations in both environments. Staging passed 15 HTTPS checks before promotion and production passed nine core checks. The existing default 30-day production Matches API still returned HTTP 503 in the follow-up probe. [Benchmark and release verification](../next-js/docs/reports/ui-performance-2026-11-27.md).
