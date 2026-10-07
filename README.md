# Goal Hint

![Goal Hint](public/brand/goal-hint-logo-primary.svg)

A free football prediction website with estimated probabilities, clear analysis and verifiable outcomes.

The Next.js application foundation is implemented. The entry page states that
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

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server. |
| `npm run lint` | Run Next.js/TypeScript lint and module-boundary rules. |
| `npm run typecheck` | Generate route types, then check strict TypeScript. |
| `npm test` | Check import boundaries, including a rejected client build. |
| `npm run build` | Compile and prerender the production application. |
| `npm start` | Serve the completed production build. |
| `npm run check` | Run lint, type-check, tests and production build in order. |

Next.js generates ignored `next-env.d.ts` and `.next/` files. The type-check
command works before the first development or production build. ESLint is a
separate check because Next.js 16 builds do not run it automatically. Tests use
Node's built-in runner and isolated temporary projects; no provider or database
calls are made.

## Environment workflow

The foundation needs no environment variables. `.env.example` documents this;
copy it to `.env.local` when configuration becomes necessary. Keep real values
in ignored local environment files or deployment secret storage. Commit only
documented, nonsecret examples. Never put credentials in `NEXT_PUBLIC_*`,
`next.config.ts` exports or browser imports. Prompt 002 owns typed environment
validation, and prompt 003 adds the Prisma/PostgreSQL integration.

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
