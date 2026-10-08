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
