# MySQL runtime and migrations

Prompt [003](../dev-plan/003-mysql-prisma.md) establishes private database access.
The user's 7 October 2026 MySQL instruction supersedes the original PostgreSQL
choice. The application baseline is MySQL 8.4 LTS with InnoDB and Prisma ORM 7.
Hosting, credentials, grants, production connection capacity, TLS evidence and
infrastructure budgets remain owner-supplied decisions. See the current
[decision register](implementation-decisions.md) and actual
[verification results](development-progress.md).

## Dependencies and generated client

Pin `prisma`, `@prisma/client` and `@prisma/adapter-mariadb` to `7.10.0`.
Prisma documents this adapter for MySQL; its name does not change the server
choice to MariaDB. The selected Node `24.18.1` and TypeScript `5.9.3` satisfy
the published package requirements. Use the committed lockfile with `npm ci`.

The installed dependency tree uses three exact, parent-scoped npm overrides:

| Parent scope | Dependency override | Reason |
| --- | --- | --- |
| `@prisma/adapter-mariadb@7.10.0` | `mariadb: "$mariadb"`, resolving the direct `3.5.4` pin | Replaces the adapter's `3.4.5` connector. The maintainer's [TLS credential advisory](https://github.com/mariadb-corporation/mariadb-connector-nodejs/security/advisories/GHSA-cqhc-2h57-wpxf), [SQL escaping advisory](https://github.com/mariadb-corporation/mariadb-connector-nodejs/security/advisories/GHSA-r3rv-jm3r-62q2) and [3.5.4 release](https://github.com/mariadb-corporation/mariadb-connector-nodejs/releases/tag/3.5.4) establish the patched connector selection. |
| `prisma@7.10.0` | `mysql2: "3.24.5"` | Includes fixes for [GHSA-3f6p-5ww8-9rcr](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-3f6p-5ww8-9rcr) and [GHSA-rgwj-5xj2-c3m3](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-rgwj-5xj2-c3m3): unsolicited cleartext authentication and unbounded compressed-packet inflation. The fixes shipped in [3.22.0](https://github.com/sidorares/node-mysql2/releases/tag/v3.22.0) and [3.23.1](https://github.com/sidorares/node-mysql2/releases/tag/v3.23.1). |
| `@prisma/config@7.10.0` | `deepmerge-ts: "8.0.2"` | The maintainer's [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx) identifies versions below `8.0.0` as vulnerable to stack exhaustion on recursive object graphs. |

The `deepmerge-ts` override crosses a major-version boundary. The installed
Prisma config loader uses the named `deepmerge` export on plain configuration
records; the reviewed three merge cases remained equivalent. The changed Map
merging and custom/in-place helper behavior is outside that use. Actual config
loading and client generation passed during `npm install`; this evidence does
not complete the remaining application or database verification.

`npm ls` confirmed the scoped versions, including the deduplicated `mariadb`
connector. The 7 October 2026 production-only audit (`npm audit --omit=dev
--json`) reports zero vulnerabilities. The full audit retains seven high
development-only package entries from the existing `braces` chains through
Next lint tooling and nodemon. No forced framework downgrade or peer bypass is
applied. Keep actual checks and open verification in the
[progress record](development-progress.md).

Recheck all three overrides when upgrading their Prisma parent packages.
Remove each only after the upstream dependency selects a patched compatible
version, the lockfile resolves it, and generation, configuration loading,
application/database checks and both audit scopes pass review. Until then,
retain exact scopes and recheck the major override against any config changes.

The `prisma-client` generator emits ESM TypeScript into
`src/server/generated/prisma`, with `.ts` import extensions for the pinned Node
runtime's TypeScript support. Generated files are ignored and reproduced during
installation/checks. Application services consume the guarded server database
module; browser components and shared public contracts do not import generated
database code. Database URLs remain private runtime secrets.

The generation wrapper adds `import "server-only";` after each generated
TypeScript file's header comments, preserving Prisma's `@ts-nocheck` directive
and licensing text. Generation supports the initial model-free schema without
an extra no-models flag.

Guarding runs after failed generation too, because Prisma can rewrite part of
an existing client before returning an error. Repeated guarding preserves the
headers and adds no duplicate markers.

The initial schema contains no application models. Its migration baseline
establishes migration history without inventing football, user, session, job or
quota entities. Later prompts add the models, SQL constraints and indexes they
own after their contracts are established. Integration probes exist only in
their disposable test target.

## Environment and connection modes

Copy the documented contract in [`.env.example`](../.env.example) into a private
environment file. Leave database access disabled until an authorized target is
available. Do not place URLs or TLS secrets in `NEXT_PUBLIC_*` settings.

| Setting | Meaning |
| --- | --- |
| `GOAL_HINT_DATABASE_ENABLED` | Explicitly enables the database operation boundary. |
| `DATABASE_URL` | Private application MySQL URL for development or production. |
| `TEST_DATABASE_URL` | Private isolated test URL; test mode never falls back to the application URL. |
| `MIGRATION_DATABASE_URL` | Separate direct migration connection with DDL privileges; never implicitly uses the application credential. |
| `GOAL_HINT_DATABASE_CONNECTION_MODE` | `direct` records the supported TCP mode; remote/production targets require it explicitly. A hosted proxy requires separate compatibility evidence. |
| `GOAL_HINT_DATABASE_POOL_LIMIT` | Positive maximum connections per process. Local default is five; remote/production sizing must be explicit. |
| `GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS` | Positive connection timeout; local default 5,000 ms. |
| `GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS` | Positive pool acquisition timeout greater than the connection timeout; local default 10,000 ms. |
| `GOAL_HINT_DATABASE_IDLE_TIMEOUT_SECONDS` | Positive idle timeout; local default 30 seconds. |
| `GOAL_HINT_DATABASE_TLS_MODE` | `required` verifies encrypted remote/production connections. `disabled` is only a local development/test option. |
| `GOAL_HINT_DATABASE_TLS_CA_FILE` | Private approved PEM CA path when system trust does not cover the server certificate. |
| `GOAL_HINT_DATABASE_ACCESS_REF` | Reference to verified target ownership, direct-connection/TLS policy, actual application/migration grants and required test isolation. A reference string alone grants no access. |

URLs must use the validated `mysql:` format, identify one database and contain
supported options only. Unknown URL parameters fail validation. Passwords
containing reserved URL characters must be encoded. Differently spelled URLs,
credentials or options do not establish different databases.

For local loopback development/tests, omitted TLS mode may resolve to disabled.
The connector permits RSA public-key retrieval only for these nonproduction,
TLS-disabled loopback connections. This supports a fresh MySQL 8.4
`caching_sha2_password` account before its authentication cache is populated.
[MySQL's authentication reference](https://dev.mysql.com/doc/refman/8.4/en/caching-sha2-pluggable-authentication.html)
documents the TLS or RSA exchange needed for initial authentication. TLS,
remote and production connections keep key retrieval disabled.
Remote and production connections require TLS with certificate and hostname
verification; an absent provider CA is not permission to disable verification.
The migration connection must follow the same approved security policy. Hosted
poolers, proxy modes, connection limits and provider-specific CA requirements
must be verified before enabling a live target.

The application connector disables server-directed redirects so a connection
cannot silently reuse the approved target's credentials at another server.

Prisma Migrate's native URL uses `sslaccept=strict` for required TLS. The
[pinned engine source](https://github.com/prisma/prisma-engines/blob/0edf323efd1d98336f3f0a68684b56f689b900d3/quaint/src/connector/mysql/url.rs)
sets TLS on for that option even without a custom `sslcert`; certificate
verification remains enabled. Set `prefer_socket=false` so the selected direct
TCP target cannot become an implicit Unix-socket reconnect on another platform.

Any remote application/test target, or any target in production mode, also
requires the runtime policy's explicit infrastructure cap, budget-approval
reference and database-access reference. A trusted verifier must validate both
`budget-approval` and `database-access` against actual approval records, ownership,
connection security, least-privilege grants and required isolation before access.
Remote development/test mode does not waive these requirements. An approved
zero cap is an intentional free-service decision; an unset cap is unresolved.
Owned loopback development/tests retain the local defaults. Multiply the pool limit by all web replicas,
workers and concurrent deployment versions when sizing server capacity. Reserve
separate capacity for migration and recovery operators.

Application access gates the selected `DATABASE_URL` or, in test mode,
`TEST_DATABASE_URL`. Migration commands use the separate `database-migration`
operation boundary and gate the actual `MIGRATION_DATABASE_URL`; a local
application URL cannot authorize a remote migration target.

## Lifecycle, transactions and readiness

Reuse one lazy Prisma client and bounded connector pool per process. Next
development reloads reuse the process-global instance. Application requests do
not create their own pool or disconnect after every query. Long-lived workers
use the same reusable server service and close their client when shutting down.
One-off operator scripts close their owned client in `finally`.

`getDatabase()` returns the cached runtime; `createDatabase(policy, verifier)`
creates an explicitly owned runtime for an isolated context. Its `query(callback)`
passes the generated Prisma client, `transaction(callback, options)` passes the
transaction client, `readiness()` returns `ready` or `unavailable`, and
`disconnect()` closes that runtime. `disconnectDatabase()` closes the cached
process client. Remote/production callers supply the trusted budget and access
evidence verifier required by policy; configured reference strings are not proof.

The shared transaction helper passes a Prisma transaction client to the caller.
Nested repositories accept that client so related writes share one transaction.
Select isolation, time limits and locking from the feature's invariant; do not
automatically retry arbitrary callback side effects. Network/provider calls stay
outside held transactions. Retry deadlocks or serialization conflicts only at an
idempotent service boundary with bounded attempts and preserved business keys.

Private readiness reports necessary status only. It does not publish hostnames,
database names, server versions, credentials, SQL, driver messages or internal
schema details through a public endpoint. Database errors must retain only safe
classified status; raw Prisma/connector errors and query-event parameters must
not be logged. Nonempty process `DEBUG` is rejected before database access and
queries; the guard also remembers `DEBUG` enabled when the module loaded, because
adapter debug namespaces can retain that configuration and print SQL/parameters.
A successful connection probe does not prove grants, migrations,
backups, workload capacity or production qualification.

## Migration workflow

Prediction history from 019 extends canonical fixtures/evidence/model versions
with additive cycles, immutable sets/markets and schedule/audit records. Read
the [history runbook](prediction-history.md) for composite binding constraints,
column-scoped cycle grants and rollback that preserves forecast history.

| Command | Purpose and target |
| --- | --- |
| `npm run db:generate` | Reproduce the generated server client without connecting to a database. |
| `npm run db:validate` | Validate the schema without applying it. |
| `npm run db:migrate -- --name <lowercase_identifier>` | Generate SQL offline by comparing `prisma/schema.snapshot.prisma` with the current schema; review the new migration and updated snapshot together. |
| `npm run db:deploy` | Apply committed migrations using the explicit migration connection. |
| `npm run db:status` | Inspect the committed/applied migration state on that connection. |
| `npm run db:verify` | Check migration status, then compare the datasource with the Prisma schema using `migrate diff --exit-code`; drift fails without repair/reset. |
| `npm run db:health` | Run the private sanitized application-readiness probe. |
| `npm run test:db` | Run the disposable real-MySQL integration harness. |

Schema generation and validation must work when no URL is configured; no fake
connection target is supplied to make those commands pass. Targeted commands
must stop with sanitized guidance if migration configuration is missing. Do not
use automatic `db push`, migration reset or data deletion as a release strategy.

The Prisma config always supplies a datasource object, with its URL omitted for
offline commands. The pinned schema engine requires that object for offline
comparisons; omitting it can produce a misleading successful empty diff.
An unexpectedly blank diff now fails without creating a migration or updating
the snapshot; only Prisma's explicit empty-migration comment denotes no change.

The wrapper disables Prisma checkpoint telemetry and update requests so local
commands do not wait on that network work. It also rejects `DEBUG`, `NODE_DEBUG`
and `NODE_DEBUG_NATIVE` before spawning a migration child, whose environment
contains the private connection URL. Unexpected wrapper failures expose a
static message rather than raw filesystem, driver or process diagnostics.

Migration generation uses `migrate diff --from-schema` / `--to-schema --script`
and needs no database or shadow target. It writes a dated named migration and
advances the committed schema snapshot only when the diff contains actual SQL.
The snapshot represents the last migration's Prisma data model. Review and
commit both changes together; hand-written SQL constraints, grants and triggers
require their own review and checks because Prisma schema diff does not describe
every database capability. `db:verify` likewise reports representable schema
drift and migration status, not proof of every privilege or custom SQL invariant.

Use the npm wrapper commands. The Prisma config receives their validated prepared
migration URL and contains no private service imports; it is not itself a service
authorization boundary. Targetless commands omit that URL.

The current operator CLI and health command intentionally provide no trusted
budget/access evidence verifier. Remote/production target operations through
these commands therefore fail closed even when reference settings are filled.
A later approved operator integration must verify the underlying budget/access
records before wiring those gates; switching technical mode or setting a reference is not
an authorization workaround. The reusable runtime accepts an explicitly supplied
trusted verifier, but no live verifier or production target is claimed.

Create migrations incrementally, commit reviewed SQL and never rewrite an
already deployed migration. For a fresh authorized target, deploy, inspect status,
verify the resulting schema, then repeat deployment to prove it is a no-op.
Existing-data adoption requires an inspected baseline and explicit recovery
plan; do not declare existing migrations applied without checking the schema.

MySQL schema statements can implicitly commit. A failed migration may leave
earlier statements applied even though an application DML transaction would
roll back. Inspect migration records and actual table/constraint state, then
prepare a reviewed forward repair or an accurately recorded migration resolution.
Do not mark a failure resolved merely to suppress a deployment error.

## Privileges and storage conventions

Separate application and migration accounts. Grant the application account only
the database/table privileges its features use. Do not give it global privileges,
account creation,
grant delegation, schema DDL or access to `_prisma_migrations`. The migration
account may receive the required schema-scoped DDL and migration-history rights;
offline migration generation does not create a shadow database.
Never infer that a supplied root credential is a suitable application account.

Grant DML per feature-owned table. Immutable forecast/evidence/audit history
needs append-only repositories, grants and constraints appropriate to that
feature; a blanket `UPDATE`/`DELETE` grant does not establish immutability.
Synthetic test fixtures may use DDL only inside a target created and owned by
the harness. They do not establish the application's production grants.

- Store UTC instants as `DateTime @db.DateTime(3)` and serialize ISO 8601 UTC.
  Set connector/session time handling explicitly; `DATETIME` stores no timezone.
  Keep EAT date/window calculations in the shared calendar feature.
- Store monetary totals in integer minor units. Use exact `DECIMAL` for rates
  and probabilities, with feature-owned precision, scale, bounds and rounding.
  Avoid floating point persistence and unsafe conversion of large integers.
- Require InnoDB foreign keys and durable unique keys. Use consistent types and
  collations across related columns. Choose case-sensitive machine identity and
  normalized search behavior from validated provider contracts rather than name
  matching or an incidental server collation.
- Use indexed row locks or conditional updates together with durable uniqueness
  and ownership/version fencing. Connection-scoped locks alone cannot make a
  lease valid after the connection or worker dies.
- Append corrections with original provenance. Later migrations own the actual
  audit/history tables and their mutation restrictions.

## Evolution and rollback

Use expand/backfill/contract changes. Add compatible schema first, deploy code
that can coexist with the previous version, backfill in bounded restartable
batches, validate completeness, then remove obsolete fields only after old
applications/workers and rollback versions are retired. Review MySQL metadata
locking and migration duration against the actual target before rollout.

Application rollback keeps committed migration history and original forecast
records. It does not automatically apply down migrations, drop new tables or
restore an older backup over newer data. Prove backup/restore and approved
recovery objectives in prompt 045 before launch.

## Isolated integration evidence

The reusable harness must create a fresh private MySQL server data directory
and owned disposable database, with loopback-only access and no inherited server
configuration. `MYSQL_TEST_SERVER_BINARY` may select an installed test-server
binary; this test-only control is separate from application policy. Never start,
stop, initialize or clean an existing service/data directory to obtain evidence.

A portable official MySQL 8.4 LTS ZIP can supply the binary without installing
a service. Select it for the current PowerShell session, then run the harness:

```powershell
$env:MYSQL_TEST_SERVER_BINARY = 'C:\path\to\mysql-8.4\bin\mysqld.exe'
npm run test:db
```

The harness ignores the binary's installed configuration and supplies a fresh
data directory and unused loopback port. It verifies the directory, server UUID
and port before administrative mutations and again before shutdown. Each run
creates separate migration and application accounts; the application has DML
access only to its fixture table, and cannot read migration history or run DDL.
The migration role has database-scoped privileges and cannot read server accounts.
Test clients also disable inherited login-path files and `MYSQL_PWD`; the cold
application account connects through Prisma before any client login can warm
its authentication cache.

Before mutation or cleanup, verify the actual server/database identity and
harness ownership, not just `NODE_ENV=test`, a name prefix or unequal URL text.
Cleanup may remove only exact objects created by that run after ownership is
rechecked. Supplied application/production data must remain untouched.

The harness should prove committed and rolled-back Prisma read/write
transactions, repeat deployment/status, concurrent uniqueness or row-lock
behavior, UTC round trips, migration/application privilege separation and client
shutdown. Later prompts reuse the owned-target setup for their substantive
concurrency checks.

The 8 October 2026 acceptance run passed all eight checks on a fresh owned
MySQL 8.4.11 instance; actual commands and results are in the
[progress record](development-progress.md). If a future run has no server
binary, generation and local checks still run and the integration skip is
explicit. A local run establishes its tested compatibility and isolation only;
hosted target approval, TLS, grants, budgets, backups and release readiness
require their own evidence.
