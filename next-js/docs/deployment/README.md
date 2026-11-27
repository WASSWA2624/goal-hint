# Goal Hint web release package

`goal-hint-nextjs-1.0.0.zip` contains a self-contained production build of the website for
cPanel's **Setup Node.js App** (Phusion Passenger). Everything the server needs,
including its `node_modules`, is already inside. You don't need to run `npm install`
or a build on the server.

Build the ZIP from `next-js/` in a clean checkout with the pinned Node.js and
npm versions:

```sh
npm run package:cpanel -- --commit <full-sha>
```

The packager exports the approved Git commit to a temporary directory. A fresh
build runs `npm ci` and compiles the Next.js standalone runtime. Use
`--reuse <prior-full-sha>` when the existing verified local ZIP and its build
inputs match. Both modes publish `../deploy/goal-hint-nextjs-1.0.0.zip` and its
adjacent `.zip.sha256` locally. The package includes `.env.example`. Private
settings and approval records are supplied by each hosted environment.

## Package layout

```text
goal-hint/
  app.js            Passenger startup file (loads standalone/server.js)
  package.json      no dependencies; "Run NPM Install" is unnecessary
  BUILD_INFO.json   commit, build versions and migration inventory fingerprint
  prisma/           ordered MySQL migrations, MariaDB overlays and adopted checksums
  scripts/          MariaDB migration verification and legacy activation entry
  DEPLOY.md         this guide
  .env.example      every supported setting, with comments
  standalone/       Next.js server, .next/, public/ and traced node_modules
```

The bundled `node_modules` sits under `standalone/`, not the application root,
because CloudLinux's Node.js selector reserves `<app root>/node_modules` for its
own virtual-environment link.

## Requirements

- cPanel with **Setup Node.js App** and **Node.js 24** (the build uses 24.18.1).
- Linux hosting with `/usr/bin/convert` (ImageMagick) and WebP support for badge
  conversion. The package excludes platform-specific Sharp binaries.
- A persistent database for stored data. Local schema development targets
  MySQL 8.4. The Ubuntu VPS uses MariaDB with reviewed compatibility overlays.
  [Database runbook](../database.md).
- With no environment variables, the site runs in its safe default state: database
  and providers off, and indexing off.

## Deploying

Use `python scripts/deploy-hosted.py` from `next-js/` for operator and automated
deployments. It verifies the local ZIP, sends changed files over SSH, and checks
the target's migration ledger and served build. Stage and verify the approved
commit before promoting the same archive to production. The VPS keeps a single
active installation per environment. The application ZIP stays local and the
VPS removes the superseded release after acceptance. [VPS commands and
verification](how-to-deploy.md#vps-staging-and-release-promotion).

Staging uses the private `.env.test` profile and production uses
`.env.production`. Each has its own database credentials and approval register.
The Ubuntu VPS connects to MariaDB through verified loopback TLS. The
[former shared host procedure](how-to-deploy.md#former-shared-host) records
the earlier cPanel deployment setup.

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

The [database runbook](../database.md) explains each database setting. Your
local `.env.development` values won't work as they are, because production mode applies
stricter checks than development.

Android, iOS, Windows, macOS and Linux release shells and browser installations
all use the HTTPS app. Database configuration is private to the Next.js server.
Confirm the public HTTPS feed returns the expected fixture cohort and
`/manifest.webmanifest` launches `/en/matches`.

The runtime policy validates every setting when the server starts. If a value is
invalid or a prerequisite is missing, every request returns 500 and the log lists
the failing setting names, never their values. Unknown `GOAL_HINT_*` and any
`NEXT_PUBLIC_*` settings also fail. Don't set `PORT` or `HOSTNAME`, because
Passenger assigns the listening socket. Database refusals at request time (approval
register, credentials, TLS, `DEBUG`) are not logged: pages show "data unavailable"
and `/api/*` answers 503.

Set production values in `~/goal-hint-private/.env.production` and staging
values in `~/goal-hint-test-private/.env.test`. The deploy script copies each
environment's file into its active release, where Passenger loads it at
startup. Use the supported [hosted settings sync](how-to-deploy.md#update-hosted-web-settings)
for eligible changes and keep secrets outside version control and the public
document root.

Production database access also verifies the exact `database-access` and
`budget-approval` references against the private operator register already used
by the live runner. Keep each reviewed register at
`.goal-hint/owner-approvals.json` in the environment's private directory. The
deploy script copies it into the active `standalone/` directory.
Migration commands and workers look for `.goal-hint/owner-approvals.json` under
their own working directory. Never include it in the deployment ZIP or version control.
Files saved directly under the active `standalone/` directory belong to that
release. Update the canonical private settings to carry changes forward.

Use only recorded, verified decisions for the actual deployment target and budget.
Missing, malformed or mismatched records deny access; reference strings alone do
not approve anything. Database-disabled previews and loopback development/test
connections do not need a register. Removing a required approval also blocks the
next web database access, even if the process already has a connection pool.

## Updating

Use the local release package and the same staging-first workflow for updates
and `--restore` code recovery. Apply pending migrations only after reviewing
compatibility and handling any required writer pause. The staging and production
databases retain their own data and migration ledgers. [VPS release
promotion](how-to-deploy.md#vps-staging-and-release-promotion).

## Not included

- **Database records and recovery copies.** The ZIP includes the reviewed
  migration inventory and runner. The environment supplies the migration role
  and persistent database. The independent backup operator manages backups
  outside the VPS.
- **Background workers** (`npm run live`, `worker:*`, `recovery`, `monitoring`).
  The website only reads stored data. Shared cPanel hosting usually stops
  long-running background processes, so run the live runner on a host that can keep
  it running and reach the same database
  ([live operations runbook](../live-operations.md)).
- **Image optimization.** The app doesn't use `next/image`, so `sharp` is left out.

## Troubleshooting

Before enabling per-client registration/verification limits behind Passenger,
qualify the actual socket/proxy chain and configure only verified proxy CIDRs.
Blank `GOAL_HINT_TRUSTED_PROXY_CIDRS` trusts no forwarded address. See the
[transport security checklist](../registration-referral-security.md#client-address-provenance).
Raw X-Forwarded-For/X-Real-IP observations do not establish trust; remote ingress
and Passenger socket behavior remain unverified until tested on that deployment.

- **Every page returns 500, or Passenger shows 503 or "Incomplete response":**
  check the application log. Its path is shown in **Setup Node.js App**, often
  `~/goal-hint/stderr.log`. A `RuntimePolicyError` lists the settings to fix.
- **"Application should not contain folder/file with such name" (`node_modules`):**
  remove any `node_modules` folder you uploaded to the application root. The
  bundled dependencies belong in `standalone/node_modules`.
- **Changes don't appear:** select **Restart**. Passenger keeps the running process
  until it's restarted.
