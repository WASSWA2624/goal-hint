# Deploying Goal Hint to cPanel

`goal-hint-cpanel.zip` contains a self-contained production build of the website for
cPanel's **Setup Node.js App** (Phusion Passenger). Everything the server needs,
including its `node_modules`, is already inside. You don't need to run `npm install`
or a build on the server.

Build or rebuild the zip from `next-js/` in a full checkout with the pinned Node.js 24.18.1:

```sh
npm run package:cpanel
```

The script copies the working tree to a temporary directory without git-ignored
files, so `.env.local`, `.env.operations` and `.goal-hint/` are never included.
It then runs `npm ci` and a `standalone` Next.js build, and writes
`deploy/goal-hint-cpanel.zip`. The zip itself is git-ignored.

## Package layout

```text
goal-hint/
  app.js            Passenger startup file (loads standalone/server.js)
  package.json      no dependencies; "Run NPM Install" is unnecessary
  BUILD_INFO.json   commit, build time, Node and Next.js versions
  DEPLOY.md         this guide
  .env.example      every supported setting, with comments
  standalone/       Next.js server, .next/, public/ and traced node_modules
```

The bundled `node_modules` sits under `standalone/`, not the application root,
because CloudLinux's Node.js selector reserves `<app root>/node_modules` for its
own virtual-environment link.

## Requirements

- cPanel with **Setup Node.js App** and **Node.js 24** (the build uses 24.18.1).
- A **MySQL 8.4** database for features that read stored data. Many cPanel hosts
  provide MariaDB instead. Confirm the server version with your host, because the
  application baseline is MySQL 8.4 ([database runbook](../docs/database.md)).
- With no environment variables, the site runs in its safe default state: database
  and providers off, and indexing off.

## Deploying

Use `python scripts/deploy-cpanel.py` from `next-js/` in a full checkout. Its first run creates the
**Setup Node.js App** entry (Node.js 24, application root `goal-hint`, startup file
`app.js`). Every run uploads the zip into a new release under `~/goal-hint-releases/`
and switches `~/goal-hint/standalone` to it. The step-by-step guide, including the
database, is [how-to-deploy.md](how-to-deploy.md). Don't run cPanel's `npm install`:
the root `package.json` has no dependencies.

## Configuration

Settings are read when the server starts, so **Restart** after every change. Use
`.env.example` as the reference. In File Manager, enable **Show Hidden Files** to
see it. Common production values:

| Setting | Purpose |
| --- | --- |
| `GOAL_HINT_DEPLOYMENT_ENVIRONMENT=production` | Classifies the deployment for SEO; missing values keep indexing disabled. |
| `GOAL_HINT_DATABASE_ENABLED=true` | Enables stored-data reads (feed, match details, history). Without it, the pages render and `/api/*` answers 503. |
| `DATABASE_URL` | Application (DML-only) MySQL credentials. |
| `GOAL_HINT_DATABASE_CONNECTION_MODE`, `GOAL_HINT_DATABASE_POOL_LIMIT` | Explicit connection mode and pool size, required in production. |
| `GOAL_HINT_DATABASE_TLS_MODE`, `GOAL_HINT_DATABASE_ACCESS_REF` | Verified TLS and an access reference; production rejects `disabled` TLS. |
| `GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_BUDGET_APPROVAL_REF` | Approved infrastructure cap and its approval reference, required once the database is enabled in production. |

The [database runbook](../docs/database.md) explains each database setting. Your
local `.env.local` values won't work as they are, because production mode applies
stricter checks than development.

The runtime policy validates every setting when the server starts. If a value is
invalid or a prerequisite is missing, every request returns 500 and the log lists
the failing setting names, never their values. Unknown `GOAL_HINT_*` and any
`NEXT_PUBLIC_*` settings also fail. Don't set `PORT` or `HOSTNAME`, because
Passenger assigns the listening socket. Database refusals at request time (approval
register, credentials, TLS, `DEBUG`) are not logged: pages show "data unavailable"
and `/api/*` answers 503.

Put these lines in `~/goal-hint-private/.env.production.local`, editing it over SSH with
`python scripts/deploy-cpanel.py --config-pull` / `--config-push`. The deploy script
copies that file into each release, where Next.js loads it at startup. Keep secrets
out of the cPanel **Environment variables** screen: it writes values into the
domain's `.htaccess`, and any variable set there overrides the file. Never commit
the file or place it under the domain's document root.

Production database access also verifies the exact `database-access` and
`budget-approval` references against the private operator register already used
by the live runner. Keep the reviewed register at
`~/goal-hint-private/.goal-hint/owner-approvals.json`; the deploy script copies it
into the release, whose `standalone/` directory is the server's working directory.
Migration commands and workers look for `.goal-hint/owner-approvals.json` under
their own working directory. Never include it in the deployment ZIP or version control.
Files saved directly under `~/goal-hint/standalone/` belong to one release and are
replaced on the next deploy or `--restart`.

Use only recorded, verified decisions for the actual deployment target and budget.
Missing, malformed or mismatched records deny access; reference strings alone do
not approve anything. Database-disabled previews and loopback development/test
connections do not need a register. Removing a required approval also blocks the
next web database access, even if the process already has a connection pool.

## Updating

Run `python scripts/deploy-cpanel.py --build` to rebuild and deploy, and
`--rollback` to return to the previously active release. `--status` shows the
deployed `BUILD_INFO.json`. See [how-to-deploy.md](how-to-deploy.md).

## Not included

- **Database migrations.** Apply schema changes from a full checkout with the
  `db:*` commands described in the [database runbook](../docs/database.md). Those
  commands require the verified private operator register for remote/production
  targets, a compatible server and separate migration credentials. The web ZIP
  does not include migration tooling or grant approval to a database target.
- **Background workers** (`npm run live`, `worker:*`, `recovery`, `monitoring`).
  The website only reads stored data. Shared cPanel hosting usually stops
  long-running background processes, so run the live runner on a host that can keep
  it running and reach the same database
  ([live operations runbook](../docs/live-operations.md)).
- **Image optimization.** The app doesn't use `next/image`, so `sharp` is left out.

## Troubleshooting

- **Every page returns 500, or Passenger shows 503 or "Incomplete response":**
  check the application log. Its path is shown in **Setup Node.js App**, often
  `~/goal-hint/stderr.log`. A `RuntimePolicyError` lists the settings to fix.
- **"Application should not contain folder/file with such name" (`node_modules`):**
  remove any `node_modules` folder you uploaded to the application root. The
  bundled dependencies belong in `standalone/node_modules`.
- **Changes don't appear:** select **Restart**. Passenger keeps the running process
  until it's restarted.
