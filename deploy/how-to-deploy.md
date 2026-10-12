# How to deploy

| | |
| --- | --- |
| Site | `https://goalhint.com` (before DNS: `http://goalhint.com.hosspi.com/en`) |
| SSH | `hossuney@66.29.132.57:21098`, key `~/.ssh/goalhint_deploy` |
| App | `~/goal-hint` → active release in `~/goal-hint-releases/` (last 3 kept) |
| Secrets | `~/goal-hint-private/` (`.env.production.local`, `.goal-hint/owner-approvals.json`) |
| Database | MariaDB 11.4, `localhost:3306/hossuney_goalhint_db` |

> **Database is off.** The current migrations are MySQL-only and fail on MariaDB.
> Don't run `db:deploy` on production until the MariaDB port is merged.

## One-time setup

1. Install Node: `fnm install 24.18.1`. You also need Python 3.10+.
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

This does the whole release:
- rebuilds `deploy/goal-hint-cpanel.zip`;
- uploads it and verifies the checksum;
- activates the new release and restarts the app;
- checks that the site returns HTTP 200.

To build without deploying: `fnm exec --using=24.18.1 npm.cmd run package:cpanel`.

| Command (`python scripts/deploy-cpanel.py …`) | Does |
| --- | --- |
| `--status` | Active release, build info, log tail |
| `--logs 200` | Last 200 log lines |
| `--restart` | Re-applies `~/goal-hint-private/` and restarts |
| `--rollback` | Switches back to the previous release |

## Settings

- Edit the files in `~/goal-hint-private/` in cPanel **File Manager**. Turn on
  **Settings → Show Hidden Files** to see them.
- Then run `--restart`.
- Don't put secrets in **Setup Node.js App → Environment variables**. That screen
  writes them into the public web root (`~/goalhint.com/.htaccess`).
- Never set `PORT`, `HOSTNAME`, `DEBUG`, `NEXT_PUBLIC_*`, or any `GOAL_HINT_*` name not
  in `.env.example`. Any of these makes every page return 500.

## Database

**One-time**, in cPanel → **MySQL Databases**:
- give app user `hossuney_goalhint_db` a new password and `SELECT, INSERT, UPDATE, DELETE`
  on the database;
- create a separate migration user, e.g. `hossuney_goalhint_mig`, with **ALL
  PRIVILEGES**. Don't delete it later: the database triggers run as this user.

**Migrate** (each schema change):
1. Back up: cPanel → **Backup → Download a MySQL Database Backup**.
2. Open a tunnel and leave it running:
   ```powershell
   ssh -i $HOME\.ssh\goalhint_deploy -p 21098 -N -L 3317:127.0.0.1:3306 hossuney@66.29.132.57
   ```
3. In a second PowerShell 7 window, run:
   ```powershell
   $pw = [uri]::EscapeDataString((Read-Host 'Migration password' -MaskInput))
   $env:MIGRATION_DATABASE_URL = "mysql://hossuney_goalhint_mig:$pw@127.0.0.1:3317/hossuney_goalhint_db"
   $env:GOAL_HINT_DATABASE_ENABLED = 'true'
   fnm exec --using=24.18.1 npm.cmd run db:deploy
   fnm exec --using=24.18.1 npm.cmd run db:status
   Remove-Item Env:MIGRATION_DATABASE_URL; Remove-Variable pw
   ```
4. Deploy the app that needs the new schema.
5. If a migration fails, restore the backup in phpMyAdmin → **Import**.

**Enable** (once):
1. Create `~/goal-hint-private/.goal-hint/owner-approvals.json`. Each `reference` must
   match the setting of the same name in step 2.
   ```json
   {"version": 1, "owner": "<name>", "approvals": [
     {"requirement": "database-access", "reference": "goalhint-prod-db", "approvedAt": "2026-10-12", "decision": "<what you approved>"},
     {"requirement": "budget-approval", "reference": "goalhint-prod-budget", "approvedAt": "2026-10-12", "decision": "<what you approved>"}]}
   ```
2. Add to `~/goal-hint-private/.env.production.local`. Percent-encode the password, and
   leave `GOAL_HINT_DATABASE_TLS_CA_FILE` unset.
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
3. Run `--restart`.
4. Check: `https://goalhint.com/api/matches` should no longer return 503.

The website only reads data. Matches appear once the live runner (`npm run live`)
writes them. Run it on your computer through the same tunnel; shared hosting stops
long-running processes.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Site times out | DNS isn't pointed yet (one-time setup, step 3) |
| Every page returns 500 | `--logs`: `RuntimePolicyError` names the bad setting |
| `/api/*` returns 503 | Database off or refused: check `--logs` and the **Enable** steps |
| `Permission denied (publickey)` | The key isn't authorized in cPanel |
| Old version still showing | `--restart`, or `--rollback` if the new release is broken |
