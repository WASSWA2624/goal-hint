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
- Build the hosted release with `npm run package:cpanel` from the intended clean commit. The script checks the pinned Node release, builds the Next.js standalone server, and includes public and static assets, the Passenger launcher, and the migration inventory and activation scripts. The connection fallback entry, versioned worker and generated asset manifest ship together. The script emits a release ZIP and SHA-256. The hosted badge pipeline uses the system GraphicsMagick or ImageMagick codec. Preserve the same verified artifact for staging and production. Host secrets and approval records are supplied from private environment configuration. [Release packaging script](../next-js/scripts/package-cpanel.py), [connection recovery](../next-js/docs/offline-startup.md), [VPS release promotion](../next-js/docs/deployment/how-to-deploy.md#vps-staging-and-release-promotion).

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

## Community invitations release checks

Apply `20261126194240_community_invitations` before activating the Community invitation release. It adds nullable invitation, attempt and confirmation fields to `MemberAccount`. Verify the migration inventory and ledger and check that the staging application account can read and update these columns. Test the guest and signed-in flows with synthetic destinations and accounts. The automatic invitation requires at least one enabled, configured WhatsApp destination. Production promotion follows owner review of staging. [Community behavior](authentication.md#community-invitations), [Migration](../next-js/prisma/migrations/20261126194240_community_invitations/migration.sql).

### Community invitations staging verification

On 26 November 2026, staging activated `a567f8e1` with Next build `BtSbhJ1ircHCIp_qdWPIl`. A full encrypted staging backup passed checksum verification and matched the schema, triggers, migration ledger and table data on an isolated restore. The nullable-column migration passed on that restore before activation. Staging MariaDB verified all 95 required migrations with zero pending. The application account verified read and update access to all four new columns over TLS with zero rows changed. The prior web release `59faf6e1` remains available for rollback.

Public HTTPS smoke checks passed for Matches, staging `noindex`, the released build manifest, the Privacy disclosure, public Community settings, the private guest session response and guest denial from the account Community endpoint. Neither WhatsApp destination was configured on staging. Chromium verified the guest Group and Channel handoffs, return confirmation, and same-day suppression in phone dark and desktop light using intercepted destinations. Local Chromium and isolated MySQL covered the signed-in flow, the exact 24-hour boundary, cross-device confirmation, concurrent claims and reconciliation after actual signup and login. Lint, schema validation, the theme contract and the production-mode build passed. The broader test run was stopped after four failures reproduced on the pre-change branch.

The release ZIP SHA-256 is `822ca3755311f58e1be3399b3f1f013828c7a48c6c8e071fd463f7978d32361a`.

### Community invitations production verification

On 26 November 2026, after owner review of staging, production activated `a567f8e1` from the same checksummed ZIP and served Next build `BtSbhJ1ircHCIp_qdWPIl`. The encrypted production backup covered the complete schema and triggers, plus all member account and migration ledger rows. The isolated restore matched those backups, and `20261126194240_community_invitations` passed on the restore before production activation. Production MariaDB applied the migration and verified all 95 required migrations with zero pending. The four nullable columns matched the migration. The application role passed SELECT and a rolled-back zero-row UPDATE over verified TLS. The prior web release `59faf6e1` remains available for rollback.

Production HTTPS returned HTTP 200 for Matches, Best Slips, Builder, Login, the released build manifest, Privacy, public Community settings, the guest session and the one-day Matches API. Privacy included the Community disclosure. The public Community settings matched preflight, with both configured WhatsApp destinations enabled. The private account endpoint denied guest and cross-origin requests with HTTP 403. Chromium verified the configured Channel and Group handoffs in phone dark and desktop light, the confirmation on return, the No and Yes responses, and same-day suppression. The browser intercepted those WhatsApp requests. The default 30-day Matches API returned HTTP 503 before and after promotion.

## Subscriber administration staging verification

On 26 November 2026, staging activated clean commit `59faf6e1` over `1afee350`. HTTPS served Next build `EaIreorAnFdT0fwnToEpI` with noindex. MariaDB verified all 94 migrations with zero pending before and after activation. The existing schema and application grants cover this change.

Hosted smoke used synthetic accounts to verify current-admin authorization, rejection of cross-site calls, count confirmation, partial results, grant replay, blocking and unblocking, device revocation, secure password reset, personal-data erasure and eligible permanent deletion. The reset used the ownership-verification and single-use link flow, with no external message. The erased fixture lost identifying data and retained its access record. Bulk and individual deletion removed eligible fixtures and wrote unlinked operation audits. Replaying the synthetic credentials after sign-out failed. Financial and provider-retention cases were verified in isolated MySQL with populated records.

The local checks passed 85 focused tests, 18 restricted-MySQL admin tests, and seven bulk and reset integration tests. The final focused MySQL deletion run passed eight cases. The Subscriber HTML/API fixture and Playwright passed on desktop and phone in light and dark, including page-local selection, cancel, exact confirmation count and partial failures. Schema validation, lint, TypeScript, the theme contract and the production-mode build passed. The unchanged Subscribe suite has two pre-existing loading fixture failures reproduced with the baseline tests.

The release ZIP SHA-256 is `a1ff833a20cb3e427b64ec08cf3a47d809ce387bbfee0e31900686219f729ba2`.

<details>
<summary>Changed files</summary>

- `APP_OVERVIEW.md`
- `implementation-docs/authentication.md`
- `implementation-docs/deployment-and-version-control.md`
- `implementation-docs/payments.md`
- `implementation-docs/subscriptions.md`
- `next-js/docs/subscriptions.md`
- `next-js/scripts/verify-subscriber-directory-rendering.py`
- `next-js/src/app/(owner)/admin/password-requests/page.tsx`
- `next-js/src/app/(owner)/admin/subscribers/page.tsx`
- `next-js/src/app/api/admin/subscribers/bulk/route.ts`
- `next-js/src/components/admin/code-tools.tsx`
- `next-js/src/components/admin/password-requests-editor.tsx`
- `next-js/src/components/admin/subscriber-action-menu.tsx`
- `next-js/src/components/admin/subscriber-bulk-actions.tsx`
- `next-js/src/components/admin/subscriber-detail.tsx`
- `next-js/src/components/admin/subscriber-directory-parts.tsx`
- `next-js/src/components/admin/subscriber-directory.tsx`
- `next-js/src/components/admin/subscriber-workspace.tsx`
- `next-js/src/domain/admin-audit.ts`
- `next-js/src/domain/subscriber-actions.ts`
- `next-js/src/domain/subscriber-directory.ts`
- `next-js/src/server/admin/audit.ts`
- `next-js/src/server/admin/codes-http.ts`
- `next-js/src/server/admin/delete-subscriber.ts`
- `next-js/src/server/admin/subscriber-directory.ts`
- `next-js/src/server/admin/subscribers-http.ts`
- `next-js/src/server/admin/subscribers.ts`
- `next-js/src/server/members/access-codes.ts`
- `next-js/src/server/members/checkout.ts`
- `next-js/src/server/members/password-recovery.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/(owner)/admin/password-requests/page.tsx`
- `next-js/tests/helpers/rendering/owner-payments/app/api/admin/subscribers/[id]/route.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/api/admin/subscribers/bulk/route.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/api/fixture/subscribers/route.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/fixture.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/subscriber-actions.ts`
- `next-js/tests/helpers/rendering/owner-payments/app/subscriber-directory-query.ts`
- `next-js/tests/members-admin.integration.mjs`
- `next-js/tests/page-loading-performance.test.mjs`
- `next-js/tests/subscriber-bulk.integration.mjs`
- `next-js/tests/subscriber-directory.test.mjs`

</details>

## Subscriber administration production verification

On 26 November 2026, production promoted `59faf6e1` from the same SHA-256-verified ZIP used on staging. HTTPS served Next build `EaIreorAnFdT0fwnToEpI` and its static build manifest. MariaDB verified all 94 migrations with zero pending before and after activation. The application’s existing permissions for the financial-retention reads were verified over TLS. The prior release `1afee350` remains available for rollback.

Read-only HTTPS smoke returned HTTP 200 for Matches, Best Slips and Builder. Guest requests for Subscriber list, selected-account and Password Requests pages redirected to login. Subscriber search, detail, bulk and password request APIs returned HTTP 401 for guests. A cross-origin bulk request returned HTTP 403. Administrative responses were private and no-store. Staging covered signed-in account changes, secure reset, erasure and eligible deletion. Isolated MySQL covered the financial and pending-checkout retention cases.

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

After owner approval, production activated the same combined ZIP with all 93 migrations verified and zero pending. The served Matches page contained the candidate's build identifier. The one-day production feed returned HTTP 200 in 6.38 seconds, with 50 records on page one and 122 matches among 143 known fixtures. The bare 30-day request returned application HTTP 503 after 31.46 seconds with `Retry-After: 5` and no feed payload. The production timeout remains unresolved.

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

The 26 November 2026 release record documents staging verification of `a1e61cde` with migration status and a synthetic worker check, with production promotion pending at that time. The application overview in this checkout records the earlier production verification of `ee5f6a44`. This audit did not query the hosted deployments, GitHub settings or the actual scheduler. The runbooks document manual approval, upload and activation, with scripts for validation and recurring jobs. Any host-side automation beyond those records needs confirmation from the host operator. [Staging verification record](https://github.com/WASSWA2624/goal-hint/commit/8fd09bfb18cae147d8d9729f01f2b10424908c28), [earlier rollout evidence](../APP_OVERVIEW.md), [release and worker runbooks](../next-js/docs/deployment/how-to-deploy.md).
