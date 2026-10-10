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

## 003 — MySQL and Prisma runtime

Date: 8 October 2026 (Africa/Kampala).

Status: complete. Prompt 003 acceptance checks and final repository checks passed
on the pinned runtime. Live database approval and deployment evidence remain
unresolved in the decision register.

### Implementation and fixes

Completed the existing minimal MySQL/Prisma foundation without adding domain
models. Services and workers reuse one lazy, bounded process pool and generated
server client. The runtime exposes guarded query and transaction callbacks,
sanitized readiness and errors, and explicit shutdown; development module reloads
reuse the same client. UTC sessions and millisecond/exact-decimal conventions,
application/migration privileges and compatible schema evolution are documented
in the [database runbook](database.md).

Fixed the targetless Prisma config to supply an empty datasource object. The
pinned native schema engine needs it for offline diff; without it, the CLI could
return exit 0 and empty SQL despite a changed schema. Offline migration generation
now creates real reviewed SQL in an isolated fixture, advances its snapshot only
for an actual change and rejects unexpectedly blank output. The committed
model-free schema and baseline migration are preserved.

Disabled checkpoint/update requests for Prisma child commands, guarded debug
settings that can expose child environment credentials, and redacted unexpected
wrapper failures. Client generation restores server-only markers even after a
failed partial generation, preserving headers and avoiding duplicate imports.
Real Next client-compilation tests enforce both direct and transitive boundaries.

The runtime now sanitizes all pool/adapter/client initialization failures and
releases an owned pool when initialization fails. It refuses server-directed
redirects. Cold MySQL 8.4 `caching_sha2_password` authentication uses RSA key
retrieval only for nonproduction, TLS-disabled loopback connections; remote,
TLS and production connections keep retrieval disabled and retain verified TLS.
A fresh application account reproduced the failure and verified the fix before
any other client login could populate its authentication cache.

The reusable integration harness owns a new data directory, loopback server and
disposable database. It rechecks the ownership marker, directory, server UUID
and port before administrative mutations, subtests and shutdown. Test clients
exclude inherited login-path files and `MYSQL_PWD`. Separate schema-scoped
migration and fixture-table DML accounts prove the documented privilege design.
All owned diagnostic and acceptance instances shut down and removed their
verified disposable directories; existing services and data were preserved.

### Changed files

- `prisma.config.ts`: targetless datasource object required by the native engine.
- `src/server/database/client.ts`, `connection.ts`: initialization cleanup and
  redaction, direct-target protection and local cold-authentication support.
- `scripts/database.mjs`: reliable offline commands, static failures, debug
  protection and generated-client guarding on success and failure.
- `tests/database.test.mjs`, `database-cli.test.mjs`: meaningful runtime, offline
  migration, redaction and failed-generation regressions. Database test child
  processes share a bounded 30-second cold-start timeout.
- `tests/database.integration.mjs`, `helpers/mysql-instance.mjs`: genuine isolated
  MySQL transactions, privileges, drift and repeated ownership verification.
- `docs/database.md`, `implementation-decisions.md`, this progress record and
  `dev-tracker.md`: connection decisions, procedures and actual handoff status.

### Verification

The final acceptance run uses Node `24.18.1`, npm `11.16.0`, Prisma `7.10.0`
and Oracle MySQL Community `8.4.11`. Rechecked publisher metadata and official
adapter/generator/runtime documentation; retained the existing exact dependency
pins and scoped connector/config overrides. See the
[decision register](implementation-decisions.md) for sources and constraints.

The official portable MySQL ZIP remains under ignored `.tmp/mysql-tools` for
repeat testing, without a service installation or changes to global MySQL
configuration. The published MD5 matched, and Oracle's detached signature
verified using its official release key. The portable binary was selected with
`MYSQL_TEST_SERVER_BINARY` for the acceptance run.

| Command/check | Result |
| --- | --- |
| `npm ls --depth=0`; `npm ls @prisma/adapter-mariadb mariadb mysql2 deepmerge-ts` | Passed; exact installed versions and all three scoped overrides resolve correctly. |
| Focused database runtime tests on Node 24 | Passed: 10 tests, including cold-auth settings, initialization cleanup/redaction and singleton lifecycle. |
| Focused database CLI tests | Passed: 6 tests covering offline SQL/snapshot generation, target isolation, argument validation, diagnostics and failed-generation guards. |
| `npm run check` on pinned Node/npm | Passed (exit 0): client generation, schema validation, lint with zero warnings, route/type generation, strict type-check, all 48 tests with zero failures/skips, and the production Turbopack build. |
| `npm run test:db` with the portable MySQL 8.4.11 binary on Node 24 | Passed: 8 tests, zero failures/skips. Fresh/repeated deployment, migration status and schema verification; restricted account access; drift detection without repair; real InnoDB commit, exact decimals and UTC `DATETIME(3)` round trip; DML rollback; concurrent durable uniqueness; process singleton and shutdown. |
| `npm run db:migrate -- --name verify_foundation` | Passed; unchanged committed schema produces no new migration or snapshot change. |
| `npm run db:health` without local database configuration | Passed; reports `disabled` without a connection or private diagnostics. |
| `npm audit --omit=dev --json` | Passed: zero reported production vulnerabilities. |
| `npm audit --json` | Exit 1: seven existing high-severity development-only entries in the recorded `braces` chains; no new database-package advisory remains. |
| `git diff --check`; committed schema/migration comparison; disposable-directory check | Passed: no whitespace errors, committed schemas and migrations unchanged, zero remaining disposable MySQL directories. |

The real run exposed uncached local authentication that the earlier migration
account's warmed cache had masked; the final restricted application account
connects without a warmup workaround. A parallel repository run hit a 10-second
singleton subprocess cold-start limit with no output. That test exited naturally
in 848 ms on a pinned-runtime isolated rerun; its shared bounded timeout now
allows cold Windows imports while preserving every assertion and natural exit.
An initial shell run selected Node 26; the final acceptance results above use
the explicitly selected pinned Node 24 runtime.

### Handoff and unresolved inputs

Prompt 003 introduces no football, authentication, job or quota tables and does
not enable live access. OP-01 still requires an approved hosted target,
credentials, actual least-privilege grants, TLS evidence and process/replica
capacity; OP-12 still requires itemized infrastructure approval. Remote/production
operator commands remain gated until a trusted evidence-verifier integration
exists. A local test success does not supply those approvals or qualify backups,
hosting or production operations. No provider calls, purchase or deployment was
performed. Prompt 003 is ticked in the root development tracker; prompt 004 was
not started.

## 004 — East Africa calendar

Date: 8 October 2026 (Africa/Kampala).

Status: complete. Prompt 004 implementation and acceptance checks passed on the
pinned runtime. Prompt 005 was not started.

### Implemented behavior and shared API

Added a reusable browser-safe calendar domain using `Africa/Kampala` reporting
dates and integer UTC epoch milliseconds. Strict parsers reject impossible,
noncanonical and normalized dates/times, including trailing line terminators;
Gregorian increments cover month/year/leap-century boundaries. Date inputs are
copied into primitives. Frozen run/query boundaries preserve original identity
without retaining mutable Date objects.

The 7 October 2026 run begins at `2026-10-06T21:00:00.000Z` and ends exclusively
at `2026-10-13T21:00:00.000Z`, covering 7–13 October EAT. Current decisions capture
an injected clock once, derive a new rolling window, and require original
manifest/window and current-window membership together. Historical bounded query
ranges remain valid outside prediction eligibility. Named-zone day boundaries
also handle historical 23.5-hour and 24.5-hour Kampala days.

Publication is strictly before scheduled kickoff minus 300 seconds. A supplied
earlier closing instant reduces the deadline; a later instant cannot extend it.
Kickoff display returns language-neutral `Intl` inputs with an explicit timezone
and unchanged reporting date/UTC value. An optional visitor-local date never
changes run identity or eligibility.

`calendarRules` is now the shared source of the existing runtime calendar policy.
The daily trigger contract remains 00:00 EAT and UTC cron `0 21 * * *` on the
preceding date. The module does not install or activate a scheduler.

| Shared API | Purpose |
| --- | --- |
| `parseReportingDate`, `addReportingDays` | Canonical Gregorian dates and validated increments. |
| UTC parsers/factories and `toUtcIsoString` | Millisecond instants, copied Date inputs and explicit UTC serialization. |
| `getReportingDate`, `getReportingDayBounds`, `createPredictionWindow`, `isInWindow` | Named-zone reporting dates and immutable inclusive/exclusive boundaries. |
| `validateReportingDateRange` | Mandatory inclusive endpoints and caller-supplied finite day cap, independently of prediction eligibility. |
| `getPublicationDeadline`, `isBeforePublicationCutoff`, `isEligibleForPrediction`, `isTemporallyEligibleForPublication` | Standard/earlier deadlines and original/current/manifest temporal eligibility. |
| `createCalendar`, `getKickoffDisplayInput` | Injected current decisions and separate locale-compatible display values. |

Full types, inputs, examples, supported years and later integration responsibilities
are documented in the [calendar contract](calendar.md).

### Changed files

- `src/domain/calendar.ts`: shared temporal rules, values, validation and clock API.
- `src/server/config/runtime-policy.ts`: references the same frozen calendar rules.
- `src/domain/README.md`, `docs/calendar.md`: discoverable API and scheduling contract.
- `tests/calendar.test.mjs`: 16 meaningful calendar acceptance/regression groups.
- `docs/implementation-decisions.md`, this record and `dev-tracker.md`: decisions,
  actual check results and completed prompt status.

### Verification

Node `24.18.1`, npm `11.16.0`; no dependency changes. Next telemetry was disabled
for the repository check. All timestamps/manifests/clocks are synthetic test
inputs; no external provider or database access was needed by the calendar tests.

| Command/check | Result |
| --- | --- |
| Focused calendar tests on pinned Node 24 | Passed: final **16 groups**, zero failures/skips. |
| Exact 7 October window | Passed: start/end and adjacent milliseconds, seven EAT dates and exclusive day-seven boundary. |
| Calendar transitions and strict inputs | Passed: EAT midnight, month/year/leap-century transitions, supported year limits, impossible dates, UTC precision and trailing-line rejection. |
| Host `TZ=UTC`, `America/Los_Angeles`, `Asia/Tokyo` child processes | Passed: same reporting/window/cutoff/display inputs; each process confirmed its different configured host timezone. |
| Publication and display separation | Passed: cutoff equality rejects, one millisecond before accepts, earlier closure only reduces deadline, both windows plus manifest required, clock read once, visitor display changes local date without changing EAT identity. |
| Historical named-zone boundaries | Passed: exact UTC boundaries and neighbor instants for Kampala days of 23.5 and 24.5 hours; independently valid historical query ranges. |
| `npm run check` | Passed (exit 0): generation, schema validation, zero-warning lint, strict type-check, then-current **63 tests** without failures/skips and production Turbopack build. |
| Final file lint after historical regression addition | Passed: `npm exec -- eslint tests/calendar.test.mjs --max-warnings=0`. The added regression and shared-rule identity assertion also passed in the final focused 16-group run. |
| `git diff --check` | Passed; no database models/migrations, dependency or specification changes. |

Independent review caught JavaScript regex end anchors accepting trailing line
terminators; exact input length/full-match checks fixed this before final
verification. The additional historical regression was added after the full
repository suite had loaded its 15 calendar groups; its final focused run is
recorded separately above.

### Handoff and unresolved dependencies

No input blocks prompt 004. Public query services in 028/030 must supply their
approved maximum date spans. Persistence adapters enforce their storage bounds;
reporting dates support `0001–9999` while JavaScript instants have a wider range.
Prompts 019–025 own persisted manifests, actual-start/schedule evidence, status
freshness, cycle closure, run ordering and atomic publication. Temporal eligibility
does not grant operation approval or reopen locked cycles. Durable triggering and
deployment remain with 020/021/046–049. No live scheduler, provider call, purchase
or deployment was performed. Prompt 004 is ticked in the root tracker.

## 005 — Regulation-time market domain

Date: 8 October 2026 (Africa/Kampala).

Status: complete. Prompt 005 implementation, acceptance checks and full repository
verification passed on the pinned runtime. Prompt 006 was not started.

### Shared behavior and rule decisions

Added reusable browser-safe contracts for match result, derived double chance,
over/under 2.5 and BTTS. Every family uses regulation including stoppage time,
excluding extra time and penalties. Stable selection codes and exact tie order
remain independent of display language. Exact-score families remain excluded.

The user explicitly chose sum tolerance **0.001** and consistency tolerance
**0.002**. These are shared source-owned defaults in `regulation-markets-v1`;
different runtime overrides fail. OP-02 is resolved for this version, while
independent provider/evidence/production gates remain intact.

Validation requires complete finite probabilities strictly inside `(0, 1)` and
uses exact canonical-decimal comparisons to include tolerance equality without
an extra floating-point epsilon. It never infers missing values, converts odds,
normalizes accepted distributions or substitutes verbal confidence. Result and
double chance form one source group; derivation and strict bounds succeed or
reject together.

The two feasible-marginal consistency constraints relate draw, over 2.5 and BTTS.
Conflicts omit all participating fallback groups ahead of valid AI. Same-source
contradictions omit all joint participants with audited reasons, preserving no
arbitrary family preference. Available/unavailable snapshot entries are explicit,
immutable and independent of input property order.

`probability-display-v1` allocates exclusive display groups to 100% by exact
largest remainders and specification tie order. Overlapping double-chance values
round independently. Original precision and unrounded selected picks remain
unchanged; outputs carry Estimated probability and boundary-label keys.

Pure settlement requires an eligible final context and a separately verified
regulation score. Live/nonfinal/unknown or invalid/missing score evidence stays
Pending; ineligible cycles and void fixture statuses retain reasons; missing or
unsupported picks remain Unavailable. Eligible final picks settle independently
to Correct or Incorrect. Extra-time and penalty totals never replace regulation
scores. All outcomes carry the rule version.

Full APIs, types, conflict/rounding rules and result precedence are documented in
the [market contract](markets.md).

### Changed files

- `src/domain/markets.ts`: versioned codes, strict validation, atomic derivation,
  consistency, deterministic selection, frozen snapshots and presentation.
- `src/domain/market-settlement.ts`: pure five-outcome adjudication and stable reasons.
- `src/server/config/runtime-policy.ts`: shared approved defaults/version and
  rejection of differing overrides, preserving all independent evidence gates.
- `tests/markets.test.mjs`, `market-settlement.test.mjs`: 20 validation/display
  groups and 11 regulation settlement groups.
- `tests/runtime-policy.test.mjs`: approved-default/override regression coverage.
- `.env.example`, `README.md`, `src/domain/README.md`, `docs/markets.md`: workflow
  and shared-contract documentation.
- `docs/implementation-decisions.md`, this progress record and `dev-tracker.md`:
  recorded user choice, OP-02 resolution and actual implementation status.

### Verification

Pinned Node `24.18.1`, npm `11.16.0`; no dependency or database schema changes.
Probabilities, scores and source labels are synthetic fixtures, not live provider
support or forecast-quality evidence. Next telemetry was disabled for checks.

| Command/check | Result |
| --- | --- |
| Focused market validation/presentation tests | Passed: **20 groups**, zero failures/skips; exact sum/consistency equality and next-representable rejection, derived strict bounds, all mixed-source conflicts, deterministic picks, group rounding, subnormal/boundary labels, unsupported families and immutable inputs/outputs. |
| Focused settlement tests | Passed: **11 groups**, zero failures/skips; draws/0–0/1–1, two/three goals, BTTS zero boundaries, live and final status, extra-time/penalty regulation evidence, void/unavailable precedence, malformed inputs and unchanged caller context. |
| Focused runtime-policy tests | Passed: **27 tests**, zero failures/skips; approved defaults/equivalent decimals, drift rejection in all modes and independent publication evidence gates. |
| Focused ESLint and strict type-check | Passed with zero warnings/errors after final domain metadata/type fixes. |
| `npm run check` | Passed (exit 0): generation, schema validation, zero-warning lint, strict type-check, all **96 tests** with zero failures/skips and production Turbopack build/prerendering. |
| Whitespace and schema/dependency/specification scope checks | Passed: no migrations, dependency changes or original specification/plan edits. |

Review tightened presentation to reject inconsistent deserialized selection,
probability, period/source/line and derivation metadata. Distributive market types
preserve family-specific complete distributions. Final focused checks include
these refinements.

### Handoff and remaining dependencies

No unresolved input blocks the domain feature. Provider support/precision,
freshness and source mappings remain with 007/008/013; model/evidence sufficiency
and calibration/quality remain with 011/012/014. Persistence owners choose exact
database precision/scale from validated contracts. Forecast locks, cycles,
publication, result verification, corrections and headline aggregation remain
with 019–030. No external provider calls, purchase, live forecast, scheduler or
deployment was performed. Prompt 005 is ticked in the root tracker.

## 006 — Shared API-Football quota limiter

**Date:** 8 October 2026. **Scope:** `dev-plan/006-api-quota-limiter.md`.

### Implementation

Added server-only durable quota contracts, MySQL coordination, reservations,
single-use dispatch claims and an authorized bounded gateway for ordinary calls
and reset probes. All replicas/tools/trials/retries use the same canonical account
identity and shared database. Migration `20261008182528_api_quota_limiter` adds
`ApiQuotaAccount`, `ApiQuotaPeriod` and `ApiQuotaAttempt`, with account foreign keys,
nullable unique owned-work keys and rolling/priority/sequence indexes. Generated
schema snapshot advances with that incremental migration; foundation SQL remains
unchanged. No dependency versions changed.

The account lock encloses all checks and writes. MySQL UTC is authoritative;
transactions are bounded and external I/O runs after commit. Verified active
terms cap 12 per rolling second, 720 per rolling minute and 120,000 per provider
day, with even 84 ms default pacing and protected 20,000 essential capacity.
Priority orders safety/recovery, near-kickoff and live/date work, daily inputs and
enrichment; ordinary work cannot consume reserve. Queued duplicates can inherit
essential urgency. Prior spending, uncertain attempts, unused permits and crashes
remain counted. Retrying needs a new counted ID; joining never invokes transport.

Lower limits apply immediately, including between reservation and launch. Header
floors account for subsequent reservations and unresolved work; stale responses
cannot refill allowance. The gateway enforces runtime/evidence authority, short
permit windows, single use, remaining lease timeouts, AbortSignal transport and
redacted structured outcomes. HTTP/body rate limits pause all callers; expired
subscriptions/credentials and unavailable/corrupt shared state fail closed while
stored reads remain usable.

Verified boundary evidence allows one counted candidate probe. Bulk dispatch
requires successful probe-bound trusted reset confirmation. Old counters persist;
uncertain probes, stale old replies, higher headers and EAT midnight cannot enable
bulk traffic. Same-period refresh/reset cannot restore lower active terms. All
reset/account evidence in tests is synthetic; real database behavior is not.

### Changed files and handoff

- `src/server/football/quota-contract.ts`, `quota-limiter.ts`,
  `quota-mysql-store.ts`, `quota-gateway.ts`: shared typed state, durable safety
  rules, account locking and guarded one-request transport.
- `prisma/schema.prisma`, `schema.snapshot.prisma`, incremental quota migration:
  three coordination/usage tables; no forecast/catalog/job implementation.
- `tests/quota.integration.mjs`: genuine isolated MySQL concurrency and failure
  acceptance; `tests/quota-gateway.test.mjs`: gateway authority/transport cases.
- `package.json`: explicit `test:quota` integration command.
- `docs/quota-limiter.md`, `README.md`, decision register, this record and root
  tracker: caller contract, rollout dependencies and actual progress.

### Verification

Pinned Node `24.18.1`, npm `11.16.0`; owned genuine MySQL `8.4.11` fixtures with
separate migration DDL and narrowly scoped application DML roles. The existing
ownership-checked helper starts a fresh loopback server/data directory and removes
only its own fixture after shutdown. No installed service, external database,
provider account or live API request is used.

| Command/check | Result |
| --- | --- |
| `npm run check` | Passed (exit 0): client generation, schema validation, zero-warning lint, strict type-check, **113 tests**, zero failures/skips, and production Turbopack build/prerendering. |
| Final scoped ESLint, `tsc --noEmit`, gateway tests | Passed after the final limiter refinements: zero warnings/errors and **17 gateway tests**, zero failures/skips. Covers authorization revocation, single-use claims, ordinary/probe parity, delayed commits/process pauses, remaining lease bounds, AbortSignal timeout, late success/rejection, body errors and storage failure. |
| `npm run test:db` | Passed on owned genuine MySQL **8.4.11**: **8 tests**, zero failures/skips. Applies the new migration, repeats deployment, checks status/schema, denies DDL/history access to the application role, detects drift without repair, verifies InnoDB/UTC/exact values, rollback, concurrent uniqueness and singleton shutdown. |
| Final unfiltered `npm run test:quota` | Passed on owned genuine MySQL **8.4.11**: **25 tests**, zero failures/skips, about 124 seconds. Separate pools serialize/deduplicate concurrent work; **725 counted reservations and single-use claims** satisfy every rolling second/minute and 84 ms pacing interval. Covers lower rates/day terms, cap/headroom/reserve, priorities/promotion, uncertain retries, crash/restart, stale/in-flight headers, contention, unavailable/corrupt storage, expiry and clock regression. |
| Provider-period/reset checks within that quota suite | Passed using explicitly synthetic evidence: one counted candidate probe; no bulk traffic on uncertainty or without exact trusted confirmation; old counters/stale replies cannot reset daily allowance; lower probe terms survive confirmation; minute floors cross daily boundaries and expire only at their trailing-minute boundary. |
| Actual MySQL UTC-clock gateway check within that quota suite | Passed: one authorized mocked transport, three authority checks, durable count **1**, completed outcome. Final gateway latency about **95 ms** (reserve 36 / claim 33 / complete 25); no network I/O. |
| Whitespace/scope checks | Passed. Incremental migration explicitly selects InnoDB; foundation migration, dependency versions and specification/dev-plan files remain unchanged. All owned fixture servers/data directories were cleaned up. |

Review tightened same-period verified refreshes, lower terms between reservation
and launch, urgent queued deduplication, candidate lower-term preservation and
account-wide minute protection across daily boundaries. The final unfiltered
quota suite includes every correction.

The first actual-clock gateway check exposed an 84 ms permit freshness window
that could expire during real MySQL commits. The final permit freshness window
is independently bounded to one second (or its shorter lease/deadline), while
launch claims recheck account pacing/windows and the gateway checks elapsed time
immediately before I/O. Real-clock checks then passed without increasing the
test request's 5-second transport budget. One repeated 725-attempt stress run
under parallel build load exceeded its original 180-second test allowance; the
fixture-only stress allowance is now 300 seconds, parent 600 seconds. Earlier
and final full runs passed; the final stress loop took about **92 seconds**.
This changes test infrastructure timing, not application job/time budgets.

Implementation and all local acceptance checks are complete. Prompt 006 is
ticked in the root tracker; provider-account/reset qualification is still pending.

### Remaining external evidence

OP-03 remains pending: canonical authorized account identity, actual limits,
daily boundary/reset protocol, candidate probe confirmation, expiry, current
payable total within US$45 and egress/IP protection evidence. Prompt 008 owns that
authorized trial; 007 owns header/body parsing and real HTTP integration. OP-11
job request/time/fallback budgets remain with 010/025; the gateway requires caller
bounds and supplies no invented job defaults. No purchase, provider request,
scheduler, forecast, deployment or notification was performed.

## 007 — API-Football adapter

**Completed:** 8 October 2026. **Scope:** protected direct-v3 retrieval and
normalization, with no polling, catalog persistence or publication.

### Implemented behavior and changed files

- `src/server/football/api-football-contract.ts`, `api-football-adapter.ts` and
  `api-football-normalize.ts`: fixed-origin typed endpoints, private credentials,
  bounded streamed JSON reads, separately counted retries with jitter and honored
  provider delays, explicit failure/completeness/coverage metadata and immutable
  normalized records. Supported operations cover fixtures/date/live/IDs,
  teams/competitions, statistics/player aggregates, lineups/injuries and separate
  fallback predictions.
- `src/server/football/quota-gateway.ts`: an early-observation callback preserves
  already received lower quota headers and known failures if a body stalls.
  Observations cannot establish success and are ignored after abort, elapsed
  deadline or completion; conservative final reconciliation precedes exposure.
- `tests/api-football-adapter.test.mjs` and
  `tests/api-football-normalize.test.mjs`: **48 transport/contract** and **18
  normalization** cases using explicitly labeled synthetic payloads and injected
  HTTP. `tests/quota-gateway.test.mjs` adds **8** early-observation regressions;
  `tests/quota.integration.mjs` adds actual durable adapter/header acceptance.
- `docs/api-football-adapter.md`, `docs/quota-limiter.md`, `README.md`, decision
  register, this progress record and root tracker: usage, official provenance,
  normalization decisions, honest local results and pending external evidence.

No dependency, database schema, migration, specification or dev-plan changes were
needed. Every provider HTTP attempt uses the existing durable limiter/gateway;
uncertainty is never refunded. Account work identity survives credential rotation.
Local fresh/in-flight reuse remains bounded and policy-authorized; fallback
reuse additionally requires a job scope. Structured cache admission waits for
complete correlation/retrieval, preserves original times and excludes failed or
partial responses. No image HTTP request, binary storage or proxy exists.

### Official evidence and normalization decisions

Reviewed on 8 October 2026:

- [Official beginner guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
  (13 March 2026): direct v3 origin/header, endpoint shapes, fixture single-response
  behavior and `/players` pagination at 20 items per page.
- [Fixture-ID tutorial](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league)
  (12 December 2024): hyphen-separated IDs, at most 20; actual batching requires
  trusted evidence or falls back to individually reserved lookups.
- [Rate-limit article](https://www.api-football.com/news/post/how-ratelimit-works)
  (12 June 2026): daily/minute headers, rate-limit bodies and HTTP 429.
- [Coverage guidance](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)
  and [provider terms](https://www.api-football.com/terms): field population and
  reuse/media rights need independent qualification.

The interactive reference and public schema download could not provide readable
schemas in this session; the accessible official guides support the implemented
endpoint subset. No claim of a verified full current schema or account contract
is made. Fixtures never receive an invented page parameter. Unexpected pages,
short player pages, drifting totals, duplicates, mismatched/missing selector
echoes, foreign identities and exhausted bounds stay incomplete.

Kickoff/date checks use the shared Africa/Kampala calendar, including UTC day
boundaries. Original response retrieval time is independent of the unavailable
per-record provider update time; update fields remain null. Failed received
responses retain time/quota provenance without payloads or fabricated paging.
Empty enrichment and unavailable injury information never imply complete field
coverage or squad fitness. All known status codes map explicitly; unknowns and
live disappearance never establish a final score. FT/AET/PEN `score.fulltime`
candidates require exact trusted verification; extra-time/penalty totals cannot
substitute. Approved third-party images remain credential-free HTTPS URL metadata
only. Predictions remain fallback-only and do not become validated market groups.

### Verification

Pinned Node **24.18.1**, npm **11.16.0**. Genuine MySQL **8.4.11** runs only in the
ownership-checked throwaway harness, with separate migration and application
roles. Provider responses, account/reset evidence, cache/media approvals and
regulation verifiers in all tests are synthetic. No credentialed provider HTTP,
live account probe, paid operation or image fetch ran.

| Command/check | Result |
| --- | --- |
| Final `npm run check` | Passed (exit 0): client generation, schema validation, zero-warning lint, strict type-check, **187 tests**, zero failures/skips, production Turbopack build and prerendering. |
| Focused adapter and normalization checks | Passed: **48 adapter** and **18 normalization** tests, with normal Node 24 strip-only execution; scoped ESLint and TypeScript checks passed. |
| Final focused quota gateway | Passed: **25 tests**, including eight new early-observation cases, zero failures/skips. |
| `npm run test:quota` | Passed on owned genuine MySQL **8.4.11**: **26 tests**, zero failures/skips, about **100 seconds**. The 725 counted-reservation stress loop passed, about 66 seconds. |
| New durable adapter case | Passed: one mocked HTTP 200 response with a stalled body retains received lower limit/zero remaining headers; the stream is canceled, the attempt stays uncertain/count **1**, and a separate MySQL-backed replica is denied with no second HTTP dispatch. |
| Actual-clock gateway case | Passed with real MySQL UTC time: counted single-use mocked transport, about **76 ms** total (reserve 31 / claim 23 / completion 22 ms). No network I/O. |
| Scope/cleanup | Whitespace and local-link checks passed. Owned MySQL instance/data directory cleaned up; no existing service or external database was used. |

Review found and corrected premature caching of missing requested IDs, unrelated
selector/row acceptance, duplicate observations, empty coverage implications,
deadline crossings during cache approval and loss of quota headers on stalled
bodies. Meaningful regressions cover those cases, body-level errors, HTTP 499,
bounded response cancellation, retry identity, permission revocation, original
times, fallback scopes and regulation-score safety.

Implementation and local acceptance checks are complete; prompt 007 is ticked in
the root tracker. The [008 handoff](implementation-decisions.md#unverified-mappings-and-coverage-questions-for-008)
keeps actual account limits/reset/expiry, full query/body contracts, representative
field/status/score coverage and data/media rights unverified. OP-11 job bounds,
OP-12 billable egress and OP-24 shared cache strategy retain their existing
owners. Nothing activates polling or paid/provider/publication operations.

## 008 — Football provider trial (9 October 2026 EAT)

Implemented the internal bounded trial command, durable private journal and
34-requirement report format described in
[008](../dev-plan/008-football-provider-trial.md). The dated evidence collection
and report generation occurred on 8 October UTC. Provider suitability remains
incomplete; local tooling completion does not establish actual account, field,
market, price or rights qualification.

### Delivered files and behavior

- `src/server/football/provider-trial-{contract,input,journal,runner,command,evaluation}.ts`:
  strict immutable plans, exclusive process ownership, atomic synced intent/result
  records, cumulative request budgets, bounded adapter operations, trusted source
  verification and JSON/Markdown findings. Crashes retain the full uncertain
  reservation; zero-I/O quota waits can defer safely; completed responses never
  replay. Absolute deadlines and timed observations survive restarts.
- `scripts/football-provider-trial.mjs` and `npm run trial:football`: private
  `init`, `report` and explicitly gated `run` actions. Offline actions need no
  credentials/database. Reports distinguish confirmed, failed and untested
  findings, retain source/test timestamps and state separate catalog/live/launch
  gates. Unknown inputs are not assigned invented defaults.
- Existing adapter contracts/normalization: counted `/status` diagnostic with its
  documented object response and optional paging. It strips account holder data
  and preserves actual plan, active state, expiry and counters without activating
  capacity or supplying account reset evidence.
- `tests/provider-trial-*.test.mjs`, `tests/api-football-account.test.mjs` and an
  additional `tests/quota.integration.mjs` case: offline output, source/rights
  gates, budget/retry accounting, crash recovery, cross-process locking, symlink
  safety, immutable completed results, safe deferral and shared market/calendar
  contract checks. All provider payloads and account/rights approvals are
  explicitly synthetic development fixtures.
- [Trial runbook](football-provider-trial.md), README, decision register and
  sanitized baseline reports:
  [Markdown](reports/provider-trial-008.md) /
  [JSON](reports/provider-trial-008.json).

No dependencies, database schema/migrations, public routes or UI were added.
Every live transport would use the existing MySQL limiter/gateway, including
diagnostics, retries and pagination. The CLI requires trusted runtime, quota,
private retention and observation authority; no permissive live verifier was
created. Fallback context and predictions reuse shared identity, regulation,
probability, settlement, Kampala-day and five-minute cutoff rules. Missing
provider update time requires an explicit verified freshness policy. Advice and
goal picks cannot manufacture totals/BTTS distributions.

### Reproducible offline report and pending live evidence

Executed with pinned Node **24.18.1** and npm **11.16.0**:

```sh
npm run trial:football -- report --directory .tmp/provider-trial-008
```

The command resumed its existing immutable offline journal and generated
`.tmp/provider-trial-008/provider-trial-report.md` and
`.tmp/provider-trial-008/provider-trial-report.json`. The sanitized tracked copies
above contain **34 untested requirements**, **0 dispatched/charged requests**,
an unresolved allowance and `liveSuitability: incomplete`. No actual provider,
account probe, remote image, purchase, renewal or plan change occurred. Private
journals and verification modules remain ignored; no raw provider/account
payload was copied into the tracked baseline reports.

Primary pricing, rate-limit, terms, predictions and `/status` reference sources
were reviewed on 8 October UTC and are linked in the runbook/decision register.
Published Mega limits and the advertised US$39 price are background evidence;
actual limits/reset/expiry and an itemized payable total within US$45 remain
pending. Public redistribution/logo permissions are not inferred from private
entitlement or provider terms. Source-specific mappings, update/freshness policy
and media restrictions require actual verified evidence.

OP-05 competition IDs/seasons and trial allowance remain unanswered; no live
credentials, account/payment records or applicable verification authority are
configured. OP-03–08 remain explicitly pending. **009** may implement catalog
structure with those gates; live import/reuse and public data/prediction/media
operations remain blocked. AI-quality qualification belongs to **014**, and
launch requires later release checks.

### Verification

| Command/check | Result |
| --- | --- |
| Final `npm run check` | Passed (exit 0): client generation, schema validation, zero-warning lint, strict type-check, **274 tests: 273 passed, 1 platform skip**, and production Turbopack build/prerendering. |
| Trial/account tests within the full suite | **87 cases: 86 passed, 1 skip** — 11 account diagnostic, 7 command, 18 runner, 33 evaluator and 18 journal cases. |
| Journal process/filesystem acceptance | Real child-process crash recovery, live-owner locking and symlink/junction rejection passed. One POSIX file-mode check is skipped on Windows; private inherited ACLs remain an operator responsibility. |
| Final `npm run test:quota` | Passed on owned genuine MySQL **8.4.11**: **27 tests**, zero failures/skips, about **132 seconds**. `MYSQL_TEST_SERVER_BINARY` points to the existing ignored `.tmp/mysql-tools/mysql-8.4.11-winx64/bin/mysqld.exe`. |
| New durable trial acceptance | Passed: unknown-account denial dispatches zero and persists deferral; reopening after verified synthetic initialization counts a 503→200 retry as **2** durable requests, exhausts the trial allowance and cannot replay the completed sample after another reopen. |
| Offline command/report | Passed without credentials or database; generation/resume records all 34 live requirements untested and zero requests. Missing-authority `run` returns exit **2** with an incomplete report. |
| Scope/cleanup | Owned MySQL instance/data directory was cleaned up. No existing service/external database or actual provider/account/media operation was used. Whitespace and local-link checks passed. |

Early parallel attempts encountered local Prisma/MySQL startup timeouts during
heavy CPU/paging pressure. Diagnostic client generation briefly overlapped a
generated-client boundary test. The final ordered repository check ran after
all 11 generated server-only guards were restored and passed, including that
boundary test; database/schema scripts required no changes.

Implementation and local acceptance checks are complete; prompt **008** is
ticked in the root tracker. The tracked offline report deliberately leaves
actual provider suitability incomplete and live/launch gates blocked. No live
trial result or permission is claimed by this completion checkbox.

## 009 — Canonical football catalog

Implemented on **9 October 2026 EAT**, building on the 003 database runtime,
004 calendar, 005 settlement rules, 006 quota gateway, 007 sole provider adapter
and the explicitly incomplete 008 trial. Local persistence acceptance is
independent of live account/coverage/rights qualification.

### Delivered files and migration

- `src/server/football/catalog-contract.ts` and `catalog-input.ts`: strict
  immutable import selections/bounds, provenance/scope validation, safe normalized
  identities/search, attributable regulation proof and explicit degraded-subset
  authority. Missing fixture season rejects the row without guessing a season.
  Only privately registered validated batches bound to the same trusted authority
  can enter the writer.
- `catalog-service.ts`: reusable private imports through the existing adapter;
  pre-I/O authorization/retention, identical in-flight request sharing, committed
  request replay without I/O and conflict rejection for reused IDs. No additional
  HTTP client, quota counter, live verifier or public import path was created.
- `catalog-mysql-store.ts`: canonical identities/aliases/seasons, transactional
  provider locks and fixture mutations, shared metadata updates, private mapping
  review, exact versions/audits and consistent exact-scope coverage reads.
  Original source times are retained; outages/disappearance never delete records
  or imply final/canceled status. Missing fields preserve reliable values under
  the documented update rules.
- `prisma/schema.prisma`, the matching snapshot and incremental migration
  `20261008214325_canonical_football_catalog/migration.sql`: **12 new InnoDB
  tables**, binary collations, restrictive relationships, unique provider IDs,
  season/search/date/round indexes and reviewed SQL checks. Existing foundation
  and quota table definitions/migration history remain compatible. The import
  sequence resolves equal-time coverage ordering without comparing UUIDs.
- `tests/catalog-input.test.mjs`, `catalog-service.test.mjs`,
  `catalog.integration.mjs` and `helpers/catalog-fixtures.mjs`: deterministic
  validation/service cases plus genuine MySQL multi-replica identity, uniqueness,
  version, coverage, mapping, permission and coordinator acceptance.
- `package.json`: `npm run test:catalog`; [catalog runbook](football-catalog.md),
  README, decision register and root tracker handoff.

Fresh approved shared names/logo URLs and attributable aliases advance every
referencing fixture version once per import. Audits preserve normalized old/new
attributes and alias additions alongside fixture-owned changes. Coordinators
receive the original shared attributes and all writes roll back on failure.
Regulation scores require exact verified fixture/status/period evidence and
never use extra-time/shootout totals. Third-party images remain approved remote
URL strings; no binary image is downloaded or stored.

`coordinateFixtureMutation` and `withFixtureTransaction` expose one consistent
provider-then-fixture transaction boundary for later cycle/schedule services.
Custom callbacks are never automatically retried. Those future services must
wire the coordinator into every importer; direct fixture writes cannot become
an alternative schedule/status mutation path. Daily selection, cycle lifecycle,
polling, predictions, settlement jobs and public endpoints remain with their
own prompts.

### Verification

Commands used pinned Node **24.18.1** and npm **11.16.0**. Genuine MySQL checks
used the existing ignored portable **8.4.11** binary, a new loopback server/data
directory and separate migration DDL/application DML credentials. Each owned
target was verified before writes and cleanup; no existing service/database,
actual provider/account or remote image operation was used.

| Command/check | Result |
| --- | --- |
| `npm run check` | Passed: guarded Prisma generation, schema validation, zero-warning lint, strict type-check, **311 tests: 310 passed, 1 existing Windows POSIX-mode skip**, and production build/prerendering. |
| New input/service tests | **37 passed**: 27 input cases and 10 service cases, including pre-I/O denial, source/scope validation, unknown seasons, immutable receipt replay, in-flight sharing and permission revocation. |
| Final `npm run test:catalog` | **28 passed, no failures/skips**, about **29 seconds**, on genuine owned MySQL 8.4.11. Concurrent/repeated imports across competitions/seasons reuse canonical identities; distinct same-name IDs remain distinct. |
| Catalog database acceptance | Passed: native uniqueness/constraints, exact BigInt IDs/versions, direct/shared version races and audits, alias search, safe URL retention, verified regulation periods, stale/null preservation, outage/disappearance, exact filtered/empty/degraded coverage and equal-time sequence ordering. |
| Mapping/coordinator acceptance | Passed: attributable alternate identity, pending conflicts, older/weaker proof preservation, future-time rejection, operation/retention revocation rollback, coordinator old/new snapshots, duplicate/omitted/unawaited-failed apply rollback and future-service lock serialization. |
| Incremental schema review | Schema validation and empty offline diff passed; genuine migration deployment and drift verification passed with least-privilege role separation. |
| `npm run test:db` regression | **8 passed, no failures/skips**, about **21 seconds**: repeat deployment/status, drift detection, exact UTC/value round trips, rollback, concurrent uniqueness, privilege separation and pool shutdown with the new migration. |
| Final handoff checks | Whitespace checks passed; **104 local Markdown links** resolve. Final ordered repository and catalog checks passed after the authority-bound prepared-batch guard was added. |

The initial catalog run exposed two test assumptions: JSON serialization needed
an explicit BigInt representation, and 007 rejects pre-1970 kickoffs. The corrected
historical EAT check uses a clearly synthetic normalized future-contract
observation to verify catalog/calendar storage; it does not extend or claim live
provider historical coverage. Final database acceptance passed after those
corrections and the audit/coordination hardening.

### Pending live evidence

The 008 baseline remains **34 untested requirements and zero actual requests**.
OP-03–08 still require authorized account/reset/expiry/payable records, initial
competition IDs/seasons and allowance, private/structured retention and audit
reuse terms, source-specific identity/score/freshness mapping, and public/logo
rights. Synthetic normalized timestamps, mappings, permissions and provider
bodies prove local behavior only. No actual pending provider mapping was
collected; contradictory synthetic mappings stay in private test review rows.

Live catalog imports/reuse and public data/prediction/media operations remain
blocked until those actual evidence gates pass. No retention period, account
capacity, enabled competition or unlimited raw/structured entitlement is invented.

Implementation and local acceptance checks are complete; **009** is ticked in
the root tracker. Actual provider qualification and live/public permissions
remain separate pending gates.

## 010 — Research and AI cost control

Implemented on **9 October 2026 EAT** using the existing 002 runtime operation
gates and 003 MySQL runtime. AI and research have independent account/category
ledgers; neither changes API-Football quotas or its US$45 payable ceiling.

### Delivered files and invariants

- `src/server/cost-control/cost-contract.ts`, `cost-input.ts`, `cost-pricing.ts`
  and `cost-totals.ts`: strict immutable policy/usage parsing, opaque identities,
  exact USD picodollar arithmetic, explicit versioned rational conversions and
  conservative financial/count projections. Estimates, observations and
  invoices stay separately labeled.
- `cost-service.ts`: atomic maximum reservations, stable work/job ceilings,
  one-use owner permits, verified completion/reconciliation, confirmed
  cancellation, explicit eligible nearest-kickoff priority and distinct budget,
  request/token/unit/time/fallback/timeout outcomes. Unknown and partial usage
  retains the maximum; actual overages and opening debt block later paid work.
- `cost-mysql-store.ts`: account/category row locks across replicas, exact native
  sums with sealed JSON projection checks, immutable period/job/attempt metadata,
  append-only receipt history and guarded lifecycle transitions. Provider I/O
  stays outside transactions; caller callbacks are never automatically replayed.
- `cost-policy.ts`: existing runtime scope, credentials, trusted approvals and
  provider/model selection plus explicit verified joint AI/research allocations
  within global job request/token/time limits, with fallback reserved once.
- `cost-gateway.ts`: one authorized transport callback after durable claim,
  bounded reservation/claim/settlement waits and transport timeout, abort and
  drained late results. A real late receipt can still be verified and accounted
  for without exposing its timed-out value or inventing usage. Verified cached
  evidence reuse dispatches zero requests and preserves original source times.
- `cost-observability.ts`: private JSON-safe aggregate records with exact string
  amounts/counters and no copied prompts, credentials, owner tokens, source
  bodies or driver errors.
- Schema/snapshot and migration `20261008221928_research_ai_cost_control`:
  **four new InnoDB tables**, `DECIMAL(38,12)` monetary columns, native unique
  work/attempt identities, restrictive foreign keys, indexes and reviewed
  nonnegative/state/priority/count/identity/period checks. Existing migrations
  remain intact.
- Focused input/pricing/service/policy/gateway/telemetry tests, genuine MySQL
  `tests/cost.integration.mjs` and reusable synthetic fixture/memory helpers;
  `npm run test:cost`, [cost runbook](research-cost-control.md), README/boundary
  guidance, decision-register and tracker handoff.

Verified historical receipt quantities combine componentwise, so a later smaller
receipt cannot erase known measured charges. Original `observedAt` selects the
latest usage; older verified invoices still contribute their actual charges.
An invoice with unknown quantities can settle money while preserving conservative
request/token/unit/time bounds. Monotonic account-clock checks also apply to
reconciliation, cancellation and private reads; late bills can reconcile against
their original closed period after a new period is explicitly approved.

### Verification

Commands use pinned Node **24.18.1** and npm **11.16.0**. Database acceptance uses
the existing ignored portable MySQL **8.4.11** binary, a fresh owned loopback
server/data directory and separate migration DDL/application DML roles. Source
prices, receipts, approvals and clocks are explicitly synthetic. No actual paid
AI, research or football request is made.

| Command/check | Result |
| --- | --- |
| `npm run check` | Passed: guarded Prisma generation, schema validation, zero-warning lint, strict type-check, **382 tests: 381 passed, 1 existing Windows POSIX-mode skip**, production build and prerendering. |
| New focused cost tests | **71 passed** across input, pricing/projections, service, runtime policy, gateway/cache and telemetry contracts. |
| Final `npm run test:cost` | **29 passed, no failures/skips**, about **27 seconds**, with 28 genuine MySQL acceptance subchecks and their parent. |
| Concurrent durable accounting | Passed aggregate and per-job worker races, stable work/attempt identities, single-use claims, retries, restart, cancellation, unknown/partial usage and immutable period/cap behavior. |
| Billing and operating bounds | Passed measured/invoice separation, invoice-only unknown count reservations, original source chronology, componentwise historical maxima, observed overages, exact EUR-to-USD rounding and distinct request/token/unit/time/fallback outcomes. |
| Storage integrity and isolation | Passed corrupt JSON/native projection rejection; identity and inactive opening-debt bindings; seven valid-shaped direct-store reset/mutation/history attacks; native uniqueness/foreign keys; separate AI/research/football allowances and least-privilege roles. |
| `npm run test:db` regression | **8 passed, no failures/skips**, about **25 seconds**: repeat deployment/status/drift, exact UTC/value round trips, rollback, concurrent uniqueness, role separation and pool shutdown with the new migration. |
| Final handoff | Whitespace checks passed and **100 local Markdown links** resolve. Ignored logs: `.tmp/cost-full-check.log`, `.tmp/cost-acceptance-final.log` and `.tmp/cost-database-regression.log`. |

The final migration uses explicit boolean guarded CHECK expressions compatible
with MySQL 8.4. Native bindings cannot detach charged rows from their sealed
account/job/period or erase prior opening debt. Final genuine acceptance also
verifies incremental deployment and schema drift against the snapshot.

### Pending live decisions

OP-09–11 still need actual AI/research providers/accounts/model, rate versions,
billable units/fees, source currencies and conversion rules, accounting windows,
opening charges, separate monthly caps, per-job monetary/request/token/unit/time
allocations and usable fallback time. OP-13 still needs actual licensed research
source, extraction/attribution/reuse/display and retention evidence. There is no
live rate resolver, receipt verifier, provider adapter or enabled paid path.
Configuration references and synthetic tests do not approve these decisions.
Stored forecast reads remain independent of accounting storage availability.

This feature starts no predictions, fixture selection, scheduled workers,
public cost endpoint or monitoring destination. Those integrations remain with
their respective later prompts.

Implementation and local acceptance checks are complete; **010** is ticked in
the root tracker. Actual paid-operation configuration and evidence remain
separate pending gates.

## Prompt 011 — Fixture evidence foundation (partial)

**Date:** 9 October 2026 EAT. Independent local collection, immutable snapshots,
security and persistence are implemented. The licensed research provider and
OP-13/14 operating choices have not been supplied; no provider-specific news
adapter or live source qualification is claimed. **011 remains unchecked** in
[the root tracker](../dev-tracker.md).

### Changed files and behavior

- Eight server evidence modules provide strict contracts/parsers, deterministic
  snapshots, bounded collection/replay, canonical football observations,
  cost-controlled research integration, safe source fetching and immutable
  MySQL persistence. Explicit fixture/version/team/time inputs and nullable
  caller cycle/run references are retained; no production references are made up.
- Football collection uses the existing adapter and shared quota gateway.
  Accepted history proves canonical identities and regulation scores before
  deriving form/rest or collecting supported statistics. Catalogue snapshots
  expose all approved API-Football team aliases. Missing injuries, neutral venue
  and unsupported xG remain unknown; provider predictions cannot enter this path.
- Snapshot eligibility excludes wrong identities and future/stale/unapproved
  evidence, retains source times and versions, deduplicates syndicated coverage,
  and preserves conflicts, rumor and missingness. Minimum coverage and source
  freshness rules require explicit verified policy. Missing news yields
  `Limited news coverage`; a denied optional search does not erase sufficient
  structured facts.
- Research integration requires a reviewed actual binding, separate existing
  cost reservations/receipts and verified license/evidence/freshness policies.
  One callback permits one bounded attempt. Extraction text remains inert data;
  it cannot authorize actions, read credentials or invoke tools.
- Source fetching uses approved HTTPS hosts, safe query names, public DNS
  address validation, pinned connections and fresh checks across redirects.
  Strict synchronous authority results, final dispatch expiry checks and shared
  abort/deadline checks prevent late work from gaining permission.
- Schema/snapshot and migration `20261008225550_fixture_evidence` add **three
  InnoDB tables** with restrictive/composite foreign keys, positive identity and
  chronology checks, sealed native/JSON projections and immutable source links.
  Evidence application grants require SELECT/INSERT only. The writer rechecks
  canonical mappings, fixture version and permissions before committing.
- Focused evidence tests, genuine MySQL acceptance, reusable synthetic fixtures,
  `npm run test:evidence`, [evidence runbook](fixture-evidence.md), README and
  server/worker guidance accompany the implementation.

### Confirmed acceptance

Pinned Node **24.18.1**, npm **11.16.0** and the existing ignored genuine MySQL
**8.4.11** binary were used. The database helper starts a fresh owned loopback
server with separate migration/application roles and removes only its owned
datadir after shutdown. All source responses, prices, receipts, licenses,
policies and credentials in these tests are synthetic. No paid research, AI or
football call was made and no live credentials were read.

| Check | Result |
| --- | --- |
| `npm run check` | Passed guarded Prisma generation, schema validation, zero-warning lint, strict type-check, **472 tests: 471 passed, 1 existing Windows POSIX-mode skip**, and production build/prerendering. Log: `.tmp/evidence-full-check.log`. |
| New focused evidence contracts | **90 passed** across strict input/snapshots, football collection, cost-gateway research integration, source-network security and orchestration/replay. |
| Genuine evidence MySQL acceptance | **20 passed, no failures/skips**, about **29 seconds**: incremental migration drift, role separation, concurrent idempotency, immutable source deduplication, original timestamps, wrong fixture/team bindings, composite foreign keys, changed schedule/version denial, authority rollback, null cycle/run refs, exact bigint versions, checksum/native projection corruption and protected archives. Log: `.tmp/evidence-acceptance.log`. |
| Genuine catalogue regression | **28 passed, no failures/skips**, about **26 seconds** after the alias snapshot extension. Log: `.tmp/evidence-catalog-regression.log`. |
| Handoff | Whitespace checks passed and **487 local Markdown links** resolve. The 011 tracker row remains empty because the selected news adapter and approved operating rules are still required. |

### Remaining decisions and checks

Select the licensed research/news provider and approved sources, attribution,
original-summary/extraction permissions, reuse/display/archive retention rights,
minimum evidence thresholds, source age/clock policy and conflict/unknown-time
rules. OP-09–11 still govern actual pricing, caps and job allocations. The
provider-specific implementation and its bounded live integration/coverage
qualification depend on these decisions. Completing the independent foundation
does not resolve them or enable paid operations.

## Prompt 012 — Primary AI predictor foundation (partial)

**Date:** 9 October 2026 EAT. The independent local registry, prompt, validation,
calibration hooks and cost-controlled candidate flow are implemented. No actual
AI provider, exact model/version or calibration configuration was supplied.
The required provider-specific transport, current official API/rate verification
and live integration remain incomplete. **012 remains unchecked** in
[the root tracker](../dev-tracker.md).

### Changed files and behavior

- Nine server predictor modules implement immutable model configuration/parsing,
  bounded registry pinning, append-only MySQL persistence, prepared evidence
  prompts, provider integration contracts, output validation, evaluated
  calibration hooks and one bounded candidate invocation. Existing evidence,
  market and cost services supply shared rules and accounting.
- Model identities cover provider/model/version, reviewed API contract,
  `regulation-ai-prompt-v1`, `regulation-ai-output-v1`, known chronological
  training/validation/calibration/final-test windows, evaluation configuration,
  explicit clock policy and input/output bounds. Job/invocation pins prevent
  silent model switches; restarting jobs require independently verified prior
  pins. No prediction result or durable job tables are introduced.
- Prompts verify genuine retained facts and current source/transmission rights,
  preserve unknown/conflicting/missing evidence and keep source text inert.
  Prepared object provenance blocks copied/forged worker instructions. Primary
  input excludes provider forecast votes, raw articles, tools and credentials.
- Output validation binds exact canonical fixture/version/team/cycle/run,
  evidence/model identity and original clocks. Genuine source/fact/claim/team
  reference tuples and independent semantic grounding proof are mandatory.
  Shared 005 rules validate distributions and derive double chance. Valid
  independent families survive invalid or missing ones without complements,
  normalization, guessed numerical news effects or public publication.
- Candidates retain explicit evidence coverage/missingness, attribution,
  timestamps, pin/model provenance and provisional/evaluation state. Calibration
  requires an exact evaluated artifact; transformed distributions pass shared
  rules again. Current model, source, transport and calibration authority is
  checked after callbacks; a final clock check rejects newly stale output.
- The provider bridge runs one approved attempt through the existing cost
  gateway, verifies/reconciles usage before returning output and retains unknown
  liability. Invalid output remains charged and attempts are not automatically
  retried. Shared `cost-dispatch.ts` replaces duplicated research final-dispatch
  guards and counts approval/credential latency against launch/workflow bounds.
- The service includes preflight and registry wait in wall/monotonic time,
  reserves explicit fallback time, prevents dispatch after cancellation/expiry,
  joins identical concurrent intents and rejects conflicting or excess inflight
  requests. Distinct denials cover timeout, insufficient evidence, budget/token
  limits, invalid output/citations, uncertain usage and absent configuration.
  It starts no research, fallback selection, revisions, locks or scheduling.
- Schema/snapshot and migration `20261008232332_ai_predictor_model_registry`
  add **one InnoDB ModelVersion table** with binary identities, chronological
  windows, sealed native/JSON projections and SELECT/INSERT application grants.
  Three synthetic fixture helpers, focused tests, genuine registry acceptance,
  `npm run test:predictor`, [predictor runbook](ai-predictor.md), README and
  server/worker guidance accompany the implementation.

### Remaining decisions and checks

OP-15 needs the actual provider, exact immutable model/version, approved
calibration policy/artifact and applicable model/evaluation windows. OP-09–11
still need actual account/rates/monthly and job budgets, request/token/unit/time
allocations and fallback opportunity. OP-13–14 still govern the licensed evidence
adapter, coverage/freshness and source use/transmission permissions; OP-16 owns
independent quality evaluation. Implement the selected provider using current
official structured-output and rate documentation, then run bounded accounted
integration smoke checks when approved credentials exist. Synthetic approvals
and passing contract tests establish no provider rights or prediction quality.

### Confirmed acceptance

Checks used pinned Node **24.18.1**, npm **11.16.0** and genuine MySQL **8.4.11**.
The database helper owned a fresh isolated loopback server/data directory with
separate DDL and SELECT/INSERT application roles, then shut it down and removed
only its owned temporary data. All provider responses, model identifiers,
prices, receipts, credentials and authority/evaluation records are synthetic.
No live AI, research or football request was made.

| Check | Result |
| --- | --- |
| Final `npm run check` | Passed guarded Prisma generation, schema validation, zero-warning lint, strict type-check, **554 tests: 553 passed, 1 existing Windows POSIX-mode skip**, and production build/prerendering. Log: `.tmp/predictor-full-check.log`. |
| New focused predictor contracts | **82 passed**: 11 registry, 14 prompt, 30 output/calibration, 13 real-cost-gateway adapter and 14 full-chain service checks. |
| Genuine `test:predictor` acceptance | **12 passed, no failures/skips**, about **23 seconds**: incremental deployment/drift, native projections/hash/window constraints, role separation, concurrent idempotency, original millisecond windows, immutable versions, revoked-authority rollback, restart pin proof and corrupt archive rejection. Log: `.tmp/predictor-acceptance.log`. |
| Existing research regression | All 12 research bridge tests passed after sharing final dispatch guards; the final full suite passed them again. |
| Handoff | Whitespace and local Markdown link checks passed. The 012 tracker row remains empty because actual provider/model/calibration selection and the selected adapter are still required. |

The final service checks include original generation after evidence cutoff,
partial valid families, charged invalid responses without retries, precise
fallback-ready denials, concurrent joining/conflicts/capacity, rejected async
approvals, mid-call permission/retention revocation, blocking preflight against
fallback time, and freshness expiring during semantic verification. Synthetic
valid outputs remain provisional; these checks establish contract behavior,
not football prediction accuracy or calibration quality.

## Prompt 013 — Validated provider fallback

**Date:** 9 October 2026 EAT. The local adapter, complete candidate resolver and
bounded refresh service are implemented. They use the existing API-Football
transport and quota gateway with independently verified policy and ownership
contracts. Local implementation and acceptance are complete; the recorded live
trial, freshness, retention/rights, account and selected AI integration remain
pending. Read the [fallback runbook](provider-fallback.md).

### Changed files and behavior

- Five server-only modules under `src/server/fallback/` define strict context,
  receipts, provenance, explicit freshness policy, private adapter, resolution
  rules and one bounded refresh service. Three focused suites and three
  synthetic helpers exercise the actual 012 validation/calibration, 013
  resolver/collector, 007 normalization and 006 quota gateway together.
- The adapter verifies exact canonical fixture/version, cycle/run, home/away
  aliases, kickoff, scheduled status, current permissions and approved response
  mapping before and after collection. The original job identity and request
  allowance persist across accesses; quotas remain account-wide through the
  existing durable gateway. Approved cache hits preserve original clocks and
  incur no new request. Exhausted cache misses are stopped before reservation.
- `api-football-contract.ts` and `api-football-adapter.ts` add a private fallback
  workflow with shared abort/deadline checks, before-reservation and final HTTP
  dispatch hooks. Each retry consumes the owning allowance. Rejected asynchronous
  approvals cannot authorize work; uncertain attempts retain their liability.
  Four additional 007 regressions cover the extended workflow.
- Valid AI groups retain priority. Complete provider match-result percentages
  supply one distribution and its derived double chance under the shared 005
  rules. Incomplete, unsupported or conflicting groups stay explicitly
  unavailable. No source mixing, averaging, guessed complements, odds conversion
  or exact-score output is introduced. Every result contains the complete set
  of family availability decisions rather than inheriting old markets.
- `predictor-output.ts` carries the pinned model's original `outputTiming` policy
  and exposes a pure freshness check after authenticated receipt verification.
  Candidates preserve AI evidence-grounded reasons, genuine source references,
  uncertainty, coverage/missingness and immutable model/evidence provenance.
  Provider reasons describe the supported statistical basis with permitted
  real attribution only.
- Generation, retrieval and update times remain distinct. Unknown provider
  generation/update times require separate explicit approved policies and stay
  flagged. Cached data cannot reset its age. Final checks cover source expiry,
  context/permission changes and the complete wall/monotonic deadline. One
  bounded recomposition can discard a newly expired source while preserving the
  other, with no additional HTTP request.
- The service preserves valid AI through failed or malformed fallback receipts,
  records conservative request accounting, joins identical inflight requests
  and rejects conflicting or excess work. Original job bounds remain separate
  from shorter per-call deadlines so later permitted cache reuse stays valid.
  Zero surviving families return `retain-previous-or-unavailable`; no prediction
  revision, lock, schema migration, public provider route or scheduler is added.
- README, private server/worker guidance, the fallback runbook and
  [implementation decisions](implementation-decisions.md) document the caller
  contracts and remaining live evidence.

### Market-support evidence and remaining live checks

Reviewed current official API-Sports endpoint guidance on 9 October 2026 EAT;
the precise source links and limits are recorded in the runbook. The current
normalized contract supports complete home/draw/away percentages under verified
regulation mapping. Derived double chance shares that same source. Provider
total-goals and BTTS remain unsupported because their required complete
distributions or validated derivation are absent. Advice, winner picks, goal
thresholds and comparison statistics cannot fill those gaps.

The committed [008 trial report](reports/provider-trial-008.md) records **zero
real observations and zero dispatched requests**. Actual fallback coverage,
pre-match availability, source freshness and rights remain untested. OP-03/04/06,
OP-07/08, OP-11 and OP-15 retain their account/rights, mapping/freshness/retention,
job-allocation and selected AI integration requirements. No numeric freshness
choice, unknown-time acceptance, live permission or supported binary distribution
has been invented.

### Confirmed acceptance

Checks use pinned Node **24.18.1**, npm **11.16.0** and genuine MySQL **8.4.11**.
The quota regression helper owned an isolated throwaway loopback server with
separate migration/application roles, then stopped and cleaned only its owned
data. All provider responses, credentials, source approvals, account evidence
and AI receipts are synthetic; no live football, AI or research request was made.

| Check | Result |
| --- | --- |
| Final `npm run check` | Passed guarded Prisma generation, schema validation, zero-warning lint, strict type-check, **650 tests: 649 passed, 1 existing Windows POSIX-mode skip**, and production build/prerendering. Log: `.tmp/fallback-full-check.log`. |
| New fallback scenarios | **92 passed**: 27 provider adapter, 23 source-group resolution and 42 service-chain checks. They cover every failure trigger, complete AI priority, partial/unsupported groups, incomplete distributions, mixed-source conflicts, exact context, age/unknown clocks, revoked proof, quota/time exhaustion and original same-job cache provenance. |
| Existing adapter regressions | All **52** API-Football tests passed, including **4 new** workflow/cancellation/final-dispatch checks, bringing this prompt's added checks to **96**. |
| Genuine `npm run test:quota` | **27 passed, no failures/skips**, about **129 seconds** on the owned MySQL 8.4.11 server. Durable account-wide concurrency, rolling limits, reset uncertainty, single-use claims, header reconciliation, dispatch freshness, adapter retries and storage failures remain valid. Log: `.tmp/fallback-quota-regression.log`. |
| Handoff | Tracked and untracked changed files pass whitespace checks; local Markdown links resolve. The 013 row is ticked in [the root tracker](../dev-tracker.md). Live provider qualification remains pending; 011 and 012 remain unchecked for their outstanding selected integrations. |

The final service regression repeats one original job request with a ten-second
job deadline and a one-second per-call allowance. After advancing the clock,
the second resolution reuses the cached provider candidate with identical
original timestamps, zero new dispatches and only one total quota reservation.
Other final checks prove source expiry/revocation drops only affected groups,
blocking approval time counts against the deadline, and a second expiry during
the bounded recomposition prevents a late candidate. These checks establish
contract and accounting behavior, not football prediction accuracy or live
coverage.

## Prompt 014 — Chronological evaluation harness (partial operating setup)

**Date:** 9 October 2026 EAT. The independent offline harness, deterministic
metrics, reconstructable baselines, immutable archives and private report command
are implemented. Actual chronological periods, cohort/parameter choices, sample
and quality/public-claim thresholds, selected AI configuration and genuine
forecast observations remain pending. **014 remains unchecked** in
[the root tracker](../dev-tracker.md). No model was promoted or qualified.

### Changed files and behavior

- Eight server-only modules in `src/server/evaluation/` implement versioned
  protocol/dataset contracts, strict bounded parsing, metrics, baselines,
  cohort/gate evaluation, readable reports, immutable archives and the local
  command. Six focused suites and a reusable synthetic helper cover actual
  shared market/settlement, predictor and filesystem behavior.
- Protocol identities freeze half-open chronological assessment windows,
  competition/horizon selections, baseline settings, reliability bins,
  uncertainty parameters and original gate criteria. Model fitting/prior
  evaluation periods remain separate from the planned assessment schedule;
  012's existing known-window cutoff guards stay unchanged. A future planned
  final assessment is not represented as already completed model fitting.
- Datasets bind fixture/version/cycle, canonical teams, exact evidence cutoff,
  forecast-as-of time, original capture/generation/update times, source/model
  versions and independently verified regulation results. News/football input
  must be available by the evidence cutoff; provider forecast receipts must be
  captured by the forecast-as-of time. Later news, revised hindsight forecasts,
  future fitting artifacts, overlapping splits and changed hashes are rejected.
- Kickoff assigns each fixture/cycle to one split. Each horizon contains one
  selected capture per fixture/cycle; repeated revisions cannot inflate counts.
  AI/provider/combined and baseline comparisons use identical matched keys and
  expose their intersection counts. Source-specific and combined metrics retain
  unique picks, while unavailable, void and pending denominators reconcile.
- Metrics report selected-pick hit rate, full-distribution Brier/log loss and
  selection-specific reliability bins with counts, observed frequencies and
  Wilson uncertainty. Double chance averages three overlapping binary events
  per fixture and contributes one headline pick. No distribution normalization,
  probability clipping or hidden alternatives inflate the results.
- League frequencies use explicit additive smoothing of available regulation
  history. Team strength uses chronological Elo updates and a configured
  Davidson draw weight for result/double chance only. Approved parameters are
  required; no-history output stays unavailable. Shared validators own sums,
  strict probability bounds, derivation and joint consistency. Original history
  receipt hashes preserve batch provenance and deterministic ordering.
- Gates retain their actual frozen criteria and separate diagnostics from
  passed/failed/pending qualification. Synthetic data, insufficient samples,
  unknown fitting provenance, unapproved settings and unverified independent
  final tests cannot qualify a model or public claim. Failure retains a verified
  previous approved model; where none exists, status stays provisional with a
  launch blocker. Source/history/model authority is checked again at return.
- Only an original issued harness report can create an evaluation archive;
  copied/rehashed invented results and revoked proofs are rejected. Exclusive
  bounded writes preserve `protocol.json`, `dataset.json`, `report.json` and
  `report.md`; the first final-test protocol/selection/dataset/report binding
  rejects silently changed reruns. Identical reruns preserve their artifacts.
  JSON decodes bigint only at the native fixture-version field.
- `scripts/forecast-evaluation.mjs` and `npm run evaluation:report` provide the
  local command. It reads an explicit private protocol/dataset and trusted
  authority module, or writes factual readiness artifacts with no data arguments.
  It constructs no runtime policy, database, credential lookup or provider
  transport. README, server/worker guidance, the
  [evaluation runbook](forecast-evaluation.md) and
  [decision register](implementation-decisions.md) accompany the implementation.
  No database migration or public performance route is introduced.

### Actual datasets, report paths and remaining shadow requirements

No genuine evaluation dataset or selected model was supplied. The committed
[readiness Markdown report](reports/forecast-evaluation-014-readiness.md) and
[canonical JSON report](reports/forecast-evaluation-014-readiness.json) record
**zero actual forecast observations, zero live requests in this evaluation,
unavailable historical AI/provider comparisons and provisional/unapproved model
status**. They were generated by the actual local command and copied to the
committed handoff paths. Synthetic fixture policies and metric results remain
test data, not an actual dataset or operating approval.

OP-15–18 and OP-33 retain actual model/calibration, evaluation periods, selected
competitions/horizons, baseline values, sample/quality/coverage/public-claim
gates, source availability/rights, budgets and bounded prospective shadow
requirements. Freeze the complete actual protocol before inspecting the final
test. The runbook/readiness report give a concrete capture plan: retain every
predeclared fixture/horizon and missing attempt, original evidence/source and
forecast receipts, immutable manifests and separately verified regulation
results/corrections. Later approved private shadow work must use the existing
cost/quota controls and passed pipeline-integrity checks. No hindsight forecast,
fixed accuracy promise, automatic promotion or public calibration claim follows.

### Confirmed local acceptance

Checks use pinned Node **24.18.1** and npm **11.16.0**. Fixtures, source/model
versions, periods, thresholds, credentials and authority records are explicitly
synthetic. Filesystem archive checks use owned temporary directories. No live
football, AI, research or database request was made by this feature.

| Check | Result |
| --- | --- |
| Final `npm run check` | Passed guarded Prisma generation, schema validation, zero-warning lint, strict type-check, **746 tests: 745 passed, 1 existing Windows POSIX-mode skip**, and production build/prerendering. Log: `.tmp/evaluation-full-check.log`. |
| New evaluation checks | **96 passed**: 15 input/integrity, 17 metric arithmetic/calibration, 20 historical baseline, 29 full harness/cohort/gate and 15 report/archive/CLI checks. All six suites passed again in the full check. |
| Genuine predictor integration | The harness test uses actual 012 prompt construction, output validation and calibration hooks with one immutable model's completed fitting windows and a future planned assessment period. It produces a scored synthetic capture without qualification or public claims. |
| Reproducibility and archive integrity | Frozen reruns and reordered fixture/history batches reproduce hashes/metrics. Exact native bigint versions survive JSON/archive reads. Identical archives are reused; copied/rehashed invented reports, revoked authority, traversal/linked paths, size limits, changed datasets and final-test replacement are denied. |
| Actual readiness command | `npm run evaluation:report` succeeded and generated report **a0fb4f64b50d0971cde249f8b690a9140a600ec89e4d419a8c2d3502c186dfde**. Its canonical JSON and Markdown were copied to the two `docs/reports/forecast-evaluation-014-readiness` handoff paths. |
| Handoff | Whitespace and local Markdown links checked. 014 stays empty while its approved protocol and selected configuration remain unresolved. No actual forecast-quality claim or model promotion is recorded. |

The two readiness files accidentally created by an early path-traversal test
remain under `C:/Users/WASSWA WILSON/AppData/Local/Temp/unapproved-target/`, outside
the repository. Automatic approval review rejected the verified narrow cleanup
with **“blocked by policy”**; cleanup was not retried. The corrected test preserves
the literal traversal input and rejects it before creating files. These two
temporary files contain factual zero-observation readiness data and are not
included in repository changes.

## Prompt 015 — Shared brand styling

Implemented the light-theme design system using the existing named first-party
brand assets and local Manrope source. **015 is complete** and its row is ticked
in [the root tracker](../dev-tracker.md). The independent styling work does not
resolve the recorded operating prerequisites for 011/012/014.

### Implemented and changed files

- `src/styles/theme.ts` and `styled.d.ts` define the typed palette, semantic
  surfaces/borders/outcomes, typography, spacing, breakpoints, focus and control
  dimensions. `global-style.tsx`, `registry.tsx` and `provider.tsx` implement the
  single client styling arrangement with initial and streamed server insertion.
- `src/components/ui/brand.tsx`, `layout.tsx`, `controls.tsx` and `feedback.tsx`
  provide the reusable exports listed in the [styling runbook](brand-styling.md).
  Native controls have accessible names, stable IDs, preserved hint/error
  associations, visible focus, square corners and 44px minimum targets. Status
  presentations combine text with decorative icons.
- `src/app/layout.tsx` loads the existing licensed font, integrates the root
  provider and named favicon assets. `page.tsx` uses the shared layout and honest
  empty-state presentation. `src/components/dev/brand-demo.tsx` is imported only
  in development, with interface examples and a local form that sends no data.
- `next.config.ts` enables the styled-components compiler. The documented
  `agentRules: false` setting keeps this development check from creating
  unrelated managed instruction files. `eslint.config.mjs` extends the private
  import guard to styles. `.gitignore` excludes Playwright captures and CLI
  session artifacts.
- `scripts/verify-brand-rendering.mjs` and the `test:styling` package script
  build and verify an isolated production acceptance fixture under `.tmp`.
  README/component guidance, this handoff, the decision register and tracker
  document the exports and results. No dependency version, lockfile or schema
  migration changed.

### Validation and evidence

All commands ran with Node.js **24.18.1** and npm **11.16.0**. Browser checks used
Playwright CLI with Chromium. No live football/AI/database calls were dispatched.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed guarded Prisma generation/schema validation, zero-warning ESLint, strict type-check, **746 tests: 745 passed and 1 existing Windows POSIX-mode skip**, plus production build/prerendering. Log: `.tmp/brand-015-full-check.log`. |
| Production styling fixture | `node scripts/verify-brand-rendering.mjs --serve` passed on the final theme. Artifact directory: `.tmp/brand-styling-evUVVA/`, with build log, `initial.html`, `streamed.html`, `stream-chunks.json` and `verification.json`. One initial style element contains 35 registered rules. The delayed response contains two emitted style elements, 12 unique registered rules and six response chunks. A genuinely new CSS rule precedes its actual streamed DOM and is emitted once. Global style/reset occurs once per response. |
| Production client boundary | All 13 fixture browser chunks exclude the fake secret/private canary and checked private service names. Rendered HTML excludes transient styling attributes. Actual application production chunks/reference manifest and HTML omit the development demo module and copy. No provider services are imported into the style/component graph. |
| Production without JavaScript | The actual application homepage returned 200 at 320px with JavaScript disabled. Readable heading/body, navy text, paper background, one styled-components style element and the named primary SVG rendered without hydration. Body is 16px; document width is 320px with no horizontal overflow. Screenshot: `output/playwright/brand-015-actual-production-no-js-320.png`. |
| Phone/desktop and long text | Production fixture checked at **320, 360, 390, 430 and 1280px**, including long labels, errors and a 270-character unbroken identifier. No horizontal document overflow; control/link minimum height is 44px, all inspected component corners are 0px. Desktop/320 captures: `output/playwright/brand-015-production-desktop.png` and `brand-015-production-320.png`. |
| Doubled text | The base font was explicitly doubled from 16px to 32px at 320px; body computed at 32px and document width remained within the viewport. Long text, control labels and feedback wrap. Spacing/gutter tokens were adjusted to fixed pixel values after inspection to preserve usable width. Screenshot: `output/playwright/brand-015-production-320-text-200.png`. |
| Keyboard and fields | Visible focus follows native tab order; a disabled button is skipped. Shared field labels each associate with their control, all referenced description IDs exist, the invalid field is marked, and the existing description remains beside hint/error IDs. A real interactive status update proves hydration; icons are decorative and status labels remain visible. Focus screenshot: `output/playwright/brand-015-production-keyboard-focus.png`. |
| Streamed browser navigation | Three primitive → delayed → primitive cycles retained the same document. New delayed content had its expected CSS marker when displayed. The adopted sheet remained **one element / 78 CSSOM rules** after every cycle, with no growth. No console warnings, hydration errors or page errors occurred during initial hydration and the navigation checks. |
| Motion and contrast | Reduced-motion media emulation is honored; computed animation/transition duration is 0.00001s. White/teal text is 4.86:1; navy/white 16.69:1; muted/white 5.98:1; outcome text/background at least 6.10:1. Control boundaries exceed 3:1 on white/paper. Focus CSS uses a navy 3px outline with a 3px offset; Windows display scaling returns fractional pixel measurements. |
| Handoff | Changed-file whitespace and repository-local Markdown links checked. First-party brand files and font source/license are reused unchanged. No synthetic football data, feed/card feature, locale shell or extra theme ships. |

The scoped fixture and temporary production server were stopped after checks;
the development homepage provides the preview for later primitive work. Live
device performance and full feed/navigation acceptance belong to their later
prompts and are not claimed by these isolated browser checks.

## Prompt 016 — English locale navigation

Implemented and verified on **9 October 2026 EAT**. **016 is complete** and its
row is ticked in [the root tracker](../dev-tracker.md). The [navigation runbook](locale-navigation.md)
documents route, message and component contracts. Existing operating gates for
011/012/014 remain unchanged and do not block this independent public shell.

### Implemented and changed files

- `src/domain/navigation.ts` defines the shared dated-feed view, strict parsing,
  Today/Results date/status defaults, information links and future match links.
  Today uses current EAT day/all statuses; Results uses previous EAT
  day/finished statuses. Both use `/en/predictions/YYYY-MM-DD`; `/en` renders the
  same feed shell and `/en/results` is not a separate application.
- `src/i18n/locales.ts`, `messages.ts` and `messages/en.ts` provide English-only
  publication, fallback, stable externalized keys, cardinal plural messages and
  `Intl` number/reporting-date formatting. Domain market/status IDs stay neutral.
- `src/proxy.ts` redirects unsupported locale-like prefixes to English while
  preserving path/query and excluding APIs/framework/assets. `src/app/page.tsx`
  permanently redirects `/` to `/en`. `src/app/layout.tsx` externalizes metadata
  copy while retaining the one shared provider, local font and English language.
- `src/app/[locale]/layout.tsx`, `page.tsx`, `predictions/[date]/page.tsx` and
  `how-it-works`, `privacy`, `terms`, `contact` page modules provide locale
  validation, interim noindex surfaces and semantic current locations.
  `src/app/not-found.tsx` provides a navigable English 404.
- `src/app/_components/public-shell.tsx`, `feed-shell.tsx` and
  `information-shell.tsx` compose server content. Request-scoped EAT dates use
  the existing calendar after `connection()`; no build-time date is cached.
  `src/components/navigation/shell-styles.tsx` reuses brand tokens, named logo,
  existing layout/link controls, wrapping and square corners. A native skip
  anchor moves keyboard focus to the main landmark. The old public development
  primitive demo is no longer mounted; its isolated styling fixture remains.
- `tests/navigation.test.mjs` covers fallback, routing, EAT midnight/year
  boundaries, historical views, malformed inputs, plural/count formatting and
  per-key fallback. `scripts/verify-navigation-rendering.mjs` checks the actual
  production HTML and redirects; `package.json` exposes `test:navigation` and
  `test:navigation:html`. The private-import lint guard and its boundary test now
  include i18n. Component guidance, styling/navigation runbooks, decision
  register, this record and tracker document the handoff. No dependency version,
  lockfile, schema or migration changed.

### Validation and evidence

Checks used Node.js **24.18.1**, npm **11.16.0** and Playwright CLI with installed
Chrome. This shell dispatched no football/AI/provider or application database
requests and issued no visitor cookies.

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed with zero warnings after the final native skip-link change. Server page composition lives in the app's private component directory, preserving browser import restrictions. |
| `npm run typecheck`, `npm run build` | Passed. The final Next.js 16.4 production build compiled and type-checked all locale, information, dated-feed and 404 routes plus the locale proxy. Public date-dependent routes render on demand. |
| `npm run test:navigation` | All **9** contract tests passed, including both sides of 21:00 UTC/EAT midnight, year rollover, old leap-day reporting, fallback and malformed paths/statuses. |
| Full existing suite | The final `node --conditions=react-server --test --test-reporter=dot tests/*.test.mjs` run exited 0: **755 cases, 754 passed and 1 existing Windows POSIX-mode skip**. Log: `.tmp/016-tests.log`. The first parallel run hit the existing offline Prisma-generation test's 60-second timeout while builds/checks competed for resources; that file passed alone, then the complete suite passed on rerun. No unrelated test or timeout was changed. |
| Production HTML | `node scripts/verify-navigation-rendering.mjs` passed on the final build. Eight anonymous feed/information pages have initial CSS before the shell, one main/h1, current-location markup before hydration, all links and `noindex, follow`. Root returns 308 to `/en` even with French browser headers. Locale fallbacks return 307 with route/query preserved. Invalid dates/statuses, repeated statuses, unknown matches and unknown routes return real 404s. No selector, auth UI, invented forecasts or misleading empty-fixture state appears. |
| Existing styling regression | `npm run test:styling` passed with one initial style element/35 registered rules, delayed styles preceding streamed DOM, two streamed style elements/12 unique registered rules, six response chunks and 13 browser chunks free of the private canary. Transient props remain absent. Final application chunks omit `BrandDemo` and the private canary. |
| Fresh browser navigation | An isolated French-language/Los Angeles context followed root, Today, Results, home, every information link, Back and `/fr/predictions/...?...` fallback. Targets, EAT dates, headings and server/current markers matched. Zero visitor cookies; zero page errors and zero console warnings/errors. |
| Keyboard | Tab order is skip → home → Today → Results → How it works → Privacy → Terms → Contact, with visible outlines. Shift+Tab reverses correctly. Activating the native skip link focuses `main-content`; the next Tab reaches footer navigation. The initial framework-link implementation scrolled without moving focus and was replaced before completion. |
| Phone, desktop and expansion | Checked **320px** and **1280px**, 16→32px base-text enlargement at 320px, tripled English labels/body copy plus a long unbroken identifier, and **200% CSS layout zoom at 640px (320px effective width)**. Document width stays within the viewport. Text and navigation wrap without clipping; screenshots were visually inspected. |
| Without JavaScript | A second isolated Swahili-language/Honolulu context disabled JavaScript. The inline Next queue remained undefined, with correct English language, 16px type, paper background, EAT date and a 320px document. Root, native skip, all six shell links and home worked with server-rendered current markers and zero cookies. The script assertion result was `passed: true`; its later optional console command was canceled during browser cleanup. |

Browser scripts/configs and screenshots remain ignored under
`output/playwright/locale-navigation-*`, including `320.png`,
`320-text-200.png`, `expanded.png`, `zoom-200.png`, `desktop.png` and `nojs.png`.
The production HTML verifier and domain tests are committed source; no browser
test dependency was added. Local Markdown targets and changed-file whitespace
were checked. Temporary acceptance browsers and the production server were
stopped after verification.

### Temporary surfaces and remaining scope

| Surface | Replacement owner |
| --- | --- |
| `/en` and dated feed, including Results' finished filter | 032 supplies the real stored match feed; 017/028/033 extend shared URL/query/filter behavior. |
| `/en/how-it-works` preparation notice | 038 supplies methodology and measured performance. |
| `/en/privacy` preparation notice | 039 supplies the actual privacy notice. |
| `/en/terms` preparation notice | 040 supplies actual terms. |
| `/en/contact` preparation notice | 041 supplies verified owner contact information. |

All interim surfaces remain `noindex, follow`; 042 owns final discovery and
indexing. The reserved match helper creates no public fixture placeholder;
035 owns verified match pages and canonical slugs. Already-open-tab midnight
rollover belongs to 037. No unimplemented locale, language selector, decorative
hero, feed query, simulated forecast/live state or legal assertion ships.
**No blocker remains for 016.**

## 017 — Request-safe client state

Date: **9 October 2026 (Africa/Kampala)**.

Implemented the client-state feature and its integration with the existing feed
preview. The [state runbook](client-state.md) and
[decision register](implementation-decisions.md#prompt-017--request-safe-state-and-versioned-handoff)
record the contracts for subsequent API, feed, filter, pagination and polling
prompts. No dependency version, lockfile, schema or migration changed.

### Scope and changed files

- `src/domain/feed-query.ts` owns reusable validated URL queries, canonical
  serialization/hrefs/list keys and shared Today/Results defaults. It supports
  EAT-relative dates, explicit historical dates and bounded ranges, normalized
  search, league/status/market, market-attached probability sort and pagination.
  Unknown, repeated, ambiguous and incompatible parameters fail closed.
- `src/domain/fixture-snapshot.ts` validates a typed public fixture projection
  with a coherent nullable cycle/run/revision forecast. It reuses the calendar,
  market validation and settlement status contract. Fixture data versions are
  exact unsigned BIGINT decimal strings; opaque IDs never determine freshness.
- `src/state/{contracts,feed,store,hooks,provider,preferences}.ts[x]` supplies
  per-provider stores, typed hooks, stable SSR/hydration handoff, mutable drafts,
  allowlisted anonymous preferences, numeric version reconciliation and
  generation/sequence/query/page request fencing. Whole snapshots replace only
  at strictly newer versions. Stale batches and failed refreshes retain accepted
  records, list membership and loaded position.
- Serializable Back checkpoints hold loaded page extent/IDs/scroll against a
  navigation entry, canonical query and starting page, bounded to 20 entries and
  30 minutes. Explicit EAT events roll relative selections to page 1 and preserve
  historical applied dates/ranges and historical drafts.
- Both locale feed pages use the shared URL parser and pass an explicit unloaded
  bootstrap into the provider through `src/app/_components/feed-shell.tsx`.
  Date ranges and additional canonical status labels reuse the existing UI and
  `src/i18n/messages/en.ts`. The feed still clearly identifies its preview state.
  `src/domain/navigation.ts` reuses and re-exports the shared defaults/statuses.
- `tests/{feed-query,client-state}.test.mjs` and the synthetic helper cover the
  contracts. `scripts/verify-client-state-rendering.mjs` builds an isolated real
  Next production fixture with two providers and verifies concurrent requests.
  `package.json` exposes `test:state` and `test:state:rendering`.
- `scripts/verify-navigation-rendering.mjs` adds valid full-query/range HTML and
  invalid-query 404 checks. `eslint.config.mjs` and its boundary test protect
  `src/state` from private imports; generated Playwright artifacts are excluded
  from lint. State/domain guidance, navigation runbook, decision register, this
  progress record and the tracker document the handoff.

### Validation and evidence

Checks ran on pinned **Node.js 24.18.1 / npm 11.16.0**. Browser checks used the
Playwright skill/CLI and installed Chrome. Synthetic fixture data was confined
to tests and temporary acceptance apps; it was never added to public routes.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed (exit 0): Prisma generation/schema validation, zero-warning lint, strict type-check, all **771 cases: 770 passed, 0 failed, 1 existing Windows POSIX-mode skip**, and the final Next.js production build. Log: `.tmp/017-check.log`. |
| `npm run test:state` | All **16** focused tests passed: URL round trips/defaults/malformed values, sort-market validation, isolation, exact numeric versions above JS precision, changed probability/source/explanation snapshots, older/equal versions, cycle changes, unavailable forecasts, request/query races, atomic stale/invalid pages, append/refresh failures, Back identity/page/expiry/bounds, empty-vs-unloaded state, EAT rollover and historical drafts, preference allowlist. |
| Isolated production SSR | Four concurrent requests each rendered two distinct providers with request-specific applied queries/drafts, version 9 fixture handoff and comfortable initial preferences. No response contained another request's query and no visitor cookie was issued. `test:state:rendering` passed. |
| Hydration and provider isolation | Browser JavaScript was gated until the real server DOM was inspected with an existing compact preference. Both providers initially rendered comfortable; after scripts were released both hydrated to compact without warnings/errors. Updating A's draft left its applied query and B's state intact. Parent rerenders with changed bootstrap props retained each mounted store. |
| Optional local storage | A context whose local-storage getter throws still hydrated and updated preferences/drafts. Sibling providers stayed isolated. A fresh context persisted only `goal-hint:preferences:v1` containing version/density; reload applied that preference after hydration. No fixtures, forecasts or queries were written. |
| Integrated production HTML | Ten feed/information URLs passed, including a sorted relative Tomorrow view and a seven-day historical range with search/league/page inputs. Initial styles, navigation/current markers, range endpoints, noindex and anonymous access remain correct. Malformed/mixed/repeated/unknown queries and incompatible probability sorts return real 404s; root and locale fallbacks remain correct. |

The browser acceptance result was `passed: true`, with `hydrationErrors: 0`.
The screenshot `output/playwright/client-state-hydration.png` was visually
inspected; the gated script/config remain beside it in ignored browser output.
SSR fixture HTML/build logs are under `.tmp/client-state-*`. The initial fixture
omitted public favicons, producing two resource 404s; the fixture builder was
corrected to copy the real first-party brand assets before the clean browser
acceptance run. No application behavior or test timeout was weakened.

### Remaining scope

The implementation deliberately provides state and reconciliation contracts.
028 supplies public stored-data endpoints; 032 supplies the real match feed;
033 wires controls to URLs; 034 chooses the persistent provider boundary and
wires real Back/session/DOM restoration; 037 adds EAT triggers and polling.
Current pages pass `data: null`; they do not imply empty fixture availability.
There are no invented RTK Query endpoints, browser provider/AI requests,
forecast persistence or active polling. Existing operating/launch gates remain
with their owning prompts. **No blocker remains for 017.**

## 018 — Reusable match card

Date: **9 October 2026 (Africa/Kampala)**.

Implemented shared match-card presentation and its public-data contract. The
[runbook](match-card.md) and
[decision register](implementation-decisions.md#prompt-018--selected-market-match-card-presentation)
describe the handoff to later feed/detail pages. No dependency version, lockfile,
schema or migration changed.

### Scope and changed files

- `src/components/match/{match-card,team-row,probability-label,outcome-badge,match-card-list}.tsx`
  supplies the article, separate Home/Away scores, selected-family prediction,
  estimated probability, five explicit/icon outcomes, source/publication and
  supplied notices, plus canonical analysis navigation. Shared tokens/primitives
  keep square corners, visible focus and a one-column/mobile, two-column/large
  native list. `src/components/ui/visually-hidden.tsx` supplies reusable heading
  and score-label semantics without duplicate logo announcements.
- `src/domain/match-card.ts` selects only the requested family, reuses complete
  market probability presentation, binds supplied outcomes and derives Unicode
  initials. `market-settlement.ts` exports the existing played-final predicate;
  card code never adjudicates display scores or synthesizes missing forecasts.
- `src/domain/fixture-snapshot.ts` adds optional logo, coverage, delayed,
  provisional and per-market outcome metadata. It validates cycle/revision/pick
  coherence, public Void reasons and final-status correctness. These fields use
  the existing atomic whole-version state replacement.
- `src/domain/remote-image.ts` shares structural HTTPS URL checks with
  `src/server/football/{catalog-input,api-football-normalize,provider-trial-evaluation}.ts`.
  Existing server media approval remains authoritative. Native 32px images use
  direct supplied URLs, lazy/eager loading, cached-load detection and initials on
  missing/failed images. Changed URLs can recover without retry loops.
- `src/i18n/messages.ts` reuses immutable number/date formatters and adds
  one-pass interpolation plus actual EAT instant labels. `messages/en.ts` owns
  the card, market, probability and outcome copy.
- `tests/match-card.test.mjs`, `tests/helpers/match-card-fixtures.mjs` and
  `tests/fixtures/match-card/preview.tsx` provide deterministic synthetic cases.
  `scripts/verify-match-card-rendering.mjs` builds a temporary production app
  with the real components/root provider and an isolated analysis destination.
  `package.json` exposes `test:card` and `test:card:rendering`.
- Component/domain guidance, styling/state runbooks, this progress record,
  implementation decisions, the new match-card runbook and tracker document
  the shared contracts and completed acceptance.

### Validation and evidence

Checks used pinned **Node.js 24.18.1 / npm 11.16.0**. Browser checks used the
Playwright skill/CLI and installed Chrome. All example teams, scores, predictions
and image responses were synthetic, confined to tests/temporary apps.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed (exit 0): Prisma generation/schema validation, zero-warning lint, strict type-check, **780 cases: 779 passed, 0 failed, 1 existing Windows POSIX-mode skip**, and the Next.js production build. Log: `.tmp/018-check.log`. |
| `npm run test:card` | All **9** focused tests passed: family/outcome independence, absent forecasts, score/settlement separation, identity binding and Void reason, sources/notices, group rounding/boundaries, Unicode initials, URL structure, literal interpolation/EAT publication and whole-version metadata replacement. |
| Isolated production SSR | `test:card:rendering` passed with **12** labeled examples, every outcome and both sources, correct reading order, one link per card, initial styles, actual publication time, notice scope, direct HTTPS native images/reserved dimensions, and no visitor cookie. Repeated after simplifying the unavailable label. Final artifacts: `.tmp/match-card-L2q8B0/`. |
| Hydration and family selection | Gated JavaScript allowed inspection of server markup and eager logo completion before hydration. Releasing scripts produced no hydration/page errors. Switching the first card from match result to total goals changed Correct/54% to Incorrect/70% and back, without coloring the card. |
| Reading and keyboard order | All articles have unique accessible headings, Home/Away score labels, decorative logo/initial containers and text plus non-color outcome icons. Tab followed preview controls then all 12 links in source order, with visible focus; Enter reached the canonical isolated fixture destination. |
| Responsive/text checks | At **320, 360, 390, 430 and 1280px**, no document/card overflow; logos remained 32px square, score columns aligned, long words wrapped and corners stayed square. Mobile lists had one column, desktop two. At 320px with **200% text**, the same layout checks passed. |
| Images and no-JavaScript behavior | Browser requests used the exact synthetic HTTPS URLs as image requests, without optimizer/proxy requests. 404 and 429 removed failed images and retained initials; a replacement URL loaded. A JavaScript-disabled 320px context retained readable server cards/initials and working keyboard analysis navigation. |
| Integrated public regression | All **10** feed/information URLs passed `test:navigation:html`, including historical ranges and selected-market sorting; redirects, locale fallback and invalid-query 404s stayed correct. Production browser chunks contained no card-example headings, URLs or synthetic team names. |

The browser acceptance result was `passed: true`, `cards: 12`,
`hydrationErrors: 0`. Expected image failures were synthetic 404/429 responses,
not application errors. The final unavailable copy was separately checked in
the rebuilt browser fixture. Screenshots visually inspected under ignored
`output/playwright/` include `match-card-{desktop,320,text-200,long-320,void,unavailable,limited,partial,delayed,broken}.png`.
The fixture uses intercepted synthetic HTTPS images, so these checks establish
component transport/fallback behavior rather than real-provider media approval
or CDN uptime. Acceptance scripts/config remain beside the screenshots.

### Remaining scope

The public feed still passes unloaded data and contains no fabricated matches.
028 supplies public DTO reads, 032 composes the real feed, 035 owns real analysis
destinations and 037 owns refresh/polling. Locked-revision projection and settled
outcomes remain server responsibilities. Real media rights, provider operations,
forecast qualification and launch gates retain their existing owners.
**No blocker remains for 018.**

## 019 — Immutable prediction history

Date: **9 October 2026 (Africa/Kampala)**.

Implemented prediction-history persistence and private read repositories. The
[history runbook](prediction-history.md) and
[decision register](implementation-decisions.md#prompt-019--immutable-prediction-cycle-and-revision-storage)
document invariants, transaction handoff, least-privilege grants and rollback
that preserves history. No dependency version or lockfile changed.

### Scope and changed files

- `prisma/schema.prisma`, its schema snapshot and migration
  `20261009121009_prediction_history/migration.sql` add minimal `DailyRun`
  identity/order, `PredictionCycle`, immutable `PredictionSet`/`MarketPrediction`,
  and append-only `PredictionSchedule`/`PredictionAudit`. They extend existing
  fixtures with an active-cycle reference and reuse evidence/model records.
  Composite foreign keys bind cycle/fixture/current/locked/predecessor, run/order,
  schedule and exact evidence identity/version/hash. Native probability, state,
  timing, projection/integrity checks and lookup/uniqueness indexes supplement
  the shared application rules. The migration contains no forecast seeds.
- `src/server/predictions/{history-contract,history-input,history-read,history-mysql-store}.ts`
  supplies strict commands/types, idempotent run/cycle creation, immutable
  complete revisions, scoped serialized transactions and expected-version
  cycle/reference changes. All four families are stored explicitly; unsupported
  new families never inherit old values. Original provenance/fallback reasons,
  evidence/model/rule versions and distinct clocks survive unchanged.
- Mutations reuse the existing catalog provider→fixture lock order and increment
  exact fixture data versions with their audit records. Failed callbacks roll
  back all related SQL; caught writer errors also prevent commit. Immutable
  payloads have no supported update/delete method, and test application grants
  deny those operations. Closed/locked cycles cannot reopen or substitute picks.
- Coherent read-only current/locked/display, revision/cycle history, audit and
  schedule repositories use stable bounded cursors. Open reads current, closed
  reads locked or unavailable, and void retains its last applicable prediction
  and reason even without a lock. Empty cycles never invent a forecast.
- `src/server/fallback/fallback-input.ts` adds reusable strict archive parsing
  for resolved candidates, preserving the existing complete market validator,
  coherent match-result/double-chance provenance, original clocks and flags.
- `tests/prediction-history.{test,integration}.mjs` and its synthetic helper
  exercise contracts and genuine isolated database behavior. `package.json`
  exposes `test:history`. The server guidance, database/history runbooks,
  implementation decisions, progress record and tracker document the handoff.

### Validation and evidence

Checks used pinned **Node.js 24.18.1 / npm 11.16.0** and owned throwaway
**MySQL Community Server 8.4.11** instances selected with
`MYSQL_TEST_SERVER_BINARY`. Separate migration/application users exercised real
permissions. Tests made no football, news or AI provider request; all decisions,
forecast inputs and permissions were synthetic. No installed MySQL service or
application database was used.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed (exit 0): Prisma generation/validation, zero-warning lint, strict type-check, **785 cases: 784 passed, 0 failed, 1 existing Windows POSIX-mode skip**, and the Next.js production build. Log: `.tmp/019-check.log`. |
| `npm run test:history` | **22 passed, 0 failed/skipped**: five deterministic archive/command tests plus the database harness and 16 database cases. Log: `.tmp/019-history.log`. |
| Migration/schema | All committed migrations deployed to fresh InnoDB databases. `db:verify` confirmed schema agreement with no drift; application DDL and migration-table access were denied. No live rows or seeds were introduced. |
| Concurrency and bindings | Six independent-client retries each shared one run, cycle and refresh publication. Conflicting inputs, stale schedules/versions, older new runs, wrong evidence/fixture/cycle references and invalid probabilities were refused. Native composite keys also rejected cross-cycle/fixture refs and malformed probability payloads. |
| Precision/provenance | Binary64 thirds, complete source provenance, explanations, model/evidence bindings, original publication/evidence/source times and unknown provider clocks round-tripped. Fixture versions above JavaScript's safe integer range remained exact. A newer partial fallback snapshot removed unsupported older AI families. |
| Immutability/atomicity | Application UPDATE/DELETE attempts on sets/markets/schedules/audits and cycle identity edits failed. Throwing after revision/reference changes rolled back payloads, markets, references, audits and fixture versions. Catching a writer failure inside the callback still rolled back the entire transaction. Escaped writer calls failed. |
| Read/lifecycle storage | Chronological cursors did not alter references/versions. Closed cycles used locked or unavailable data; locked picks could not be replaced/reopened. Schedule corrections appended observations/audits while preserving picks. Void cycles retained reasons/predictions without a lock; empty closed/void cycles stayed unavailable. Activating a new explicit cycle retained old history. |
| Existing catalog integration | **28 passed, 0 failed/skipped** on MySQL 8.4.11. Canonical identities, import coordination, exact versions, concurrency and result provenance remained valid. Log: `.tmp/019-catalog.log`. |
| Existing evidence integration | **20 passed, 0 failed/skipped** on MySQL 8.4.11. Immutable requests/sources, precision, native constraints, nullable cycle/run refs and archive preservation remained valid. Log: `.tmp/019-evidence.log`. |
| Existing model integration | **12 passed, 0 failed/skipped** on MySQL 8.4.11. Immutable model configurations, pins, authority checks, native constraints and least privilege remained valid. Log: `.tmp/019-predictor.log`. |

The initial isolated migration attempt caught MySQL's requirement for an
explicit boolean comparison around COALESCE in CHECK expressions; the migration
was corrected before acceptance. Real round trips also identified unsigned
32-bit raw-query decoding and the evidence fixture's original authority binding;
those were corrected without weakening validation or permissions. Later clean
runs passed. The owned test instances were shut down and removed by their
ownership-checked harness. No UI changed, so visual acceptance was not required.

### Deferred interfaces and blockers

020 owns durable job/lease identity, 021 committed daily manifests, 022
transactional publication eligibility, 023 eligible cutoff locking, 024 lifecycle
decisions/canonical schedule coordination, and 027 settlement/corrections.
The provided transaction writer is their storage boundary; it is not an active
publication service or a scheduler. Public read endpoints and history UI remain
with 028/029/036. Rollback preserves additive schema and immutable history while
disabling writers; corrections use reviewed forward migrations and drift checks.

Live evidence/model/source approvals and quality gates in 011/012/014 remain
pending with their existing tracker state, alongside production database
grants/retention/recovery qualification. They do not block independent local
storage acceptance. **No blocker remains for 019.**

## Prompt 020 — Durable jobs

**Date:** 9 October 2026 EAT. **Status:** local implementation and required
acceptance checks complete; 020 ticked in `dev-tracker.md`. Production activation
is blocked by the explicit deployment decisions below. No later prompt was run.

### Changes

- `prisma/schema.prisma`, its schema snapshot and additive migration
  `20261009123830_durable_jobs` add durable jobs, actual attempts, append-only
  events/usage and 64 sharded enqueue-control locks. Existing daily runs/cycles
  gain inverse relations. Native refresh uniqueness, fixture/cycle/run FKs,
  envelope seals/projections and state/deadline/owner checks preserve identities.
  Only static lock rows are initialized; no runnable job or forecast is seeded.
- `src/server/jobs/` adds strict versioned typed envelopes/handler registry,
  the MySQL queue and private identity/trigger adapter. Enqueue and caller effects
  can share one transaction; caught writer errors still roll back. Committed rows
  are their own durable delivery intent, so no broker send can disappear after
  commit. Claims recover expired leases without changing the business job key.
- Renewable leases, actual attempt IDs and monotonic fencing check ownership on
  every mutation/finalization. Original deadlines stay bounded. Capped
  exponential equal-jitter retries and structured failure/expiry reasons retain
  audit evidence. Request/cost references, actual counts/duration and uncertainty
  phases append without raw errors, responses or credentials.
- The worker exposes abort/checkpoint eligibility and separate primary/fallback
  time budgets, serializes heartbeats, stops new claims on shutdown and closes
  its pool. `src/workers/jobs.ts` uses pinned Node 24 native TypeScript stripping,
  relative `.ts` imports and `react-server`; a trusted operator binding is
  mandatory. No production handler, public/internal route or scheduler is mounted.
- `tests/durable-jobs.{test,integration}.mjs` and three test-only helpers cover
  contracts, genuine MySQL contention/recovery and actual child-process death
  and restart. `package.json` adds `test:jobs` and `worker:jobs` without changing
  dependencies/lockfile. `docs/durable-jobs.md`, database/server/worker guidance,
  decision register, progress and tracker record the handoff.

### Validation and recovery evidence

Checks used **Node.js 24.18.1 / npm 11.16.0** and owned throwaway
**MySQL Community Server 8.4.11** instances selected through
`MYSQL_TEST_SERVER_BINARY`. All identities, approvals, handlers and effects were
synthetic. No application database, installed MySQL service, provider call,
subscription or live deployment was used. The ownership-checked harness shut
down and removed its owned servers and test data.

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed, exit 0: Prisma generation/validation, zero-warning lint, strict type-check, **790 cases: 789 passed, 0 failed, 1 existing Windows POSIX-mode skip**, and the Next.js production build. Log: `.tmp/020-check.log`. |
| `npm run test:jobs` | **23 passed, 0 failed/skipped**: five deterministic tests plus the database harness and 17 substantive database/process cases. Log: `.tmp/020-jobs.log`. |
| Migration/grants | All committed migrations deployed to fresh InnoDB databases and `db:verify` found no drift. Application DDL, operational payload/attempt identity edits, job deletion and event/usage changes were denied; native checks rejected invalid attempt counters. |
| Contention/idempotency | Six independent duplicate enqueue clients shared one job and initial event. Two competing workers created one attempt; only its actual owner could finish. Changed payload/model keys and mismatched refresh fixture/cycle bindings were refused. |
| Death/restart | A real child worker committed an idempotent business effect, was killed, then another process recovered its expired lease. Job identity stayed fixed, attempt/fence changed and exactly one business effect remained. Closing/recreating a database connection also resumed a committed pending row with no external send. |
| Ownership/atomicity | Already expired owners could not renew, retry or acknowledge even before takeover. Fenced effect/ack transactions rolled back together. Enqueue/caller effects rolled back after a caught writer failure; escaped enqueue calls were refused. |
| Bounds/privacy | Heartbeat renewal did not extend hard deadlines. Tests verified fallback reserve, current eligibility stop, bounded timeout, capped retry/non-retryable reasons, graceful retry/drain, idempotent usage references, read-only history/cursors and raw-error redaction. Unauthorized triggers rejected before enqueue and never ran handlers. |
| Standalone runtime | Actual Node `.ts` entry loaded a trusted synthetic binding, handled durable work and exited cleanly after shutdown. Missing bindings failed closed with static diagnostics and no credential output. |
| `npm run test:history` | **22 passed, 0 failed/skipped** on MySQL 8.4.11; immutable forecast, schedule/audit, precision, transaction and closed/void read contracts remained valid. Log: `.tmp/020-history.log`. |
| `npm run test:catalog` | **28 passed, 0 failed/skipped** on MySQL 8.4.11; canonical identities, import coordination, exact versions and provider→fixture locking remained valid. Log: `.tmp/020-catalog.log`. |
| Review | Tracked diff/new-file whitespace, local documentation links, schema snapshot agreement, server-only markers and explicit worker imports checked. Public routes remain unchanged; no UI visual check was required. |

The first contention run exposed duplicate-insert lock-upgrade deadlocks. Sharded
enqueue locks fixed the race while preserving the rule against retrying arbitrary
business callbacks. A positive standalone test then exposed its test-only IPC
channel remaining open after shutdown; the binding now closes that channel and
the harness bounds exit waiting. Only the verified owned stuck test child was
terminated. Clean final runs passed all required checks.

### Explicit deployment blockers and deferred work

The local MySQL-backed implementation creates no managed subscription or hosted
approval. OP-19 still requires confirmation of the deployed queue/worker host,
actual service/workload identity, operator ownership and representative capacity;
OP-01 actual target/TLS/grants/pool capacity, OP-11 approved per-workload
time/request/token/fallback/retry/concurrency bounds, OP-12 itemized infrastructure
budgets and OP-32 environment/host isolation remain pending. The worker's trusted
binding fails closed until authorized; synthetic test bindings are not approval.
At-least-once external effects still need provider idempotency and the existing
shared quota/cost ledgers. Uncooperative in-process JavaScript needs a qualified
supervisor/termination policy; queue fencing protects supported finalization.

021 owns committed manifests and their enqueue transaction; 022–024 own
publication/locking/lifecycle, 025 prediction orchestration, 026 the continuous
poller, 043 watchdog/recovery thresholds and 044/046 hosted monitoring/capacity.
Rollback stops writers/workers and retains additive schema and all job/forecast
history; reviewed corrections roll forward after schema-state inspection.
011/012/014 retain their existing unresolved live qualification state. No local
implementation or acceptance blocker remains for 020.

## Prompt 021 — Daily selection

**Date:** 9 October 2026 EAT. **Status:** local implementation and required
acceptance checks complete; 021 ticked in `dev-tracker.md`. Live scheduling
remains blocked by the decisions below. No later prompt was implemented.

### Changes and schedule setup

- `src/server/selection/selection-{contract,input,mysql-store,service,read,trigger}.ts`
  add the strict policy/authority contract, seven-date orchestration, renewable
  database-UTC ownership/fencing, coverage-aware date projection, typed durable
  selection handler and authenticated scheduler adapter. The schedule constant
  is `0 21 * * *` UTC, midnight `Africa/Kampala`. The scheduler must retain the
  original occurrence; retries never derive another date from invocation time.
- `prisma/schema.prisma`, its snapshot and additive migration
  `20261009131134_daily_selection` extend `DailyRun` and add append-only
  `DailyRunManifest`, durable `DailyRunImport`, immutable `RunFixture` membership
  and explicit `SelectionCycleEligibility`. Native date/identity/rank/state
  checks, refresh uniqueness and composite fixture/cycle/job FKs preserve the
  cohort. Application column grants separate immutable content from progress.
- Each date request is saved before I/O. Complete receipts are reused, incomplete
  imports retried, original bounds retained, and receipt-commit crashes recovered
  without fetching again. Existing API-Football adapter/gateway own requests and
  pagination; unexpected fixture pages stay incomplete. Retained canonical
  fixtures remain known data even after a newer empty response.
- `src/server/football/catalog-mysql-store.ts` and
  `src/server/predictions/history-mysql-store.ts` accept a caller-owned transaction
  for the existing provider → fixture lock/writer boundary. Initial cycles,
  selection entries and manifest commit now roll back together. Open cycles are
  reused; a new ordinal after closure needs an explicit recorded eligible
  postponed/void input. No cycle is reopened and no lifecycle event is inferred.
- A committed manifest seals boundaries, policy hash, coverage/page evidence,
  exclusions, fixture/cycle/kickoff identities and nearest-kickoff rank/envelope.
  Reconciliation transactionally enqueues/links only missing entries, recovering
  crashes before dispatch or partway through it. Later discoveries wait for
  another eligible daily selection. Total/successful-completed/terminal counts
  and per-entry queue outcomes persist separately without membership changes.
- Partial finalization requires both a configured degradation policy and a
  separately verified recorded action after import retries. Incomplete dates
  return partial/data-unavailable, including zero-row dates. A committed partial
  manifest is never silently completed or changed.
- `src/server/jobs/job-trigger.ts` exports its existing bounded private body
  parser for reuse. `tests/daily-selection.{test,integration}.mjs` and
  `tests/helpers/selection-fixtures.mjs` exercise the feature through the real
  catalog adapter/gateway, history and queue. `package.json` adds `test:selection`
  without dependency changes. The runbook, server/worker guidance, operating
  decisions and tracker document the handoff.

### Verification and recovery evidence

Checks used the available bundled **Node.js 24.19.0 / npm 11.17.0**, and owned
throwaway **MySQL Community Server 8.4.11** instances selected through
`MYSQL_TEST_SERVER_BINARY`. The repository's existing runtime pins remain
24.18.1/11.16.0; exact-pin execution was not claimed. All provider bodies,
permissions, policies and lifecycle inputs were synthetic. No application
database, installed server service, provider/media request or hosted schedule
was used. The ownership-checked harness removed its test servers/data.

| Check | Actual result |
| --- | --- |
| `npm run test:selection` | **18 passed, 0 failed/skipped**: five deterministic tests, the database harness and twelve substantive MySQL cases. Log: `.tmp/021-selection.log`. |
| EAT boundaries | Proved 7 October starts at 6 October 21:00 UTC, includes 7–13 October, includes the last millisecond and excludes the next midnight boundary. Original scheduled occurrence remains identical on repeated trigger delivery. |
| Migration/permissions | Fresh InnoDB deployment and `db:verify` passed without drift. Application DDL, manifest/membership/import/evidence changes and deletion were denied. Native progress checks and composite cross-refresh job links were verified. |
| Concurrency/ownership | Competing triggers produced one active selector and one refresh per selected key. Heartbeats kept slow provider work owned; expired owners could neither renew nor commit before/after takeover. Fences increased monotonically. |
| Import/restart | Unexpected pagination retried without dispatch or false completeness. Restart fetched only the incomplete date. A committed catalog receipt resumed without another fetch. A precommit crash rolled back cycle, membership and manifest effects. |
| Commit/dispatch recovery | A committed manifest with zero dispatches resumed unchanged. A crash after a linked enqueue prefix recovered only the missing suffix; duplicate enqueue stayed one job per refresh. |
| Partial/late discovery | Missing-date finalization required a verified recorded action. The partial date never became No fixtures. A late fixture could not join that manifest and was selected by another eligible daily run. |
| Cycles/progress | Open cycles were reused. Unapproved closed/void cycles were excluded; explicit void and postponed inputs created later ordinals while prior cycles stayed closed. Queue success/failure outcomes persisted with unchanged manifest membership. |
| `npm run test:history` | **22 passed, 0 failed/skipped** on MySQL 8.4.11. Log: `.tmp/021-history.log`. |
| `npm run test:catalog` | **28 passed, 0 failed/skipped** on MySQL 8.4.11. Log: `.tmp/021-catalog.log`. |
| `npm run test:jobs` | **23 passed, 0 failed/skipped** on MySQL 8.4.11, including existing actual child-process crash/restart checks. Log: `.tmp/021-jobs.log`. |
| Existing fallback timing test | The first full check overlapped database work and hit an existing short-deadline fallback test. Its isolated suite passed **42/42**, with no fallback code change. Log: `.tmp/021-fallback.log`. |
| `npm run check` | Passed, exit 0: Prisma generation/validation, zero-warning lint, strict type-check, **795 cases: 794 passed, 0 failed, 1 existing Windows POSIX-mode skip**, and the Next.js production build. Log: `.tmp/021-check.log`. |

The first fresh migration attempt caught the need to match existing binary
identity collations on foreign keys; the new migration was corrected before
acceptance. Test wiring was also corrected to use the existing history writer's
explicit transaction API and coherent closed-without-prediction references.
Final MySQL runs passed. No UI changed, so visual acceptance was not required.

### Live blockers and later integration

OP-05/20 still need approved competitions/trial-backed eligibility evidence and
an actual degraded-finalization policy/action authority. A complete manifest can
commit without a degraded action; missing degradation approval blocks only the
affected incomplete live path. OP-03–08 provider/account/retention qualification,
OP-11 approved bounds and OP-19 hosting/workload identity remain unresolved.
The protected factory and schedule configuration are ready, but no route,
production binding or hosted cron is mounted or activated.

022–025 own publication, locking, lifecycle detection/transitions and the refresh
handler. The latter should synchronize the provided progress projection after
terminal work; persisted queue outcomes remain authoritative until synchronized.
026 polling cannot add selection jobs. 043 may call the same original-occurrence
recovery contract. Rollback stops bindings/workers while retaining additive schema
and immutable manifests, imports, cycles and jobs; repairs roll forward after
schema-state inspection. Earlier live qualification gates remain unchanged.

## Prompt 022 — Revision publication

**Date:** 9 October 2026 EAT. **Status:** implementation and required local
verification complete. The tracker row is ticked; live activation remains gated.

### Changed files and behavior

- `src/server/predictions/publication-{contract,input,eligibility,read,service}.ts`
  add the single complete-snapshot acceptance path, explicit policy/authority,
  transactional manifest/window/cycle/schedule/status/source validation,
  database-time cutoff and ownership checks, immutable result recovery and
  coherent current/locked/void reads with ordered refresh/delay status.
- `prisma/schema.prisma`, its snapshot and additive migration
  `20261009134454_revision_publication` add append-only
  `PredictionRefreshResult`, `PredictionPublicationBarrier` and
  `PredictionChangeEvent`. Binary identities, restrictive composite FKs, unique
  attempt/event bindings and native checks protect the records. Application
  access to new tables is SELECT/INSERT only.
- `history-mysql-store.ts` uses MySQL UTC time by default, preserving its
  explicit test clock. `history-read.ts` shares the existing coherent display
  rules with publication. Evidence/model stores expose their existing validated
  reads inside the caller's transaction; no second connection or source reader
  is used while publishing.
- The shared provider → fixture → job locking boundary serializes publication
  with catalog, cycle close and schedule changes. Commit atomically appends the
  set/four markets, moves current, advances fixture version and writes history
  audit, refresh result and durable invalidation event. Final ownership, source/
  observation freshness and strict cutoff are checked after provisional writes.
- Original manifest membership/window and the current rolling EAT window must
  agree with the active open cycle and accepted schedule. Exact stored evidence,
  model pin/configuration, AI source attributions/coverage, provider support
  receipts and full probability/source consistency are revalidated. No visitor
  or completion-time/source-confidence ordering is introduced.
- Verified early observed/canonical play persists a publication barrier, even
  before 023's final lock operation exists. Later scheduled responses cannot
  reopen eligibility. Shared barrier/schedule helpers prepare 023/024 without
  implementing their final lock or lifecycle coordinator.
- New fallback can replace old AI. Partial snapshots drop unsupported families;
  zero-family outcomes create no set and retain only an eligible previous
  revision with original clocks and Update delayed, otherwise unavailable.
  Accepted refresh replay returns the original receipt after changed model/
  composition, acknowledgement, closure or lost commit response, without moving
  current back. Exact unpublished attempts replay; later attempts can recover.
- `tests/revision-publication.{test,integration}.mjs` and the publication helper
  use genuine MySQL, independently pooled clients, the real selection/catalog/
  evidence/model/history/queue contracts and deterministic MySQL session clocks.
  Existing forecast helpers accept an optional real job ID. `package.json` adds
  `test:publication`; no dependencies changed. The publication runbook, server
  guide and implementation register document grants, recovery and live gates.

### Verification

Checks use bundled **Node.js 24.19.0 / npm 11.17.0** and owned throwaway
**MySQL Community Server 8.4.11** via `MYSQL_TEST_SERVER_BINARY`. Existing
24.18.1/11.16.0 pins remain unchanged; exact-pin execution is not claimed.
Provider/model bodies, permission decisions and MySQL session clocks are
synthetic. No application database, installed service, live provider request,
deployment or hosted schedule is used. Harnesses clean their owned test targets.

| Check | Actual result |
| --- | --- |
| `npm run test:publication` | **25 passed, 0 failed/skipped**: six deterministic tests, the MySQL harness and eighteen substantive transaction/concurrency cases. Log: `.tmp/022-publication.log`. |
| Migration/permissions | All migrations deployed on InnoDB and `db:verify` found no drift. New-table DDL/deletion was denied to the application role; composite bindings and sealed result/barrier reads were exercised through actual inserts. |
| Duplicate/order races | Eight same-key calls across two clients yielded one set, current pointer, result and event. Overlapping older/newer runs left the newer reference current; a newer partial fallback replaced older AI. Old accepted-key replay returned its original receipt without restoring current. |
| Eligibility/time | Rejected exactly-at/after cutoff, cutoff crossing during provisional writes, early observed and canonical play, stale/future observations, stale source output, wrong active cycle, changed schedule, missing manifest identity and original/current-window violations. Later scheduled evidence could not remove the durable play barrier. |
| Atomicity/recovery | Failure after set/reference/result/event writes rolled everything back. A simulated lost response after actual commit recovered the original immutable publication. Acknowledged/restarted deliveries with a changed model pin still returned that original publication. Unpublished attempts could recover without duplicating a set. |
| Lifecycle/read races | Publication losing a close/schedule race refused the write. Publication winning the lock was visible to the subsequent close decision. Retention kept original forecast timestamps/provenance and Update delayed; empty history stayed unavailable. Bounded event replay and coherent current/locked reads passed. |
| `npm run test:history` | **22 passed, 0 failed/skipped**. Log: `.tmp/022-history.log`. |
| `npm run test:selection` | **18 passed, 0 failed/skipped**. Log: `.tmp/022-selection.log`. |
| `npm run test:evidence` | **20 passed, 0 failed/skipped**. Log: `.tmp/022-evidence.log`. |
| `npm run test:predictor` | **12 passed, 0 failed/skipped**. Log: `.tmp/022-predictor.log`. |
| `npm run test:jobs` | **23 passed, 0 failed/skipped** on its isolated final run. Log: `.tmp/022-jobs.log`. |
| `npm run check` | Prisma generation/validation, zero-warning lint and strict type-check passed. The default-concurrency unit step hit the existing 25 ms fallback timing test, so this invocation stopped before build. Log: `.tmp/022-check-first.log`. All check stages subsequently passed as recorded below. |
| `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs` | **801 cases: 800 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Reduced concurrency resolved the scheduler-sensitive fallback assertion without code/test changes. Log: `.tmp/022-unit-serial.log`. |
| `npm run build` | Passed, exit 0: Next.js production compilation, TypeScript and page generation. Log: `.tmp/022-build.log`. |

The **120 affected unit/integration cases** passed in their final runs. All
database acceptance used genuine MySQL rather than an in-memory transaction
substitute. The initial jobs regression overlapped several database suites and
hit an existing short backoff timing expectation: a claim was already due when
the test expected null. The isolated rerun passed 23/23 without job-code or
test changes; the earlier log remains `.tmp/022-jobs-overlap.log`. The first full
check also hit the existing fallback test's 25 ms deadline before its collector
started, making its unknown-request expectation scheduler-sensitive. Its
isolated suite passed **42/42** (`.tmp/022-fallback.log`), and the entire unit
suite then passed with test concurrency set to one. The normal test script and
fallback implementation/tests remain unchanged. Initial publication test setup
was corrected to reuse each immutable committed cohort and actual owning job
identities. No live operation or qualification result is inferred.

### Live blockers and handoff

OP-21 still requires trial-backed status/kickoff observation age and conflict
decisions. OP-07/14 source/evidence freshness and unknown-time rules, actual
provider/redistribution/retention rights, separate budgets, model/calibration/
quality qualification, selection choices and deployed identity remain pending.
No permissive production binding or freshness allowance was invented.

The authority must enforce the existing runtime publication approval gate and
independently prove owning job/model/evidence/source receipts. 023 owns final
locking, 024 schedule/actual-start corrections, 025 orchestration/failure costs,
and 031 event consumption/caching. Scheduled predictions stay disabled until
023–025 and the live gates pass. Rollback stops bindings and preserves additive
schema plus immutable forecasts, barriers, results and events; repairs roll
forward after inspecting actual schema/migration state. No UI changed.

## Prompt 023 — Cutoff locking

**Date:** 9 October 2026 EAT. **Status:** implementation and required local
verification complete. The tracker row is ticked; live activation remains gated.

### Changed files and behavior

- cutoff-{contract,input,eligibility,read,service}.ts implement explicit policy
  and synchronous workload/evidence authority, stable durable close/recovery
  envelopes, strict history reconstruction, irreversible single-reference
  closure, immediate observed-play closure and an audited immutable void.
- publication-barrier.ts shares the existing append-only safety-barrier write
  with publication. Selection requires the implemented cutoff scheduler after
  refresh dispatch and checks ownership again afterward. The actual close handler
  integrates with the existing registry/renewable worker rather than a new runner.
- Prisma schema/snapshot and additive migration 20261009142724_cutoff_locking
  introduce sealed append-only PredictionCycleOperation receipts and extend
  PredictionChangeEvent with exactly-one refresh/operation bindings and native
  checks. Existing publication events remain valid; application grants need only
  SELECT/INSERT on the new table.
- The shared provider → fixture → job transaction replays schedule and actual
  start evidence; selects the latest eligible accepted run rather than the current
  pointer; preserves an eligible earlier-day forecast; and atomically closes,
  increments fixture version and records audit/receipt/invalidation. Effective
  close time remains separate from delayed lock execution. Void never substitutes
  another locked pick or rewrites a forecast.
- tests/cutoff-locking.{test,integration}.mjs and its synthetic helper exercise
  genuine MySQL clocks, real publication/selection/evidence/model/queue contracts,
  competing clients and the durable worker. Existing selection/publication tests
  stub only their newly required scheduler dependency. The cutoff runbook, existing
  selection/history/publication guides, server README and decision register describe
  bindings, recovery, grants, events and outstanding live gates.
- `.env.example` restores the documented empty provider-key setting. A populated
  value in the current commit was retained in ignored `.env.local` without being
  printed; it must be rotated because it already exists in GitHub history.

### Verification

Checks use bundled **Node.js 24.19.0 / npm 11.17.0** and owned throwaway
**MySQL Community Server 8.4.11** via MYSQL_TEST_SERVER_BINARY. Repository pins
24.18.1/11.16.0 remain unchanged; exact-pin execution is not claimed. Provider,
model, policy, permission and session-clock data are synthetic. No live provider,
application database, installed service, deployment or hosted schedule is used.

| Check | Actual result |
| --- | --- |
| `npm run test:cutoff` | **26 passed, 0 failed/skipped**: eight deterministic tests, the MySQL harness and seventeen substantive database/worker cases. Log: `.tmp/023-cutoff.log`. |
| Cutoff migration/permissions | Fresh InnoDB deployment and `db:verify` passed with no drift. Application DDL, operation deletion/update and unbound change events were denied. Existing publication events remained valid. |
| Scheduling/recovery | A simulated crash after one cutoff enqueue preserved the committed manifest and refresh jobs. Retry performed no imports, filled the remaining cutoff jobs and retained stable identities. Superseded jobs scheduled the accepted cutoff; the real worker closed after downtime. |
| Eligibility/races | Proved one millisecond before, exactly at and after cutoff; early play/barrier consumption; previous-day early-morning forecasts; earlier schedule corrections that skip the newest pointer; and past deadlines that later extensions cannot erase. Publication/closure and schedule races used the shared real MySQL locks. |
| Outcome independence | A delayed lock chose the newer eligible away pick even though the older home pick would have won the stored 8–0 final score. Changing that result afterward preserved the same immutable lock. |
| Atomicity/immutability | Eight competing closes produced one receipt/reference/event. Final authority failure or actual lease expiry rolled back provisional closure, audit/version/result/event effects. Ambiguous committed responses and restart returned the original lock. Void retained the original pick/payload/close/lock times and emitted its own stable audit/event. |
| `npm run test:publication` | **25 passed, 0 failed/skipped**. Log: `.tmp/023-publication.log`. |
| `npm run test:history` | **22 passed, 0 failed/skipped**. Log: `.tmp/023-history.log`. |
| `npm run test:selection` | **18 passed, 0 failed/skipped**. Log: `.tmp/023-selection.log`. |
| `npm run test:jobs` | **23 passed, 0 failed/skipped** in its isolated run. Log: `.tmp/023-jobs.log`. |
| Environment-example correction | The initial full unit run had **807 passed, 1 failed, 1 existing skip** because the tracked example contained a populated provider key. After restoring its safe blank value, the isolated runtime-policy suite passed **27/27**. Logs: `.tmp/023-check.log`, `.tmp/023-runtime-policy.log`. |
| Repository validation | All `npm run check` stages passed, using `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs` for the unit stage to avoid the known scheduler-sensitive fallback test. Prisma generation/validation, zero-warning lint and strict type-check passed; the final unit rerun had **809 cases: 808 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Logs: `.tmp/023-check.log`, `.tmp/023-unit-final.log`. |
| `npm run build` | Passed, exit 0: Next.js production compilation, TypeScript and page generation. Log: `.tmp/023-build.log`. |

Initial acceptance setup exposed existing provider integer-second timestamp and
verified regulation-score constraints; test fixtures were corrected to satisfy
those existing parser/database contracts. The MySQL acceptance exercises cutoff boundaries,
early play, previous-day retention, historical eligibility instead of a newest
pointer, outcomes-independent selection, duplicate closes, shared-lock races,
full rollback, ambiguous committed-response recovery, void immutability and a
real expired lease/fence recovery. All **114 affected unit/integration cases**
passed in final runs. Repository-wide validation and the production build also
passed after the environment-example correction. No prediction or fallback
implementation was changed to make an existing timing test pass.

### Live blockers and handoff

Actual close-job workload bounds/hosting identity (OP-19), provider and reuse
rights, independent budgets, model/evaluation qualification and publication's
approved timing/conflict choices remain unresolved. Synthetic approvals grant
no live operation permission. 024 owns detecting/coordinating kickoff/start
corrections, 025 refresh orchestration, 027 settlement, 031 cache consumption and
043 watchdog discovery. Scheduled predictions remain disabled pending 024–025
and the live gates. Rollback disables bindings and retains additive schema and
immutable forecasts, schedules, audits, receipts and events; repairs roll forward.
No UI changed, so visual acceptance is not required.

## Prompt 024 — Schedule lifecycle

**Date:** 9 October 2026 EAT. **Status:** implementation and required local
acceptance complete. The tracker row is ticked; live activation remains gated.

### Changed files and behavior

- `predictions/lifecycle-{contract,input,policy,read,service}.ts` provide one
  normalized, attributable observation service with explicit mapping/evidence
  policy, immutable receipt replay, monotonic source ordering, conflict holds,
  actual-start safety, cutoff corrections, postponement/terminal voids and
  next-daily-selection rescheduling handoffs. No polling loop is introduced.
- Catalog coordination now receives original normalized observations and an
  explicit apply/retain choice, including stale/unchanged rows. Active-cycle
  kickoff/status changes without coordination fail closed. Publication and
  selection check the stored conflict projection. Refresh eligibility remains
  separate from result tracking outside the rolling window.
- Cutoff operations reuse the caller's transaction, enqueue updated cutoff jobs
  atomically and permit audited pre-lock voids while preserving existing
  closed-lock behavior. The shared queue exposes transactional enqueue. No
  lifecycle observation creates a prediction-refresh job or edits a manifest.
- Prisma schema/snapshot and migration `20261009150750_schedule_lifecycle`
  add InnoDB/binary-identity lifecycle cursor and append-only observation tables,
  a next-run handoff boundary, and composite lifecycle/fixture/version change
  event bindings with native checks. Existing refresh/cycle event rows remain valid.
- `tests/schedule-lifecycle.{test,integration}.mjs`, the synthetic lifecycle helper
  and reusable prediction-pipeline harness cover real MySQL/selection/publication/
  queue/history behavior. Existing cutoff/selection/publication harness grants
  add SELECT on the conflict projection; forecasts and observations remain immutable.
- The new [schedule runbook](schedule-lifecycle.md), cutoff/selection/publication
  guides, server README and decision register describe evidence ordering, conflict
  resolution, coordination, grants and live handoff. No UI changed.

### Verification

Checks use bundled **Node.js 24.19.0 / npm 11.17.0** and owned throwaway
**MySQL Community Server 8.4.11** via MYSQL_TEST_SERVER_BINARY. Repository pins
24.18.1/11.16.0 remain unchanged. Provider observations, clocks, policies and
approvals are synthetic; no provider, production database or installed service
is used. Initial lifecycle acceptance passed **23/23**, expanded acceptance
passed **26/26**, and final acceptance passed **27/27**, including retained
regulation scores after missing-score observations and final-to-live regression
holds. No feature check remains skipped or pending.

| Check | Actual result |
| --- | --- |
| `npm run test:lifecycle` | **27 passed, 0 failed/skipped**: five deterministic tests, the genuine MySQL harness and twenty-one substantive database/concurrency cases. Log: `.tmp/024-lifecycle.log`. |
| Migration and permissions | Fresh deployment and `db:verify` passed without drift. New tables use InnoDB and binary identity collation. Observation edits/deletes and unbound change events were denied. Existing publication/cycle events still passed their regressions. |
| Lifecycle and selection | Ordinary delay preserves cycle/job/manifest identity. Passed corrected/previously elapsed cutoffs close from eligible history. Repeated postponements void/preserve earlier forecasts and create ordinals two/three only in later daily selections; unchanged polls retain the handoff boundary. Terminal statuses preserve normalized result observations and known verified scores. |
| Safety and conflicts | Early play and earlier-start corrections close/void before and after locking. Same-time/unknown-mapping/regressed-status conflicts remain explicit and block publication. Stale evidence cannot roll back schedule fields; verified older start proof still invalidates a lock. Missing provider entries do not invent a terminal status. |
| Races and atomicity | Competing lifecycle/publication/lock clients preserve irreversible closure and never replace a locked selection. Six duplicate observations create one receipt/transition. Failed scheduling, authority or identity validation rolls back canonical/history/event effects. Ambiguous committed-response replay returns the original receipt. No extra refresh job or changed committed manifest membership was observed. |
| Affected MySQL regressions | `node --conditions=react-server --test --test-concurrency=2 tests/catalog.integration.mjs tests/prediction-history.integration.mjs tests/daily-selection.integration.mjs tests/revision-publication.integration.mjs tests/cutoff-locking.integration.mjs tests/durable-jobs.integration.mjs`: **113 passed, 0 failed/skipped**. Log: `.tmp/024-regression.log`. |
| Repository units | `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`: **814 cases, 813 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Reduced concurrency avoids the previously documented scheduler-sensitive fallback test. Log: `.tmp/024-unit.log`. |
| Prisma, lint and types | Prisma format/generation/validation, zero-warning lint and strict type-check passed. Schema and snapshot agree. Exact pinned runtime execution is not claimed. |
| `npm run build` | Passed, exit 0: production compilation, TypeScript and page generation. Log: `.tmp/024-build.log`. |

### Live blockers and handoff

Actual provider mappings, evidence/conflict/unknown-update and retention approval,
rights, publication freshness, separate budgets, model/evaluation qualification,
workload bounds and hosting identity remain live gates (OP-07/14/19/21). Synthetic
authority proves local failure behavior and grants no live operation permission.
025 owns spending/refresh orchestration, 026 shared polling/result synchronization,
027 settlement, 031 event consumption and 043 watchdog discovery. No later prompt
is implemented or ticked. Rollback disables bindings and preserves additive schema,
canonical identities and immutable forecasts/schedules/evidence/audits/events;
inspect actual DDL state and repair forward. Visual acceptance is not required.

## Prompt 025 — Prediction refresh worker

Implemented `dev-plan/025-prediction-refresh-worker.md` as an operator-bound
durable job definition, composing the existing services without another forecast
validation/publication path. Public routes remain stored-data consumers.

### Changed files and behavior

- `src/server/refresh/refresh-{contract,input,mysql-store,observation,service}.ts`:
  sealed manifest/current fixture/cycle/run eligibility; immutable reviewed plan
  and model pin; explicit total football and separate research/AI allocations;
  bounded evidence, primary prediction, fallback and final observation phases;
  lifecycle recheck and atomic publication; five operational outcomes and precise
  phase reasons/cost summaries; published replay and terminal progress repair.
- `prisma/schema.prisma`, matching snapshot and
  `20261009153335_prediction_refresh_worker/migration.sql`: additive append-only
  `PredictionRefreshIntent`, `PredictionRefreshStage`, `PredictionRefreshOutcome`,
  job foreign keys, existing binary identity collation and JSON shape checks.
- Evidence/predictor/fallback services accept parent cancellation workflows.
  Evidence reports separate football/research usage. Fallback's shared pure
  resolver preserves valid AI after an interrupted provider attempt. Football
  fixture lookup accepts the existing workflow boundary for final status checks.
- Job contracts/registry/worker/MySQL queue: transaction-aware usage recording and
  an optional awaited settled hook. Stage completion and usage commit together;
  replay adds no duplicate count. Selection progress updates only changed member
  state projections.
- `tests/prediction-refresh.test.mjs`, `.integration.mjs`,
  `tests/helpers/refresh-fixtures.mjs` and the extended reusable MySQL pipeline
  harness; `npm run test:refresh`; `docs/prediction-refresh-worker.md` and the
  decision register. No frontend/UI change.

### Verification

Used bundled **Node.js 24.19.0 / npm 11.17.0**, with repository pins unchanged,
and owned throwaway **MySQL Community Server 8.4.11**. All provider transports,
credentials, policy approvals, observations and model outputs were synthetic.
No live provider, installed database service or application database was used.

| Check | Actual result |
| --- | --- |
| `npm run test:refresh` | **30 passed, 0 failed/skipped**: four cancellation/resolution units, two real MySQL harnesses and twenty-four end-to-end cases. Log: `.tmp/025-refresh-final.log`. |
| Final usage rollback check | Re-ran the complete manifest-owned harness after adding failure injection: **19 passed, 0 failed/skipped**. Invalid usage rolls back the completed stage; published replay preserves one AI usage count. Log: `.tmp/025-atomic-usage.log`. |
| AI/fallback behavior | Valid AI, invalid output, provider/AI outage, actual AI timeout, insufficient evidence, AI budget exhaustion, partial fallback, no supported source and fallback timeout passed. Valid AI survives fallback failure; provider forecasts remain outside primary input. Limited news does not force fallback; research and AI ledger summaries remain separate. |
| Durability/concurrency | Immutable model/cost intent survives restart; an unfinished AI boundary never redispatches. A real cost-gateway dispatch interrupted by worker shutdown retains charged liability and falls back without a second AI call. Ambiguous publication response returns the original revision without new usage. Two workers claim one delivery. Append-only worker grants and invalid allocation identities/budgets/reserves are enforced. |
| Lifecycle/age/progress | Fresh early play and an earlier kickoff whose cutoff has passed close before publication. Stale original status cannot authorize publication. A newer daily run supersedes a leased older member; old work is ineligible. Zero valid families retain the previous complete set with original evidence/generation/publication times. Terminal progress distinguishes queue completion from publication and repairs expired/unclaimed work. |
| Affected MySQL regressions | Eight suites (cost, cutoff, selection, jobs, evidence, predictor, publication, lifecycle), concurrency two: **151 passed, 0 failed/skipped**. Fresh migrations and component drift checks passed. Log: `.tmp/025-regression.log`. |
| Repository units | `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`: **818 cases, 817 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Log: `.tmp/025-unit.log`. |
| Prisma, lint and types | Generation, schema validation, zero-warning lint and strict type-check passed; schema and snapshot match. Logs: `.tmp/025-schema.log`, `.tmp/025-lint.log`, `.tmp/025-typecheck.log`. |
| Production build | `npm run build` passed: compilation, TypeScript and production page generation. Log: `.tmp/025-build.log`. |

The synthetic timeout test was expanded to allow database reservation time before
the transport timeout, avoiding an overloaded test host exercising a different
earlier timeout boundary. This changes no production allowance. Migration
collation was aligned with existing job keys before final fresh deployments.

### Live blockers and handoff

The worker definition is ready for a reviewed trusted binding. Existing provider
coverage/quota and reuse rights, research provider/license, model/calibration and
evaluation proof, rates and separate account/job budgets, freshness/conflict
policies, workload and hosting/worker identity remain OP-07/14/19/21 live gates.
No production behavior is enabled by synthetic tests. Rollback disables the
binding and preserves additive tables and immutable forecasts/evidence/history;
inspect DDL and repair forward. 026 polling, 027 settlement, 031 event consumption
and 043 watchdog discovery remain separate prompts. No later prompt is ticked.

## Prompt 026 — Fixture and result synchronization

Implemented and locally verified on **9 October 2026 EAT**. Prompt 026's
implementation and acceptance checks are complete; its tracker row is ticked.
Live activation still requires the operating inputs below. No later prompt is
implemented or ticked.

### Changed files and behavior

- `src/server/results/result-sync-{contract,policy,mysql-store,service,command}.ts`:
  one renewable account-wide fenced lease; persisted 15-second live/60-second
  EAT-date cadence; idle pause/resume; locally filtered coverage; fresh-record
  deduplication; at-most-20-ID missing-live/cross-midnight batches; finite slower
  unresolved/correction tiers; persisted quota/outage backoff and delay reads.
- `prisma/schema.prisma`, matching snapshot and
  `20261009164940_fixture_result_sync/migration.sql`: additive InnoDB lease,
  sealed response batch, result state, append-only result and provider observation
  tables; same-fixture lifecycle/result foreign keys and four-way event binding.
  Result revisions advance the shared fixture version and retain predecessors,
  original clocks, separately verified regulation and extra-time/penalty totals.
- Existing provider live/date/ID methods accept the shared cancellation/dispatch
  workflow. Lifecycle exposes a validated transaction-scoped projection entry
  point, keeping schedule/cutoff/result application under the same fixture lock.
  No additional prediction validation/publication path is introduced.
- `src/workers/results.ts`, `worker:results` and `test:results` package scripts;
  result unit/integration suites and synthetic helper; extended reusable MySQL
  pipeline grants; server/worker READMEs, the decision register and
  [result synchronization runbook](fixture-result-sync.md).

Responses commit before application. Recovery drains pending batches before new
dispatch and resumes partial application per fixture without duplicate results
or events. Original accepted lifecycle receipts cannot apply old cached scores
over a newer cursor. Known catalog final timestamps anchor correction horizons;
new retrievals and corrections cannot restart them. Exhaustion retains visible
unresolved state. Forecast payloads, locked references and committed manifests
remain immutable; polling does not enqueue refresh jobs or call AI.

### Verification

Used the pinned **Node.js 24.18.1 / npm 11.16.0** and owned throwaway
**MySQL Community Server 8.4.11** via MYSQL_TEST_SERVER_BINARY. Provider transports,
clocks, account evidence, score/mapping approvals and policies are synthetic.
No live provider, application database or installed database service was used.

| Check | Actual result |
| --- | --- |
| `npm run test:results` | **25 passed, 0 failed/skipped**: five units, a genuine MySQL harness and nineteen substantive database cases. Final log: `.tmp/026-results-final.log`. |
| Cadence/ownership | Controlled exact 15s/60s boundaries, idle pause/resume, graceful restart without duplicate polls, six competing cold-start owners, exact lease expiry takeover, stale renew/release fencing and twenty concurrent ticks passed. Late in-flight old-owner responses cannot persist. |
| Cross-midnight/missing data | Forty-six fixtures use **20/20/6** ID groups; already refreshed records avoid ID work. Missing live/ID entries preserve live status and explicit missing reasons. Outside-window unresolved fixtures slow down and remain stored after their polling horizon. |
| Result integrity/recovery | Unverified regulation remains unknown despite extra-time/shootout totals. Verification and corrections append predecessor-linked versions/events. Unchanged results keep original observation/update clocks while actual sync advances. Saved-response and partial-application interruption recover without another fetch. Stale, conflicting and originally accepted cached observations cannot roll back newer scores. |
| Quota/outages | The real shared limiter denies optional work at the essential reserve and permits one final ID batch before stopping exactly at **120,000** accounted requests. No cap excess occurred. Provider failures back off across restart while stored data remains readable. Unexpected pagination/date-boundary rows do not overwrite fixtures. |
| Forecast invariants | Polling early play closes through lifecycle/cutoff handling; later final corrections retain the exact locked revision, picks, payload and manifest. Refresh job count is unchanged. The synthetic transport accepts only fixture endpoints; no AI calls occur. |
| Migration/permissions | Fresh deployment and `db:verify` passed without drift. New tables use InnoDB; binary identities and quota-account FK collation agree. Result/observation/body UPDATE and DELETE are denied. Invalid unbound result events are rejected. |
| Affected database regressions | Eight suites (catalog, cutoff, selection, jobs, refresh, quota, publication, lifecycle), concurrency two: **171 passed, 0 failed/skipped**. Log: `.tmp/026-regression.log`. |
| Repository units | `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`: **823 cases, 822 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Log: `.tmp/026-unit.log`. |
| Schema, lint and types | Prisma format/generation/validation and migration drift check passed; schema/snapshot match. Final `npm run lint` and `npm run typecheck` passed. Logs: `.tmp/026-lint.log`, `.tmp/026-typecheck.log`. |
| Production build | Final `npm run build` passed: compilation, strict TypeScript and page generation. Log: `.tmp/026-build.log`. |

Initial acceptance exposed a quota-account FK collation mismatch and concurrent
first-lease insertion lock upgrades. The migration now matches the existing
account columns, and acquisition locks the permanent account row before insert.
Controlled clock jumps also verified immediate reacquisition after expiry.
Expanded recovery checks caught the original-accepted-receipt cache edge case;
application now checks the current lifecycle/canonical cursor before using its
scores. All fixes passed the final acceptance suite.

### Live blockers and handoff

An approved approach threshold, active window, finite unresolved/correction
tiers, resource/backoff bounds, competition/season coverage, retention/rights,
real batch support, lifecycle mappings/conflict policy, verified account evidence
and trusted continuous-host binding remain required. Missing settings fail
configuration validation; no permissive live values or approval are inferred
from tests. Existing OP-07/14/19/21 operating gates continue to apply.

027 owns settlement against verified regulation and immutable locked selections;
031 owns result-event delivery/cache invalidation; 043 owns watchdog discovery.
Rollback stops the binding and retains additive schema, canonical identities,
responses, result revisions, forecasts, manifests and audit/events. Inspect actual
DDL state and repair forward. No UI change requires visual acceptance.

## Prompt 027 — Market settlement

**Date:** 9 October 2026. **Status:** implementation and local acceptance complete.
Followed [027](../dev-plan/027-market-settlement.md) only. Applied additive
migrations to owned throwaway MySQL 8.4.11 instances; no installed/production
database, provider network, AI invocation or live activation was used.

### Implemented and changed files

- `src/server/settlement/settlement-contract.ts` and `settlement-service.ts`:
  immutable locked-pick settlement, independent four-family outcomes, correction
  chains, atomic fixture invalidations, durable source receipts, bounded missed
  work discovery/reconciliation and an existing-worker job definition with lease
  fencing. Reuses shared regulation domain/history/cutoff/catalog/job services.
- `src/server/results/result-read.ts` and `result-sync-mysql-store.ts`: shared
  sealed result reader validating identity, version, body and indexed score
  fields/content hash; the synchronization read now reuses that reader.
- `prisma/schema.prisma`, snapshot and migration
  `20261009181240_market_settlement`: SettlementBatch, MarketSettlement,
  MarketSettlementRevision and SettlementEventReceipt; composite restrictive
  foreign keys, one active family pointer, append-only correction chains and an
  exactly-one-source settlement event extension. InnoDB/binary identities.
- `tests/market-settlement.integration.mjs`, `tests/prediction-pipeline.mjs` and
  `package.json`: genuine MySQL acceptance, least-privilege settlement grants and
  `npm run test:settlement`. Existing pure market rules/tests are reused.
- `docs/market-settlement.md`, decision register and tracker: evidence,
  correction/applicable-cycle contracts, private worker integration, recovery,
  grants, rollout boundaries and completion handoff.

### Verification

| Check | Actual outcome |
| --- | --- |
| `npm run test:settlement` | **28 passed, 0 failed/skipped**: 11 domain checks, 16 substantive genuine MySQL cases and their harness. Log `.tmp/027-settlement-final.log`. |
| Regulation rules | Draws, 0–0, BTTS, exactly two/three goals, live reported scores, extra time and penalties with/without separately verified regulation passed. |
| Missing/void outcomes | Partial provider families, closed no prediction, canceled/abandoned/awarded/postponed locks, early-start cutoff invalidation, historical void cycles and a new applicable cycle passed. |
| Corrections/integrity | Prior badge/reason/sealed result, visible correction time, unchanged badge corrections, repeated score confirmation, exact immutable locked picks, stale canonical/result disagreement, corrupt seals and crossed family pointers passed. |
| Concurrency/recovery | Twelve competing replica deliveries create one batch/four active outcomes. Duplicate replay, rollback before commit, lost acknowledgement after commit, bounded omitted-delivery/cycle discovery, expired lease fencing and successful replacement durable delivery passed. |
| Migration/grants | Fresh deployment and `db:verify` passed without drift. Foreign keys, event shape, binary InnoDB tables and denial of audit UPDATE/DELETE passed. |
| Affected database regressions | Cutoff, selection, prediction history, result sync, publication and lifecycle: **109 passed**, no failures/skips. Durable jobs standalone rerun: **18 passed**, no failures/skips (`.tmp/027-jobs-repeat.log`). |
| Repository units | **823 cases: 822 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`, log `.tmp/027-unit.log`. |
| Schema/lint/types | Prisma format/generation/validation, schema/snapshot equality, `npm run lint` and final `npm run typecheck` passed. Logs `.tmp/027-lint.log`, `.tmp/027-typecheck.log`. |
| Production build | `npm run build` passed compilation, strict TypeScript and page generation (`.tmp/027-build.log`). |

The combined seven-suite regression run recorded 125 passes and two failures
(one existing durable-job wall-clock expiry assertion and its parent harness).
The short jitter backoff had already elapsed by the next claim under concurrent
load, so that claim legitimately returned a replacement lease. The isolated
durable-job rerun passed all 18 cases; no queue implementation/test change was
made for this feature. Combined log `.tmp/027-regression.log` retains the result.

Repeated-score acceptance exposed a real projection edge case: canonical score
verification can advance while material result synchronization preserves its
original sealed timestamp. Settlement now accepts the original verification
when score/evidence still agree and canonical verification is no earlier. An
unchanged confirmation no longer creates a false correction or Pending badge.

### Remaining operating gates and handoff

No feature implementation/acceptance blocker remains. Synthetic evidence does
not establish live provider rights, regulation mapping, quality or approvals.
Existing provider/model/rights/database/hosting gates continue to apply; private
job execution bounds and binding must be supplied by the operator. No scheduler
or worker was activated. 030 owns hit-rate aggregation, 031 owns result-event
delivery/cache invalidation and 043 owns watchdog activation. Rollback stops the
private binding and retains additive schema, immutable locks, result/correction
evidence and durable events. No UI change requires visual acceptance.

## Prompt 028 — Match feed API

**Date:** 9 October 2026. **Status:** implementation and local acceptance complete.
Followed [028](../dev-plan/028-match-feed-api.md) only. Added GET /api/matches
and its reusable stored-data server service. Database acceptance deployed all
migrations to owned throwaway MySQL 8.4.11 instances. No installed/production
database, football/research provider, AI invocation or live worker was used.

### Implemented and changed files

- `src/app/api/matches/route.ts` and `src/server/matches/`: anonymous Node route,
  shared query service, parameterized SQL filtering/search/sorting before
  pagination, coherent card projections, exact-date coverage, real daily-run
  progress, structured errors and a replica-safe public search budget. Reuses
  the existing URL/EAT/catalog/forecast/result/settlement contracts.
- `src/domain/match-feed.ts`, `fixture-snapshot.ts` and English messages: public
  response/error schemas and backwards-compatible shared card metadata for cycle
  modes/void reasons, unavailable families, update observations, correction time,
  score period and seven-day availability. No UI change or later detail/cache
  feature is implemented.
- `src/server/settlement/settlement-read.ts`, `settlement-service.ts`,
  `results/result-read.ts`, `selection/selection-read.ts` and
  `selection/selection-mysql-store.ts`: extracted reusable sealed read paths and
  canonical result agreement without changing private write behavior. Public
  reads suppress stale outcome badges and never write settlement or jobs.
- Prisma schema/snapshot and additive migration
  `20261009184740_match_feed_api`: one permanent binary-collated InnoDB
  PublicSearchLimit row, with a scope CHECK and migration seed. Public runtime
  grants need SELECT/UPDATE on that row, with SELECT on shared read tables.
- `tests/match-feed.test.mjs`, `match-feed.integration.mjs`,
  `prediction-pipeline.mjs`, `helpers/lifecycle-fixtures.mjs` and `package.json`:
  028 acceptance and `npm run test:feed`. Shared synthetic helpers now derive
  canonical provider team IDs rather than assuming every fixture uses 10/20;
  the pipeline adds minimal search-counter grants.
- `docs/match-feed-api.md`, implementation decisions and tracker: complete
  response/error/pagination/search/privacy/grants/rollout contracts; OP-23's
  initial bounds are settled, with production tuning left to workload evidence.

### Verification

| Check | Actual outcome |
| --- | --- |
| `npm run test:feed` | **47 passed, 0 failed/skipped**: 31 input/HTTP/schema checks, 15 substantive genuine MySQL checks and their harness. Log `.tmp/028-feed-final.log`. |
| Queries/pagination | 75 synthetic fixture inputs; matching aliases beyond page one, renamed canonical names, league/country aliases, wildcard/injection literals, exact inclusive/exclusive EAT boundaries, a historical date and a two-day range passed. Default 30/max 100, page links, stable ties, selected-family unrounded sorting, missing values last and out-of-range recovery passed. |
| Coherent projections | Current AI and provisional provider snapshots, missing families, immutable locks, a closed cycle with an ineligible retained preview, pre-lock void reasons, a new applicable cycle with no duplicate, verified regulation, correction timestamps and stale-settlement Pending behavior passed. Historical forecasts remain readable after competition removal and outside the current window. |
| Coverage/progress | Partial/failed/unknown imports retain rows and cannot establish authoritative empty dates. Newer unfinished/failed attempts suppress an older complete-empty receipt; later complete coverage restores it. Progress uses actual durable successes despite stale DailyRun counters; missing/uncommitted runs keep unknown totals. |
| Public security | Anonymous success, no auth/set-cookie requirements, 400 validation before database/limiter access, 429/503 recoverable JSON and diagnostic redaction passed. Across two replicas, a 130-request burst admits exactly 120; expiry resets atomically, ordinary browsing continues, and no visitor identity/search text is stored. Adapter counts, fetch interception and job/result/forecast/version totals prove no visitor-triggered work. |
| Migration/schema | Fresh deployment and `db:verify` passed on genuine MySQL; counter InnoDB/binary collation and denial of runtime INSERT/DELETE passed. Prisma generation/validation and schema/snapshot equality passed. |
| Affected database regressions | **126 passed, 0 failed/skipped** across selection, prediction history, publication, cutoff, lifecycle, result sync and settlement. Command uses `--test-concurrency=2`; log `.tmp/028-regression.log`. |
| Repository units | **854 cases: 853 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/028-unit.log`. |
| Lint/types/build | `npm run lint`, final `npm run typecheck` and `npm run build` passed. Production route manifest includes dynamic /api/matches. Logs `.tmp/028-lint.log`, `.tmp/028-typecheck.log`, `.tmp/028-build.log`. |
| Production HTTP smoke | An owned loopback Next production server with database capability disabled returned uncached structured 400s for invalid/duplicate/oversized inputs, a recoverable 503 for the disabled database, no locale redirect/cookie, and 405 for POST. Temporary harness/log `.tmp/028-http-smoke.mjs`, `.tmp/028-http.log`; no provider request or live DB was possible. |

### Remaining operating gates and handoff

No feature implementation or local acceptance blocker remains. Apply the additive
migration and runtime grants before enabling the route against a configured
database/competition set. Existing production budget/access verification,
provider/model/rights/quality and hosting gates remain in force; these tests do
not establish production coverage, rights, throughput, forecast quality or
successful deployment. The initial shared search budget is conservative and may
return busy responses across visitors; tune with real workload evidence.

The public canonical fixture version is separate from asOf-dated operational
job/coverage/window observations. Future client integration must refresh those
observations without treating them as a new forecast/result revision. 029 owns
match detail, 030 hit rates, 031 event/cache work and 032 real feed composition.
No later prompt, worker or scheduler was activated. Rollback disables the route
and retains additive schema and immutable history. No UI change requires visual
acceptance.

## Prompt 029 — Match detail API

**Date:** 9 October 2026. **Status:** implementation and local acceptance complete.
Followed [029](../dev-plan/029-match-detail-api.md) only.
Added anonymous GET /api/matches/{id}, explicit revision/cycle selection and
bounded stable history. Genuine database acceptance used owned throwaway MySQL
8.4.11 instances with synthetic observations, policies and forecasts. No live
provider, AI invocation, production database, worker or scheduler was used.

### Changed files and behavior

- `src/app/api/matches/[id]/route.ts`, `src/server/matches/detail-query.ts`,
  `detail-service.ts`, `detail-read.ts` and `detail-http.ts`: reusable repeatable
  stored queries, owned revision/cycle selection, anchored history, safe source
  attribution and analysis, explicit historical identities, applicable audited
  outcomes, and canonical UUID/slug route data. Current fixture metadata remains
  distinct from an explicitly selected historical snapshot.
- `src/domain/match-detail.ts`, `fixture-snapshot.ts` and `navigation.ts`: strict
  public DTOs, reusable validated forecast schema and future detail route identity.
  Complete source-owned probabilities and alternatives preserve deterministic
  picks. Unknown provider clocks remain null; expired/unapproved analysis is
  withheld without replacing stored forecasts or inventing explanations.
- `src/server/matches/public-http.ts`, `feed-http.ts`, `feed-error.ts`,
  `fixture-read.ts` and `src/domain/match-feed.ts`: shared uncached public errors
  and void-reason projection, including a nonrecoverable 404. Existing feed
  success/error behavior and aggregate anonymous search policy are preserved.
  Detail reads do not search or mutate its counter. No migration/grant is added.
- `tests/match-detail.test.mjs`, `match-detail.integration.mjs` and `package.json`:
  `npm run test:detail`, input/privacy/HTTP acceptance, genuine MySQL scenarios,
  immutable history pagination under publication and cycle creation, and read-only
  interception plus before/after database checks.
- `docs/match-detail-api.md`, implementation decisions and tracker: DTO,
  selection/pagination, source permission, privacy and operating contracts.

### Verification

| Check | Actual outcome |
| --- | --- |
| Feed/detail acceptance | **80 passed, 0 failed/skipped**, including both genuine MySQL suites. Command `node --conditions=react-server --test --test-concurrency=2 tests/match-feed.test.mjs tests/match-feed.integration.mjs tests/match-detail.test.mjs tests/match-detail.integration.mjs`; log `.tmp/029-api-final.log`. Final `npm run test:detail` rerun: **34 passed, 0 failed/skipped**, including the added shared UTC/unsigned-version boundary check; log `.tmp/029-detail-complete.log`. |
| Detail state/ownership | Open, locked, unpublished, closed-without-lock, pre-lock void, old void cycles, corrected results, selected earlier revisions, unknown fixture/history UUIDs and cross-fixture references passed. The database wrapper initially redacted intentional 404s to 503; domain failures are now preserved across that wrapper and both API suites pass. |
| Consistency/history | Complete probabilities, derived double chance, alternatives, mixed-family provenance, original clocks, explicit current/selected identities and monotonic versions passed. Anchored revision pagination remains stable after another publication; cycle pagination remains stable after another cycle; zero anchors pin empty membership. |
| Privacy/read-only | Only approved original explanations/attribution leave the whitelist. Expired or unapproved citations withhold analysis; unknown update times remain null. Model/raw/private fields are absent. A transaction proxy rejects writes/non-SELECT SQL, fetch interception sees zero calls, and forecasts/evidence/results/jobs/audits/settlement/cycles/versions/search counter remain identical before/after history reads. |
| Lint/types | Lint and TypeScript passed; logs `.tmp/029-lint-final.log`, `.tmp/029-types-final.log`. |
| Build/production HTTP | Final `npm run build` passed and lists dynamic /api/matches/[id]. An owned loopback production server with database capability disabled passed input/duplicate/oversize rejection, shared feed errors, uncached 503, async route identity params, no locale redirect/cookie and POST 405. Logs `.tmp/029-build.log`, `.tmp/029-http.log`; temporary smoke harness `.tmp/029-http-smoke.mjs`. |
| Repository units | **878 cases: 877 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/029-unit-final.log`. The initial concurrent run had one timing-sensitive existing cost-gateway test expire before its controlled stage; the unchanged isolated cost suite passed all 14 checks, followed by this successful quiet full run. No cost code was changed. |

### Handoff

No feature implementation or local acceptance blocker remains; 029 is checked
in the tracker. Existing provider/model/reuse/budget/database/hosting gates remain effective;
synthetic acceptance establishes local behavior, not live rights, quality,
capacity or deployment readiness. No new schema, grants or private write path
is required. Public canonical fixture versions remain separate from asOf-dated
operational observations and permission filtering. 030 owns performance, 031
cache/event work, 035 detail-page rendering and 036 history UI. No later prompt
was started. Rollback disables the detail route while retaining immutable data.
No UI change requires visual acceptance.

## Prompt 030 — Performance API

**Date:** 9 October 2026. **Status:** implementation and local acceptance complete.
Followed [030](../dev-plan/030-performance-api.md) only.
Added anonymous GET /api/performance and bounded stored-data aggregation.
Acceptance uses owned throwaway MySQL 8.4.11 databases and synthetic forecasts,
observations, approvals and policies. No live provider/AI, production database,
worker, scheduler or independent quality claim was exercised.

### Changed files and behavior

- `src/app/api/performance/route.ts`, `src/server/performance/performance-query.ts`,
  `performance-read.ts`, `performance-service.ts`, `performance-http.ts` and
  `src/domain/performance.ts`: strict bounded public query/response contracts,
  indexed batch reads, repeatable snapshots, locked forecast coverage/scoring,
  explicit source/version/horizon scopes, policy verification and correction
  freshness. Unavailable comparisons do not substitute unmatched fixtures.
- `src/server/evaluation/evaluation-gates.ts`, `evaluation-service.ts`: reuse
  numeric quality diagnostics in chronological evaluation and public reporting.
  Existing `evaluateMarketMetrics` remains the sole probability scoring and
  calibration implementation, including overlapping binary double chance.
- `src/server/predictions/history-read.ts`, `src/server/results/result-read.ts`,
  `src/server/settlement/settlement-read.ts`, `src/server/predictor/predictor-mysql-store.ts`
  and `src/server/matches/feed-read.ts`: shared sealed row parsers, settlement
  projection and indexed public fixture scope. The raw MySQL result boundary
  normalizes unsigned goal bigints and booleans while preserving seal/index/hash
  checks. No migration, write grants or private worker behavior changes.
- `tests/performance.test.mjs`, `performance.integration.mjs`,
  `tests/helpers/performance-fixtures.mjs`, `package.json`: `npm run test:performance`,
  hand calculations, genuine MySQL reconciliation, corrections, policy gates,
  bounds, privacy and read-only/outbound interception.
- `docs/performance-api.md`, implementation decisions and tracker: cohort,
  metric/claim, evidence, correction, resource and future invalidation contracts.

### Reconciliation and math

The 30-fixture synthetic cohort contains one applicable void, one old postponed
cycle plus its new applicable cycle, open/no-lock forecasts, unsupported provider
families, mixed-family sources and a newer ineligible stored revision. The cutoff
locks the earlier eligible publication; reporting uses that exact lock even when
the newer current pointer would select a different outcome.

- Match result and double chance each reconcile to **5 available, 24 unavailable,
  1 void; 4 settled and 1 pending**, with 3 AI and 2 provider available forecasts.
  Source filters account for nonmatching forecasts separately as filteredOut.
- Totals and BTTS each reconcile to **4 available, 25 unavailable, 1 void**, with
  all four available picks settled. The unsupported fallback families are not
  borrowed from older AI revisions.
- Combined match result starts at **2 correct / 4 settled = 0.5**, full-distribution
  Brier **0.78**, and log loss
  `(-ln(.4)-ln(.3)-ln(.5)-ln(.1))/4`. Double-chance Brier is **0.26**; four selected
  picks produce twelve calibration events across the three overlapping selections,
  without multiplying the hit-rate denominator.
- Correcting the first regulation result invalidates its old audit immediately:
  **3 settled / 2 pending** until private resettlement. Afterwards match result is
  **1 correct / 4 settled = 0.25**, Brier **0.83**, with the same locked evidence
  links and the actual audited correction/read time. Both snapshot transitions
  change the fingerprint.
- Moving the current postponed fixture outside the date range reduces headline
  fixture count to 29 while the old postponed cycle remains in its original date
  period; the four scored picks and their metrics remain unchanged. Failed jobs
  and retained refreshes are separate operational counts.
- Zero denominators, insufficient samples, failed quality gates, missing matched
  baseline evidence, mixed horizons, foreign provider versions, absent/forged/
  asynchronous/revoked policies and unapproved production thresholds withhold
  numeric values. Explicit calibration counts and Wilson uncertainty appear only
  with the verified synthetic fixed-band policy. No public claim is authorized.

### Verification

| Check | Actual outcome |
| --- | --- |
| Performance acceptance | **36 passed, 0 failed/skipped**, including eight genuine MySQL subcases. `npm run test:performance`; log `.tmp/030-performance-final.log`. Covers hand counts/math, two cycles, ignored unselected revisions, mixed sources, pending/void/unsupported families, filters, matched-comparison unavailability, actual correction clocks and immutable evidence. |
| Public quality/limits | Unit cases prove zero/null denominators, minimum samples, coverage/loss gates, missing matched baselines, policy scope and mixed horizons. The coverage denominator retains all nonvoid known fixtures, including filtered origins/versions; filtering cannot inflate coverage. 1,001 fixtures stop before snapshot loading; an intercepted oversized JSON preflight stops before payload reading. |
| Read-only/privacy | A genuine transaction proxy rejects writes and non-SELECT SQL, observes bounded batch operations, and sees zero outbound fetches. Before/after jobs, revisions, evidence, results, audits, settlements, cycle pointers, fixture versions and search counters remain identical. No cookie or private proof/raw/model configuration fields escape. |
| Shared reader regressions | **98 passed, 0 failed/skipped** on owned MySQL. Command `node --conditions=react-server --test --test-concurrency=2 tests/prediction-history.integration.mjs tests/result-sync.integration.mjs tests/market-settlement.integration.mjs tests/match-feed.integration.mjs tests/match-detail.integration.mjs tests/cutoff-locking.integration.mjs`; log `.tmp/030-regressions.log`. Includes native checks/grants, unchanged results, extra-time/penalty rules, late locks, audited voids, corrupt evidence, atomic rollback and readonly feed/detail/history. |
| Lint/types/build | Lint and typecheck passed; final production build also passed TypeScript and lists dynamic /api/performance. Logs `.tmp/030-lint-final.log`, `.tmp/030-types-final.log`, `.tmp/030-build.log`. |
| Production HTTP | Owned loopback Next server with database capability disabled passed malformed/duplicate/oversize filters, shared feed errors, safe uncached 503, no locale redirect or cookie and POST 405. Harness `.tmp/030-http-smoke.mjs`; final log `.tmp/030-http-final.log`. Genuine successful HTTP handler reads are covered in the MySQL suite. |
| Repository units | **905 cases: 904 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Quiet command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/030-unit-final.log`. Includes chronological evaluation regressions for the extracted shared quality diagnostics. |

### Operating gates and scope

OP-16/OP-17 remain unresolved: actual approved sample/quality/coverage thresholds,
calibration bands/confidence and independent chronological qualification are not
supplied. The production route binds no policy, serves factual counts and explicit
unavailable null metrics, and retains provisional estimates. Synthetic verified
policies establish implementation behavior only. Existing provider/model/reuse/
budget/database/hosting gates remain effective. No cache/UI/later prompt is added;
031 receives stable snapshot keys and explicit invalidation categories. Rollback
disables the performance route while retaining stored immutable data. No UI
change requires visual acceptance. No feature implementation or local acceptance
blocker remains; 030 is checked in the tracker. Later rows remain unchanged.

## 031 — Public response cache (9 October 2026)

### Implemented behavior and changed files

Completed the shared server-only cache for feed, detail/history and performance.
It reuses MySQL rather than provisioning another service. Canonical keys include
validated query/history/filter/sort/page fields, locale, resolved EAT dates and
competition/evaluation scope. Search accounting and live policy verification
remain outside cache reuse. Hits retain response/source clocks, data versions,
coverage, run progress, revision references and correction fingerprints.

- Added `src/server/cache/public-cache.ts` and `mysql-public-cache.ts`; integrated
  the three API routes and `feed-service.ts`, `detail-service.ts`, `detail-read.ts`
  and `performance-service.ts`.
- Added three disposable-cache/generation/journal models to both Prisma schema
  files and migration `20261009183000_public_response_cache`, with 30 transactional
  invalidation triggers. Existing prediction changes invalidate fixture/current
  and original cycle dates; fixture changes invalidate old/new dates. Job, run,
  import, lifecycle and catalog changes also cover progress/coverage without a
  prediction event.
- Added bounded private `scripts/public-cache-reconcile.mjs`, `cache:reconcile`
  and `test:cache` commands. Maintenance acknowledges only applied generations,
  recovers late commits without a global watermark and sweeps expired bodies.
- Added cache unit/integration suites and extended the shared pipeline grants.
  Existing integration harness migration roles now have schema-scoped `TRIGGER`;
  the owned throwaway MySQL enables binary-log trigger creation explicitly.
- Added `docs/public-response-cache.md`; updated database instructions, the OP-24
  decision and tracker. No UI or later browser refresh feature is implemented.

Mutable envelopes have a five-second maximum lifetime, capped by EAT midnight
and applicable source permissions. Immutable revision markets/analysis can last
six hours, capped by source permission expiry. Generation stamps captured before
loading are checked at fill and every hit, including invalidation racing a fill's
commit. Failed lookups/fills use bounded stored reads; a database outage remains
unavailable. Cache rows cannot turn errors into authoritative empty responses.

### Verification

| Check | Actual outcome |
| --- | --- |
| Cache acceptance | **24 passed, 0 failed/skipped**: eight units and 16 genuine MySQL cases, including the parent scenario. Covers replica hits, normalized isolation, publication/locking, score/status/reschedule old/new dates, settlement/corrections, job/import progress, source expiry, midnight, rollback and absence of forecast/provider side effects. |
| Races, recovery and outages | Passed both stale-fill windows, concurrent consumers, missed notification/downtime recovery, duplicate passes, a late lower-ID commit, incomplete-generation acknowledgment rollback, SQL cache-access revocation, simulated cache/database outage, failed fills and replica clock skew. The old-snapshot insert may safely lose a unique-key race instead of overwriting the newer row. |
| Freshness | Genuine MySQL hits at virtual age 4,999 ms and refreshes at 5,000 ms; immutable payload creation times survive result corrections while mutable badges update. Simulated 15/60-second observations plus the independent five-second expiry fit 20/65-second budgets before worker/network processing. Hits preserve original sync times. This is not a hosted SLA. |
| Database regressions | **345 final passing cases across 20 root scenarios**, combining 320 unaffected cases in the full sweep with the successful 25-case performance/cache rerun. Full command: `node --conditions=react-server --test --test-concurrency=2 tests/*.integration.mjs`; log `.tmp/031-database-regressions.log`. The sweep exposed a policy-revocation response regression and an overly strict cache-race assertion; both were corrected. The final targeted command uses concurrency 1 with `tests/performance.integration.mjs tests/public-cache.integration.mjs`; **25 passed, 0 failed/skipped**, log `.tmp/031-cache-performance-final.log`. |
| Repository units | **913 cases: 912 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Quiet command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/031-units-final.log`. |
| Migration and permissions | Fresh deploy, repeated deploy and `db:verify` pass on genuine MySQL 8.4.11. All 30 triggers are present; the application cannot forge generations/journals or gain trigger DDL rights. Source transaction rollback also rolls back invalidation. |
| Static/build checks | `npm run db:generate`, `npm run db:validate`, `npm run lint`, `npm run typecheck`, `npm run build` and `git diff --check` pass. Final build keeps all three API routes dynamic. |
| Production HTTP | Owned loopback `next start` passes 12 invalid/unavailable GET cases plus GET-only method enforcement, with no redirect, cookie or HTTP cache. The database-disabled profile remains truthful 503. Log `.tmp/031-http-final.log`; owned server stopped. |

### Operating gates and handoff

OP-24's local strategy is settled. OP-01/12/19/32 still require an actual approved
hosted target, trigger/definer/binlog capabilities, per-table grants, maintenance
scheduling, infrastructure budget and workload/latency evidence. No remote server
setting, subscription, provider operation or deployment was changed. Generation
and journal retention remains subject to the later approved recovery policy;
schedule bounded expired-body cleanup before hosted operation.

Rollback can remove the route wrappers while retaining cache tables, generations,
journals and trigger-definer rights. Repair partially applied DDL forward; do not
erase source or forecast history. No local feature or acceptance blocker remains.
031 is checked in the tracker; later rows are unchanged.

## 032 — Match feed page (10 October 2026)

### Implemented behavior and changed files

Completed the shared server-rendered Today/Results feed with real stored-data
reads, initial match HTML/CSS, EAT reporting dates, ordinary Today/Tomorrow/Next
7 days and adjacent historical-date links, truthful coverage/error states and a
shared stored run-status area. Current and locked forecasts use the existing
projection; closed cycles without a selection stay unavailable. Actual publication,
last-sync, coverage-observation and projection-observation clocks remain distinct.

- Added `server/matches/public-feed.ts` and `feed-page.ts`; the page and matches
  API share database/competition/cache composition, without an internal HTTP call.
- Replaced the interim `feed-shell.tsx`; added `match-feed-page.tsx`,
  `feed-date-links.tsx` and `feed-run-status.tsx`. Reused shared shell, controls,
  feedback, card/list components and the per-provider client bootstrap. Added
  optional composition slots for 033/034, with no unfinished public control.
- The two locale feed routes share API query validation and stored-year limits.
  `public-shell.tsx` now provides one request instant to date and service reads.
- Added `domain/feed-date-navigation.ts`; extracted `domain/match-slug.ts` from
  the detail service while preserving its public export and canonical behavior.
- Extended the existing match card/messages with cycle state, missing lock,
  update/availability and original last-sync presentation. First two cards use
  eager remote logos; the remainder retain lazy native images and reserved sizes.
- Added `tests/feed-page.test.mjs`, `feed-page.integration.mjs` and
  `scripts/verify-match-feed-rendering.mjs`, with package commands. Updated the
  navigation HTML check to allow actual stored forecast/empty content, the
  navigation/card documentation and added `docs/match-feed-page.md`.
- Updated this record, implementation decisions and tracker. No migration or
  database schema change is required.

### Verification

| Check | Actual outcome |
| --- | --- |
| Page contracts | Five new unit tests pass: filters retained and page reset for every date link, EAT midnight and seven-day range, calendar endpoints, exact query/clock handoff, original cached response identity and sanitized failures. |
| Genuine stored page handoff | **6 passed, 0 failed/skipped** on owned MySQL 8.4.11. Covers 30-card stable order/ties from 32 matches, run 2/34 counts, future boundaries, coverage states, missing lock, historical verified score/settlement, original clocks, repeated shared-cache reads and zero provider/prediction side effects. Log `.tmp/032-page-integration.log`. |
| Existing feed regressions | **16 passed, 0 failed/skipped** on owned MySQL. Includes full-cohort search/aliases, ordering, coverage authority, progress, locks, voids, corrected settlement, no side effects and atomic shared search limits. Log `.tmp/032-feed-regression.log`. |
| Production component HTML | `npm run test:feed-page:rendering -- --serve` builds an isolated Next production app from actual MySQL-captured projections. **23 scenarios pass** initial names/kickoff/prediction, original publication/sync clocks, CSS-before-content, exact card order, honest states, all run phases and seven-day messaging. Four run-phase presentation variants are explicitly synthetic. Artifacts `.tmp/match-feed-nS3vVG/`; the harness's repeated SQL preparation also passes all six cases. |
| Browser acceptance | **72 assertions pass** through the Playwright skill/CLI using installed Chrome, French locale and Los Angeles timezone. Tests scripts held before hydration, unchanged labels after hydration, 404/429 logos, 320/360/390/430/1280 widths, one/two columns, 200% text, skip link/focus, all 30 keyboard analysis destinations, one Enter to an isolated canonical analysis target, date links/boundaries, every data/error state, retry and JavaScript-disabled date browsing. No hydration/browser errors or visitor cookies; no browser API polling. Log `.tmp/032-browser-final.log`; screenshots and acceptance source under ignored `output/playwright/feed-page-*`. |
| Repository units | **918 cases: 917 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/032-units.log`. |
| Static/build | Typecheck, lint, tracked/new-file whitespace checks and production build pass. Build retains dynamic dated/home feeds and all three APIs. Client chunk audit finds no database credentials/configuration, provider endpoint or worker/service implementation. Logs `.tmp/032-types-final.log`, `.tmp/032-lint-final.log`, `.tmp/032-build.log`. |
| Actual production routes | Owned loopback production server with database capability disabled passes Today/Tomorrow/7-day/history/beyond-window failure rendering, actual EAT date after midnight, anonymous no-store/no-cookie behavior and no sample fallback. Existing navigation HTML checks pass all ten valid surfaces, redirects and invalid-route cases. API composition retains 400/503 and years below 1000 return 404. Log `.tmp/032-production.log`; server stopped. |

### Operating gates and handoff

No local implementation or required acceptance blocker remains. Prompt 032 is
checked; 033 and subsequent rows remain unchanged. Search controls, Load more,
Back restoration, real match analysis and live refresh retain their separate
033–037 ownership. Browser analysis activation uses the isolated test destination;
production match-detail pages are still supplied by 035.

Existing approved database/provider/competition/model/reuse/budget/hosting inputs
and launch qualification remain required for live public content. Nothing here
claims real coverage, forecast quality or a deployed service. Genuine MySQL tests
use owned throwaway servers and synthetic stored forecasts; installed services
and remote databases are unchanged. The page exposes a truthful temporary-failure
surface for an unavailable production configuration. No paid call or schedule was
activated. Rollback can restore the previous feed composition without altering
source history, locks, results or response-cache schema.

## 033 — Search and filter controls (10 October 2026)

**Complete.** Added shareable, accessible search/league/status/market/order
controls over the complete stored date cohort. Prompt 033 is checked in the
tracker; 034 and later prompts remain unchanged.

### Changes

- Added reusable `SearchInput`/`FilterControl` to shared controls and
  `components/match/feed-controls.tsx` for the native GET form, disclosure,
  applied summary, Apply/Reset, focus return and selected-family ordering.
- Added `domain/feed-controls.ts`. Draft text retains spaces until Apply;
  `state/feed.ts` now preserves raw text without weakening applied-query checks.
  Empty native GET league values normalize to null in the shared parser.
- Added `app/_components/feed-surface.tsx`; simplified server page composition
  and reused date/run presentation in the client surface. Server query changes
  synchronize the per-provider draft while retaining field/panel focus. Explicit
  transitions discard superseded navigation and preserve prior cards on failure,
  with original reporting dates, filters and market clearly labeled.
- Extended the public feed DTO/service with bounded full-cohort league options
  and cache projection version 2. Options use the same RepeatableRead snapshot
  as records and cannot disappear merely because search returns no cards.
- Added draft/Reset/native URL tests, strict league projection checks, and genuine
  SQL capture cases for aliases beyond the first page, countries, league aliases,
  empty results and all market orders. Updated rendering/navigation verification
  and the client state, feed page/API and new search/filter documentation.

### Verification

| Check | Actual outcome |
| --- | --- |
| Repository units | **921 cases: 920 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Log `.tmp/033-units.log`. |
| Final contract checks | **34 passed** after adding strict league option validation. Covers raw draft spaces, normalization/limits, native GET equivalence, Reset dates/page size and API projection bounds/privacy. Log `.tmp/033-contracts-final.log`. |
| Genuine stored page handoff | **7 passed, 0 failed/skipped** using owned MySQL 8.4.11, including full-cohort aliases/countries/league searches and options after an empty filter result. Logs in `.tmp/match-feed-71Ogu7/database.log`. |
| Feed/cache regressions | **32 passed, 0 failed/skipped** on owned MySQL. Covers distinct unrounded selected-market ordering/ties/missing values, history/settlement, coverage, search limits, cache invalidation/recovery and zero provider/prediction side effects. Log `.tmp/033-db-regression.log`. |
| Production rendering | **36 isolated SQL-captured scenarios pass**, including exact card order, original timestamps, initial CSS and all coverage/failure states. Four run-phase presentation variants remain explicitly synthetic. Final client code rebuilt against the same captures. Logs `.tmp/033-rendering.log`, `.tmp/033-fixture-final-build.log`; artifacts `.tmp/match-feed-71Ogu7/`. |
| Browser | **66 assertions pass** in installed Chrome through the Playwright skill/CLI, French locale/Los Angeles timezone. Covers alias beyond the first page, country/league search, reload/Back/Forward/shared page, league/status controls, selected-market order, failed market change retaining original cards, rapid queries and A → B → A Reset, pagination reset, reporting date/range Reset, Escape/Close and submission focus, 320–1280 widths, 200% text, labels/focus/touch sizes, one status region, native forms/Reset without JavaScript, invalid URLs, no cookies/polling and no hydration errors. Expected logo 404s exercise fallback. Logs `.tmp/033-browser-final.log`, `.tmp/033-extra.log`; source/screenshots `output/playwright/033-*`. |
| Static/build | Final lint, typecheck, production build and whitespace checks pass. Logs `.tmp/033-lint-final.log`, `.tmp/033-types-final.log`, `.tmp/033-build.log`. |
| Actual production routes | Existing navigation HTML checks pass ten anonymous surfaces, redirects and invalid queries against the owned loopback production server with database capability disabled. Native GET empty-league/probability input is accepted and unavailable storage remains a truthful failure. Log `.tmp/033-production.log`. |

The browser acceptance found and fixed Reset refreshing an unfinished search;
the final A → B → A test passes. An initial generated-file encoding error was also
corrected before final builds. No implementation or required acceptance blocker
remains. Live operating/launch gates remain unchanged; these tests establish
stored-query/UI behavior with synthetic inputs, not real forecast quality or
hosted availability. No paid call, schedule or remote database change was made.
No migration is required. Owned acceptance servers and browser sessions are
stopped after verification; the installed database service remains untouched.

## 034 — Pagination and navigation restoration (10 October 2026)

**Complete.** The stored feed retains crawlable, date-pinned pagination links
and progressively enhances Load more. Back/reload restore validated filters,
loaded extent, scroll and analysis-link focus after fetching the necessary
stored pages. Prompt 034 is checked; 035 and subsequent rows remain unchanged.

### Changes

- Added `domain/feed-pagination.ts` for pinned links, response checks, contiguous
  append and atomic prefix replacement with whole-record version protection.
  Added `domain/feed-navigation.ts` for bounded, expiring metadata checkpoints;
  `state/feed.ts` reuses its existing restoration limits.
- Added `components/match/feed-pagination.tsx`, `feed-page-client.ts`,
  `feed-restoration.ts` and `use-feed-pagination.ts`. They implement shared square
  controls, anonymous stored API reads, duplicate-load locking, cancellation,
  retry/refresh, history-entry scoping and focus/scroll restoration. Storage is
  optional and contains no fixture records. Appended extent is capped at ten
  pages; ordinary Next links continue beyond it.
- Updated `app/_components/feed-surface.tsx`, the shared match card and messages
  for retained loaded pages, focused new articles, errors and one polite status
  region. Query changes reset pages and cancel obsolete loads. Link/form departure
  captures the current position before route changes.
- Added opaque `paginationVersion` to the public DTO/service using committed
  date/catalog generations from the same RepeatableRead snapshot. Reused the
  MySQL cache generation reader and bumped feed cache projection to 3. No schema
  or migration change is required.
- Added meaningful pagination/checkpoint units and real MySQL mutation cases.
  Extended the isolated production rendering harness with a stored-data API and
  canonical analysis destinations for fixtures beyond the first page. Updated
  the state/feed/filter documentation, implementation decisions and tracker;
  added `docs/pagination-navigation.md`.

### Verification

| Check | Actual outcome |
| --- | --- |
| Repository units | **925 cases: 924 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/034-units.log`. |
| Final query/state contracts | **23 passed**, including four new cases covering fully preserved URLs, overlap/cohort rejection, atomic whole-record version handling, entry/query/page isolation, expiry, malformed data and storage bounds. Log `.tmp/034-contracts-final.log`. |
| Genuine MySQL page handoff | **8 passed, 0 failed/skipped**, owned MySQL 8.4.11. Includes 95 fixtures over four pages, repeated stable markers, last-page fixture moving to the first through the authorized lifecycle, publication invalidation, unchanged marker after acknowledgment and zero provider/prediction side effects. Log `.tmp/match-feed-KkJh2p/database.log`. |
| Feed/cache regressions | **32 passed, 0 failed/skipped** on owned MySQL. Covers selected-market ordering/ties, coverage, history/settlement, search budgets, transactional invalidation, cache recovery and side-effect-free reads. Log `.tmp/034-db-regression.log`. |
| Production rendering | **47 isolated SQL-captured scenarios pass**, preserving exact card order, timestamps, initial CSS and honest coverage/error states. Four run-phase variants remain explicitly synthetic. The final hook was rebuilt against the same captured projections. Logs `.tmp/034-rendering.log`, `.tmp/034-fixture-final-build.log`; artifacts `.tmp/match-feed-KkJh2p/`. |
| Browser acceptance | **76 assertions pass** through the Playwright skill/CLI and installed Chrome, French locale/Los Angeles timezone. Covers four-page append without gaps/duplicates, no scroll loading, keyboard Load more/Tab/Enter/Back focus, one live region, 503/429/retry, duplicate clicks, query cancellation, concurrent schedule changes and atomic refresh failure, three-page Back/reload on desktop/mobile, failed restoration with full-extent retry, direct page three, history-entry isolation, blocked storage, form-departure position, no-JavaScript discovery of all 95 fixtures, 320–1280 widths, 200% text, square controls, reserved lazy native logos, no visitor cookies and no browser/hydration errors. Logs `.tmp/034-browser-final.log`, `.tmp/034-extra-final.log`, `.tmp/034-keyboard-final.log`; sources/screenshots `output/playwright/034-*`. Mobile/desktop card and pagination screenshots visually reviewed. Expected injected HTTP failures exercise recovery. |
| Static/build | Final typecheck, lint, production build and tracked/new-file whitespace checks pass. Logs `.tmp/034-types-final.log`, `.tmp/034-lint-final.log`, `.tmp/034-build-final.log`. |
| Actual production routes | Ten anonymous surfaces, redirects and invalid queries pass existing navigation HTML checks against the owned loopback production server with database capability disabled. Actual reporting dates remain EAT and unavailable storage is a truthful failure. Log `.tmp/034-production.log`. |

No implementation or required acceptance blocker remains. Browser navigation uses
an isolated canonical analysis route; prompt 035 must repeat Back acceptance
through its real detail page. An initial test setup attempted a schedule change
through catalog import; it was corrected to use the existing coordinated lifecycle.
The isolated generated analysis route also needed an explicit shared DTO type.
Both final preparation/build checks pass.

Existing live operating, source-rights, forecast-quality and hosting gates remain
unchanged. Synthetic stored forecasts and local acceptance do not claim real
coverage or deployment. No paid operation, provider call, schedule, remote database
change or migration was activated. Owned acceptance servers/browser sessions are
stopped after verification; the installed database service remains untouched.

## 035 — Match detail page (10 October 2026)

**Complete.** Added the reusable server-rendered detail route and completed
034's deferred Back check through the real match destination. Prompt 035 is
checked; 036 and subsequent rows remain unchanged.

### Changes

- Added `[locale]/matches/[fixtureId]/[slug]/page.tsx` and reusable server route,
  page and content composition in `app/_components/match-detail-{route,page,content}.tsx`.
  UUID is authoritative; changed slugs/uppercase IDs redirect canonically, unknown
  fixtures return 404, and unavailable storage retains an explicit retry state.
  Request-scoped caching shares one stored response between metadata and content.
- Added `server/matches/public-detail.ts`, `detail-page.ts` and
  `detail-presentation.ts`. API/page now share stored-service/cache composition,
  page preflight and sanitized failures. The HTML boundary reuses offline safe
  source URL checks and withholds unsafe/unattributed explanations.
- Added `components/match/detail-styles.tsx`; reused the shell, team rows,
  probability labels, outcome badges, native disclosures and square tokens.
  All four available/unavailable families come from one selected snapshot.
  Original sources/fallback reasons, alternatives, explanations, uncertainty,
  publication/evidence/source clocks and honest freshness states remain visible.
- Kept live/verified regulation scores separate from per-family outcomes and
  settlement/correction clocks. Void reasons survive absent predictions; closed
  cycles never substitute unlocked previews. Exact-score prediction remains
  disabled. Added only an optional server history slot for 036.
- Added unique metadata and canonical/social previews using the existing brand
  Open Graph image. Existing prelaunch `noindex, follow` remains unchanged.
- Added `tests/match-detail-page.test.mjs`, shared owned-directory capture helper
  and genuine SQL detail/navigation capture cases. Extended the existing production
  rendering harness with `--detail` and validated reuse for UI-only iterations.
  Updated API/state/feed/pagination documentation, implementation decisions and
  tracker; added `docs/match-detail-page.md`. No schema or migration is required.

### Verification

| Check | Actual outcome |
| --- | --- |
| Repository units | **930 cases: 929 passed, 0 failed, 1 existing Windows POSIX-mode skip**. Command `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/035-units.log`. |
| Final detail contracts | **29 passed**, including five new tests for identity/query preflight before reads, original projection/clock handoff, distinct sanitized failures, whole-revision market isolation, outcome identity independent of score, unsafe/missing attribution and fixture-derived metadata. Log `.tmp/035-contracts-final.log`. |
| Genuine MySQL qualification | **18 passed, 0 failed/skipped** in fresh feed/detail capture, owned MySQL 8.4.11. Includes four-page feed navigation, open/locked/void/closed-without-lock, partial and mixed-family snapshots, expiry, verified/corrected results and read-only anonymous requests with zero outbound work. Original log `.tmp/match-feed-gIlpKV/database.log`. After adding explicit permitted linked-evidence publication, the detail suite repeats with **10 passed, 0 failed/skipped**, preserving cited URLs and independent source clocks; log `.tmp/035-detail-final.log`. |
| Production HTML | **47 feed and 22 detail scenarios pass** initial CSS/content, exact stored identities/clocks, all lifecycle states, unsafe URL suppression, permanent slug redirect, canonical/social metadata and genuine unknown-fixture 404. Seventeen detail projections are SQL-captured; five long-name/unsafe-link/delayed-coverage/failure variants are explicitly synthetic. The existing four feed run-phase variants remain synthetic. Final code rebuilt against the qualified captures without repeating SQL; log `.tmp/035-rendering-accepted.log`, artifacts `.tmp/match-feed-gIlpKV/`. |
| Browser | **322 assertions pass**, installed Chrome through the Playwright skill/CLI, French locale/Los Angeles timezone. Covers selected snapshot/source/alternatives across all states, independent correct/incorrect badges, missing lock/void forecast, correction clocks, fallback unknown times, limited-news/age/partial/delayed disclosures, escaped summaries and rejected unsafe links, 404/redirect/metadata, keyboard/source focus, native no-JavaScript markets/alternatives/permitted citations, 320–1280 widths, 200% text, long names, throttled logos, reserved native images, no client detail polling/provider API work/cookies and no browser/hydration errors. Real-detail Back restores filters, 90 ordered cards, scroll and analysis focus on desktop/mobile after three stored-page reads. Log `.tmp/035-browser-accepted.log`; source/screenshots `output/playwright/035-*`. Screenshots visually reviewed. |
| Static/build | Final build, typecheck and lint pass; dynamic detail route is present. Client chunks exclude stored reader, evidence store, database configuration, provider API and synthetic fixture markers. Tracked/new-file whitespace checks pass. Logs `.tmp/035-build-accepted.log`, `.tmp/035-types-accepted.log`, `.tmp/035-lint-accepted.log`. |
| Actual production routes | Existing navigation HTML checks pass ten anonymous surfaces, redirects and invalid routes. Additional real-route checks confirm malformed IDs/reserved revision queries return 404, disabled storage produces truthful retryable detail HTML, and detail API preserves anonymous 400/503 behavior with safe bodies and no cookies. Log `.tmp/035-production.log`; owned loopback server runs with database capability disabled. |

No implementation or required acceptance blocker remains. The SQL test gained a
permitted linked-source scenario because the earlier structured evidence correctly
had no attributable URL; the page does not invent one. The initial HTML reason
assertion was corrected to compare escaped text, and server presentation was
placed under the app boundary to preserve the repository's client import rules.
Final checks pass. Read-only history browsing and live refresh remain 036/037.

Existing real provider/model/competition/rights/budget/hosting and launch gates
remain unchanged. Synthetic permissions, predictions and attribution URLs prove
stored contracts and UI behavior, not forecast quality, real source rights or
deployment. No paid football/research/AI operation, scheduler, remote database
change or migration was activated. Owned acceptance servers/browser sessions are
stopped after verification; the installed database service remains untouched.

## 036 — Read-only revision history (10 October 2026)

**Complete.** Added expandable publication/cycle history within the canonical
match page. Prompt 036 is checked; 037 and later prompts remain unchanged.

### Changes

- Added `app/_components/revision-history.tsx` and
  `server/matches/history-page.ts`. Publications use persisted fixture revision
  order, EAT run dates, cycle/revision counters, source kinds, actual publication
  times and reference-derived current/locked/superseded/void labels. Cycles keep
  their separate ordinals, safe reasons and exposed schedule/lifecycle clocks.
- Extended `domain/match-detail.ts` and `server/matches/detail-service.ts` with
  bounded public publication summaries. Sealed revision/cycle readers and a
  batch daily-run lookup supply provenance; no migration is required.
- Extended `match-detail-{route,page,content}.tsx` and
  `server/matches/detail-page.ts` to validate history queries and keep an
  independent applicable forecast as primary content. One selected complete
  snapshot appears below it, with all four available/unavailable families,
  alternatives, original analysis, permitted sources and separate evidence clocks.
  Superseded selections do not acquire settlement badges or performance entries.
- Added reusable `components/ui/disclosure.tsx`, shared by history and existing
  alternatives/sources. Native keyboard and accessible expanded state work before
  hydration. Plain nested disclosures preserve readable 320 px market widths;
  outer surfaces retain square borders and visible focus. DOM IDs are scoped per
  snapshot. Updated shared detail styles and English messages.
- Chose ordinary server-rendered selection/pagination/retry links. Both lists
  retain the 029 ten/default, twenty/maximum bounds, independent keyset cursors
  and pinned high-water marks. Failed historical reads preserve primary content
  and available initial history with inline retry. Cross-fixture/missing IDs are
  safe 404s. Canonical redirects preserve validated queries; canonical metadata
  excludes them, with explicit existing `noindex, follow` on history views.
- Added `tests/revision-history-page.test.mjs`, expanded detail SQL/page checks
  and the production rendering harness's `--history` mode. Added package commands
  `test:history-page` and `test:history-page:rendering`. Updated API/page contracts,
  implementation decisions and `docs/revision-history-page.md`.

### Verification

| Check | Actual outcome |
| --- | --- |
| Repository units | **933 cases: 932 passed, 0 failed, 1 existing Windows POSIX-mode skip**. `node --conditions=react-server --test --test-concurrency=1 tests/*.test.mjs`; log `.tmp/036-units.log`. |
| History/detail contracts | **32 passed**, covering bounded/duplicate/invalid queries, fixture identity, canonical links, both anchors and independent cursors, current/locked/void labels, snapshot isolation, attribution and sanitized failures. Log `.tmp/036-contracts-complete.log`. |
| Genuine MySQL page preparation | **18 passed, 0 failed/skipped**, owned MySQL 8.4.11. Covers stored feed membership/navigation plus older/current/locked/partial/void/corrected snapshots, accurate run/source clocks, anchored pagination during publication, source permissions and zero prediction/settlement/provider side effects. Log `.tmp/match-feed-w3KhSp/database.log`. |
| Final SQL detail qualification | **10 passed, 0 failed/skipped**, explicitly capturing historical locked selection and its independent primary projection, permitted older explanations/links, partial prior revisions and old cycles. Proxy rejects writes and outbound calls; full reference/job/result/settlement/version invariants remain unchanged. Log `.tmp/036-detail-final.log`. |
| Cache/performance regressions | **25 passed, 0 failed/skipped** on owned MySQL. Includes historical/void/superseded cohort counts, original locks, result corrections, policy revocation, cache invalidation, source expiry and recovery. Log `.tmp/036-db-regression.log`. |
| Production HTML | **47 feed and 22 regular detail scenarios pass**, plus dedicated history checks for separate primary/historical/partial content, safe 404s, canonical noindex, unique IDs and failed-read retry. Final build reuses the qualified SQL captures without repeating their checks. Log `.tmp/036-rendering-complete.log`; artifacts `.tmp/match-feed-w3KhSp/`. |
| Browser | **119 assertions pass**, installed Chrome through the Playwright skill/CLI. Covers keyboard Enter/Space/Tab and native accessibility-tree expanded state; complete older/current/locked/partial/void snapshots; permitted original links/timestamps; both-list anchors, older pages and Back; inline busy/retry preserving primary content; cross-fixture/missing/invalid 404s; 320–1280 widths, 200% text, square controls, no-JavaScript disclosure/analysis and EAT under French locale/Los Angeles timezone; no client provider/history polling, visitor cookies or hydration/page errors. Expected blocked-logo/404 network errors are injected acceptance cases. Log `.tmp/036-browser-final.log`, source/screenshots `output/playwright/036-*`. Desktop/mobile/market screenshots visually reviewed. |
| Static and production routes | Final production build, typecheck, lint and whitespace checks pass. Logs `.tmp/036-build-final.log`, `.tmp/036-types-final.log`, `.tmp/036-lint-complete.log`. Actual build rejects malformed history before storage, preserves truthful disabled-storage retry HTML and anonymous API 400/503 responses without cookies; log `.tmp/036-production.log`. |

No implementation or required acceptance blocker remains. An initial concurrent
fixture run timed out during an owned migration; the independent rerun passed all
18 cases. The isolated reader's optional query argument was corrected before its
production build passed. Browser assertions were corrected to inspect Chrome's
native disclosure expanded property and identify publication labels when void
and publication times coincide. Visual review then removed unnecessary nested
padding; final layout, HTML and browser checks pass.

Existing live provider/model/rights/budget/hosting and release gates remain
unchanged. Synthetic policies/forecasts/source permissions are isolated test
evidence, not qualification of live predictions or redistribution rights. No
paid provider/AI/research call, scheduled prediction, migration to an existing
database, deployment or later feature was activated. Owned acceptance servers and
browser were stopped; the user's development server and installed MySQL service
remain untouched.


## 037 - Live client refresh

Complete. The implementation and required acceptance checks pass; tracker row
037 is ticked. Work on 038 has not started.

### Changed behavior and files

- Added `state/refresh-api.ts` and extended the per-provider store with RTK Query
  reducer/middleware. Pagination and current-detail reads share typed anonymous
  stored-data endpoints, validation, deadlines, normalized request deduplication
  and cancellation that preserves other subscribers.
- Added `domain/live-refresh.ts`, `fixture-reconciliation.ts`, shared browser
  lifecycle hook, refresh-status feedback and `live-match-detail.tsx`.
  Integrated the feed's loaded-prefix hook and detail SSR boundary. Current data
  remains visible on transient, malformed, stale or unstable-cohort failures.
- Added run sequences to stored feed forecasts and shared daily-run counts to
  detail responses; tightened current card/detail snapshot coherence. Extended
  equal-version observation/job handling without changing forecast content or
  timestamps. Updated feed/detail cache projection versions.
- Extracted reusable offline evidence URL/presentation helpers so current detail
  can hydrate without importing server networking. Historical content remains
  server rendered, isolated and labeled with its original read clock.
- Added deterministic live-refresh tests and real SQL assertions for shared
  progress/repeated visitor reads. Extended isolated rendering with stored detail
  GETs and a generated test-only EAT clock; added package verification commands.
- Added `docs/live-client-refresh.md`; updated state, API, pagination and history
  documentation and implementation decisions. No schema migration is required.

### Verification

| Check | Result |
| --- | --- |
| Focused live/feed/detail contracts | 64 passed, zero failures; `.tmp/037-contracts-final.log`. Covers reversed publication/lock/result correction, earlier cycles/runs, partial replacement, equal-version observation updates, deduplication, cancellation, serial cadence, visibility/reconnect and exact EAT midnight. |
| Genuine MySQL read/cache acceptance | 26 passed, zero failures/skips on owned MySQL 8.4.11; `.tmp/037-db-real.log`. |
| Final SQL detail/provenance acceptance | 10 passed, zero failures/skips; `.tmp/037-detail-qualified.log`. Confirms shared run counts and twelve additional independent visitor ticks with writes/network blocked, unchanged jobs/revisions/locks/results/settlement/version state and no cookies. Captured projections remain under `.tmp/live-refresh-037/`. |
| Production rendering | 47 feed and 22 detail scenarios plus dedicated history isolation/404/canonical/retry checks pass; `.tmp/037-rendering-final.log`. |
| Production build/typecheck/lint | Pass; `.tmp/037-build-final.log`, `.tmp/037-types-final.log`, `.tmp/037-lint-final.log`. |
| Full repository units | **942 cases: 941 passed, zero failures, one existing Windows POSIX-mode skip**, on pinned Node 24.18.1; `.tmp/037-units-node24.log`. Final expanded live-client assertions also pass (25 cases); `.tmp/037-live-accepted.log`. |
| Browser acceptance | **54 assertions pass** in installed Chrome using Playwright CLI: 25 feed, 14 rollover and 15 detail checks. Covers the 20-second cadence, hidden pause/reconnect, shared counts, retained/partial/error snapshots, quiet repeated failures, stale rejection, three-page refresh, focus/scroll, obsolete requests, seven-day rollover, relative page reset and explicit historical position, current/history isolation, retry, 320–1280 widths, anonymous GET-only reads and zero page/hydration errors. Logs `.tmp/037-browser-feed.log`, `.tmp/037-browser-rollover-accepted.log`, `.tmp/037-browser-detail.log`; source/screenshots `output/playwright/037-*`. Mobile/current/history screenshots visually reviewed. |

The first SQL command lacked MYSQL_TEST_SERVER_BINARY and skipped; it was rerun
with the existing genuine test binary and passed. A capture-only rerun initially
used the temporary root rather than a nested owned output directory; corrected
capture and final SQL qualification pass. Browser checks found initial pageshow
could duplicate the first read; it now resumes only persisted restoration.
An existing cost-gateway timing assertion failed during a competing build; its
targeted rerun and the final serial full-suite rerun both passed. Final lint and
changed-file whitespace checks pass; `.tmp/037-lint-accepted.log`.
Browser clock setup was adjusted to use a fixed date and real elapsed timers for
rollover/detail acceptance after Playwright's paused-clock setup stalled. Detail
response variants retain their captured daily-run identity; the earlier run was
correctly rejected before this test input was corrected. No application defect
remains from those harness retries.

External production provider/model/rights/budget/hosting and release gates remain
unchanged. Synthetic response/clock variants are acceptance inputs only. No
production forecasts, external paid calls or deployment were activated.
Owned acceptance server/browser processes were stopped; existing services and
the user's development server were left untouched.
