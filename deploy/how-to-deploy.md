# How to deploy

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
   from the repository root:
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

Commit first, then from the repository root:

```powershell
python scripts/deploy-cpanel.py --build
```

This rebuilds `deploy/goal-hint-cpanel.zip`, uploads it with a checksum check,
activates the new release, restarts the app and checks that the site returns HTTP 200.

The package removes Windows codecs and records the hosted badge codec.
Before activation, deployment verifies WebP conversion with the host's installed
`/usr/bin/convert` (ImageMagick). Badge responses use Next.js route caching with
seven-day revalidation. Local Windows tooling uses the pinned Sharp dependency.
This host lacks the CPU features required by native Sharp and Wasm SIMD.
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
python scripts/deploy-cpanel.py --config-pull   # server → deploy/.env.production.local, deploy/.goal-hint/owner-approvals.json
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
[database runbook](../docs/database.md) for setting names. Preserve the configured
analytics secret, username and password hash; changing the secret changes visitor
keys. See [analytics setup](../docs/analytics.md).

**Content:** the separate worker deployment now runs on the hosting account. Its
five-minute cron holds a file lock and runs the live worker for at most 270
seconds, allowing shared hosting to reclaim the process between invocations.
Database leases, approved provider limits and existing job idempotency remain
authoritative. This avoids dependence on a local computer or an SSH tunnel.

After worker code changes, prepare the git-ignored worker environment and existing
owner register, then run:

```powershell
python scripts/deploy-worker-cpanel.py --env-file deploy/.env.worker.production.local --approvals deploy/.goal-hint/worker-owner-approvals.json
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
