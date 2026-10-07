# 003 PostgreSQL and Prisma runtime

**Feature:** Establish reliable database access and incremental migrations.

**Depends on:** [001 Project foundation](001-project-foundation.md), [002 Runtime policy](002-runtime-policy.md).

**Source:** [App specification](../app-write-up.md), sections 9–11 and 13–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and current configuration. Implement the minimal PostgreSQL/Prisma runtime used by application services and durable workers. Confirm the compatible Prisma 7 setup against the pinned runtime and official documentation; use the appropriate connection adapter and generated-client arrangement for the chosen stable version. Keep database credentials and generated server clients outside browser bundles.

Provide reusable database lifecycle helpers and transaction access that work for the chosen local runtime and eventual long-lived workers. Resolve required hosting/connection-mode choices from documented evidence before configuring a live target. Support development and an isolated test database through validated environment settings; never run test cleanup against an unverified database or existing production data.

Establish migration generation, deployment and verification commands, plus a minimal initial schema only where needed for infrastructure. Do not invent the complete football schema before the provider trial. Later feature prompts own their domain migrations, constraints and indexes. Do not add users, sessions, authentication tables or speculative entities. Document conventions for UTC timestamps, exact monetary/probability representations, referential integrity, durable uniqueness, transactions and append-only audit history without pretending those domain features already exist.

Use a least-privilege application connection strategy and document separate migration privileges. Define a safe approach to schema evolution and compatibility during application rollbacks. Health checks should reveal only necessary readiness information and must not expose secrets or internal database details publicly. Add a reusable isolated integration-test setup for transactional and concurrency checks required by later prompts.

## Acceptance checks

- A fresh isolated PostgreSQL database accepts committed migrations and the generated Prisma client performs a real read/write transaction.
- Migration status and repeat deployment behave predictably; a failed transaction rolls back its writes.
- The application and worker access pattern avoids accidental per-request connection creation and uses documented cleanup where appropriate.
- Database secrets cannot enter public configuration, logs or browser bundles.
- If no database is available, generation and local checks run, but database integration evidence is explicitly pending.

## Handoff

Record changed files, migration commands, database-backed checks and their results in `docs/development-progress.md`. Update `docs/implementation-decisions.md` for connection/runtime decisions and genuine blockers. Preserve existing data and report any migration limitation precisely.
