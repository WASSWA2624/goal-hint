# How to deploy

| | |
| --- | --- |
| Site | `https://goalhint.com` (before DNS: `http://goalhint.com.hosspi.com/en`) |
| SSH | `hossuney@66.29.132.57:21098`, key `~/.ssh/goalhint_deploy` |
| App | `~/goal-hint` → active release in `~/goal-hint-releases/` (last 3 kept) |
| Secrets | `~/goal-hint-private/` (`.env.production.local`, `.goal-hint/owner-approvals.json`) |
| Database | MariaDB 11.4, `localhost:3306/hossuney_goalhint_db` |

> **Database is off.** The migrations and the live runner use MySQL-only SQL that
> MariaDB rejects. Don't migrate or enable the database until the MariaDB port is merged.

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

## Database (after the MariaDB port)

**One-time**, in cPanel → **MySQL Databases**:
- **App user `hossuney_goalhint_db`:**
  - set a new password;
  - under **Privileged Users**, untick **ALL PRIVILEGES** and tick only `SELECT`,
    `INSERT`, `UPDATE` and `DELETE`.
- **Migration user:** create one, e.g. `hossuney_goalhint_mig`, with **ALL
  PRIVILEGES**. Never delete it: the database triggers run as this user.

**Migrate** (for each schema change):
1. Stop the live runner, then back up: cPanel → **Backup → Download a MySQL Database
   Backup**.
2. Open a tunnel and leave it running:
   ```powershell
   ssh -i $HOME\.ssh\goalhint_deploy -p 21098 -N -L 3317:127.0.0.1:3306 hossuney@66.29.132.57
   ```
3. In a second PowerShell 7 window, run:
   ```powershell
   $pw = [uri]::EscapeDataString((Read-Host 'Migration password' -MaskInput))
   $env:MIGRATION_DATABASE_URL = "mysql://hossuney_goalhint_mig:$pw@127.0.0.1:3317/hossuney_goalhint_db"
   $env:DATABASE_URL = $env:MIGRATION_DATABASE_URL   # required by the policy check; not used to connect
   $env:GOAL_HINT_DATABASE_ENABLED = 'true'; $env:GOAL_HINT_DATABASE_TLS_MODE = 'disabled'   # SSH encrypts the tunnel
   fnm exec --using=24.18.1 npm.cmd run db:status
   fnm exec --using=24.18.1 npm.cmd run db:deploy
   Remove-Item Env:MIGRATION_DATABASE_URL, Env:DATABASE_URL, Env:GOAL_HINT_DATABASE_ENABLED, Env:GOAL_HINT_DATABASE_TLS_MODE; Remove-Variable pw
   ```
4. Deploy the app that needs the new schema.

If a migration fails:
1. In phpMyAdmin, open the database → **Structure → Check all → Drop**, with foreign key
   checks off.
2. Restore the backup as the migration user over SSH. phpMyAdmin can't import its
   triggers.
   ```powershell
   scp -i $HOME\.ssh\goalhint_deploy -P 21098 <backup>.sql.gz hossuney@66.29.132.57:goal-hint-private/
   ssh -i $HOME\.ssh\goalhint_deploy -p 21098 hossuney@66.29.132.57
   gunzip -c ~/goal-hint-private/<backup>.sql.gz | mariadb -h 127.0.0.1 -u hossuney_goalhint_mig -p hossuney_goalhint_db
   ```
   Run the second command, then type the third in the SSH session it opens.

**Enable** (once `db:status` reports the schema is up to date):
1. Create `deploy/.goal-hint/owner-approvals.json`. The two references must equal the
   settings in step 2.
   ```json
   {"version": 1, "owner": "<name>", "approvals": [
     {"requirement": "database-access", "reference": "goalhint-prod-db", "approvedAt": "2026-10-12", "decision": "<what you approved>"},
     {"requirement": "budget-approval", "reference": "goalhint-prod-budget", "approvedAt": "2026-10-12", "decision": "<what you approved>"}]}
   ```
2. Replace the contents of `deploy/.env.production.local` with these lines (run
   `--config-pull` first). Percent-encode the password, and leave
   `GOAL_HINT_DATABASE_TLS_CA_FILE` unset.
   ```dotenv
   GOAL_HINT_DATABASE_ENABLED=true
   DATABASE_URL=mysql://hossuney_goalhint_db:<PASSWORD>@localhost:3306/hossuney_goalhint_db
   GOAL_HINT_DATABASE_CONNECTION_MODE=direct
   GOAL_HINT_DATABASE_POOL_LIMIT=3
   GOAL_HINT_DATABASE_TLS_MODE=required
   GOAL_HINT_DATABASE_ACCESS_REF=goalhint-prod-db
   GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS=<cents>
   GOAL_HINT_BUDGET_APPROVAL_REF=goalhint-prod-budget
   GOAL_HINT_COMPETITION_IDS=<ids from .env.local>
   ```
3. Run `python scripts/deploy-cpanel.py --config-push`. It reports `/api/matches`: 200
   means the database is in use, and 503 means it's off or refused.

**Content:** matches appear once the live runner (`npm run live`) writes them. Shared
hosting stops long-running processes, so run it on your computer:
- put `DATABASE_URL=mysql://hossuney_goalhint_db:<PASSWORD>@127.0.0.1:3317/hossuney_goalhint_db`
  in `.env.operations`, not `.env.local`;
- keep the tunnel open while it runs.

Writing through the tunnel bypasses the app's approval and TLS checks, so record that
decision in your owner approvals.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Site times out | DNS isn't pointed yet (one-time setup, step 3) |
| Every page returns 500 | Run `--logs`: `RuntimePolicyError` names the bad setting |
| `/api/*` returns 503 (not logged) | Check the approval references, password encoding, `GOAL_HINT_COMPETITION_IDS`, that `DEBUG` is unset, and `db:status` |
| `Permission denied (publickey)` | The key isn't authorized in cPanel |
| Release is broken | Run `--rollback` |
