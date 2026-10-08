# 003 MySQL and Prisma runtime

**Feature:** Establish reliable database access and incremental migrations.

**Depends on:** [001 Project foundation](001-project-foundation.md), [002 Runtime policy](002-runtime-policy.md).

**Source:** [App specification](../app-write-up.md), sections 9–11 and 13–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and current configuration. Implement the minimal MySQL/Prisma runtime used by application services and durable workers, with MySQL 8.4 LTS and InnoDB as the server baseline. Confirm the compatible Prisma 7 setup against the pinned runtime and official documentation; use the MySQL datasource provider, appropriate connection adapter and generated-client arrangement for the chosen stable version. Keep database credentials and generated server clients outside browser bundles.

Provide reusable database lifecycle helpers and transaction access that work for the chosen local runtime and eventual long-lived workers. Resolve required hosting/connection-mode choices from documented evidence before configuring a live target. Support development and an isolated test database through validated environment settings; never run test cleanup against an unverified database or existing production data.

Establish migration generation, deployment and verification commands, plus a minimal initial schema only where needed for infrastructure. Do not invent the complete football schema before the provider trial. Later feature prompts own their domain migrations, constraints and indexes. Do not add users, sessions, authentication tables or speculative entities. Document UTC instants stored in explicitly precise `DATETIME(3)` fields, UTC connection/serialization behavior, exact monetary/probability representations, InnoDB foreign keys, durable uniqueness, transactions and append-only audit history without pretending those domain features already exist. Use row locking or conditional updates with uniqueness and ownership fencing for concurrent mutations; no connection-scoped lock alone establishes durable ownership.

Use a least-privilege application connection strategy and document separate migration privileges. Define a safe approach to schema evolution and compatibility during application rollbacks. Account for MySQL DDL implicit commits: failed schema changes cannot be treated like a rolled-back application transaction, and recovery must inspect actual schema/migration state. Health checks should reveal only necessary readiness information and must not expose secrets or internal database details publicly. Add a reusable isolated integration-test setup for transactional and concurrency checks required by later prompts.

## Acceptance checks

- A fresh isolated MySQL database accepts committed migrations and the generated Prisma client performs a real InnoDB read/write transaction.
- Migration status and repeat deployment behave predictably; a failed application DML transaction rolls back its writes. Document separate recovery for partially applied DDL.
- The application and worker access pattern avoids accidental per-request connection creation and uses documented cleanup where appropriate.
- Database secrets cannot enter public configuration, logs or browser bundles.
- If no database is available, generation and local checks run, but database integration evidence is explicitly pending.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, migration commands, database-backed checks and their results in `docs/development-progress.md`. Update `docs/implementation-decisions.md` for connection/runtime decisions and genuine blockers. Preserve existing data and report any migration limitation precisely.
