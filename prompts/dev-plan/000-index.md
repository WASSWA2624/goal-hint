# Goal Hint development prompts

Run these prompts in numeric order to build the application described in [app-write-up.md](../../app-write-up.md). That specification is the product source of truth; this folder organizes its implementation without replacing it. The existing [brand guide](../../next-js/assets/brand/README.md) governs brand asset usage.

There are **67 implementation prompts**, one feature per file. This index is the execution guide, not an application feature. Creating this plan does not execute any of its prompts or indicate that development is complete.

Application source paths such as `src/`, `docs/`, `scripts/`, `tests/`, and
`dev-tracker.md` in these prompts are relative to `next-js/`. Run npm and Python
commands from that directory. Paths starting with `prompts/` and the specification
`app-write-up.md` are relative to the repository root.

## How to run a prompt

1. Start with **001** and run one file at a time. Read this index, the current specification, applicable repository instructions and the prompt before editing code.
2. Inspect the repository and previous handoffs. Build on existing modules; do not recreate foundations or overwrite unrelated changes.
3. Implement only that file's feature, including its necessary integration and verification. Shared contracts may be introduced when needed, but do not implement later features or leave a placeholder presented as finished.
4. Run the feature's meaningful acceptance checks and the repository checks affected by the change. Fix failures caused by the feature and record actual results.
5. Update `docs/development-progress.md`. Every implementation prompt must update [dev-tracker.md](../../next-js/dev-tracker.md) by setting its row's status: ☑ Completed when its implementation and acceptance checks are complete; ◐ Partial when implementation has started but work, checks or an external blocker remain (add a one-line note under the tracker's Partial rows); ☐ Not started otherwise. Then proceed to the next number when its prerequisites are satisfied. Do not automatically run all remaining prompts.

Example instruction to an implementation agent:

```text
From the repository root, read app-write-up.md, prompts/dev-plan/000-index.md
and applicable repository instructions. Run application commands from next-js/.
Implement prompts/dev-plan/001-project-foundation.md completely, within its stated scope.
Run its acceptance checks and update docs/development-progress.md with the
changes, results and any unresolved blockers. When implementation and acceptance
checks are complete, mark this file's row ☑ Completed in dev-tracker.md;
otherwise mark it ◐ Partial with a note. Do not start the next prompt.
```

Change the filename for each subsequent run. Prompt 001 starts the progress record and compatibility notes; prompt 002 formalizes `docs/implementation-decisions.md` as the operating decision register.

## Execution rules

- **Specification precedence:** resolve an actual conflict in favor of `app-write-up.md`; record the discrepancy. Do not silently change product requirements or reopen settled choices.
- **One feature per run:** the order is cumulative. The linked dependencies identify direct integration prerequisites; read relevant earlier implementations as well. A rerun should finish or correct the existing feature without duplicating schema, components, jobs or provider calls.
- **Decisions and external evidence:** use existing authorized settings and credentials. Record unresolved competitions, budgets, providers, hosting, thresholds, rights and owner details with the first feature that needs them. Complete independent local work, but keep affected integration checks pending. Later independent implementation may proceed in numeric order; dependent live behavior and phase approval must wait for the missing input or evidence.
- **Honest completion:** synthetic fixtures and mocks belong only in development/tests. They do not prove coverage, subscriptions, rights, forecast quality, production availability or successful deployment. Never substitute fixture data into public production output.
- **Reuse and consistency:** use shared domain services and reusable UI components. Preserve server/client boundaries and incrementally extend Prisma migrations with the feature that owns the data. Use the existing navy/teal branding and square component corners.
- **Checks match risk:** use real database/concurrency tests for publication, locking, quota and identity invariants; use deterministic clocks and failure cases for jobs; visually verify UI and production rendering. Do not add trivial tests merely to mirror markup or constants. Report checks that could not run.
- **Scope and authority:** these files describe implementation. Do not purchase subscriptions, invent credentials, send contact messages or declare external gates passed. Reuse existing deployment authorization; if an external action still requires a decision, first prepare the concrete result and record the exact dependency.

Every feature handoff should identify its prompt number, implemented behavior, changed files/migrations, verification commands and outcomes, outstanding inputs and whether its acceptance checks passed. Keep the progress record factual and separate from the reusable prompts.

## Invariants throughout development

- Public pages and read endpoints work anonymously, and anonymous visitors get no cookies. The only visitor identity is paid access (057–067): phone-number accounts and member sessions, manual payment reports, access codes bound to the paying account and a private owner dashboard at `/admin` behind the existing analytics owner login. No passwords, OTP, auth SDK or visitor profiles; no automatic payment collection; no betting, stakes or bookmaker links; no separate native feature implementation or AI chat. The approved Flutter shell hosts the same web app; see [its requirements](../flutter-app-shell.md). Paid access stays `off` until the owner switches it on.
- Every prediction-bearing read goes through the gated reads (`src/server/members/gated-reads.ts`, from 061), including later Tips, My Picks and Profile reads. Gating policy lives only in `src/domain/paywall.ts`; page metadata never quotes a pick or probability.
- AI is primary. API-Football is the only football data/fallback provider; source labels remain per market. A new revision is a complete snapshot, never an unmarked mixture with older markets.
- EAT determines dates. One daily run at midnight EAT selects today plus six days; publication is strictly before kickoff minus five minutes and closes earlier on observed play. Locks, history and source timestamps remain auditable.
- Polling, page visits and filters do not enqueue prediction work. Provider calls stay on the server and pass through shared limits; public reads use stored data.
- Apply the US$45 monthly API-Football ceiling separately from research/AI and hosting budgets. All account callers share the request ceiling and essential reserve, including trial and staging tools.
- Reuse canonical team/fixture identities. Third-party images stay remote; the original Goal Hint brand kit may be bundled.
- Launch in English and light mode. Prepare translation/theme/ad extension points without activating additional languages, dark mode, ads or optional exact scores without their recorded requirements being met.

## Implementation order

The early runtime, database and domain work exists to support the specification's data/model trial. Provider contracts are validated before building the canonical production catalog. Public styling follows the trial; publication and cutoff locking are adjacent and precede activating prediction workers.

### 001–014 Data and model trial

| Prompt | Feature delivered |
| --- | --- |
| [001 Project foundation](001-project-foundation.md) | Create the minimal Next.js and TypeScript development foundation. |
| [002 Runtime policy](002-runtime-policy.md) | Validate environment settings and track unresolved operating decisions. |
| [003 MySQL and Prisma](003-mysql-prisma.md) | Establish database access and incremental migrations. |
| [004 EAT calendar](004-eat-calendar.md) | Centralize reporting dates, seven-day windows and cutoff calculations. |
| [005 Market domain](005-market-domain.md) | Define the four market families and probability rules. |
| [006 API quota limiter](006-api-quota-limiter.md) | Enforce account-wide request limits and essential reserves. |
| [007 API-Football adapter](007-api-football-adapter.md) | Normalize football-provider calls behind the shared limiter. |
| [008 Football provider trial](008-football-provider-trial.md) | Verify coverage, contracts, rights, account limits and payable price. |
| [009 Canonical football catalog](009-canonical-football-catalog.md) | Persist unique competitions, seasons, teams and fixtures. |
| [010 Research cost control](010-research-cost-control.md) | Enforce separate AI and research spending budgets. |
| [011 Fixture evidence](011-fixture-evidence.md) | Collect attributable, timestamped structured and news evidence. |
| [012 AI predictor](012-ai-predictor.md) | Implement the selected primary predictor and model provenance. |
| [013 Provider fallback](013-provider-fallback.md) | Combine valid source groups under the fallback contract. |
| [014 Forecast evaluation](014-forecast-evaluation.md) | Build chronological evaluation, calibration and quality gates. |

**Gate:** record provider, budget and model trial evidence before claiming the trial is passed. Independent implementation may continue with pending checks identified. Bounded private shadow runs may collect missing prospective quality evidence once provider rights, paid-operation budgets and pipeline integrity checks have passed; keep their results separate from public production forecasts. Unmet quality gates still block public claims and production release.

### 015–018 Product foundation

| Prompt | Feature delivered |
| --- | --- |
| [015 Brand styling](015-brand-styling.md) | Apply the existing identity through reusable server-rendered styles. |
| [016 English routes and navigation](016-locale-navigation.md) | Create the English route structure and shared navigation shell. |
| [017 Client state](017-client-state.md) | Connect URL state to per-instance Redux stores. |
| [018 Match card](018-match-card.md) | Build the reusable accessible fixture and prediction card. |

**Gate:** initial HTML and styled-components CSS render correctly before hydration; the English shell and reusable card work at the required phone widths.

### 019–027 Daily prediction and result pipeline

| Prompt | Feature delivered |
| --- | --- |
| [019 Prediction history](019-prediction-history.md) | Persist immutable revisions and cycle references. |
| [020 Durable jobs](020-durable-jobs.md) | Provide durable dispatch, leases and private worker entry points. |
| [021 Daily selection](021-daily-selection.md) | Commit one immutable seven-day fixture manifest per EAT date. |
| [022 Revision publication](022-revision-publication.md) | Publish one eligible ordered snapshot transactionally. |
| [023 Cutoff locking](023-cutoff-locking.md) | Close each cycle with its final eligible forecast or no prediction. |
| [024 Schedule lifecycle](024-schedule-lifecycle.md) | Handle kickoff corrections, postponements and void cycles. |
| [025 Prediction refresh worker](025-prediction-refresh-worker.md) | Execute the daily evidence, AI and fallback refresh job. |
| [026 Fixture and result synchronization](026-fixture-result-sync.md) | Run one leased live/date/result poller. |
| [027 Market settlement](027-market-settlement.md) | Settle locked picks against verified regulation scores. |

**Gate:** do not activate scheduled predictions until publication, locking, schedule changes and worker integration all pass their checks. Result polling remains a separate workload.

### 028–031 Public data services

| Prompt | Feature delivered |
| --- | --- |
| [028 Match feed API](028-match-feed-api.md) | Query the full selected fixture cohort with search and pagination. |
| [029 Match detail API](029-match-detail-api.md) | Expose consistent current, locked and historical match projections. |
| [030 Performance API](030-performance-api.md) | Calculate auditable market and source performance. |
| [031 Public response cache](031-public-response-cache.md) | Cache stored projections and invalidate material changes. |

**Gate:** public reads contain only visitor-facing stored data, operate anonymously and preserve revision/version consistency. From 061 they still work anonymously, resolve viewer access from cookies (member and owner sessions) and gate prediction content after the cache read; an anonymous read needs no cookie and sets none.

### 032–042 Public experience

| Prompt | Feature delivered |
| --- | --- |
| [032 Match feed page](032-match-feed-page.md) | Render today's and historical matches with honest data states. |
| [033 Search and filter controls](033-search-filter-controls.md) | Connect search, date, league, status, market and sort controls. |
| [034 Pagination and navigation restoration](034-pagination-navigation.md) | Add Load more, crawlable pagination and Back restoration. |
| [035 Match detail page](035-match-detail-page.md) | Present markets, evidence, uncertainties and verified outcomes. |
| [036 Revision history view](036-revision-history.md) | Expose earlier read-only forecasts within the match page. |
| [037 Live client refresh](037-live-client-refresh.md) | Refresh visible app data without stale-response regressions. |
| [038 Methodology and performance](038-methodology-performance.md) | Explain the system and display measured performance honestly. |
| [039 Privacy page](039-privacy-page.md) | Publish the application's actual data-handling policy. |
| [040 Terms page](040-terms-page.md) | Publish accurate terms for the free prediction service. |
| [041 Contact page](041-contact-page.md) | Provide a verified owner-supplied contact channel. |
| [042 SEO and discovery](042-seo-discovery.md) | Implement metadata, canonical URLs, sitemaps and indexing rules. |

**Gate:** complete browsing and result flows must work with real stored projections. Owner-supplied public information and indexing policies must be ready before launch.

### 043–049 Operations and release

| Prompt | Feature delivered |
| --- | --- |
| [043 Recovery watchdog](043-recovery-watchdog.md) | Detect and safely recover missed runs, stale jobs and missing locks. |
| [044 Operations monitoring](044-operations-monitoring.md) | Expose private operational health, cost and performance evidence. |
| [045 Backup and restore](045-backup-restore.md) | Prove recovery and apply the chosen retention policy. |
| [046 Staging deployment](046-staging-deployment.md) | Deploy the web app and durable workers to the selected staging runtime. |
| [047 Shadow qualification](047-shadow-qualification.md) | Collect real prospective forecast and capacity evidence. |
| [048 Release readiness](048-release-readiness.md) | Produce a verifiable go/no-go result against launch criteria. |
| [049 Production deployment](049-production-deployment.md) | Release the qualified application and verify production operations. |

**Gate:** real shadow observations and recovery evidence precede release approval. A deployed staging app or a passing unit suite alone does not establish production readiness. Never fabricate elapsed observation time or sufficient sample sizes.

### 050–056 Feed screen redesign and expansion

| Prompt | Feature delivered |
| --- | --- |
| [050 Feed query extensions](050-feed-query-extensions.md) | Multi-value league/country filters, probability range, sort direction and numbered-pagination data. |
| [051 Feed screen layout](051-feed-screen-layout.md) | Mobile and desktop feed screens reproducing the [layout templates](templates/). |
| [052 Provider odds import](052-provider-odds-import.md) | Stored pre-match odds, price display and the odds-range filter. |
| [053 Score-distribution markets](053-score-distribution-markets.md) | Every goal-based provider market derived from AI full-time and half-time score distributions. |
| [054 Market-implied markets](054-market-implied-markets.md) | Corners, cards and other non-goal markets from de-margined odds, with settlement. |
| [055 On-device picks, alerts and profile](055-on-device-picks.md) | My Picks, the notifications bell and on-device Profile preferences; the avatar is the account entry. |
| [056 Leagues and tips pages](056-leagues-and-tips-pages.md) | League directory and daily top-picks sections, subscriber-only for unfinished fixtures. |

**Gate:** the owner-approved specification edits (version 1.8) precede behaviour changes. Templates fix layout only; theme tokens and real data supply branding and content. Prompts 052–054 stay within the API-Football budget in section 14; no market is shown before its settlement rule is tested. Version 1.9 paid access also applies: 053–054 keep the family-total invariant tied to `publicPolicy.markets`, and 055–056 depend on 061–062, so run them after those prompts.

### 057–067 Paid access

| Prompt | Feature delivered |
| --- | --- |
| [057 Owner admin foundation](057-owner-admin-foundation.md) | Private `/admin` shell, shared admin guard and private exclusion points on the analytics owner login. |
| [058 Data model, settings, plans and audit](058-subscription-data-model.md) | The nine paid-access tables, phone normalization, the paywall switch and owner settings, plans and audit. |
| [059 Phone sign-in and member sessions](059-phone-sign-in.md) | Phone-only sign-in, member sessions, throttles, sign-out and devices. |
| [060 Access codes, periods and access resolution](060-access-codes-periods.md) | Codes bound to the paying account, periods, device unlock and viewer access. |
| [061 Server-side prediction gating](061-prediction-gating-server.md) | Gated reads, gated wire variants, oracle refusal, generic metadata and the leak scan. |
| [062 Gated UI, transitions and entry points](062-gated-ui-entry-points.md) | Designed gated card, verdict, drawers, filters, banner, account icons and tier-aware refresh. |
| [063 Get access page and payment submissions](063-get-access-payments.md) | The single Get access page, SMS auto-fill, screenshot upload and payment reports. |
| [064 Owner payments queue and codes](064-admin-payments-codes.md) | One-tap approval with automatic checks, the code ready panel and code management. |
| [065 Overview, subscribers, audit and purge](065-admin-subscribers-audit.md) | Owner overview, subscriber tools, the audit page and the members purge. |
| [066 Legal, help, policy copy and analytics](066-paywall-legal-copy.md) | Privacy, terms, help and contact copy, analytics goals and documentation. |
| [067 Paid access launch readiness](067-paywall-launch-readiness.md) | Host checks, the switch-on checklist and read-only production checks. |

**Gate:** Phase 0 (specification 1.9, these prompts and the decision rows OP-37–OP-40) precedes any paid-access code. Paid access ships with the switch `off`; no prompt deploys to production unless the owner explicitly asks, and switching it `on` needs OP-40. Add no env keys (an older release rejects unknown keys) and no npm dependencies. Every prompt that adds an `/api/admin` route or `/admin` page extends `tests/admin-routes.test.mjs`. Record manual checks in `docs/development-progress.md`: layout at 375 px in the Browser pane; throttled checks in desktop Chrome DevTools (device mode, Slow 3G or a 200 kbit/s profile), because the Browser pane cannot throttle; phone-only behaviour (clipboard, file picker, tab discard) on a real Android phone over HTTPS dev (`npx next dev --experimental-https`, its CA trusted on the phone), otherwise in test mode after an owner-requested deploy. The [monetization plan](../monetization.md) holds the full design.

## Requirement coverage

| Specification requirement | Implementation ownership |
| --- | --- |
| Scope, stack and operating decisions (§§1, 9, 14–15) | 001–003, 008, 010, 014, 046–049 |
| Navigation, cards and styling (§§2–3) | 015–018, 032–037, 050–051, 055–056, 062 |
| Market probabilities and outcomes (§§4, 7–8) | 005, 012–014, 022–024, 027, 030, 038, 052–054 |
| EAT windows, daily selection and cadence (§5) | 004, 020–026, 037, 043 |
| Provider, research, canonical identities and images (§§6, 10) | 006–013, 018–019, 026 |
| Database integrity, immutable history and APIs (§§9–11) | 003, 009, 011–012, 019–031, 036 |
| Shared quotas, cost limits and concurrency (§§11, 14) | 006–008, 010, 020–027, 043–047 |
| SEO and English/language infrastructure (§12) | 016, 034–036, 038–042, 061 |
| Accessibility and performance (§13) | 015–018, 028, 031–038, 044, 047–048 |
| Secrets, read-only access and safe input handling (§13) | 002, 007, 011–012, 020, 028–031, 043–044, 046, 057, 059, 063 |
| Privacy, terms and contact (§§2, 13, 15) | 039–041, 066 |
| Backups, retention, recovery and launch (§§13–15) | 043–049, 065, 067 |
| Paid access (§§1–3, 12–15): phone format (canonical digits with country code, no plus, `256772123456`); payment report fields (payer number, transaction ID, amount, screenshot); owner approval against the owner's wallet; codes bound to the paying account; periods and device cap; server-side gating with no leaks to anonymous viewers or crawlers | 057–067 |
| Official implementation references (§16) | Consult from each relevant prompt when verifying external contracts and compatible versions. |

The specification's acceptance criteria remain the final checklist. Prompt 048 reconciles each criterion with concrete evidence and reports unmet gates; it does not hide missing features inside a generic finishing step.
