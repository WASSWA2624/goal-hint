# How to deploy

The first sections describe the previous shared host. See [VPS staging and
release promotion](#vps-staging-and-release-promotion) for the Ubuntu VPS.

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
2. Pause writers for changes that rebuild or lock tables. Take a private backup
   including triggers, record its checksum and verify restoration to a separate
   target. Keep backups outside the public document root.
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

On 14 October 2026, a private backup was taken before the corrective migration
`20261014161000_transactional_storage` converted the seven analytics tables and
`OperationsMonitorState` from MyISAM to InnoDB. Prisma's history table was converted
as separate maintenance. All 81 tables now use InnoDB, and 26 migrations are
recorded as completed. Keep that backup until the release and recovery checks are
accepted.

If a migration fails, stop further attempts and retain its history and diagnostics.
MariaDB DDL can commit individual statements, so inspect what actually changed
before preparing a forward repair. Do not mark a failed migration applied simply
to clear the error. Application rollback switches releases and keeps database
schema and data. Restore a verified backup through an explicit recovery plan that
accounts for newer writes; never drop all production tables as routine recovery.

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

`https://test.goalhint.com` runs under the `ghstage` cPanel account on the
Ubuntu VPS. Apache serves the Next.js bundle through Passenger using the
repository's pinned Node.js. The VPS keeps MariaDB on loopback. The staging
database uses separate application and migration accounts with verified TLS.
Staging uses the verified 12 November 2026 snapshot of the active local football
database. The app's member sign-in is active and provider jobs are disabled.

`https://goalhint.com` runs under the separate `ghprod` cPanel account and uses
`ghprod_prod` with its own TLS application and migration credentials. The initial
production load copied 240,229 fixtures and related browsing and historical data
from staging. Accounts, wallets, and payments start fresh. AutoSSL covers both
production hostnames, and `www.goalhint.com` redirects to `goalhint.com`.
The production football worker uses the existing direct API-Football account.
Paid checkout is off. Phone verification and password-reset delivery require
messaging setup.

Develop on `localhost` with the private `.env.development`, then verify the
release on `test.goalhint.com`. Promote the same tested release to `goalhint.com`
after the owner reviews test and authorizes production. Each environment has its
own database and configuration. Routine release promotions carry application
code and reviewed schema migrations.

1. Build the release with `npm run package:cpanel` from a clean checkout of the
   intended commit. Keep the ZIP and its SHA-256 together.
2. Verify the ZIP after upload. Unpack it into
   `~/goal-hint-releases/<commit>` under the staging account. Copy private
   `.env.test` and the approval register from `~/goal-hint-private/` into the
   release's `standalone/` directory with account-only permissions. Passenger
   loads `.env.test` explicitly while Next.js runs in production mode. Production
   uses `.env.production` and its own approval register. Keep the existing hosted
   settings when migrating filenames.
3. Use the packaged activation script from the VPS operator account. It checks
   the app's target, connects with the separate MariaDB migration account over
   TLS, validates the Prisma ledger and runs all pending migrations in order.
   When there are pending changes, pause any affected writers, verify a private
   backup and set `GOAL_HINT_MIGRATION_BACKUP` to its SHA-256 manifest. The
   script verifies zero pending migrations before switching the release and
   restarting Passenger. A migration failure leaves the current release active.

   ```sh
   bash "$release/scripts/activate-hosted.sh" staging "$release" ghstage \
     "$node_binary" "$migration_client_options" ghstage_localcopy
   ```

   Use `production`, `ghprod` and `ghprod_prod` with the production account's
   private settings and migration options after production authorization.
4. Check the public HTTPS Matches page and `/api/matches`, and verify the
   staging page returns a `noindex` directive. Review the release online before
   promoting the same ZIP to production with production's own configuration
   and database.
5. Load the agreed production data. If migrating existing hosted accounts,
   verify the old production backup and its restore first. Check migration
   history, row counts, database constraints, and the new origin's app and API
   before routing public traffic to it.
6. For the initial VPS cutover, update the existing apex A record in Namecheap
   Advanced DNS. Keep the `www` alias, staging record, and mail records in
   place. Run AutoSSL for `ghprod`, verify HTTPS on both production names, and
   confirm HTTP redirects to HTTPS.

Keep the prior app release available for rollback. Switching releases does
not roll back the database. The shared-host deployment commands above target
the previous production host.

To refresh staging data, take a consistent data-only MySQL export into a new
cPanel database with the verified MariaDB table definitions. Load the data
before restoring the staging triggers, and preserve the target's Prisma history.
Apply the MariaDB numeric JSON projection overlay where the durable-job check
still compares extracted values as text. Verify row counts, constraints, and
the app against the new database before switching the staging release. Keep
the previous database for rollback. See the [durable-job overlay](../../prisma/mariadb/20261009123830_durable_job_numeric_projection.sql).

Apply the [expanded goal markets overlay](../../prisma/mariadb/20261113140000_expand_local_goal_markets.sql)
after verifying `20261111170100_local_goal_market_source` and its current check
constraints. Verify existing O/U 1.5 history and a new local forecast publication
and settlement in the isolated test database before enabling the production worker.

### VPS live football worker

The VPS runs `goalhint-live@ghprod.service` and starts it at boot.
`goalhint-live@ghstage.service` is disabled. Each unit reads its account's private
`~/goal-hint-worker/private/worker.env` and the approval register in its active
worker release. The worker has a dedicated TLS database user with football and
job permissions. The hosted MariaDB smoke test verified fixture import,
provisional predictions, score polling, settlement, and public feed reads with
simulated provider responses.

The owner confirmed publication rights and authorized quota use on production.
`GOAL_HINT_FOOTBALL_EXISTING_PREPAID=true` uses the current direct prepaid term
with zero new spending. The worker verifies that the account has an active paid
plan and an expiry in the future. The private register records the owner's
authorization and the provider account status. The invoice total is unverified.

Keep the shared provider account's quota use on production. The local live
worker and `Goal Hint Football Archive` scheduled task are paused. Test worker
changes on staging with simulated responses. The VPS units share a lock to
prevent overlap. Check the production journal for `ready` and
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
result polling uses the same quota ledger. Odds, AI, research, and the separate
statistics and events collector are off.

#### Historical import and live detail rollout

Apply the `20261113130000_football_history_import_status` [MariaDB overlay](../../prisma/mariadb/20261113130000_football_history_import_status.sql) on each isolated target before qualifying the worker. The web role needs `SELECT` on `FootballHistoryImportStatus`. The worker needs `SELECT` and `INSERT` on that table and `UPDATE` on `status`, `coverage` and `updatedAt`. Verify the worker's existing fixture, result and job grants plus `SELECT`/`INSERT` on `FootballHistorySourcePage` and `SELECT`/`INSERT`/`UPDATE` on `FootballHistoryDetailState` and `FixtureFacts`. The stored historical response pages use the recorded private-use terms.

On the promoted production worker set `GOAL_HINT_DEPLOYMENT_ENVIRONMENT=production` and `GOAL_HINT_HISTORY_IMPORT_ENABLED=true`. Retain the existing shared provider account and competition scope. Enable `GOAL_HINT_LIVE_DETAILS_ENABLED=true` for an eligible verified plan. The history jobs share the enrichment budget and yield to daily selection, live scores and details. Keep hosted staging's provider jobs disabled. Qualify the same archive runtime with the synthetic fixture job in `tests/live-runtime.integration.mjs` before production activation.

Check Admin Overview for counts at each stage of today's fixture coverage and for each historical phase's imported, remaining and unavailable coverage. An unknown count indicates that the stored receipts do not establish a total. Odds catalogs and prices use the existing rights and freshness gates. The historical job captures the available odds mapping when configured. Historical prices outside the provider's available pre-match window and historical in-play odds remain unavailable. The job resumes from persisted fixture, detail and reference receipts across restarts and quota resets.

## Paid access (066)

No deployment or activation is authorized by prompts 057–067. Overlay inventory includes `prisma/mariadb/20261019142209_subscriptions.sql` alongside analytics and existing goal-market/manifest overlays. Stop app and worker writes for verified DDL; check all nine InnoDB tables, checks/FKs and narrow grants before restarting. Preserve paid mode off and complete host checks plus OP-40 approval. See [subscriber operations](../subscriptions.md).
