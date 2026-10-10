# Goal Hint

![Goal Hint](public/brand/goal-hint-logo-primary.svg)

A free football prediction website with estimated probabilities, clear analysis and verifiable outcomes.

The Next.js foundation, runtime policy, MySQL/Prisma access, calendar, market domain
and shared football quota limiter are implemented. The entry page states that
predictions are not yet available; product features follow the numbered plan.

- [App specification](app-write-up.md): scope, user experience, prediction rules, architecture and launch requirements.
- [Development prompts](dev-plan/000-index.md): run numbered feature prompts in order to implement the application.
- [Brand guide](assets/brand/README.md): logo variants, palette, file inventory, usage and regeneration.
- [Brand preview](assets/brand/goal-hint-brand-preview.html): open locally to inspect the complete identity.
- [Brand sheet](assets/brand/goal-hint-brand-sheet.png): shareable visual overview.

Production-ready artwork is in `public/brand/`; editable sources, tokens and the original logo reference are in `assets/brand/`. Use “Goal Hint” consistently, with deep navy, teal and square component corners.

## Local development

Use **Node.js 24.18.1 LTS** and **npm 11.16.0**. The versions are pinned in
`package.json`, `.node-version` and `.nvmrc`; `.npmrc` rejects incompatible
engines and saves exact dependency versions. With fnm, run `fnm install` then
`fnm use` in this directory. With nvm, use `nvm install` and `nvm use` (nvm-windows
users should pass `24.18.1` explicitly). Confirm `node --version` and
`npm --version` before installing.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No database, account, token, cookie
or provider credentials are needed for the foundation. Install from
`package-lock.json` with `npm ci`; use `npm install` only for intentional,
reviewed dependency updates and commit the resulting lockfile.

The development command uses nodemon to restart Next.js after saved source,
public asset, TypeScript/Next configuration or environment file changes,
including environment files created after startup.
Next.js handles browser Fast Refresh. `nodemon.json` defines the watch paths and
debounces saves; generated output and dependency directories are excluded.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js under nodemon with automatic restart on saved changes. |
| `npm run lint` | Run Next.js/TypeScript lint and module-boundary rules. |
| `npm run typecheck` | Generate route types, then check strict TypeScript. |
| `npm test` | Check module boundaries, runtime validation and operation gates. |
| `npm run policy:check` | Validate server configuration from the process and optional `.env.local`. |
| `npm run build` | Compile and prerender the production application. |
| `npm start` | Serve the completed production build. |
| `npm run check` | Run lint, type-check, tests and production build in order. |
| `npm run db:generate` / `npm run db:validate` | Generate the guarded Prisma client and validate the MySQL schema without a database. |
| `npm run db:migrate -- --name <change>` | Generate a reviewable migration offline from the committed schema snapshot. |
| `npm run db:deploy` / `npm run db:status` / `npm run db:verify` | Deploy reviewed migrations, check their state and detect schema drift using separate migration credentials. |
| `npm run db:health` | Report private database readiness without internal diagnostics. |
| `npm run test:db` | Run integration checks in a newly owned isolated MySQL server; explicitly skips when no genuine server binary is available. |
| `npm run test:quota` | Run shared quota, concurrency and reset checks on an owned isolated MySQL server. |
| `npm run trial:football -- init` / `report` / `run` | Generate private provider evidence reports or resume an explicitly authorized bounded trial. |

Next.js generates ignored `next-env.d.ts` and `.next/` files. The type-check
command works before the first development or production build. ESLint is a
separate check because Next.js 16 builds do not run it automatically. Tests use
Node's built-in runner and isolated temporary projects; the default tests make no
provider or database calls. Database-backed checks use the separate isolated harness.

## Live data

`npm run dev` only reads stored data. To fill it from the real API-Football account,
run the private live runner beside it. Daily selection at 00:00 EAT, provisional
API-Football fallback forecasts, cutoff locks, result polling and settlement are all
sized from the account's verified plan limits, so an upgrade needs no code change.

```sh
npm run live:status
npm run live:competitions -- --write
npm run live
```

Read the [live operations runbook](docs/live-operations.md) first: it covers the ignored
`.env.operations` and owner-approval files and what remains outside live operation (AI,
research, qualification, hosting).

## Environment workflow

The minimal public page works with no environment variables. Copy `.env.example`
to ignored `.env.local` to configure later features; blank owner choices remain
explicitly unresolved. Market tolerances use the approved versioned defaults
described in the [shared market contract](docs/markets.md). Keep real credentials
in local environment files or deployment secret storage. Public settings come from `src/domain/public-policy.ts`;
`NEXT_PUBLIC_*` and unknown `GOAL_HINT_*` settings fail validation. The settled
launch features cannot be enabled through environment overrides.

`src/server/config/runtime-policy.ts` owns private configuration and operational
rules. `getRuntimePolicy()` validates and caches it once per process; Next's Node
startup hook calls it. Restart after changing settings. Invalid supplied values
and enabled capabilities missing prerequisites fail with field names and static
guidance, without printing raw inputs or credentials. Money uses integer US
cents; strict boolean settings accept only `true` or `false`.

`GOAL_HINT_OPERATION_SCOPE` defaults to `disabled`. `trial` requires approved
bounded paid-use inputs but can collect missing qualification evidence. `shadow`
requires applicable private-use rights, budgets, an explicit protocol and pipeline
integrity. `production` additionally requires public rights, measured quality and
release approval, and runs only with `NODE_ENV=production`. Next's production
build mode alone does not enable any service. Optional capabilities default off;
missing configuration never supplies a zero-cost allowance or implied approval.

Future services/workers must call `assertOperationAllowed(policy, operation,
verifyEvidence)` before affected work. The trusted verifier must check actual
recorded evidence for the named requirement; references alone grant no authority.
An absent, false or throwing verifier fails closed with a redacted error. Individual
paid calls also enforce the enclosing shadow/production gate. This contract
validates readiness; prompts 006/010/020 implement shared quotas, spending and
durable execution. No provider, worker or prediction process is activated here.

`npm run policy:check` uses Node's optional `.env.local` loader and reports only
structural readiness. It does not mirror Next's full `.env.*` precedence or prove
external evidence. Set production settings in the intended process environment.
Tests supply isolated synthetic configuration; `NODE_ENV=test` cannot authorize
paid/provider, shadow or publication operations. Test database access requires
`TEST_DATABASE_URL` and never falls back to `DATABASE_URL`; the integration harness
owns a fresh server/data directory and verifies its identity before mutation.
Secret wrappers require an explicit `.read()` in server adapters
and redact string/JSON serialization. Never put credentials in `next.config.ts`
exports or browser imports.

## MySQL and migrations

The specification now requires **MySQL 8.4 LTS/InnoDB** with Prisma 7.10.0.
Database access stays disabled until an approved target and credentials are
configured. Application services and workers share one lazy process pool through
`src/server/database/client.ts`; close it only at script/worker shutdown.
Transactions expose a shared Prisma transaction client and redact failures.

`MIGRATION_DATABASE_URL` supplies separate DDL credentials. Offline migration
generation uses `prisma/schema.snapshot.prisma`, creates SQL only for actual
changes and advances the snapshot for review together with the migration.
Generation/validation need no URL. The initial migration establishes history;
prompt 006 adds the incremental account, period and attempted-request quota tables.

Remote/production targets require approved direct connections, verified TLS and
explicit production pool sizing. Production operation guards also require the
existing trusted budget-evidence verifier. The CLI/health commands have no live
verifier wired, so production target operations remain blocked. Test processes
ignore local environment files and never reuse an existing service or database
for cleanup. Read the [database runbook](docs/database.md) for privileges, commands,
UTC/exact-number conventions, rollback compatibility and pending live evidence.

## Shared football quotas

Server callers use the durable MySQL limiter and authorized single-use gateway in
`src/server/football`. It applies shared rolling limits, even pacing, the protected
essential reserve, conservative header reconciliation and counted reset probes.
Run `npm run test:quota` with an available genuine MySQL binary for isolated
database acceptance. See the [quota contract](docs/quota-limiter.md) for caller
identity, priorities, timeout/retry rules and the adapter handoff. Actual provider
account/reset evidence remains pending prompt 008; no live calls are enabled.

## Code boundaries

This is one private package and one strict TypeScript workspace, with `@/*`
mapping to `src/*`. Additional packages are unnecessary at this stage.

| Directory | Responsibility |
| --- | --- |
| `src/app` | App Router pages, layouts and later route handlers; server by default. |
| `src/components` | Reusable presentation and browser components. |
| `src/domain` | Pure contracts and rules shared by every runtime. |
| `src/server` | Server-only configuration, services, database and provider adapters. |
| `src/workers` | Durable worker entry points and orchestration. |
| `tests` | Boundary checks; later features add meaningful behavioral tests. |

Each boundary has local guidance. Server/worker executable modules must import
`server-only`; the build rejects their use from Client Components. ESLint also
requires that marker and restricts imports across layers. Share public types
through `src/domain`, not a barrel that re-exports server or worker code. Keep
provider SDKs, secrets and queue dependencies in the appropriate server boundary.

Redux Toolkit, react-redux and styled-components are pinned but their providers
and rendering setup are deliberately deferred to prompts 015–017. Read
[implementation decisions](docs/implementation-decisions.md) for compatibility
evidence and [development progress](docs/development-progress.md) for verified
checks and outstanding work.

## API-Football adapter

Server callers use the typed, policy-authorized adapter in `src/server/football`
for fixtures, live data, teams/competitions, statistics, availability and isolated
fallback predictions. Every HTTP attempt and retry uses the shared quota gateway;
callers supply explicit bounds and trusted permissions. Read the
[adapter contract](docs/api-football-adapter.md) for endpoint pagination,
completeness, structured caching, score verification and logo rights. Contract
tests use synthetic responses; actual account and coverage qualification remains
with prompt 008.

The [provider trial runbook](docs/football-provider-trial.md) covers offline
`init`/`report`, approved plans, trusted authority modules and resumable `run`.
Reports distinguish real evidence from synthetic contracts; missing account,
competition, allowance and rights inputs keep live qualification incomplete.

## Canonical football catalog

Private server workers import validated fixtures, teams and competitions through
`createFootballCatalogImporter` and the existing provider adapter. MySQL preserves
canonical identities, searchable aliases, original observations, exact import
coverage and audited fixture versions. No visitor request initiates an import.
Read the [catalog contract](docs/football-catalog.md) for authorization, update
rules and the transaction boundary for later schedule services. Run
`npm run test:catalog` with an available genuine MySQL binary for isolated
concurrency acceptance. Actual retention, mapping and provider rights remain
pending the recorded trial evidence.

## Research and AI budgets

Private workers use the shared cost ledger and single-attempt gateway in
`src/server/cost-control`. It holds exact maximum spend before dispatch, preserves
uncertain charges, enforces independent AI/research caps and job allocations, and
keeps fallback time available. Read the [cost-control contract](docs/research-cost-control.md)
for pricing, reconciliation, reuse and safe summaries. `npm run test:cost` runs
isolated genuine MySQL concurrency acceptance. Actual providers, rates, caps and
operating bounds remain unresolved; live paid dispatch stays blocked.

## Fixture evidence

Private callers use `src/server/evidence` to collect attributable football facts,
apply explicit coverage/freshness rules and persist immutable fixture snapshots.
Source text stays inert; approved source fetches validate public DNS targets and
redirects. Read the [evidence runbook](docs/fixture-evidence.md) for identities,
permissions, replay and retention. `npm run test:evidence` runs isolated genuine
MySQL acceptance. The licensed news provider, concrete adapter and operating
policies remain pending, so **011 is not yet complete** in the tracker.

## Primary AI predictor

Private callers use `src/server/predictor` to pin immutable model configurations,
prepare approved evidence, validate probability groups and citations, and return
provisional candidates through the existing cost gateway. The
[predictor runbook](docs/ai-predictor.md) describes current permissions, calibration
hooks and failure reasons. `npm run test:predictor` runs isolated genuine MySQL
registry acceptance. No actual AI provider/model or calibration configuration
has been selected; its provider-specific adapter and live integration remain
incomplete, so **012 remains unchecked**.

## Validated provider fallback

Private refresh callers use `src/server/fallback` to retain valid AI groups and
fill missing match-result groups through the shared API-Football quota gateway.
Every candidate preserves source clocks, job-scoped cache provenance and explicit
unavailable-family reasons; zero valid groups signal later retention logic.
Read the [fallback runbook](docs/provider-fallback.md) for identity, freshness,
budget and source-proof contracts. Current provider inputs do not support full
total-goals or BTTS distributions. Actual trial mapping, freshness and rights
evidence remain required before enabling live fallback.

## Chronological forecast evaluation

Private callers use `src/server/evaluation` to verify original as-of datasets,
reconstruct cutoff-safe league/rating baselines and score matched market/horizon
cohorts. Frozen protocol and dataset identities make reports reproducible;
missing, pending and void observations stay visible. Double chance uses
overlapping binary events with one selected headline pick per fixture.
Read the [evaluation runbook](docs/forecast-evaluation.md) for metrics, immutable
archives and the prospective capture plan. `npm run evaluation:report` writes a
readiness report without live requests. Actual periods, thresholds, model
selection and qualifying observations remain pending; **014 remains unchecked**.

## Shared brand styling

The application uses the existing navy/teal brand, locally loaded Manrope and
one streamed styled-components registry with a light theme. Reusable layout,
brand image, button/link, labeled field, status and empty-state primitives use
square corners, visible focus and responsive logical spacing. A component
preview appears on the development homepage; production retains the honest
development state. Read the [styling runbook](docs/brand-styling.md) for exports
and accessibility contracts. `npm run test:styling` verifies production initial
HTML, genuine delayed streaming, style reuse and the browser/server boundary.
