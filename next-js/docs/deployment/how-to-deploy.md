# How to deploy

Use [VPS staging and release promotion](#vps-staging-and-release-promotion)
for current deployments. The shared-host setup, update, settings and
troubleshooting commands record the former hosting procedure.

## Former shared host

| | |
| --- | --- |
| Site | `https://goalhint.com` (before DNS: `http://goalhint.com.hosspi.com/en`) |
| SSH | `hossuney@66.29.132.57:21098`, key `~/.ssh/goalhint_deploy` |
| App | `~/goal-hint` → active release in `~/goal-hint-releases/` (last 3 kept) |
| Secrets | `~/goal-hint-private/` (`.env.production.local`, `.goal-hint/owner-approvals.json`) |
| Database | MariaDB 11.4.13, `localhost:3306/hossuney_goalhint_db` |

> **Production database is enabled.** The 14 October 2026 audit confirmed required
> TLS, configured analytics credentials and completed migration history. This
> host uses MariaDB, while the committed Prisma migrations target MySQL. Review
> each pending migration for MariaDB compatibility and verify the actual schema
> before applying it; do not replay the entire migration history.

## One-time setup

1. Install the pinned Node.js and the dependencies. Run this and every later command
   from the Next.js application root (`next-js/`):
   ```powershell
   fnm install 24.18.1
   fnm exec --using=24.18.1 npm.cmd ci
   ```
   You also need Python 3.10+.
2. On a new computer only, create a deploy key:
   `ssh-keygen -t ed25519 -f $HOME\.ssh\goalhint_deploy` (press Enter twice for no
   passphrase). Then in cPanel → **SSH Access → Manage SSH Keys**:
   - **Import Key** and paste the `.pub` text as the public key;
   - **Manage → Authorize**.
3. DNS: Namecheap → **Domain List → goalhint.com → Nameservers → Namecheap Web Hosting
   DNS**. Once it resolves to `66.29.132.57`, run cPanel → **SSL/TLS Status → Run
   AutoSSL**.

## Update and deploy

Commit first, then from the Next.js application root (`next-js/`):

```powershell
python scripts/deploy-cpanel.py --build
```

This rebuilds `../deploy/goal-hint-nextjs-1.0.0.zip`, uploads it with a checksum check,
activates the new release, restarts the app and checks that the site returns HTTP 200.

The package removes Windows codecs and records the hosted badge codec.
Before activation, deployment verifies WebP conversion with the host's installed
GraphicsMagick (`/usr/bin/gm`) or ImageMagick (`/usr/bin/convert`). Badge responses
use Next.js route caching with seven-day revalidation. Local Windows tooling uses
the pinned Sharp dependency.
A failed codec check leaves the active release untouched; earlier releases remain
eligible for rollback.

| `python scripts/deploy-cpanel.py …` | Does |
| --- | --- |
| *(no option)* | Deploys the existing zip |
| `--status` / `--logs 200` | Shows the active release and log tail / the last 200 log lines |
| `--restart` | Re-applies `~/goal-hint-private/` and restarts |
| `--rollback` | Switches back to the previously active release |

## Settings (over SSH)

```powershell
python scripts/deploy-cpanel.py --config-pull   # server → ../deploy/.private/nextjs/.env.production.local, ../deploy/.private/nextjs/.goal-hint/owner-approvals.json
# edit those git-ignored files locally
python scripts/deploy-cpanel.py --config-push   # checks them, uploads them, restarts
```

- `--config-push` refuses to upload known mistakes: missing or invalid database
  settings, unknown names, and approval references that don't match.
- Copies under `~/goal-hint/standalone/` are replaced on every deploy and restart.
- In **Setup Node.js App → Environment variables**, keep only
  `GOAL_HINT_DEPLOYMENT_ENVIRONMENT=production`. Anything set there overrides the
  settings file, and it is written into the web root's `.htaccess`.
- Any `NEXT_PUBLIC_*` setting, or a `GOAL_HINT_*` name not in `.env.example`, makes
  every page return 500. Never set `PORT`, `HOSTNAME` or `DEBUG`.

## Database updates on MariaDB

The application already connects to production. Its private configuration and
approval register are copied into every release. Keep existing values unless
changing a reviewed deployment setting; deploying a web bundle does not migrate
the database.

Use a separate schema-scoped migration account for DDL and keep its credentials
out of the application environment. The audit found that the existing application
account has database-level `ALL PRIVILEGES`, broader than the documented DML-only
role. Review and test narrower grants separately, including privileges needed by
trigger definers, before changing them. Do not delete a trigger-definer account
while its triggers remain in use.

For each schema change:

1. Confirm `SELECT VERSION(), DATABASE(), CURRENT_USER()` identifies the intended
   target and role. Inspect `_prisma_migrations`: completed records have
   `finished_at` set and `rolled_back_at` unset. Compare original SQL checksums,
   allowing only verified line-ending differences. Investigate unfinished records
   before executing more DDL.
2. Pause writers for changes that rebuild or lock tables. Review migration
   compatibility and coordinate any required recovery verification with the
   independent backup operator outside the VPS.
3. Review only the pending migration. MariaDB uses `DROP CONSTRAINT` where MySQL
   uses `DROP CHECK`. Reviewed scripts in `prisma/mariadb/` cover the goal-market
   extension, eight-date manifest and analytics migrations, and the append-only
   trigger repair (`20261019174619`). Preserve applied SQL
   and checksums; create a new migration for corrections. Check for partially
   created objects before using an overlay.
4. Apply the reviewed SQL with the migration role. Record the original migration's
   checksum in `_prisma_migrations` only after all statements and verification
   succeed. The extension and manifest overlays cannot be replayed blindly;
   analytics `CREATE TABLE IF NOT EXISTS` does not validate existing tables.
5. Verify columns, indexes, foreign keys, check clauses and enforcement, trigger
   definitions and storage engines. All application tables must use InnoDB;
   explicitly specify it when creating tables because this host's default can be
   MyISAM. `db:verify` checks representable Prisma schema drift; `db:status` checks
   migration history. Custom checks/triggers need separate inspection.
   `db:health` checks connectivity.
6. Deploy the compatible app, resume writers and verify `/api/matches` returns 200.
   For analytics changes, check `/analytics`, sign-in, authenticated reports, live
   data and CSV export over HTTPS. The deploy script's root-page check alone is
   insufficient.

For `20261120150000_recovered_pre_match_odds`, apply the canonical InnoDB
migration before switching the app or worker. In each target database give
the web role `SELECT` on `RecoveredPreMatchOddsSnapshot`. Give the worker role
`SELECT, INSERT` on the same table. When one role runs both, apply the worker
grant once. Verify the table checks and role grants before activating the
release. The released web reads historical quotes even when provider import
jobs are disabled in staging. [Odds grants](../provider-odds.md#application-grants)

Ensure `20261120160000_november_replay` and `20261121120000_featured_replay_projection`
are applied before starting the revised web release on either target. The web role needs `SELECT` on `NovemberReplayProjection`
and its existing fixture, cycle, lifecycle state, and publication barrier
reads. Use a separate operator connection for replay writes. That role needs
`SELECT, INSERT` on `NovemberReplayRevision` and `NovemberReplayAction`,
`SELECT` on `NovemberReplayProjection`, `INSERT (fixtureId, changedAt)` on
the projection, and `UPDATE (revisionId, sourceRevisionId, cycleId,
scheduleVersion, kickoffAt, evidenceCutoffAt, activationOperationId, changedAt,
integrity, body)` on the projection. It also needs the established
read access to fixture identities, audit, schedule, publication and result
evidence. The replay roles need `SELECT` on `OddsImportBatch` and
`ProviderOddsSnapshot` for price and observation proof. Use the target's
approved odds rights reference in each private replay profile. The migration
account's cache trigger needs to retain access to
`PublicCacheTag` and `PublicCacheInvalidation`. Verify the three tables and
trigger definers after migration. The featured replay migration keeps existing
projections and changes only the revision and projection check constraints.
The restricted MariaDB pointer lock uses the grants above.

Apply `20261122170000_frozen_local_featured` before switching the web or
worker release. The migration adds a nullable decision and its integrity
seal to the append-only `PredictionCycleOperation` table. Verify the named
check and the existing append-only grants. The web and worker roles need
`SELECT` on both added columns. The worker needs `INSERT` on them and the
existing reads of sealed odds snapshots, import receipts and forecast revisions.
Older releases can continue reading the unchanged cutoff operation payload.

### Hosted November replay

1. Start on staging. Use the matching verified database profile and Matches
   competition scope. Keep a separate root-only workspace for each target,
   outside the web root. You can run the replay command privately from a
   prepared worker release with the verified source and dependencies. Scheduled
   services continue on their active releases. Pass the exact environment flag,
   `--environment staging` or `--environment production`, and the target's
   `--workspace` on every command.
2. Run `audit` and `dry-run` with a SELECT-only connection. Resume a bounded
   `dry-run --pages <count>` in the same sealed workspace until it reports
   completion. Both commands work from stored evidence.
3. With the staging operator connection, run `stage` and review the sealed
   `activation-diff.json` for standard picks, priced fallbacks, forecast-only
   picks, suppressions and expected prior projection IDs. For the three-tier
   policy, use a full dry run in a fresh workspace. Record the original publication IDs, prices, settlements and
   performance before `activate`. Use a stable `--operation-id` for staging.
   Verify the revised display in Matches, the exact-outcome filter and Match
   Details. Compare the original revision history, prices, settlements and
   published performance with the recorded values. Run `rollback` with the
   same staging operation ID and verify the prior projection or original display returns.
4. Once staging passes and production replay is authorized, repeat the audit
   and dry run independently on production. Run `stage` with its operator
   connection and review its own diff before `activate`. Repeat the public and
   original publication checks. Use a stable production operation ID and reuse
   it with the same workspace for any `rollback`.
   [Replay commands and evidence](../november-forecast-replay.md)

For a featured ranking change over the same forecasts, keep the previous
activation and its sealed audit files intact. The delta rehearsal writes
separate receipts alongside the reviewed baseline and stages only verified
display changes, with the expected active pointer recorded for each fixture.
Confirm staging activation and rollback
before preparing the production delta. Reuse the existing approvals,
publication lock and quota-bounded worker. A policy-only release keeps the
existing migration ledger when schema verification reports it current.

On 14 October 2026, a private backup was taken before the corrective migration
`20261014161000_transactional_storage` converted the seven analytics tables and
`OperationsMonitorState` from MyISAM to InnoDB. Prisma's history table was converted
as separate maintenance. The associated verification at the time found all 81
tables on InnoDB and 26 completed migrations.

If a migration fails, stop further attempts and retain its history and diagnostics.
MariaDB DDL can commit individual statements, so inspect what actually changed
before preparing a forward repair. The runner records an overlay attempt in its
private migration lock before executing DDL. If the ledger cannot confirm
completion, the marker blocks subsequent deployments. Once the actual schema
and ledger have been reconciled, run the same `deploy-mariadb.py` command with
`--resolve-overlay <migration-name>` to clear that exact marker without
executing migrations. Then verify status before resuming the release. Code
recovery keeps database schema and records. Coordinate any database recovery
with the independent backup operator and account for writes since the failure.

Retain enabled database access, direct connection mode, bounded pool size, verified
TLS and matching access/budget approvals. Use `.env.example` and the
[database runbook](../database.md) for setting names. Preserve the configured
analytics secret, username and password hash; changing the secret changes visitor
keys. See [analytics setup](../analytics.md).

**Content:** the separate worker deployment now runs on the hosting account. Its
five-minute cron holds a file lock and runs the live worker for at most 270
seconds, allowing shared hosting to reclaim the process between invocations.
Database leases, approved provider limits and existing job idempotency remain
authoritative. This avoids dependence on a local computer or an SSH tunnel.

After worker code changes, prepare the git-ignored worker environment and existing
owner register, then run:

```powershell
python scripts/deploy-worker-cpanel.py --env-file ../deploy/.private/nextjs/.env.worker.production.local --approvals ../deploy/.private/nextjs/.goal-hint/worker-owner-approvals.json
```

Worker credentials live in `~/goal-hint-worker/private/`, outside the web bundle.
The worker source is in versioned releases under `~/goal-hint-worker/releases/`;
`current` selects the active one. Read sanitized events in
`~/goal-hint-worker/logs/worker.log`. Its cron is tagged `# goalhint-worker`; the
installer preserves unrelated entries and stores the original crontab in
`~/goal-hint-worker/crontab.before`. To stop the worker schedule, remove only its
tagged entry, then let the bounded invocation finish. Keep the prior release for
rollback; do not reset job, forecast or quota data.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Site times out | DNS isn't pointed yet (one-time setup, step 3) |
| LiteSpeed "404 Not Found" page | `~/goalhint.com/.htaccess` was deleted. Run `python scripts/deploy-cpanel.py --repair`, and don't delete files in `~/goalhint.com` |
| Every page returns 500 | Run `--logs`: `RuntimePolicyError` names the bad setting |
| `/api/*` returns 503 (not logged) | Check the approval references, password encoding, `GOAL_HINT_COMPETITION_IDS`, that `DEBUG` is unset, and `db:status` |
| `Permission denied (publickey)` | The key isn't authorized in cPanel |
| Release is broken | Run `--rollback` |


## VPS staging and release promotion

For Best Slips, promote the web archive reader and its migration through the
same staging checks as other web releases. The supervised slip publisher uses
the matching source release, its own database grants, and a private reviewed
model binding. See [daily slip publications](../daily-slip-publications.md) for
its activation prerequisites and status checks.

The Ubuntu VPS at `server2.goalhint.com` (`104.207.86.22`) serves both hosted
sites through Apache and Passenger with the pinned Node.js version. Connect on
SSH port `21098` as `ghprod`, with the operator key in the SSH agent and the
verified host key in `~/.ssh/goalhint_hypernova_known_hosts`.

| Branch | URL | Active application path | Private settings | Persistent database |
| --- | --- | --- | --- | --- |
| `development` | Localhost | `next-js/` in the local checkout | `.env.development` | Designated local development database |
| `staging` | `https://test.goalhint.com` | `~/goal-hint-test` | `~/goal-hint-test-private/.env.test` | `ghprod_test` |
| `production` | `https://goalhint.com` | `~/goal-hint` | `~/goal-hint-private/.env.production` | `ghprod_prod` |

Each hosted environment has its own approval register and MariaDB migration
credentials. Application and migration accounts use verified TLS on loopback.
The Flutter app is a separate build of the web host shell. A web deployment
updates the website used by installed Flutter clients. Publish a new Flutter
binary through the native release process when the shell itself changes.

1. Work on `development`, run the applicable tests, and push the approved
   commit to GitHub. Build it locally from `next-js/` with the pinned Node.js
   and npm versions. The package contains the standalone runtime dependencies.

   ```sh
   npm run package:cpanel -- --commit <full-sha>
   ```

   When the application, dependencies and build inputs match the prior archive,
   `--reuse <prior-full-sha>` verifies that archive and reuses its standalone
   build. Keep the resulting local ZIP and SHA-256 together for promotion.
2. Advance `staging` to the approved commit. Preview the release, review the
   detected additions, updates and removals, and apply it to staging.

   ```sh
   python scripts/deploy-hosted.py staging --commit <full-sha>
   python scripts/deploy-hosted.py staging --commit <full-sha> --apply --playwright-module <absolute-module-path>
   ```

   Use `--archive <local-zip>` when using a nondefault local path. The tool
   serializes deployments with the environment's private release lock, verifies
   artifact contents and sends the required changes. It reuses unchanged
   application files and dependencies and creates a short-lived candidate for
   safe activation. The Playwright module is the operator's local JavaScript
   entry point. With that option the receiver checks both feeds in Chrome
   before it records the release and removes the previous installation. The
   browser can wait for a bounded initial list or summary retry when it is
   visibly pending. Production still requires populated feeds with verified
   counts. A rejection or missed deadline restores the previous release. The VPS needs
   no ordinary application build, npm install, browser or historical release copy.
3. If the migration ledger reports pending migrations, review the SQL,
   required grants and compatibility with the current app. Handle required
   writer pauses, then add `--apply-migrations` to the intended apply command.
   Check that the same target has zero pending entries and verify the affected
   schema objects and application privileges. Preserve each target's records
   in its own database. Any backup or restore rehearsal belongs to the
   independent backup process outside the VPS.
4. Qualify staging over HTTPS, including the Matches page, Matches API,
   unauthenticated Account session, served build and staging `noindex`. Verify
   release-specific behavior and applicable stored data or worker readiness.
   After staging passes, advance `production` to the same Git commit and use
   the exact same verified ZIP for production.

   ```sh
   python scripts/deploy-hosted.py production --commit <full-sha>
   python scripts/deploy-hosted.py production --commit <full-sha> --apply --playwright-module <absolute-module-path>
   ```

   Production requires the staging verification for that artifact and repeats
   schema and HTTPS checks with its own private settings and database.
5. Review storage after acceptance. Use `--prune-release <audited-dir>` for
   each confirmed inactive application release that is eligible for removal.
   Keep legitimate application data, uploads, private settings, worker files,
   and unrelated resources out of deployment cleanup.

After changes to hosted database grants, confirm that both web and migration
accounts can connect over TLS to their intended database and that a zero-row
query against the other environment is denied. Check both migration ledgers
and repeat the HTTPS smoke checks.

For code recovery, package the earlier clean GitHub commit and run the same
commands with `--restore --commit <earlier-full-sha>`. The earlier commit must
be reachable from the current environment branches and its migration inventory
must verify against the current database. Qualify the restored build on staging
before production. Keep branch tips and database schema and records in place.
Investigate and repair any partially applied DDL before resuming deployment.

### Update hosted web settings

In the normal checkout, keep the three ignored files in `next-js/` aligned
with `.env.example`. Edit `.env.development` for local development,
`.env.test` for `test.goalhint.com`, or `.env.production` for
`goalhint.com`. Keep local worker overrides in the separate `.env.operations`
file. Each hosted account keeps its own private web file and approval register.
Leave server-held database URLs blank. The shared API-Football key is recorded
in the private profiles for the authorized operator. The hosted web sync keeps
football settings out of the hosted web files, and staging provider jobs remain
disabled.
Use `npm run env:check` to verify the local layouts and target labels without
displaying any values.

From `next-js/`, use the authorized VPS SSH agent and review a dry run before
applying. Use `--identity <path>` for a specific operator key. Supply `--key`
once per setting you want to update.

```sh
npm run env:sync -- --target staging --key YOOLA_SMS_SENDER
npm run env:sync -- --target staging --key YOOLA_SMS_SENDER --apply
```

Use `--target production` to select `.env.production` and the production
account. The dry run reports changes by key name and checks the active release,
environment and database. An `add` means the key has no explicit entry in the
hosted file. If the active release already uses the intended default, leave
the default in effect. A blank selected value preserves the server's setting.
To remove an optional override, preview and then apply
`--clear KEY`. Run `npm run env:sync -- --help` for the eligible web settings.
Keep Flutterwave settings in the private profile for the intended target. Use
sandbox credentials in development and staging and live credentials in production.
Flutterwave Standard uses `GOAL_HINT_FLUTTERWAVE_SECRET_KEY` on the server. The
public and encryption key slots are optional for Standard. Treat every slot as
private. Hosted sync validates the public and secret key mode and requires the
webhook URL to be the target HTTPS origin with `/api/payments/flutterwave/webhook`.
It checks that staging and production use different webhook secrets. Configure
the matching URL and secret in the Flutterwave dashboard for each mode.
[Flutterwave authentication](https://developer.flutterwave.com/docs/authentication).

From `next-js/`, preview the relevant profile before applying it. Add `--apply`
to the command after reviewing the name-only changes.

```sh
npm run env:sync -- --target staging --key GOAL_HINT_FLUTTERWAVE_SECRET_KEY --key GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET --key GOAL_HINT_FLUTTERWAVE_WEBHOOK_URL
```

For production use `--target production` after confirming the release's checkout
prerequisites, the live merchant's collection and settlement setup, and the
production webhook registration. Check Privacy and Terms publication, an enabled
public support contact, paid access, and an active plan. Verify that an unsigned
request receives an authentication error from the webhook. Qualify staging with
the provider's sandbox checkout and a successful server-verified entitlement
grant. Use merchant account and webhook readiness checks for production without
creating a live charge. Development can verify browser returns locally with a
sandbox key. To receive real development webhooks, use a separate HTTPS endpoint
and secret configured for that sandbox deployment.

Hosted database credentials, permissions, approval files and football worker
settings remain managed through their respective deployment procedures.

An apply updates the canonical file and its active copy under the release
lock, requests a Passenger restart, and verifies the public Matches page,
Matches API and Account session endpoint. The command holds the original
settings in memory during the operation and restores them after a recoverable
failure. If interrupted between writes, reconcile both copies with the reviewed
settings under the release lock and verify HTTPS before retrying.
The shared-host `--config-push` and `--config-pull` commands still refer to
the legacy host.

Apply the [expanded goal markets overlay](../../prisma/mariadb/20261113140000_expand_local_goal_markets.sql)
after verifying `20261111170100_local_goal_market_source` and its current check
constraints. Verify existing O/U 1.5 history and a new local forecast publication
and settlement in the isolated test database before enabling the production worker.

### VPS live football worker

On `server2.goalhint.com`, the production account's crontab runs
`~/goal-hint-worker/private/football-only-cron.sh` every five minutes. The
launcher starts the worker only when it can take the lock. An active worker
continues across checks with a 24-hour runtime cap and graceful shutdown.
It reads the private `worker.env` and the active worker release's
approval register. The dedicated database user has football and job permissions
and requires TLS. Before switching hosts, run the launcher with `--check` to
verify policy and the database connection without calling the provider. Disable
the former production worker before starting the new one. Staging provider jobs
remain disabled.

For a release on the same host, verify the candidate with the existing
launcher's `--check`. Select its versioned directory atomically between Best
Slips publication slots. The deployment SSH session may see the worker lock
while the process is visible only in the host console. Before graceful
shutdown, verify its service account, Node entry point and exact release
directory, including the matching CageFS bind mount when applicable. The
existing cron starts the selected release after the old worker releases the
lock. Verify the new ready signal, attached pollers and the next paired
publication. Keep the prior worker release available for rollback. Resolve the
active release’s `node_modules` before pruning older packages, since compatible
releases can share one installed dependency directory.

For confirmed obsolete worker packages, run
[`prune-hosted-workers.py`](../../scripts/prune-hosted-workers.py) as the hosted
production account. Pass `--football FULL_COMMIT` or `--publisher FULL_COMMIT`
once per candidate. The default previews the selection. `--apply` rechecks
launcher references, package ownership and both worker locks before deletion.
Keep any package used by the current, shadow or fallback launchers.

The owner confirmed publication rights and authorized quota use on production.
`GOAL_HINT_FOOTBALL_EXISTING_PREPAID=true` uses the current direct prepaid term
with zero new spending. The worker verifies that the account has an active paid
plan and an expiry in the future. The private register records the owner's
authorization and the provider account status. The invoice total is unverified.

Keep the shared provider account's quota use on production. The local live
worker and `Goal Hint Football Archive` scheduled task are paused. Test worker
changes on staging with simulated responses. Check the production worker's
`~/goal-hint-worker/private/football.log` for `ready` and
`selection-scheduled`, then check the import receipts, result observations,
and published prediction revisions. Compare fresh quota dispatches in
production and staging when checking isolation.

On 13 November 2026 the first production selection committed with partial
coverage. Six reporting dates imported successfully. The 14 and 20 November
imports did not commit, so the run uses retained fixtures for those dates.
The public match API served a newly published revision and a score applied by
the results poller.

The production worker keeps a slot for daily selection so pending predictions
cannot delay fixture imports. With AI off, the provider-first forecast path
uses stored evidence and skips outbound preparation requests. Live score and
result polling uses the same quota ledger. On the current host, pre-match odds
collection and live details are enabled.

#### Historical import and live detail rollout

Apply the `20261113130000_football_history_import_status` [MariaDB overlay](../../prisma/mariadb/20261113130000_football_history_import_status.sql) on each isolated target before qualifying the worker. The web role needs `SELECT` on `FootballHistoryImportStatus`. The worker needs `SELECT` and `INSERT` on that table and `UPDATE` on `status`, `coverage` and `updatedAt`. Verify the worker's existing fixture, result and job grants plus `SELECT`/`INSERT` on `FootballHistorySourcePage` and `SELECT`/`INSERT`/`UPDATE` on `FootballHistoryDetailState` and `FixtureFacts`. The stored historical response pages use the recorded private-use terms.

On the promoted production worker set `GOAL_HINT_DEPLOYMENT_ENVIRONMENT=production` and `GOAL_HINT_HISTORY_IMPORT_ENABLED=true`. Retain the existing shared provider account and competition scope. Enable `GOAL_HINT_LIVE_DETAILS_ENABLED=true` for an eligible verified plan. The history jobs share the enrichment budget and yield to daily selection, live scores and details. Keep hosted staging's provider jobs disabled. Qualify the same archive runtime with the synthetic fixture job in `tests/live-runtime.integration.mjs` before production activation.

Check Admin Overview for counts at each stage of today's fixture coverage and for each historical phase's imported, remaining and unavailable coverage. An unknown count indicates that the stored receipts do not establish a total. Odds catalogs and prices use the existing rights and freshness gates. The historical job captures the available odds mapping when configured. Historical prices outside the provider's available pre-match window and historical in-play odds remain unavailable. The job resumes from persisted fixture, detail and reference receipts across restarts and quota resets.

## Paid access (066)

No deployment or activation is authorized by prompts 057–067. Overlay inventory includes `prisma/mariadb/20261019142209_subscriptions.sql` alongside analytics and existing goal-market/manifest overlays. Stop app and worker writes for verified DDL; check all nine InnoDB tables, checks/FKs and narrow grants before restarting. Preserve paid mode off and complete host checks plus OP-40 approval. See [user operations](../subscriptions.md).
