# Goal Hint

![Goal Hint](public/brand/goal-hint-logo-primary.svg)

A free football prediction website with estimated probabilities, clear analysis and verifiable outcomes.

The Next.js application foundation and runtime policy are implemented. The entry page states that
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

Next.js generates ignored `next-env.d.ts` and `.next/` files. The type-check
command works before the first development or production build. ESLint is a
separate check because Next.js 16 builds do not run it automatically. Tests use
Node's built-in runner and isolated temporary projects; no provider or database
calls are made.

## Environment workflow

The minimal public page works with no environment variables. Copy `.env.example`
to ignored `.env.local` to configure later features; blank optional values remain
explicitly unresolved. Keep real credentials in local environment files or
deployment secret storage. Public settings come from `src/domain/public-policy.ts`;
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
`TEST_DATABASE_URL` and never falls back to `DATABASE_URL`; prompt 003 must verify
actual isolation. Secret wrappers require an explicit `.read()` in server adapters
and redact string/JSON serialization. Never put credentials in `next.config.ts`
exports or browser imports.

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
