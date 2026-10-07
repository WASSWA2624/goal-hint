# Development progress

## 001 — Project foundation

Date: 7 October 2026 (Africa/Kampala).

Status: complete. Prompt 001 acceptance checks passed; the development-tool
maintenance limitations below remain open. There are no unresolved application
blockers for this foundation.

### Scope and changes

Implemented the private Next.js App Router package and a minimal English page
that explicitly says predictions are not yet available. It requires no visitor
account, credentials, tokens, cookies, database or provider access. Product UI,
styled-components rendering, Redux providers and database integration remain
with their owning prompts. No deployment or service purchase was made.

The repository initially had no application manifest, lockfile, runtime pin or
repository AGENTS.md file; the instructions supplied in the chat apply. npm was
selected to match the installed Node LTS toolchain. Existing specification,
development plans, brand sources, asset-generation scripts and public assets
are preserved.

Changed/added files:

- `package.json`, `package-lock.json`, `.npmrc`, `.node-version`, `.nvmrc`:
  exact dependency/runtime pins and reproducible install/check commands.
- `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`: strict TypeScript,
  standard App Router configuration and enforced server/worker import markers.
- `.gitignore`, `.env.example`: generated-file and secret exclusions; no runtime
  settings required yet.
- `src/app/layout.tsx`, `src/app/page.tsx`: minimal server-rendered entry.
- `src/components/README.md`, `src/domain/README.md`, `src/server/README.md`,
  `src/workers/README.md`: reusable runtime boundaries without speculative code.
- `tests/boundaries.test.mjs`: permitted/rejected dependency directions,
  mandatory server markers and a real rejected transitive client compilation.
- `README.md`, `docs/implementation-decisions.md`, this file: local setup,
  compatibility evidence and implementation handoff.

### Version rationale

Next.js 16.4.0 and the Prisma 7 baseline were checked against official sources
and publisher package metadata. Node 24.18.1 LTS/npm 11.16.0 match this machine;
TypeScript 5.9.3 and ESLint 9.39.5 fit the framework and lint-plugin support
ranges. All direct dependencies are exact pins; the lockfile fixes transitive
resolution. See the [decision register](implementation-decisions.md) for the
complete version table, dated links and deferred integration decisions.

### Verification

All commands used Node `v24.18.1` and npm `11.16.0` on Windows. Next telemetry
was disabled for verification processes. No application secrets were configured.

| Check | Result |
| --- | --- |
| `npm install` | Passed; created the npm v3 lockfile with exact direct dependencies. |
| `npm ci` | Passed from the lockfile; SHA-256 before/after confirmed the lockfile was unchanged. |
| `npm ls --depth=0` | Passed; installed direct versions match the decision register. |
| `npm run lint` | Passed with zero warnings. |
| `npm run typecheck` | Passed, including route generation before the first production build. |
| `npm test` | Passed: five tests, zero failures/skips. The real transitive client import failed compilation with the expected `server-only` diagnostic; temporary fixtures were removed. |
| `npm run build` | Passed with the default Turbopack bundler; `/` and the framework not-found page prerendered. |
| `npm run check` after `npm ci` | Passed (exit 0): lint, route generation/type-check, all five boundary tests, and production build against the clean locked install. |
| `npm start -- --hostname 127.0.0.1 --port 3101` | Started the production server successfully; stopped after verification. |
| Anonymous PowerShell HTTP checks | `/` returned 200 with heading and honest unavailable copy, without sending credentials or receiving `Set-Cookie`; `/brand/goal-hint-logo-primary.svg` returned 200 and matched the source exactly; an unknown route returned 404. |
| In-app browser inspection | Production page displayed the heading and development notice; no browser console warnings/errors were captured. The temporary browser tab was closed. |
| `git diff --exit-code -- app-write-up.md dev-plan assets public scripts` | Passed; all original specification, plan, script and brand files are unchanged. |
| `git diff --check` | Passed. |
| `npm audit --omit=dev --json` | Passed: zero reported production vulnerabilities. |
| `npm audit --json` | Exit 1: five high-severity package entries in one development-only dependency chain; see limitations below. |

The first test run found a lint-reserved test variable name and an assertion
depending on an intermediate module appearing in Turbopack's error trace. Both
were corrected; the final test asserts the private source, client entry and
specific server-only diagnostic while retaining the transitive import fixture.

### Limitations and pending work

- ESLint 9 is end-of-life, but the current Next.js React lint plugin excludes
  ESLint 10 from its declared peer support. The compatible pin is retained
  without forced dependency resolution.
- The full audit's five entries all derive from the development-only `braces`
  stack-exhaustion advisory. No compatible patched release is published. The
  audit's proposed Next lint configuration downgrade was not applied. The
  [decision register](implementation-decisions.md) records evidence and the
  maintenance follow-up. This audit remains open despite passing app checks.
- npm also reports an unapproved `unrs-resolver` postinstall script. Installation
  and the checks passed under npm's existing policy; no script-policy override
  was needed or applied.
- Prisma/database checks, styled-components rendering/hydration, Redux behavior,
  provider calls, workers and deployment checks are deferred to their owning
  prompts. None is represented as implemented or verified here.

### Handoff

Only prompt 001 was implemented. Prompt 002 owns runtime-policy validation
and the broader operating decision register; prompt 003 owns Prisma/PostgreSQL.
No product, provider, quality, staging or release gate is claimed by this
foundation. Deferred choices and their first affected prompts are listed in the
[decision register](implementation-decisions.md).

## 002 — Runtime policy

Date: 7 October 2026 (Africa/Kampala).

Status: implemented; runtime-policy acceptance checks and nodemon save/restart
verification passed. External integrations and unresolved choices remain pending
at their owning prompts.

### Implemented behavior

Added one immutable public product projection and a typed server-owned runtime
contract. Settled identity/origin, English/light/free access, regulation-time
markets and 2.5 goals line, EAT/seven-day/daily cadence, strict five-minute
publication cutoff, AI priority/fallback, shared provider quotas, direct Mega and
the US$45 payable ceiling have discoverable definitions. Ads, extra locales,
dark mode and exact scores stay disabled; contradictory overrides fail.

Private secrets require explicit reads and redact string/JSON serialization.
Environment parsing rejects malformed supplied values, unknown app settings,
public environment exports, duplicate IDs, invalid/unsafe numbers, excessive
allowances and equal declared live/test database targets. Missing optional
choices remain `null`. Enabled affected capabilities fail structural validation
when required configuration is unresolved.

Next's Node instrumentation validates the process policy once. Service/worker
operation guards additionally require trusted verification of the relevant
rights, budget, account and pipeline records; arbitrary reference strings grant
no authority. Individual paid calls cannot bypass their enclosing phase gate.
Private shadow may gather quality evidence after its applicable private-use,
budget and pipeline prerequisites; production additionally requires public
rights, actual quality qualification and release approval. Test mode cannot
authorize paid/provider or forecasting work, and database tests never fall back
to the live URL. No live evidence verifier/provider/worker was created.

At the user's added request, `npm run dev` now uses pinned nodemon to restart the
Next development server on saved source, asset, configuration and environment
changes, including files created after startup. Next.js continues browser Fast
Refresh.

### Changed files

- `src/domain/public-policy.ts`: immutable browser-safe settings and type.
- `src/server/config/runtime-policy.ts`: schemas, private policy, redacted
  errors/secrets, configuration validation and trusted-evidence operation guards.
- `src/instrumentation.ts`: Node startup validation without importing private
  configuration into Edge/client modules.
- `src/app/layout.tsx`, `src/app/page.tsx`: reuse the shared brand/locale settings.
- `scripts/check-runtime-policy.mjs`, `.env.example`, `README.md`: structural
  configuration command and documented local workflow without credentials.
- `package.json`, `package-lock.json`, `tsconfig.json`: exact Zod/nodemon pins,
  Node server condition for tests, native TypeScript import support and commands.
- `nodemon.json`: scoped save watching and restart debounce.
- `tests/runtime-policy.test.mjs`: synthetic configuration, redaction, readiness,
  immutable projections, example environment and live-gate failure cases.
- `docs/implementation-decisions.md`, this file: preserved prior records and
  comprehensive settled/unresolved operating handoff with first dependencies.

### Verification

Node `v24.18.1`, npm `11.16.0`; Next telemetry disabled for verification. All
credential, policy and evidence fixtures were explicitly synthetic. No real
provider/database calls, purchases, messages or deployment occurred.

| Command/check | Result |
| --- | --- |
| `npm install zod@4.6.5`; `npm install --save-dev nodemon@3.1.14` | Passed; exact manifest/lockfile pins. |
| `npm run check` | Passed: lint with zero warnings, strict type-check, then-current 25 tests, and production Turbopack build. |
| Final `npm test` after test refinements | Passed: **26 tests**, zero failures/skips (5 boundary + 21 runtime-policy groups). |
| `npm run policy:check` | Passed with no local configuration required; prints structural readiness only. |
| `node --conditions=react-server --env-file=.env.example scripts/check-runtime-policy.mjs` | Passed with the complete committed example; no credentials/approvals enabled. |
| Production instrumentation with synthetic provider key and enabled trial capability but missing payable/budget/use-rights policy | Rejected server preparation; HTTP 500, no synthetic credential in logs or response. Next remained listening until the owned test process was stopped; no healthy startup or affected operation was claimed. |
| Default `npm start -- --hostname 127.0.0.1 --port 3101` and anonymous HTTP check | Passed: HTTP 200, shared heading, no visitor cookie or private policy fields in HTML. Owned server stopped afterward. |
| Nodemon isolated save/restart smoke on port 3104 | Passed: source edit restarted the real Next child and returned updated HTTP 200 output; existing `.env.local` edits restarted; final glob configuration detected initially absent `.env.local` creation and subsequent edits with distinct child processes and updated HTTP 200 output. 137 generated files plus an explicit `.next` write caused no further restart. Owned servers stopped, port 3104 closed. |
| `git diff --exit-code -- app-write-up.md dev-plan assets public`; `git diff --check` | Passed; specification, plans and brand assets preserved. Existing staged/unrelated foundation work retained. |
| `npm audit --omit=dev --json` | Passed: zero reported production vulnerabilities. |
| Full `npm audit --json` | Seven high-severity development-only package entries from the same unpatched braces advisory; historical 001 had five. Nodemon/chokidar add two affected chain entries. |

One malformed-URL refinement initially propagated a native URL exception. It
was replaced with a guarded validator; sentinel-based tests now confirm static
redacted errors across message, stack, JSON and inspection. Reviews also exposed
the need to verify underlying evidence, rather than accept nonempty references;
the final operation guard fails closed without a trusted verifier.

The first repo-local nodemon smoke encountered the user's already-running Next
development lock; that process was left running. Isolated synthetic Next projects
were used instead. Literal absent environment paths and a plain `.env*` glob
missed newly created files on Windows. The final `.env{,.*}` pattern, with the
tracked `.env.example` explicitly watched to enable dotfile monitoring, passed
creation/edit checks in a fixture without a dot-directory ancestor.

### Handoff and unresolved dependencies

The [decision register](implementation-decisions.md) contains 35 current
unresolved/evidence items, with source, unknown ownership where appropriate,
affected accepted configuration or explicitly deferred fields, and first prompt.
The next dependency is the database target/connection/privilege and isolated-test
choice in **003**. Numeric tolerances follow in **005**; account/credentials,
competitions and rights in **006–008**; spending/providers/evidence/model choices
in **010–014**. Queue/private jobs (**020**), status/polling (**022/026**), public
claims/legal/contact (**030/038–041**), recovery/monitoring/backups (**043–045**),
hosting/shadow qualification/release/domain (**046–049**) remain explicitly
pending. No missing choice is treated as approved or requested prematurely.

Actual evidence verification, quota/spend accounting, database target isolation,
workers, prospective quality and deployment checks belong to their owning
prompts. No live capability is enabled by the defaults/example. Existing ESLint
EOL, braces audit and npm optional postinstall-policy limitations remain recorded.
Prompt 003 was not started.

Automatic approval review rejected recursive removal of the verified owned
nodemon smoke fixture with “blocked by policy” and supplied no further reason.
The ignored synthetic fixture/logs remain under `.tmp`; no alternate deletion
route was attempted. Further watcher verification output remains under ignored
`out/`. All owned test processes were stopped; the user's development process
was preserved.
