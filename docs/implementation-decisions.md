# Implementation decisions

This register records implementation choices and their evidence without changing
the product requirements in [the specification](../app-write-up.md). Prompt 002
extends it into the operating decision register below. Verification results belong
in [development progress](development-progress.md); dependency metadata and
documentation establish compatibility requirements, not passing application tests.

## 001 — Runtime and dependency baseline

**Decision date:** 7 October 2026. **Status:** selected for prompt 001.

Use one private npm package with exact direct dependency versions and the
committed `package-lock.json`. Install the locked dependency tree with `npm ci`.
No package manager or lockfile existed before the foundation, so npm matches the
available supported runtime without introducing another package manager.

| Package or runtime | Exact version | Evidence and rationale |
| --- | --- | --- |
| Node.js | `24.18.1` | The [official distribution index](https://nodejs.org/dist/index.json) identifies this published release as Krypton LTS, released 28 July 2026. [Node release status](https://nodejs.org/en/about/previous-releases) lists Node 24 as LTS. Retain the available runtime so checks can execute on the pinned version. This is a supported release, not a claim that it is the newest patch. |
| npm | `11.16.0` | Bundled with Node `24.18.1` in the [official distribution index](https://nodejs.org/dist/index.json). Pin the available matching version in `packageManager` and `engines`. |
| Next.js | `16.4.0` | The specification's baseline is published, confirmed by [official installation documentation](https://nextjs.org/docs/app/getting-started/installation) and [publisher metadata](https://registry.npmjs.org/next/16.4.0). Its Node requirement is `>=20.9.0` and its React peer range includes React 19. |
| React and React DOM | `19.3.0` | Both are published stable versions. [React metadata](https://registry.npmjs.org/react/19.3.0) and [React DOM metadata](https://registry.npmjs.org/react-dom/19.3.0) confirm the matching pair; React DOM requires React `^19.3.0`. |
| TypeScript | `5.9.3` | A [published stable compiler](https://registry.npmjs.org/typescript/5.9.3) satisfying Prisma 7's `>=5.4` requirement and the lint parser's supported range. Select a compatible mature version instead of advancing the compiler independently of lint support. |
| Redux Toolkit | `2.13.0` | [Publisher metadata](https://registry.npmjs.org/@reduxjs/toolkit/2.13.0) accepts React 19 and react-redux 9 and supplies Redux 5. No additional direct Redux package is needed. |
| react-redux | `9.3.0` | [Publisher metadata](https://registry.npmjs.org/react-redux/9.3.0) accepts React 19, Redux 5 and React 19 declarations. |
| styled-components | `6.5.3` | [Publisher metadata](https://registry.npmjs.org/styled-components/6.5.3) accepts React `>=16.8.0` and includes TypeScript declarations. React Native and native styling peers are optional; this web application does not need them. |
| server-only | `0.0.1` | The [published marker package](https://registry.npmjs.org/server-only/0.0.1) supports Next.js's server/client import boundary. |
| ESLint | `9.39.5` | This [published ESLint 9 release](https://registry.npmjs.org/eslint/9.39.5) fits the Next configuration and its React plugin's supported peers. ESLint 9 is end-of-life; see the tooling limitation below. |
| eslint-config-next | `16.4.0` | Match the framework version. [Publisher metadata](https://registry.npmjs.org/eslint-config-next/16.4.0) requires ESLint `>=9` and supplies the Next, React and TypeScript lint configuration. |
| @types/node | `24.13.6` | [Published Node 24 declarations](https://registry.npmjs.org/@types/node/24.13.6), conservatively below the pinned runtime's minor version to avoid deliberately exposing newer Node APIs. Declaration versions need not equal runtime versions. |
| @types/react and @types/react-dom | `19.3.0` | Published declarations matching the React major/minor: [React types](https://registry.npmjs.org/@types/react/19.3.0) and [React DOM types](https://registry.npmjs.org/@types/react-dom/19.3.0). |

The compatibility review also checked newer tool versions. On the decision date,
TypeScript `7.0.2` was published, but [typescript-eslint's documented supported
range](https://typescript-eslint.io/users/dependency-versions/) was
`>=4.8.4 <6.1.0`. ESLint `10.12.0` was published, but the Next configuration's
[`eslint-plugin-react` dependency](https://registry.npmjs.org/eslint-plugin-react/7.37.5)
declared support through ESLint 9. These are reasons to retain the selected
compiler and lint major versions; they are not claims that the selected versions
are the newest available across all majors.

**Tooling limitation:** [ESLint 9 reached end-of-life on 6 August 2026](https://eslint.org/version-support/)
and no longer receives upstream maintenance. The checked stable
`eslint-config-next@16.4.0` still requires `eslint-plugin-react@^7.37.0`; that
plugin's published stable `7.37.5` excludes ESLint 10 from its peer range. No
maintained ESLint major satisfies this configuration's current declared peers.
Retain the compatible pin without `--force` or `--legacy-peer-deps`, record the
installation deprecation transparently, and recheck the configuration/plugin
during dependency maintenance for migration to ESLint 10. This is a development
tooling limitation, not an application-runtime blocker.

**Open dependency advisory:** the 7 October 2026 audit reports five high-severity
package entries from one development dependency chain:
`eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces`.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects
`braces <=3.0.3`: deeply nested brace patterns can exhaust the process stack.
The advisory lists no patched version, and the checked
[braces registry metadata](https://registry.npmjs.org/braces/latest) still resolves
to `3.0.3`. Current stable micromatch and fast-glob also retain this dependency.
There is no published compatible patched version to select. npm's suggested
`eslint-config-next@14.2.35` downgrade would misalign the selected Next.js 16
toolchain, so it is not applied. Retain this open maintenance item, recheck
upstream fixes during dependency updates, and keep lint patterns repository
controlled. Record full and production-only audit results separately in the
progress log; passing application checks does not clear this advisory.

### Prisma 7 compatibility, integration deferred

The [official Prisma release status](https://www.prisma.io/docs/orm/release-status)
identifies Prisma 8 as a release candidate and states that Prisma 7 remains
supported. The checked [Prisma 7 system requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements)
include Node `^20.19.0`, `^22.12.0` or `^24.0.0` and TypeScript `5.4+`.
The selected Node 24 and TypeScript 5.9 versions satisfy those requirements.

[`prisma@7.10.0`](https://registry.npmjs.org/prisma/7.10.0) and
[`@prisma/client@7.10.0`](https://registry.npmjs.org/@prisma/client/7.10.0)
were verified published candidates for prompt 003. Neither package is a
dependency of this foundation. Prompt 003 must recheck and pin the Prisma 7 CLI,
client and PostgreSQL adapter together, then validate their actual integration.
Unqualified Prisma CLI installation currently resolves to the Prisma 8 release
candidate, so the later implementation must select the required major explicitly.

## 001 — Workspace and execution boundaries

Use one strict TypeScript workspace with `@/*` resolving to `src/*`. A monorepo,
workspace package graph, queue runtime and provider SDKs would add infrastructure
before a feature needs it.

| Boundary | Responsibility and allowed dependencies |
| --- | --- |
| `src/app` | App Router routes and layouts; Server Components by default. May call server services, but must not import worker entry points. |
| `src/components` | Reusable presentation and browser interaction. Client modules declare `"use client"`. Public types come from `src/domain`; private services and workers cannot be imported here. |
| `src/domain` | Environment-independent contracts and pure rules shared by web, server and workers. No credentials, provider payloads, React, Next.js or runtime-specific imports. |
| `src/server` | Private configuration, provider adapters, database access and reusable services as their prompts implement them. Executable modules must include `import "server-only";`. |
| `src/workers` | Future process entry points and orchestration, sharing server services and domain contracts. Executable modules must include the same server-only marker. Web modules must not import worker entry points. |

ESLint restricts imports across the browser/domain and private boundaries and
requires the server-only marker for server/worker executable modules. Next.js
enforces the marker transitively when constructing client bundles. Keep public
contracts in the domain boundary instead of creating mixed public/private barrels.
Boundary directories contain guidance until their owning feature needs code.

Use Node's built-in test runner with focused import-boundary checks and an
isolated Next.js fixture that is expected to reject a transitive private import
from a Client Component. This exercises the security boundary without adding a
second test framework or manufacturing product data. Test execution and its
results are recorded separately in the progress log.

Keep lint, type-check and production build as explicit commands. The type-check
command runs `next typegen` before `tsc --noEmit`, so it does not depend on a prior
development build. Follow the [Next.js TypeScript documentation](https://nextjs.org/docs/app/api-reference/config/typescript)
and ignore generated `next-env.d.ts` and `.next/` artifacts.

Redux Toolkit, react-redux and styled-components are pinned but no store,
Redux provider, theme provider or style registry is introduced in prompt 001.
The entry point only establishes a compilable, honest application shell.

## Deferred implementation choices and first dependent prompts

These items are ownership handoffs, not blockers to the foundation. Product
choices already settled by the specification remain settled.

| First dependent prompt | Decision or evidence still required |
| --- | --- |
| **002 Runtime policy** | Extend this register with the operating choices required by subsequent prompts and implement validated environment configuration. The foundation needs no runtime secrets. |
| **003 PostgreSQL and Prisma** | Recheck exact Prisma 7 CLI/client/adapter versions, add PostgreSQL configuration and prove database access and migrations. `7.10.0` is a checked candidate, not an installed or tested integration. |
| **015 Brand styling** | Implement and production-test styled-components rendering using the [documented App Router registry](https://nextjs.org/docs/app/guides/css-in-js), compiler option and shared theme. Verify initial styles, streaming and hydration with this pinned stack. |
| **017 Client state** | Introduce stores only when state is needed. Follow the [official Redux Next.js guidance](https://redux.js.org/usage/nextjs): per-request/provider instances, no global store and no Redux access from Server Components. |
| **020 Durable jobs** | Select the queue and standalone worker runner/build strategy. Plain Node does not resolve the TypeScript `@/*` alias; external server-service execution also needs the `react-server` export condition for `server-only`. Resolve both deliberately in the worker integration. |
| **046 Staging deployment** | Confirm hosting and deployment configuration supporting long-lived polling, durable workers and shared limits, then verify the pinned runtime on that platform. No deployment is established by prompt 001. |

## 002 — Runtime contract and evidence status

**Decision date:** 7 October 2026. **Status:** implementation contract selected;
external operating choices and validation remain as recorded below.

The prompt 001 records above remain historical foundation decisions. The
operating register below now owns the prompt 002 handoff. Sources are the
[specification](../app-write-up.md), especially sections 1, 5–8, 11 and 14–15,
and the numbered [development prompts](../dev-plan/000-index.md). The repository
contains no operator approvals, provider account reports, rights agreements,
prices for AI/research, qualification reports or deployment evidence that resolve
the pending items. The specification's advertised commercial terms describe the
selected plan; they do not establish an active subscription or its current
payable total.

`src/domain/public-policy.ts` owns the immutable, nonsecret public product
policy. `src/server/config/runtime-policy.ts` owns credentials, operation scope,
enablement flags, limits and evidence references. Public exports must not contain
private operational settings or secrets. Configuration validation is not a
provider trial, legal review, qualification result or deployment approval.

`GOAL_HINT_OPERATION_SCOPE` is `disabled`, `trial`, `shadow` or `production`,
separately from the technical `NODE_ENV` build mode. Production operation scope
requires `NODE_ENV=production`; a technical production build with `trial` scope
may perform authorized private trial work without becoming a production release.
Optional capabilities are disabled by default;
unset operating choices remain unresolved rather than becoming a zero allowance
or an enabled feature. `GOAL_HINT_DATABASE_ENABLED`,
`GOAL_HINT_FOOTBALL_ENABLED`, `GOAL_HINT_AI_ENABLED` and
`GOAL_HINT_RESEARCH_ENABLED` select affected capabilities. An enabled live
operation must satisfy its own prerequisites. A production build with those
capabilities disabled can still render the foundation. `NODE_ENV=test` cannot
authorize live paid/provider work, shadow operation or public forecast
publication. Isolated test contracts remain usable without live secrets.

The infrastructure monthly cap must be explicitly configured for database
operation under `NODE_ENV=production` and private shadow/publication. An explicit zero can record a
deliberately approved free infrastructure cap; an unset cap remains unresolved.
The approval must be verified, and later features must itemize applicable service
rates and caps before enabling their live use. Comparing `TEST_DATABASE_URL`
with `DATABASE_URL` rejects identical configured targets, but this structural
check does not prove that differently written URLs address isolated databases.
Prompt 003 must establish actual test-target isolation before database tests.

Evidence-reference settings identify operator-supplied records; supplying a
nonempty reference does not prove that its underlying evidence exists, is
current or passes its owning prompt. `parseRuntimePolicy` checks configuration
structure and readiness prerequisites only. `assertOperationAllowed` also
requires a trusted evidence-verifier callback for applicable rights, budget,
account, pipeline-integrity, quality and release references. An absent verifier,
a false result or a thrown verification error denies the operation. Future
consumers must supply verification against recorded evidence before dispatch,
publication or release. This repository currently provides no live proof
verifier or live operation consumer. Never set approval references from
synthetic test output or treat a successful API response as rights/quality proof.

Status meanings:

- **Settled:** an authoritative product or implementation requirement is recorded.
- **Unresolved:** a required operator choice has not been supplied.
- **Evidence required:** a selected requirement needs real verification; no pass
  is inferred from documentation, credentials or mocks.
- **Excluded:** optional scope remains disabled until an explicit later decision
  and its validation requirements are satisfied.

No operating, incident, legal or release role is explicitly assigned by the
specification. Its “Prepared for Wasswa Wilson” attribution is not an assignment
of those duties. Each pending row therefore records an unassigned owner and the
user decision/evidence required. First dependent prompts identify the earliest
feature that needs the missing value or proof for its affected live path;
independent local work may proceed. Ask for the missing input at that dependency,
after completing useful independent work.

## 002 — Settled product and operational requirements

These are definitions to preserve, not pending choices to reopen. Detailed domain
algorithms and infrastructure are implemented by their owning prompts.

| Decision | Status and authoritative requirement | Definition or affected configuration | First implementation consumer |
| --- | --- | --- | --- |
| Identity and origin | **Settled**, specification opening table and §15: Goal Hint; canonical production origin `https://goalhint.com`. Registration, DNS and HTTPS are separately unverified. | `publicPolicy` identity/origin | 002; canonical discovery 042 |
| Access and product scope | **Settled**, §1: free anonymous public pages/read endpoints; no visitor accounts, tokens, authentication cookies, payments, betting, subscriptions, social features, AI chat or public admin dashboard. Private jobs use private service controls. | `publicPolicy` access/scope; private mutation credential configuration is server-owned | 002; private jobs 020 |
| Launch locale/theme | **Settled**, §§1, 12–13, 15: English and light mode. Prepare reusable extension points without enabling additional locales, dark mode or selectors. | `publicPolicy` launch locale/theme; reserved optional flags cannot enable them | 002; UI 015–016 |
| Advertising | **Excluded** at launch, §§1, 14–15. Future consent, audience, rights and layout decisions are required before enabling ads. | Fixed disabled public policy; reserved ad flag cannot enable it | 002; any later scope change requires a new decision |
| Exact scores | **Excluded** from the launch contract, §§4, 7 and prompt 005. No operator approval or validated score distribution exists. Any later approval must specify a validated complete score distribution, its own probability, source/timing/consistency checks and separate reporting/evaluation; it cannot silently join the four-family headline metrics. | Fixed disabled public policy; reserved exact-score flag cannot enable it | 002; reconsideration/validation begins at 005 before downstream use |
| Reporting calendar and daily run | **Settled**, §5: `Africa/Kampala` reporting dates; stored instants UTC; one logical run at 00:00 EAT, `0 21 * * *` UTC on the previous date. Selection is `[D 00:00, D+7 00:00)` in EAT, today plus six days. No hourly/last-minute AI refreshes. | Shared server/runtime schedule policy; public reporting timezone/window | 004; daily selection 021 |
| Publication cutoff | **Settled**, §§4–5: kickoff minus five minutes; publication strictly before cutoff. Observed earlier play closes writes immediately. Previous-day eligible revisions may serve early kickoffs. | Shared server/runtime cutoff policy | 004; publication/locking 022–024 |
| Four market families | **Settled**, §4: match result; derived double chance; over/under 2.5; both teams to score. Regulation time includes stoppage time and excludes extra time/penalties. Highest unrounded probability wins with ties in the specification's listed order. | Public market family list; shared domain rules introduced by 005 | 005 |
| Probability and source semantics | **Settled**, §§4, 7–8: finite values strictly between zero and one; complete outcome groups; double chance derived from one accepted match-result source group. No guessed values, implicit odds conversion, source averaging or selection by higher source percentage. Numeric tolerances remain unresolved below. | Shared market rules; `GOAL_HINT_PROBABILITY_SUM_TOLERANCE`, `GOAL_HINT_CONSISTENCY_TOLERANCE` | 005 |
| Primary predictor and fallback | **Settled**, §§1, 5, 7: valid AI families take priority; supported API-Football fallback may follow invalid/missing AI, timeout, insufficient evidence or exhausted budget. Missing news alone does not force fallback when approved evidence coverage is met. | Server source policy; AI/research/football capability flags | 011–013 |
| Revision and settlement integrity | **Settled**, §§4–5, 8, 10–11: complete ordered snapshots; one publication per refresh identity; partial replacements drop old unsupported families. No valid family retains an eligible prior forecast with original age or stays unavailable. Immutable locks/history; verified regulation results only; corrections preserve locked picks and append audit history. | Shared server/domain invariants; database services arrive in 019–027 | 019 |
| Selected football provider/plan/cap | **Settled**, §§6, 14–15: sole football-data/fallback provider API-Football by API-Sports, direct Mega; payable monthly ceiling **US$45 including taxes/payment charges**. Plan choice is not a purchase. The specification's US$39 advertised price is not a verified invoice. | Server football policy; `API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS` must not exceed 4500 | 006–008 |
| Account-wide dispatch ceilings | **Settled**, §§11, 14–15: at most 12/rolling second, evenly paced; 720/rolling 60 seconds; 120,000/verified provider day, containing a 20,000 essential reserve and leaving 30,000 headroom below the stated Mega quota. All replicas/environments/tools/retries share accounting; uncertain attempts count conservatively; use lower active ceilings; shared-state failure pauses calls. | Shared server/runtime football limits; account evidence/reset configuration remains pending | 006 |
| Shared polling and visitor independence | **Settled**, §§5, 11: one leased poller, 15-second live checks while active/approaching, 60-second EAT date/results and active unresolved checks. Browser views may refresh app endpoints every 15–30 seconds and slow/pause in background. Public visits/polls never trigger provider research or AI. | Shared server/runtime cadences; approaching/result horizon choices below | 026; browser refresh 037 |
| Evidence timestamps and missingness | **Settled**, §§5–7: retain evidence cutoff, generation, publication, retrieval and provider-update times separately. An absent update time remains unknown; retrieval does not make an unchanged forecast newly generated. Missing injury data does not imply a fully fit squad. Source text is untrusted data. | Evidence/freshness policy references; owning adapters preserve unknown values | 007; evidence 011 |
| Third-party images and attribution | **Settled**, §6: approved credential-free HTTPS URL strings, loaded directly by native browser images, no download/proxy/optimizer/binary storage/persistent image cache. First-party Goal Hint branding may be bundled. Rights and media-host restrictions still need proof below. | Provider/public serializers and shared image components; rights references | 007–008; UI 018 |
| Honest reporting and targets | **Settled**, §§8, 11, 14–15: provisional unvalidated estimates, no guaranteed accuracy or calibration claim without adequate evidence; locked fixture/market picks counted once with AI/fallback/pending/unavailable/void breakdowns. Benchmark 100/500/1,000 then the full seven-day workload. 1,000 jobs by 01:00 EAT and final badges within two minutes are provisional/proposed targets requiring deployment measurements, not service commitments. | Quality/protocol references; reporting rules 014/030; qualification 047 | 014 |

## 002 — Unresolved operating decisions and verification dependencies

Every row has owner **Unassigned — user decision or evidence required** unless
the row is later updated with an explicit assignment. `Deferred:` names identify
future contracts to be introduced by the owning prompt; they are **not accepted
environment settings** in prompt 002. Existing environment settings hold selected
values or references only; a referenced policy must resolve all listed details.

| ID / subject | Status | Decision or evidence still required and authoritative source | Owner | Affected configuration | First dependent prompt |
| --- | --- | --- | --- | --- | --- |
| OP-01 Database target and privileges | **MySQL selected; live target unresolved** | The user's 7 October 2026 instruction supersedes PostgreSQL with MySQL. Select MySQL 8.4 LTS/InnoDB and the compatible Prisma 7 direct adapter runtime locally. Live hosting, actual least-privilege grants, separate direct migration access, TLS/certificate evidence, process/replica connection capacity and authorized target credentials remain unresolved. Any remote or production target needs trusted database-access and budget evidence; remote development/test mode is not an exemption. Isolated local integration evidence belongs in the progress record and does not authorize a hosted target. Specification §§9–10, 13; prompt 003. | Unassigned; user decision/evidence required for live deployment | `GOAL_HINT_DATABASE_ENABLED`, `DATABASE_URL`, `TEST_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `GOAL_HINT_DATABASE_CONNECTION_MODE`, `GOAL_HINT_DATABASE_POOL_LIMIT`, connection/acquisition/idle timeout settings, `GOAL_HINT_DATABASE_TLS_MODE`, `GOAL_HINT_DATABASE_TLS_CA_FILE`, `GOAL_HINT_DATABASE_ACCESS_REF`; Deferred: verified live target ownership/grants/isolation/TLS/capacity and itemized infrastructure approval | **003**; hosted qualification **046** |
| OP-02 Numeric and consistency policy | **Unresolved** | Set probability-group sum and cross-market tolerances and the deterministic conflict-check details. Valid AI groups outrank conflicting fallback groups; unsupported/conflicting families must be omitted and audited. No arbitrary epsilon or normalization is approved. §§7–8; prompt 005. | Unassigned; user decision/evidence required | `GOAL_HINT_PROBABILITY_SUM_TOLERANCE`, `GOAL_HINT_CONSISTENCY_TOLERANCE`, `GOAL_HINT_EVIDENCE_POLICY_REF`; Deferred: versioned consistency/conflict rules | **005**, before production candidates are accepted |
| OP-03 Provider account and reset evidence | **Evidence required** | Verify authorized account identity, actual direct Mega limits, quota headers/reset boundary, expiry, conservative reset/probe protocol and current payable total within US$45. EAT midnight is not the assumed provider reset. Limiter implementation may use isolated simulations; provider trial owns actual account proof. §§11, 14–15; prompts 006–008. | Unassigned; user evidence required | `GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF`, `API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS`; Deferred: verified account/reset/expiry/active-limit metadata | **006** for live limiter behavior; verification **008** |
| OP-04 Private provider access | **Evidence required** | Supply authorized private-use entitlement and server key before any bounded provider probe/trial. Key presence alone does not prove subscription or rights. The trial cannot purchase, renew or change plans. §§6, 14–15; prompts 007–008. | Unassigned; user evidence required | `GOAL_HINT_FOOTBALL_ENABLED`, `API_FOOTBALL_KEY`, `GOAL_HINT_FOOTBALL_PRIVATE_USE_REF`, `GOAL_HINT_OPERATION_SCOPE` | **007** for optional live probes; trial **008** |
| OP-05 Initial competitions and trial allowance | **Unresolved** | Choose representative initial candidate competitions and a bounded account-counted trial request allowance, then approve launch coverage from observed field/status/market quality and budgets. No worldwide coverage or enabled competition is inferred from Mega endpoint access. §§1, 6, 14–15; prompt 008. | Unassigned; user decision/evidence required | `GOAL_HINT_COMPETITION_IDS`, `GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT`; Deferred: competition/season coverage settings | **008** before live trial |
| OP-06 Football/prediction/logo rights | **Evidence required** | Verify public data/prediction redistribution, credential-free remote-image display rights, attribution/reuse restrictions and separate media-host throttling for the expected audience. Private entitlement is not public redistribution permission. §§6, 15; prompt 008. | Unassigned; user evidence required | `GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF`; Deferred: source/media rights, approved URL and reuse metadata | **008**; public use remains blocked |
| OP-07 Football freshness and unknown times | **Unresolved / evidence required** | Trial-backed source-specific fallback freshness, supported family coverage, pre-match availability and acceptance of unknown provider update/generation times are missing. Unknown remains unknown; retrieval time cannot substitute silently. Require independently verified regulation-score/status mappings and document any validated BTTS derivation. §§6–7, 15; prompts 008/013. | Unassigned; user decision/evidence required | `GOAL_HINT_FRESHNESS_POLICY_REF`, `GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF`; Deferred: supported fallback derivations/coverage and unknown-timestamp eligibility rules | **008**; fallback consumes proof **013** |
| OP-08 Structured source retention | **Unresolved** | Define permission-compatible retention/reuse of normalized/raw structured provider responses and attribution records before persistent catalog caching/import. Private evidence use needs its applicable rights; public display/redistribution needs public rights. Preserve required forecast/audit history; do not invent an unlimited retention entitlement. §§6, 10, 13, 15; prompt 009. | Unassigned; user decision/evidence required | `GOAL_HINT_FOOTBALL_PRIVATE_USE_REF`, `GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF` according to use; Deferred: structured-source retention/reuse policy | **009**; backup application **045** |
| OP-09 AI spending policy | **Unresolved** | Approve a separate AI monthly cap, provider/model rate versions, billed units, currency/accounting-period conversions and conservative reservations/retry/unknown-usage reconciliation. A missing cap or unpriced call is not free work. §§7, 14–15; prompt 010. | Unassigned; user decision/evidence required | `GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_AI_PROVIDER`, `GOAL_HINT_AI_MODEL`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: versioned billing/rates and per-job monetary cap | **010** before paid AI dispatch |
| OP-10 Research spending policy | **Unresolved** | Approve the independent research/search cap, selected service's rate/unit/currency/accounting rules and conservative reconciliation, including retries. Do not borrow AI or football allowances. §§6–7, 14–15; prompt 010. | Unassigned; user decision/evidence required | `GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_RESEARCH_PROVIDER`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: versioned research rates and per-job monetary cap | **010** before paid research dispatch |
| OP-11 Per-job operating bounds | **Unresolved** | Set request/token/time ceilings and a usable time/quota reserve for fallback; document per-provider allocation and cost handling. Counts and monetary caps are different controls. No timeout, token budget or free allowance is approved by the specification. §§7, 11, 14; prompt 010. | Unassigned; user decision/evidence required | `GOAL_HINT_JOB_REQUEST_LIMIT`, `GOAL_HINT_JOB_TOKEN_LIMIT`, `GOAL_HINT_JOB_TIMEOUT_SECONDS`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: fallback time/quota reservation and per-service allocation | **010**; orchestration **025** |
| OP-12 Infrastructure budgets | **Unresolved** | Approve itemized caps/cost accounting for database, queue/workers/web hosting, network egress, monitoring and domain renewal. Production database and shadow/publication require an explicit infrastructure cap and verified approval; an explicitly approved zero may cover deliberate free infrastructure, while unset is unresolved. The aggregate cap is not approval to provision a service or assume its rate; later features must itemize applicable rates/caps. These remain separate from AI, research and the API-Football payable cap. §§14–15. | Unassigned; user decision/evidence required | `GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: itemized database/hosting/network/monitoring/domain budgets and contracted rates | **003** live database; **007** billable egress; **020** queue/workers; **031** paid cache; **044** monitoring; **046** web hosting; **049** domain renewal |
| OP-13 Licensed research and source permissions | **Unresolved** | Select the actual licensed search/news service and permitted official sources; provide credentials, attribution/extraction/reuse/display terms and retention permissions. Football data access does not license articles. §§6–7, 15; prompt 011. | Unassigned; user decision/evidence required | `GOAL_HINT_RESEARCH_ENABLED`, `GOAL_HINT_RESEARCH_PROVIDER`, `RESEARCH_API_KEY`, `GOAL_HINT_RESEARCH_LICENSE_REF`; Deferred: permitted sources/claims/reuse metadata | **011**; pricing prerequisite **010** |
| OP-14 Evidence coverage/conflicts | **Unresolved** | Set minimum evidence coverage, missing-news behavior under that threshold, source-specific freshness, conflicting-claim handling and unknown/publication-time eligibility before live evidence use. Confirmed facts and rumors remain distinct; late evidence cannot enter an earlier cutoff. §§6–8, 15; prompt 011. | Unassigned; user decision/evidence required | `GOAL_HINT_EVIDENCE_POLICY_REF`, `GOAL_HINT_FRESHNESS_POLICY_REF`; Deferred: versioned coverage/source-conflict/unknown-time policy | **011** |
| OP-15 AI predictor and calibration configuration | **Unresolved** | Select the approved predictor/model/prompt/schema and calibration configuration with training/calibration windows and provenance. Verify the chosen API and rates. A configured artifact or successful call cannot establish calibration quality; unvalidated output stays provisional. §§7–8, 15; prompt 012. | Unassigned; user decision/evidence required | `GOAL_HINT_AI_ENABLED`, `AI_API_KEY`, `GOAL_HINT_AI_PROVIDER`, `GOAL_HINT_AI_MODEL`, `GOAL_HINT_CALIBRATION_REF`; Deferred: versioned model/prompt/schema/calibration registry | **012**; rate selection **010**, evaluation **014** |
| OP-16 Evaluation protocol and samples | **Unresolved** | Freeze chronological training/validation/calibration/final-test periods, matched fixtures/horizons, reconstructable baselines, minimum samples, quality/coverage gates and calibration aggregation before the final test. Historical comparisons require genuine pre-cutoff snapshots; otherwise plan prospective observations. §§8, 14–15; prompt 014. | Unassigned; user decision/evidence required | `GOAL_HINT_SHADOW_PROTOCOL_REF`; Deferred: versioned evaluation cohorts, samples, baselines, metrics and release thresholds | **014**; actual prospective evidence **047** |
| OP-17 Public performance-claim gates | **Unresolved / evidence required** | Define minimum market/source/horizon samples and permitted claims, then gather sufficient independent evidence. No fixed accuracy promise is approved. Below-threshold public metrics must show insufficient data/provisional status. §§8, 15; prompts 014/030/038. | Unassigned; user decision/evidence required | `GOAL_HINT_QUALITY_QUALIFICATION_REF`; Deferred: public-claim minimum samples and qualification results | **014** defines gates; public consumers **030/038** |
| OP-18 Bounded shadow authorization | **Unresolved / evidence required** | Approve a private bounded protocol, maximum jobs/spend and evidence locations after applicable private provider/evidence-use rights, account, independent budgets and pipeline-integrity checks pass. Public redistribution/logo-display rights are required for public use, not isolated private shadow evidence collection. Candidate quality may remain unqualified while shadow gathers evidence. Shadow cannot publish production forecasts or declare qualification; a trusted verifier must validate applicable recorded evidence. Prompt 002, index gate and prompt 047. | Unassigned; user decision/evidence required | `GOAL_HINT_OPERATION_SCOPE=shadow`, `GOAL_HINT_SHADOW_MAX_JOBS`, `GOAL_HINT_SHADOW_BUDGET_USD_CENTS`, `GOAL_HINT_SHADOW_PROTOCOL_REF`, `GOAL_HINT_PIPELINE_INTEGRITY_REF`; private provider/account, independent infrastructure/AI/research budgets and evidence/freshness/calibration prerequisites also apply | **014** prospective protocol; execution **047** after pipeline checks |
| OP-19 Durable queue, worker runtime and private identity | **Unresolved** | Choose approved queue/runner/hosting and safe external TypeScript/module resolution, private job authentication/workload identity, deployment ownership and bounded lease/timeout/retry/concurrency settings. One long-lived leased poller is required. No managed service or paid infrastructure is inferred. §§9, 11, 13–15; prompt 020. | Unassigned; user decision/evidence required | Deferred: queue/worker hosting, service identity, leases, retry bounds and concurrency; existing job limits and infrastructure budget feed these contracts | **020**; hosted verification **046** |
| OP-20 Selection eligibility and degraded finalization | **Unresolved** | Trial-backed competition/status eligibility and an explicit recorded degraded-manifest finalization policy/action are required. A partial immutable manifest must expose missing coverage; it cannot be silently completed later or treated as authoritative emptiness. §§5, 11, 15; prompt 021. | Unassigned; user decision/evidence required | `GOAL_HINT_COMPETITION_IDS`, `GOAL_HINT_EVIDENCE_POLICY_REF`; Deferred: manifest/status eligibility and degraded-finalization policy | **021** |
| OP-21 Publication-status freshness | **Unresolved** | Set the maximum age and conflict handling of provider kickoff/status observations used for publication/cutoff safety; stale or unknown eligibility cannot authorize a write. Acquire trial evidence first; use the bound transactionally. §§5, 7, 15; prompt 022. | Unassigned; user decision/evidence required | `GOAL_HINT_FRESHNESS_POLICY_REF`, `GOAL_HINT_EVIDENCE_POLICY_REF`; Deferred: fixture-status publication freshness bound | **022**; trial evidence **008** |
| OP-22 Polling horizons and approach threshold | **Unresolved** | Choose approaching-kickoff lead time, active/result window, unresolved-result horizon and progressively slower correction checks with bounded stopping/review rules. Preserve visible unresolved fixtures after midnight/outside the prediction window. §§5, 11, 15; prompt 026. | Unassigned; user decision/evidence required | `GOAL_HINT_FRESHNESS_POLICY_REF`; Deferred: poller approach thresholds, unresolved/correction horizons/cadences | **026** |
| OP-23 Public query/search limits | **Unresolved implementation choice** | Set reusable validated response/page/search limits and anonymous search throttling from workload/security evidence; about 30 initial cards is the specification's default. No visitor credential or provider work may be added. §§11, 13; prompt 028. | Unassigned; implementation evidence required | Deferred: public query/page/search rate limits | **028** |
| OP-24 Shared cache strategy and lifetimes | **Unresolved implementation choice** | Choose approved cache capability, active/historical lifetimes and recovery/invalidation/fencing policy compatible with 15/60-second cadences and measured final-badge latency. Cache hits preserve actual source sync times. §§11, 13; prompt 031. | Unassigned; implementation/infrastructure evidence required | Deferred: cache backend, active/historical TTL and invalidation/recovery policy; infrastructure budget if paid | **031** |
| OP-25 Correction/dispute ownership and public process | **Unresolved** | The audited correction mechanics are settled; assign the actual correction/dispute owner, intake/review process, supporting-evidence rules and factual public statements. Do not promise an unapproved response time or operational policy. §§8, 12–15; prompt 038. | Unassigned; user decision/evidence required | Deferred: correction/dispute owner and public process policy | **038**; intake/legal consumers **040–041** |
| OP-26 Analytics and visitor/log retention | **Unresolved** | Inventory actual log/search/browser-preference/remote-image data flows; choose whether analytics is used, its providers/purposes/recipients/retention and applicable consent/data-handling requirements before enabling tracking. Ads stay disabled. Retention must match actual configuration and permissions. §§12–13, 15; prompts 039/044. | Unassigned; user decision/evidence required | Deferred: analytics enablement/provider, visitor/telemetry/log retention and privacy data-flow policy | **039** notice facts; telemetry activation **044** |
| OP-27 Operator identity, jurisdiction and legal facts | **Unresolved** | Obtain actual operator identity, audience/jurisdiction, lawful contact and owner-approved privacy/terms/dispute facts. “Prepared for” attribution supplies no legal identity, address, liability policy or signoff. Do not publish placeholders or invented legal assertions. §§13, 15; prompts 039–040. | Unassigned; user decision/evidence required | Deferred: approved operator/legal/privacy/terms content and factual evidence | **039**; terms **040** |
| OP-28 Verified public contact route | **Unresolved** | Supply a verified owner-approved public email or established destination, publication-approved operator details and correction recipient. No mailbox creation, test message, form backend or response commitment is authorized by the plan. §15; prompts 039/041. | Unassigned; user decision/evidence required | Deferred: public contact destination and correction recipient/content | **039** lawful notice contact; contact page **041** |
| OP-29 Recovery watchdog ownership and thresholds | **Unresolved** | Assign recovery/incident responsibility and approved detection/lease-staleness/stalled-job/missed-run/missing-lock thresholds, repair authority and independent scheduler-failure route. Recovery may not bypass cutoff, immutable manifests, budgets or quota. §§11, 13, 15; prompt 043. | Unassigned; user decision/evidence required | Deferred: watchdog thresholds, repair authorization and recovery/incident owner | **043** |
| OP-30 Alerts, destinations and monitoring service | **Unresolved** | Choose the authorized monitoring service, actionable outage/staleness/latency/quota/cost/expiry thresholds, severity/deduplication, recipients and notification approval. No recipient or unapproved test message is inferred. Telemetry must reconcile with privacy/retention decisions. §§11, 13–15; prompt 044. | Unassigned; user decision/evidence required | Deferred: monitoring provider, alert thresholds/destinations, telemetry retention and runbook ownership; infrastructure budget | **044** |
| OP-31 Recovery objectives, backups and history retention | **Unresolved / evidence required** | Approve RPO/RTO, backup/PITR capabilities, encryption/access/retention and ownership for predictions, results, evidence, audits and structured source data within rights. Prove isolated restoration and safe limiter/job restart. No arbitrary deletion period or completed restore is inferred. §§13, 15; prompt 045. | Unassigned; user decision/evidence required | Deferred: RPO/RTO, backup/PITR and prediction/result/evidence/audit/backup retention policy | **045**; source retention prerequisites **009/011**, visitor notice **039** |
| OP-32 Hosted deployment and account isolation | **Unresolved / evidence required** | Confirm actual web/database/queue/long-lived worker/poller infrastructure, scheduler/workload identity and authorized access. Choose account sharing vs genuinely separate provider accounts, durable cross-environment limits and poller observation/ownership transfer. Separate databases cannot create extra provider capacity. §§9, 11, 14–15; prompt 046. | Unassigned; user decision/evidence required | `GOAL_HINT_OPERATION_SCOPE`, infrastructure/provider/budget references; Deferred: environment isolation, hosted runtime and poller ownership plan | **046**; database/queue choices earlier **003/020** |
| OP-33 Quality qualification and measured commitments | **Evidence required** | Accumulate real prospective samples under the frozen protocol; prove market/source/horizon quality and coverage, calibrated-claim eligibility, full-slate cost/capacity and cadence/latency targets. Simulated load is not elapsed shadow observation or unapproved paid-call authority. §§8, 14–15; prompt 047. | Unassigned; user evidence/commitment decision required | `GOAL_HINT_QUALITY_QUALIFICATION_REF`, `GOAL_HINT_SHADOW_PROTOCOL_REF`; Deferred: qualification report and approved measurement-supported commitments | **047**, with protocol choices fixed **014** |
| OP-34 Release decision and signoff | **Unresolved / evidence required** | Assign production release authority and record actual go/no-go evidence tied to build/configuration. All required rights/account/budget/quality/recovery/monitoring/legal gates must pass; an environment reference cannot substitute for missing evidence or owner approval. §§14–15; prompt 048. | Unassigned; user decision/evidence required | `GOAL_HINT_RELEASE_APPROVAL_REF`, `GOAL_HINT_QUALITY_QUALIFICATION_REF`, `GOAL_HINT_OPERATION_SCOPE=production`; Deferred: release owner and readiness report | **048** |
| OP-35 Domain and production operation | **Evidence required** | Verify authorized domain registration/DNS/HTTPS/canonical redirects, current payable/account/budget state, deployment access and approved release/rollback/observation ownership. No purchase, deployment, production URL or successful scheduler run is established by the specification. §§12, 14–15; prompt 049. | Unassigned; user decision/evidence required | Public canonical origin remains fixed; server production scope/release references; Deferred: authorized domain/DNS/deployment and rollback evidence | **049** |

## 002 — Separate private-shadow and production gates

The requirement to evaluate is settled; the missing samples and quality approval
are not. A candidate must be able to gather prospective evidence without being
misrepresented as qualified.

| Scope | Required prerequisites | What it permits / evidence status |
| --- | --- | --- |
| Disabled/local contracts | Valid nonsecret settled policy and isolated local/test settings; live capability flags off. | Foundation rendering and deterministic contracts/tests. No paid/provider dispatch or forecast release. |
| Private provider trial | Authorized private provider use, credentials, payable cost within the fixed cap and account-counted bounded trial allowance; applicable budget controls and trusted verification of required evidence. Select candidate competitions before competition/fixture trials; account/status probes do not need a competition list. | Bounded private collection of missing account/coverage/freshness/rights evidence, including a technical production build with trial operation scope. Public redistribution, final coverage or model quality is not assumed. |
| Private shadow | Verified applicable private provider/evidence-use rights and account, approved independent AI and enabled-research budgets plus an explicit infrastructure cap, priced bounded calls, selected model/calibration and evidence/freshness/tolerance policies, pipeline-integrity evidence and a frozen bounded protocol with maximum jobs/spend. A trusted verifier must validate applicable recorded evidence. | Private isolated prospective forecasts may gather missing quality evidence without public redistribution/logo-display permission. Quality qualification and production-release approval are not prerequisites to gathering that evidence; neither is claimed by the run. No production forecast publication. |
| Production forecasting/release | `NODE_ENV=production` and production operation scope; all applicable provider/private and public rights, independent explicit budgets, evidence/freshness, numeric, model and pipeline prerequisites plus completed quality/sample/coverage gates, measured qualification and explicit release approval. A trusted verifier must validate applicable recorded evidence. Release readiness also verifies backups, recovery/incident ownership, actual legal/contact content, hosting/domain and monitoring evidence. | Only qualified authorized production operations. Missing mandatory decisions/evidence or failed/absent verification block the affected live path with an actionable reason; public claims must satisfy their separate sample/claim gates. |

`parseRuntimePolicy` checks configuration structure and required references;
`assertOperationAllowed` additionally requires trusted evidence verification,
and denies operations when verification is absent, false or throws. Future
consumers and the owning prompts must verify real rights, billing, pipeline and
qualification evidence. There is no live proof verifier or live dispatch in this
feature. Until those checks pass, no environment file, flag, evidence-reference
string, synthetic fixture, successful build or private shadow forecast authorizes
live work or establishes production qualification.

## 002 — Schema validation and development restart tooling

Pin `zod@4.6.5` for typed environment schemas and reusable validation. Its
[official schema API](https://zod.dev/api) and
[publisher metadata](https://registry.npmjs.org/zod/4.6.5) were checked on
7 October 2026; the selected TypeScript/runtime and actual type-check/build pass.
Do not expose raw schema errors: the runtime contract emits only documented
field names and static guidance, and secret wrappers redact serialization.

At the user's explicit request, pin development-only `nodemon@3.1.14` and run
`next dev` through it. The [publisher metadata](https://registry.npmjs.org/nodemon/3.1.14)
supports Node >=10, including the pinned Node 24 runtime. Follow
[nodemon's configuration/watch documentation](https://github.com/remy/nodemon#config-files).
`nodemon.json` watches source, public assets, Next/TypeScript configuration and
environment files, with a 300 ms save debounce and generated files excluded.
The `.env{,.*}` glob catches files created after startup; explicitly watching the
tracked `.env.example` enables dotfile monitoring. Windows smoke checks proved
creation and later edits restart the server. Literal absent paths and plain
`.env*` failed that check, so those patterns are not used.
Next.js retains browser Fast Refresh; nodemon restarts the server.
Existing development processes use their original command until restarted.

The current full audit now reports **seven high-severity development-only
package entries**, all from the same unpatched `braces` advisory recorded under
001. Nodemon adds the `nodemon > chokidar > braces` chain. Production-only audit
reports zero vulnerabilities. The historical 001 audit remains a record of its
then-current five entries; it is not the current dependency count. No forced
framework downgrade or dependency-peer bypass was applied.

## 003 — MySQL runtime, migrations and connection policy

**Decision date:** 7 October 2026. **Status:** MySQL selected by the user;
local runtime implemented and database acceptance verified on MySQL 8.4.11
on 8 October 2026. Live target decisions remain unresolved.

The user's MySQL instruction supersedes the original PostgreSQL choice.
The specification and prompt 003 now require MySQL 8.4 LTS/InnoDB. Historical
001/002 compatibility notes remain records of their original state; they do not
override this selection. No hosting service, account, paid provisioning,
production credential or operator identity is inferred.

| Package or runtime choice | Decision and evidence |
| --- | --- |
| Prisma CLI/client | Pin `prisma@7.10.0` and `@prisma/client@7.10.0`. Their [CLI metadata](https://registry.npmjs.org/prisma/7.10.0) and [client metadata](https://registry.npmjs.org/@prisma/client/7.10.0), checked through npm on the decision date, accept Node `^20.19`, `^22.12` or `>=24.0`; the client accepts TypeScript `>=5.4`. The existing Node `24.18.1` and TypeScript `5.9.3` satisfy those requirements. Retain the requested stable Prisma 7 major. |
| MySQL adapter | Pin `@prisma/adapter-mariadb@7.10.0` to match the Prisma packages. [Official MySQL documentation](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql) specifies the MySQL datasource provider and this connector adapter for standard MySQL. Its package name does not select a MariaDB server. |
| Connector security override | Pin `mariadb@3.5.4`; scope `mariadb: "$mariadb"` to `@prisma/adapter-mariadb@7.10.0`. [Adapter metadata](https://registry.npmjs.org/@prisma/adapter-mariadb/7.10.0) declares `mariadb@3.4.5`, affected by [GHSA-cqhc-2h57-wpxf](https://github.com/mariadb-corporation/mariadb-connector-nodejs/security/advisories/GHSA-cqhc-2h57-wpxf). The [text-protocol SQL escaping advisory](https://github.com/mariadb-corporation/mariadb-connector-nodejs/security/advisories/GHSA-r3rv-jm3r-62q2) requires `3.5.4` on the 3.5 branch; the [maintainer release](https://github.com/mariadb-corporation/mariadb-connector-nodejs/releases/tag/3.5.4) records these fixes. [Connector metadata](https://registry.npmjs.org/mariadb/3.5.4) requires Node `>=20`. |
| CLI connector security override | Scope `mysql2: "3.24.5"` to `prisma@7.10.0`. This includes the fixes for [GHSA-3f6p-5ww8-9rcr](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-3f6p-5ww8-9rcr), unsolicited cleartext authentication, and [GHSA-rgwj-5xj2-c3m3](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-rgwj-5xj2-c3m3), unbounded compressed-packet inflation. The maintainer releases [3.22.0](https://github.com/sidorares/node-mysql2/releases/tag/v3.22.0) and [3.23.1](https://github.com/sidorares/node-mysql2/releases/tag/v3.23.1) record those fixes. |
| Config merge security override | Scope `deepmerge-ts: "8.0.2"` to `@prisma/config@7.10.0`. [GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx) affects versions below `8.0.0`. This is an explicit scoped major compatibility override, not a general replacement of all config dependencies. |
| Server baseline | MySQL 8.4 LTS with InnoDB, based on [MySQL's release tracks](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html). This is the chosen compatibility baseline, not a claim that a live server is configured or that it is the latest major. |
| Client generation | Use `prisma-client` with custom ignored output under `src/server/generated/prisma`, ESM, Node runtime and `.ts` import/file extensions. The [official generator reference](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators) documents this arrangement. Reproduce generation without a database URL; guarded server services own access and generated clients stay outside browser imports. |

The installed Prisma config loader imports named `deepmerge` and merges plain
configuration records. Three reviewed merge cases remained equivalent across
the old and new versions; the changed Map merging and custom/in-place helper
behavior is unused here. Config loading and client generation passed during
`npm install`, and `npm ls` confirmed all three scoped resolutions. Remaining
application and database checks belong in the progress record.

The verified 7 October 2026 production-only audit (`npm audit --omit=dev
--json`) reports zero vulnerabilities. The full audit still reports seven high
development-only entries: `@next/eslint-plugin-next`, `braces`, `chokidar`,
`eslint-config-next`, `fast-glob`, `micromatch` and `nodemon`. They come from the
existing unpatched brace-processing chains recorded in 001/002. No forced
framework downgrade or peer bypass is applied; the earlier audit records remain
historical evidence.

Recheck each exact scoped override on its next Prisma parent upgrade. Remove it
only when upstream selects a patched compatible dependency and the lockfile,
config loading, generation, application/database verification and both audit
scopes support the change. Recheck the major `deepmerge-ts` override whenever
the config's merge inputs or loader behavior change.

The baseline contains no application models. An initial non-domain migration
records the starting point; provider identities, markets, jobs, quotas, evidence
and immutable history arrive in their owning prompts. No users, sessions or
authentication schema is added. Temporary integration probes remain confined to
a harness-owned disposable target and are never public application data.

Use one lazy bounded client/pool per process, retained across Next development
module reloads. Requests reuse it; workers and one-off scripts use explicit
shutdown. The server runtime exposes guarded query/transaction access and
sanitized `ready`/`unavailable` checks. It does not add a public diagnostic
endpoint or log URLs, SQL parameters or raw driver errors. Transaction retries
belong to idempotent feature services, with bounded contention handling; an
arbitrary callback is not automatically replayed.

`DATABASE_URL` is the application connection, `TEST_DATABASE_URL` is isolated
test access, and `MIGRATION_DATABASE_URL` is separate direct migration access.
Neither test nor migration credentials fall back to the application URL.
The supported runtime connection mode is explicit `direct`; live proxy/pooling
compatibility remains an evidence requirement. Local defaults bound the pool
to five connections, 5,000 ms connection and 10,000 ms acquisition timeouts, and
30 seconds idle timeout. Remote/production pool sizing must be configured and account
for every replica, worker and concurrent deployment version.

Remote/production access requires verified TLS and hostname/certificate checks,
using system trust or an approved private CA PEM file. Disabled TLS is confined
to local loopback development/tests. Unknown connection URL parameters are
rejected rather than accepted as unverified provider options. Any remote
application/test target, or any target in production mode, also requires explicit
direct mode and pool sizing, infrastructure cap, budget approval reference and
`GOAL_HINT_DATABASE_ACCESS_REF`. Trusted `budget-approval` and `database-access`
verification must establish actual target ownership, connection security,
least-privilege application/migration grants and required isolation. A remote
development/test target does not bypass those checks. Owned loopback development
and test contexts retain the bounded local defaults. These settings and a successful probe do not prove least-privilege
grants, provider terms, backups or production capacity.

The database boundary evaluates the actual application URL, or test URL in test
mode. The separate `database-migration` boundary evaluates the migration URL.
Configuring a local application target cannot waive remote migration access or
budget evidence requirements.

Migration credentials own only their approved DDL/migration privileges. The
application receives feature-specific database/table access, without global
administration, account creation, grant delegation, DDL or `_prisma_migrations`
rights. Append-only forecast/evidence/audit grants and constraints belong to the
features that create those tables. Hosted grants and secure credential delivery
remain unresolved; a local test administrator is not an application role design.

Store UTC instants in `DATETIME(3)` with explicit connector/session timezone
handling and UTC serialization. [MySQL's temporal reference](https://dev.mysql.com/doc/refman/8.4/en/datetime.html)
explains that `DATETIME` carries no timezone conversion. Store monetary totals
in integer minor units and probabilities/rates in exact decimal types; later
features choose precision, scale, bounds and rounding from validated contracts.
Use InnoDB foreign keys, unique keys, compatible collations and transaction row
locks or conditional updates with ownership/version fencing. Real contention
checks, rather than a connection-scoped lock alone, prove each durable invariant.

Schema evolution follows expand/backfill/contract with old-version compatibility.
[MySQL DDL implicitly commits](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html),
so failed migrations require inspection and a reviewed forward repair/resolution.
Application rollback preserves applied migration history and original data; it
does not automatically reset, down-migrate or overwrite newer history with a
backup. Backup/restore qualification remains prompt 045.

Generate incremental migrations offline from the committed
`prisma/schema.snapshot.prisma` to the current Prisma schema with
`migrate diff --script`. `db:migrate -- --name <lowercase_identifier>` writes
reviewable SQL and advances the snapshot only for a nonempty SQL change. It
does not access a live or shadow database. Review and commit the migration and
snapshot together; unsupported/custom SQL constraints, triggers and grants
remain separately reviewed and tested. Deployment/status/verification use only
the explicit migration target. `db:verify` checks migration status and
Prisma-representable schema drift without repairing it.

The operator CLI and health command have no wired trusted budget/access
evidence verifier, so their remote/production target operations intentionally
fail closed. The shared runtime accepts a supplied verifier; configured
approval-reference strings do not establish evidence. An approved future
operator integration must wire verified records before those commands can
run. No mode change, direct CLI invocation or environment-reference string is
an authorization workaround.

The targetless Prisma config reads only the wrapper-prepared migration URL and
does not import private server services. Generation adds the server-only marker
after generated TypeScript header comments, preserving `@ts-nocheck` and license
text; the pinned generator supports the empty schema without an extra flag.
Nonempty process `DEBUG` blocks database construction and queries, including a
value captured when the module loaded, so adapter debug namespaces cannot bypass
the normal sanitized logging policy.

The isolated harness must own a fresh private data directory/server and
disposable database, verify identity before mutation/cleanup, and leave existing
services and data untouched. `MYSQL_TEST_SERVER_BINARY` selects an installed
test binary only; it is not application configuration or authorization to use
an existing database. A name prefix, unequal URLs and `NODE_ENV=test` are guards,
not isolation proof. Actual migration deployment/status, transaction rollback,
concurrency, UTC, grants and cleanup evidence are recorded in
[development progress](development-progress.md). The 8 October 2026 isolated
MySQL 8.4.11 run passed all eight database checks with Node 24.18.1. This does not clear
the unresolved live target, TLS, privileges, capacity or budget gates in OP-01
and OP-12. The operational procedures are in [the database runbook](database.md).

### 8 October 2026 implementation verification

Rechecked Prisma 7.10.0 publisher metadata and the official
[MySQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql),
[generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
and [runtime requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements)
against the pinned Node 24.18.1 and TypeScript 5.9.3. Retain the existing exact
packages and parent-scoped security overrides; no dependency upgrades were needed.

Always provide `datasource: {}` for targetless Prisma configuration. The pinned
native schema engine requires the object for offline diff; its missing-object
failure previously surfaced as exit 0 and empty SQL. The wrapper now rejects
unexpectedly blank output without advancing migration state, disables upstream
checkpoint/update work, redacts unexpected failures and restores generated
server-only guards even after unsuccessful generation.

Disable connector server redirects. Permit RSA public-key retrieval only for
nonproduction, TLS-disabled loopback connections so an uncached
`caching_sha2_password` account can authenticate. The fresh restricted application
account proved this behavior without a cache-warming login. TLS, remote and
production connections keep retrieval disabled. The
[MySQL authentication reference](https://dev.mysql.com/doc/refman/8.4/en/caching-sha2-pluggable-authentication.html)
documents initial TLS/RSA authentication requirements. Pool, adapter and client
initialization failures retain only sanitized errors and release owned resources.

The test harness now proves separate schema-scoped migration and table-scoped
application grants, migration status/repeat deployment, drift detection without
repair, exact UTC/decimal transactions, rollback and durable uniqueness. It
rechecks its owned directory, server UUID and port before administrative work
and shutdown, and excludes inherited MySQL login files and passwords.
