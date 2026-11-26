# Deployment and version control

## Purpose and scope

This document follows the shared web app from local development and Git through packaging, database migrations, manual hosted activation, and recovery. It describes the release tools and recorded hosting arrangements.

## Environments and dependencies

The Next.js application owns the shared web UI, routes, and server operations. The repository locks Node.js and npm in `package.json` and commits `package-lock.json`. The scripts also require Python 3.11 or later. The app uses Prisma with MySQL for local development and MariaDB on the hosted VPS. The Flutter app is a separate build and opens the shared web application. [Package manifest](../next-js/package.json), [dependency lockfile](../next-js/package-lock.json), [development guide](../next-js/docs/deployment/development.md), [application overview](../APP_OVERVIEW.md).

| Environment | Supported setup |
| --- | --- |
| Local development | `npm run dev` selects the isolated synthetic MySQL demo or the owned local football snapshot, according to the workspace configuration. `npm run dev:live` uses the configured development database and checks its migrations before starting the web app. Integration tests use a separate guarded target. |
| [Hosted staging](https://test.goalhint.com) | Apache/Passenger serves a staging release with its own database and private app and migration settings. Activation supports a dedicated staging cPanel account or separate staging release under the production account. The latest recorded staging verification used the latter. Staging smoke checks include `noindex`. The documented staging setup disables live football-provider jobs. |
| [Production](https://goalhint.com) | Apache/Passenger serves the production web release with its own database and private configuration. Scheduled jobs use separately deployed worker code, private settings and database grants. |

[Local launcher](../next-js/scripts/development.py), [database target guards](../next-js/scripts/database.py), [VPS staging and production runbook](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion), [Best Slips worker operations](../next-js/docs/daily-slip-publications.md).

## Git, checks and packaging

- GitHub is the configured `origin` at [WASSWA2624/goal-hint](https://github.com/WASSWA2624/goal-hint). The locally visible history includes the `main` branch and `codex/` task branches. The runtime reviewed here is the detached `a1e61cde` checkout. Its comparison against the locally recorded `main` tip at `8fd09bfb` shows documentation changes only. Branch protection, required reviews and GitHub Actions settings are not verifiable from the checked-out files. The source tree has no tracked GitHub Actions workflows. Operator scripts handle builds and promotion without a Git push trigger. [Release runbook](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion).
- From `next-js/`, `npm ci` installs the locked dependencies and runs the Prisma-client and OCR-asset setup. Use `npm run check` for schema validation, theme contract checks, lint, type checking, the default JavaScript and Python suites, and build. Named suites in `package.json` provide additional integration and rendering coverage. `npm run build` builds the web app and offline manifest, and `npm start` runs the built app. [Package commands](../next-js/package.json), [development setup](../next-js/docs/deployment/development.md).
- Build the hosted release with `npm run package:cpanel` from the intended clean commit. The script checks the pinned Node release, builds the Next.js standalone server, and includes public and static assets, the Passenger launcher, and the migration inventory and activation scripts. It emits a release ZIP and SHA-256. The hosted badge pipeline uses the system GraphicsMagick or ImageMagick codec. Preserve the same verified artifact for staging and production. Host secrets and approval records are supplied from private environment configuration. [Release packaging script](../next-js/scripts/package-cpanel.py), [VPS release promotion](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion).

## Private configuration

| Key names | Purpose |
| --- | --- |
| `GOAL_HINT_DEPLOYMENT_ENVIRONMENT`, `GOAL_HINT_OPERATION_SCOPE` | Select the environment and govern the permitted operational scope. |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL`, `GOAL_HINT_DATABASE_ENABLED` | Provide separate application, migration, and test connections and control database-backed functionality. |
| `GOAL_HINT_DATABASE_CONNECTION_MODE`, `GOAL_HINT_DATABASE_TLS_MODE`, `GOAL_HINT_DATABASE_TLS_CA_FILE`, `GOAL_HINT_DATABASE_ACCESS_REF` | Govern transport, certificate trust and the approved access policy. |
| `GOAL_HINT_FOOTBALL_ENABLED`, `API_FOOTBALL_KEY`, `GOAL_HINT_COMPETITION_IDS`, `GOAL_HINT_FOOTBALL_PRIVATE_USE_REF`, `GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF`, `GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` | Govern football provider use, competition scope and public data/odds rights. |
| `GOAL_HINT_AI_ENABLED`, `AI_API_KEY`, `GOAL_HINT_RESEARCH_ENABLED`, `RESEARCH_API_KEY`, `GOAL_HINT_BUDGET_APPROVAL_REF`, `GOAL_HINT_RELEASE_APPROVAL_REF` | Configure optional integrations and reference operational approvals. |
| `GOAL_HINT_ADMIN_PHONES`, `GOAL_HINT_ADMIN_PASSWORD`, `GOAL_HINT_ANALYTICS_SECRET`, `GOAL_HINT_TRUSTED_PROXY_CIDRS` | Configure administrator authentication, keyed server protections including reset-link encryption, and trusted proxies. |
| `GOAL_HINT_MIGRATION_BACKUP` | Points the activation script to a private checksum manifest for the pre-migration backup. |

Hosted staging and production load distinct private web env files through the Passenger launcher. Local development and worker settings have separate files. `npm run env:check` validates local layouts, and `npm run env:sync` previews eligible hosted web settings. The latter requires an explicit apply option for writes. Database credential and grant changes, approval records, and football-worker configuration have their own operator procedures. [Environment template](../next-js/.env.example), [runtime policy](../next-js/src/server/config/runtime-policy.ts), [private settings synchronization](../next-js/scripts/sync-hosted-env.mjs), [hosted environment runbook](../next-js/docs/deployment/how-to-deploy.md#update-hosted-web-settings), [payment configuration](payments.md#records-access-and-controls).

## Database and release sequence

1. Provision or restore the target database and separate least-privilege application and migration accounts. Put credentials in the target's private configuration. Keep integration and restore rehearsals isolated. Local demo setup has its own scripted provisioning. Hosted migrations and grants use verified TLS and a dedicated migration account. [Local database runbook](../next-js/docs/local-database.md), [database tools and permissions](../next-js/docs/database.md), [hosted database runbook](../next-js/docs/deployment/how-to-deploy.md#database-updates-on-mariadb).
2. Update `prisma/schema.prisma` and run `npm run db:migrate -- --name <migration_name>` to generate a SQL diff from the committed schema snapshot and advance it. Review the generated SQL and any required MariaDB overlay or grants. On a suitable MySQL target, `npm run db:deploy` applies reviewed Prisma migrations, `npm run db:status` checks the ledger, and `npm run db:verify` checks ledger and Prisma-representable schema drift. Check engine-specific constraints and grants separately. [Schema](../next-js/prisma/schema.prisma), [schema snapshot](../next-js/prisma/schema.snapshot.prisma), [migration creation and verification](../next-js/scripts/database.py), [MariaDB compatibility runbook](../next-js/docs/deployment/how-to-deploy.md#database-updates-on-mariadb).
3. The operator uploads the release ZIP to staging, verifies its SHA-256, unpacks it in a versioned release directory, and provisions the private settings. For pending changes, verify a private backup and isolated restore, and pass the backup checksum manifest. Pause affected writers before DDL that requires it. The operator invokes `activate-hosted.sh` for the chosen target. It checks target binding and migration status under a lock. The MariaDB runner applies pending entries in order using reviewed overlays when present and checks the `_prisma_migrations` ledger after each apply. Once status shows no pending migrations, activation prepares the Passenger restart marker and atomically switches the active symlink. A migration failure leaves the current web release selected. [Activation script](../next-js/scripts/activate-hosted.sh), [MariaDB runner](../next-js/scripts/deploy-mariadb.py).
4. Smoke-test the staging HTTPS pages and APIs, check `noindex`, and verify release-specific behavior and worker readiness with the appropriate isolated or stored data. After owner review, promote the same package with production's own database and configuration. Repeat migration and smoke checks for production. Worker deployment and activation are separate operator steps. The documented production cadence is five minutes for football refresh and half-hourly for Best Slips publication using stored inputs. [Promotion and smoke-test runbook](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion), [football worker runbook](../next-js/docs/deployment/how-to-deploy.md#vps-live-football-worker), [worker deployment helper](../next-js/scripts/deploy-worker-cpanel.py), [Best Slips worker runbook](../next-js/docs/daily-slip-publications.md).
5. Keep the previous compatible release. The VPS rollback procedure restores the earlier app release and restarts Passenger while keeping the current schema and data. The `deploy-cpanel.py --rollback` helper is documented for the former shared host. Recovering database state requires a separately verified backup restore procedure. After a partial migration or ledger error, evaluate the actual schema and ledger before resuming writes. [VPS promotion and rollback](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion), [migration recovery](../next-js/docs/deployment/how-to-deploy.md#database-updates-on-mariadb), [legacy deploy helper](../next-js/scripts/deploy-cpanel.py), [separate worker recovery](../next-js/docs/deployment/how-to-deploy.md#vps-live-football-worker).

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

The release ZIP SHA-256 is `a65829796fd29c05d90d33f73a4d70173cfd5c7f8183e5e3f985e0ab4917c940`. The Matches and Slips release check confirmed that production subsequently activated `ef1b3663`.

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

After owner approval, production activated the same combined ZIP with all 93 migrations verified and zero pending. The served Matches page contained the candidate's build identifier. The one-day production feed returned HTTP 200 in 6.38 seconds, with 50 records on page one and 122 matches among 143 known fixtures. The bare 30-day request returned application HTTP 503 after 31.46 seconds with `Retry-After: 5` and no feed payload. The production timeout remains unresolved.

A bounded diagnostic request also returned HTTP 503 after 32.43 seconds. Read-only database sampling found 13 replay projection statements on the connection that matched the timing. A replay read was still active at 31.22 seconds, and the optimized count and page statements were absent from the sample. These observations point to the replay work before counting. The sampling had no request identifier.

Desktop browser checks on a populated fixture verified the two independently scrolling Match Details panes in light and dark. The checks also covered Markets & Odds, Match Statistics, Back navigation and a direct Pick History link. [Production fixture used for verification](https://goalhint.com/en/matches/fd15442b-526e-8c2e-bf40-ae9c6e7ff4d6/gent-vs-fk-crvena-zvezda).

## Matches and Slips staging verification

On 26 November 2026, the checksummed `8867ad87` release ran in a private staging instance against `ghprod_test`. The staging activation guard detected the public slot's switch to the separate mobile logout release `ef1b3663` during upload. The private instance used the existing staging profile and verified all 94 required MariaDB migrations. The Matches, Slips and Builder pages returned HTTP 200 with `noindex`. The one-day Matches feed, Slips API and guest session endpoint returned HTTP 200 with JSON responses.

Local Chromium checks verified the responsive controls in both themes, the desktop live clock, and share retry and PNG export. Chromium also verified date selection on private staging in dark mode at mobile and desktop widths. The staging profile lacks public odds approval and its archive offered no shareable slips during verification. Isolated fixtures supplied valid odds and published slips for the Builder and sharing checks. Production activated the mobile logout revision while this candidate was under review, so the combined release includes that revision before its own promotion.

The private candidate ZIP SHA-256 is `246c705750b806b093d4345a6b77e97a1f750905d0541eefdc662e55a1e4daaa`.

Public staging activated the combined release `4de9046f`, which includes the production mobile logout revision. The host verified all 94 required migrations before and after activation. Matches, Slips and Builder returned HTTP 200 with `noindex`. The one-day Matches feed, Slips API and guest session endpoint returned HTTP 200 with JSON. Chromium verified that applying a date updates the Slips calendar numeral and archive URL at 390px and 1440px in dark mode. The combined build, lint and focused account and sharing tests passed. Production promotion awaits owner review.

The public staging release ZIP SHA-256 is `10918c1b83d1ef3cfd6f198b6892d91c6b235a861cb4977ec4b1b073b081c697`.

## Verification limits

The 26 November 2026 release record documents staging verification of `a1e61cde` with migration status and a synthetic worker check, with production promotion pending at that time. The application overview in this checkout records the earlier production verification of `ee5f6a44`. This audit did not query the hosted deployments, GitHub settings or the actual scheduler. The runbooks document manual approval, upload and activation, with scripts for validation and recurring jobs. Any host-side automation beyond those records needs confirmation from the host operator. [Staging verification record](https://github.com/WASSWA2624/goal-hint/commit/8fd09bfb18cae147d8d9729f01f2b10424908c28), [earlier rollout evidence](../APP_OVERVIEW.md), [release and worker runbooks](../next-js/docs/deployment/how-to-deploy.md).
