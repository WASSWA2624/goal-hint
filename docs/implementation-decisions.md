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
| **020 Durable jobs** | Local MySQL-backed queue and native Node 24 TypeScript runner implemented in 020 using explicit relative `.ts` imports and the `react-server` condition. Hosted queue choice, worker identity, budgets and measured capacity remain deployment gates; see OP-19 and the 020 decision below. |
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
| Access and product scope | **Superseded 19 October 2026** by specification v1.9 paid access (OP-37–OP-40; [Paid access, Phase 0](#paid-access-phase-0-19-october-2026)). Was **Settled**, §1: free anonymous public pages/read endpoints; no visitor accounts, tokens, authentication cookies, payments, betting, subscriptions, social features, AI chat or public admin dashboard. Now: public pages and read endpoints still work anonymously and set no cookies for anonymous visitors; optional phone-number accounts, member sessions, manual payment reports, access codes and a private owner dashboard (`/admin`) are in scope behind `paywallMode`, which stays `off` until the owner switches it on. Betting, social features and AI chat stay out. Private jobs use private service controls. | `publicPolicy` access/scope (`access` changes in 061); private mutation credential configuration is server-owned | 002; private jobs 020; paid access 057–067 |
| Launch locale/theme | **Settled**, §§1, 12–13, 15: English and light mode. Prepare reusable extension points without enabling additional locales, dark mode or selectors. | `publicPolicy` launch locale/theme; reserved optional flags cannot enable them | 002; UI 015–016 |
| Advertising | **Excluded** at launch, §§1, 14–15. Future consent, audience, rights and layout decisions are required before enabling ads. | Fixed disabled public policy; reserved ad flag cannot enable it | 002; any later scope change requires a new decision |
| Exact scores | **Excluded** from the launch contract, §§4, 7 and prompt 005. No operator approval or validated score distribution exists. Any later approval must specify a validated complete score distribution, its own probability, source/timing/consistency checks and separate reporting/evaluation; it cannot silently join the four-family headline metrics. | Fixed disabled public policy; reserved exact-score flag cannot enable it | 002; reconsideration/validation begins at 005 before downstream use |
| Reporting calendar and daily run | **Settled**, §5: `Africa/Kampala` reporting dates; stored instants UTC; one logical run at 00:00 EAT, `0 21 * * *` UTC on the previous date. Selection is `[D 00:00, D+7 00:00)` in EAT, today plus six days. No hourly/last-minute AI refreshes. | Shared server/runtime schedule policy; public reporting timezone/window | 004; daily selection 021 |
| Publication cutoff | **Settled**, §§4–5: kickoff minus five minutes; publication strictly before cutoff. Observed earlier play closes writes immediately. Previous-day eligible revisions may serve early kickoffs. | Shared server/runtime cutoff policy | 004; publication/locking 022–024 |
| Four market families | **Settled**, §4: match result; derived double chance; over/under 2.5; both teams to score. Regulation time includes stoppage time and excludes extra time/penalties. Highest unrounded probability wins with ties in the specification's listed order. | Public market family list; shared domain rules introduced by 005 | 005 |
| Probability and source semantics | **Settled**, §§4, 7–8: finite values strictly between zero and one; complete outcome groups; double chance derived from one accepted match-result source group. No guessed values, implicit odds conversion, source averaging or selection by higher source percentage. User approved sum tolerance 0.001 and consistency tolerance 0.002 for `regulation-markets-v1` on 8 October 2026; see OP-02 and prompt 005 decisions. | Shared market rules; `GOAL_HINT_PROBABILITY_SUM_TOLERANCE`, `GOAL_HINT_CONSISTENCY_TOLERANCE` | 005 |
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
| OP-02 Numeric and consistency policy | **Resolved for `regulation-markets-v1`** | User chose sum 0.001 and consistency 0.002 on 8 October 2026. Equality uses exact canonical-decimal comparisons; probabilities are not normalized. Versioned feasible-marginal checks preserve AI ahead of conflicting fallback; same-source contradictions omit all participating groups with reasons. Different runtime overrides fail. Evidence adequacy/source verification remains separately pending in OP-07/OP-14. §§7–8; see prompt 005 decisions below. | User selected numeric limits; implementation defines conservative deterministic conflict rules | Shared `marketRules`; `GOAL_HINT_PROBABILITY_SUM_TOLERANCE`, `GOAL_HINT_CONSISTENCY_TOLERANCE`; evidence policy remains independently required | **005** implemented; provider precision/quality validation **008/014** |
| OP-03 Provider account and reset evidence | **Evidence required** | Verify authorized account identity, actual direct Mega limits, quota headers/reset boundary, expiry, conservative reset/probe protocol and current payable total within US$45. EAT midnight is not the assumed provider reset. Limiter implementation may use isolated simulations; provider trial owns actual account proof. §§11, 14–15; prompts 006–008. | Unassigned; user evidence required | `GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF`, `API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS`; Deferred: verified account/reset/expiry/active-limit metadata | **006** for live limiter behavior; verification **008** |
| OP-04 Private provider access | **Evidence required** | Supply authorized private-use entitlement and server key before any bounded provider probe/trial. Key presence alone does not prove subscription or rights. The trial cannot purchase, renew or change plans. §§6, 14–15; prompts 007–008. | Unassigned; user evidence required | `GOAL_HINT_FOOTBALL_ENABLED`, `API_FOOTBALL_KEY`, `GOAL_HINT_FOOTBALL_PRIVATE_USE_REF`, `GOAL_HINT_OPERATION_SCOPE` | **007** for optional live probes; trial **008** |
| OP-05 Initial competitions and trial allowance | **Unresolved** | Choose representative initial candidate competitions and a bounded account-counted trial request allowance, then approve launch coverage from observed field/status/market quality and budgets. No worldwide coverage or enabled competition is inferred from Mega endpoint access. §§1, 6, 14–15; prompt 008. | Unassigned; user decision/evidence required | `GOAL_HINT_COMPETITION_IDS`, `GOAL_HINT_FOOTBALL_TRIAL_REQUEST_LIMIT`; Deferred: competition/season coverage settings | **008** before live trial |
| OP-06 Football/prediction/logo rights | **Evidence required** | Verify public data/prediction redistribution, credential-free remote-image display rights, attribution/reuse restrictions and separate media-host throttling for the expected audience. Private entitlement is not public redistribution permission. §§6, 15; prompt 008. **Paid access (19 October 2026):** also confirm that API-Football's terms allow commercial use, including paid access to its fallback predictions. If paid resale is not allowed, `src/domain/paywall.ts` treats `api-football` families as free or hidden. Blocks paid switch-on (OP-40). | Unassigned; user evidence required | `GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF`; Deferred: source/media rights, approved URL and reuse metadata | **008**; public use remains blocked; paid access **061**, switch-on **067** |
| OP-07 Football freshness and unknown times | **Unresolved / evidence required** | Trial-backed source-specific fallback freshness, supported family coverage, pre-match availability and acceptance of unknown provider update/generation times are missing. Unknown remains unknown; retrieval time cannot substitute silently. Require independently verified regulation-score/status mappings and document any validated BTTS derivation. §§6–7, 15; prompts 008/013. | Unassigned; user decision/evidence required | `GOAL_HINT_FRESHNESS_POLICY_REF`, `GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF`; Deferred: supported fallback derivations/coverage and unknown-timestamp eligibility rules | **008**; fallback consumes proof **013** |
| OP-08 Structured source retention | **Unresolved** | Define permission-compatible retention/reuse of normalized/raw structured provider responses and attribution records before persistent catalog caching/import. Private evidence use needs its applicable rights; public display/redistribution needs public rights. Preserve required forecast/audit history; do not invent an unlimited retention entitlement. §§6, 10, 13, 15; prompt 009. | Unassigned; user decision/evidence required | `GOAL_HINT_FOOTBALL_PRIVATE_USE_REF`, `GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF` according to use; Deferred: structured-source retention/reuse policy | **009**; backup application **045** |
| OP-09 AI spending policy | **Unresolved** | Approve a separate AI monthly cap, provider/model rate versions, billed units, currency/accounting-period conversions and conservative reservations/retry/unknown-usage reconciliation. A missing cap or unpriced call is not free work. §§7, 14–15; prompt 010. | Unassigned; user decision/evidence required | `GOAL_HINT_AI_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_AI_PROVIDER`, `GOAL_HINT_AI_MODEL`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: versioned billing/rates and per-job monetary cap | **010** before paid AI dispatch |
| OP-10 Research spending policy | **Unresolved** | Approve the independent research/search cap, selected service's rate/unit/currency/accounting rules and conservative reconciliation, including retries. Do not borrow AI or football allowances. §§6–7, 14–15; prompt 010. | Unassigned; user decision/evidence required | `GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_RESEARCH_PROVIDER`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: versioned research rates and per-job monetary cap | **010** before paid research dispatch |
| OP-11 Per-job operating bounds | **Unresolved** | Set request/token/time ceilings and a usable time/quota reserve for fallback; document per-provider allocation and cost handling. Counts and monetary caps are different controls. No timeout, token budget or free allowance is approved by the specification. §§7, 11, 14; prompt 010. | Unassigned; user decision/evidence required | `GOAL_HINT_JOB_REQUEST_LIMIT`, `GOAL_HINT_JOB_TOKEN_LIMIT`, `GOAL_HINT_JOB_TIMEOUT_SECONDS`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: fallback time/quota reservation and per-service allocation | **010**; orchestration **025** |
| OP-12 Infrastructure budgets | **Unresolved** | Approve itemized caps/cost accounting for database, queue/workers/web hosting, network egress, monitoring and domain renewal. Production database and shadow/publication require an explicit infrastructure cap and verified approval; an explicitly approved zero may cover deliberate free infrastructure, while unset is unresolved. The aggregate cap is not approval to provision a service or assume its rate; later features must itemize applicable rates/caps. These remain separate from AI, research and the API-Football payable cap. §§14–15. | Unassigned; user decision/evidence required | `GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS`, `GOAL_HINT_BUDGET_APPROVAL_REF`; Deferred: itemized database/hosting/network/monitoring/domain budgets and contracted rates | **003** live database; **007** billable egress; **020** queue/workers; **031** paid cache; **044** monitoring; **046** web hosting; **049** domain renewal |
| OP-13 Licensed research and source permissions | **Unresolved; integration boundary implemented** | Select the actual licensed search/news service and permitted official sources; provide credentials, attribution/extraction/reuse/display terms and archive retention permissions. The 011 bridge requires a reviewed concrete provider binding; none is selected or implemented. Football data access does not license articles. §§6–7, 15. | User decision/evidence required | `GOAL_HINT_RESEARCH_ENABLED`, `GOAL_HINT_RESEARCH_PROVIDER`, `RESEARCH_API_KEY`, `GOAL_HINT_RESEARCH_LICENSE_REF`; immutable source metadata, trusted reuse verifier and approved-host fetch policy | **011 pending actual adapter**; pricing prerequisite **010** |
| OP-14 Evidence coverage/conflicts | **Unresolved; strict policy contract implemented** | Approve per-team minimum history/form/statistics, venue/rest/news requirements, source freshness bounds and clock basis, preserve/fail-coverage conflicts and exclude/allow-flagged unknown timestamps before live use. Source/cutoff/rights checks and missing-news labels are implemented, with no operating defaults. §§6–8, 15. | User decision/evidence required | `GOAL_HINT_EVIDENCE_POLICY_REF`, `GOAL_HINT_FRESHNESS_POLICY_REF`; explicit versioned `EvidencePolicy` and trusted verification | **011 pending approved rules** |
| OP-15 AI predictor and calibration configuration | **Local registry implemented; actual selection unresolved** | Select the approved provider, exact model/version and calibration configuration with applicable training/calibration windows and provenance. Local prompt/schema contracts are `regulation-ai-prompt-v1` / `regulation-ai-output-v1`; the immutable registry pins them per invocation/job. Implement the selected provider transport and verify its current structured API and rates. A configured artifact or successful call cannot establish calibration quality; unvalidated output stays provisional. §§7–8, 15; prompt 012 and [predictor runbook](ai-predictor.md). | Unassigned; user decision/evidence required | `GOAL_HINT_AI_ENABLED`, `AI_API_KEY`, `GOAL_HINT_AI_PROVIDER`, `GOAL_HINT_AI_MODEL`, `GOAL_HINT_CALIBRATION_REF`; implemented: immutable model/prompt/schema/calibration registry; pending: actual API/rates, calibration artifacts and model/evaluation proof | **012** incomplete; rate selection **010**, evaluation **014** |
| OP-16 Evaluation protocol and samples | **Unresolved** | Freeze chronological training/validation/calibration/final-test periods, matched fixtures/horizons, reconstructable baselines, minimum samples, quality/coverage gates and calibration aggregation before the final test. Historical comparisons require genuine pre-cutoff snapshots; otherwise plan prospective observations. §§8, 14–15; prompt 014. | Unassigned; user decision/evidence required | `GOAL_HINT_SHADOW_PROTOCOL_REF`; Deferred: versioned evaluation cohorts, samples, baselines, metrics and release thresholds | **014**; actual prospective evidence **047** |
| OP-17 Public performance-claim gates | **Unresolved / evidence required** | Define minimum market/source/horizon samples and permitted claims, then gather sufficient independent evidence. No fixed accuracy promise is approved. Below-threshold public metrics must show insufficient data/provisional status. §§8, 15; prompts 014/030/038. | Unassigned; user decision/evidence required | `GOAL_HINT_QUALITY_QUALIFICATION_REF`; Deferred: public-claim minimum samples and qualification results | **014** defines gates; public consumers **030/038** |
| OP-18 Bounded shadow authorization | **Unresolved / evidence required** | Approve a private bounded protocol, maximum jobs/spend and evidence locations after applicable private provider/evidence-use rights, account, independent budgets and pipeline-integrity checks pass. Public redistribution/logo-display rights are required for public use, not isolated private shadow evidence collection. Candidate quality may remain unqualified while shadow gathers evidence. Shadow cannot publish production forecasts or declare qualification; a trusted verifier must validate applicable recorded evidence. Prompt 002, index gate and prompt 047. | Unassigned; user decision/evidence required | `GOAL_HINT_OPERATION_SCOPE=shadow`, `GOAL_HINT_SHADOW_MAX_JOBS`, `GOAL_HINT_SHADOW_BUDGET_USD_CENTS`, `GOAL_HINT_SHADOW_PROTOCOL_REF`, `GOAL_HINT_PIPELINE_INTEGRITY_REF`; private provider/account, independent infrastructure/AI/research budgets and evidence/freshness/calibration prerequisites also apply | **014** prospective protocol; execution **047** after pipeline checks |
| OP-19 Durable queue, worker runtime and private identity | **Local implementation complete; deployment unresolved** | 020 implements/test-harnesses MySQL-backed durable delivery, native Node 24 `.ts`/`react-server` execution, typed registry, renewable fenced leases, bounded retries and a fail-closed private identity adapter. Approve the deployed queue/hosting, actual service/workload identity and operator ownership; qualify representative capacity and workload-specific lease/timeout/retry/concurrency/fallback settings. No managed subscription, deployment approval or continuous poller is inferred. §§9, 11, 13–15. | Unassigned; user decision/evidence required for deployment | Trusted worker/trigger bindings; Deferred: approved queue/worker hosting, actual identity and measured capacity; existing per-job limits and itemized infrastructure approval still apply | **020 local implementation**; hosted qualification **046**, poller **026** |
| OP-20 Selection eligibility and degraded finalization | **Local implementation complete; live choices unresolved** | 021 implements immutable manifests, complete-date retries, explicit verified degraded actions, partial coverage, fenced recovery and recorded closed-cycle eligibility inputs. Approve trial-backed competition/status eligibility and a degradation policy/action authority before the affected live path runs. A committed subset cannot be filled in later or treated as authoritative emptiness. §§5, 11, 15. | Unassigned; user decision/evidence required for live choices | `GOAL_HINT_COMPETITION_IDS`, `GOAL_HINT_EVIDENCE_POLICY_REF`; implemented: versioned selection policy/authority, immutable manifest and recorded action; pending: approved competition/eligibility evidence and degraded-finalization policy | **021 local implementation**; live decisions remain pending |
| OP-21 Publication-status freshness | **Local contract implemented; live decisions unresolved** | 022 requires an approved original-observation age, source-specific clock/unknown-time rules, trusted authority and transactional rechecks; older evidence cannot override a newer canonical observation. Verified play persists a publication barrier. Actual trial-backed timing/conflict decisions remain missing. §§5, 7, 15. | Unassigned; user decision/evidence required for live acceptance | `GOAL_HINT_FRESHNESS_POLICY_REF`, `GOAL_HINT_EVIDENCE_POLICY_REF`; implemented: explicit publication policy/authority; pending: approved observation/source timing and bindings | **022 local implementation**; trial evidence **008**, locking/lifecycle **023–024** |
| OP-22 Polling horizons and approach threshold | **Unresolved** | Choose approaching-kickoff lead time, active/result window, unresolved-result horizon and progressively slower correction checks with bounded stopping/review rules. Preserve visible unresolved fixtures after midnight/outside the prediction window. §§5, 11, 15; prompt 026. | Unassigned; user decision/evidence required | `GOAL_HINT_FRESHNESS_POLICY_REF`; Deferred: poller approach thresholds, unresolved/correction horizons/cadences | **026** |
| OP-23 Public query/search limits | **Initial implementation settled** | 028 reuses the URL validator: 30 default/100 maximum cards, seven-day ranges, page cap 10,000, 2 KiB query/1 MiB JSON bounds. Nonempty searches share an atomic MySQL UTC budget of 120/minute across replicas, retaining no visitor identity or search text. Genuine MySQL burst acceptance verifies the bound; tune against production workload evidence without treating synthetic tests as capacity approval. | Implemented in 028; operator owns later tuning | [Match feed contract](match-feed-api.md) | **028** |
| OP-24 Shared cache strategy and lifetimes | **Local implementation complete; hosted qualification pending** | 031 reuses MySQL: five-second mutable envelopes, six-hour immutable revision payloads capped by source permissions, EAT rollover, transactional tag generations and durable receipt recovery. Hits preserve source clocks/versions; failures use bounded stored reads. See [cache policy](public-response-cache.md). Actual trigger/binlog capabilities, maintenance and capacity/cost evidence remain OP-01/12/19/32 gates. §§11, 13. | Implementation settled; operator owns hosted qualification | No new subscription; existing database authorization and per-table grants; private cache maintenance | **031 local implementation**; hosted measurement **046/047** |
| OP-25 Correction/dispute ownership and public process | **Unresolved release blocker** | The audited correction mechanics are settled; assign the actual correction/dispute owner, intake/review process, supporting-evidence rules and factual public statements. Do not promise an unapproved response time or operational policy. The user explicitly deferred these facts during 038; terms retain that gate. §§8, 12–15; prompts 038/040. | Unassigned; user decision/evidence required | Deferred: correction/dispute owner and public process policy | **038**; intake/legal consumers **040–041** |
| OP-26 Analytics and visitor/log retention | **Current implementation retained; unresolved facts block release** | Inventory actual log/search/browser-preference/remote-image data flows; choose whether analytics is used, its providers/purposes/recipients/retention and applicable consent/data-handling requirements before enabling tracking. Ads stay disabled. Retention must match actual configuration and permissions. §§12–13, 15; prompts 039/044. **Paid access (19 October 2026):** also covers member data: phone numbers, member sessions, payer numbers, payment screenshots, throttle records and owner audit rows. Decide PDPO registration under the Data Protection and Privacy Act 2019, retention of payment records, payer numbers and audit rows (for example the tax-record period), cross-border processing including WhatsApp/Meta and the hosting country, and a breach procedure. Until then payment metadata, codes and audit rows are kept with no purge or DELETE grant, and the privacy notice carries the `data-protection` blocker. Blocks paid switch-on (OP-40). | Unassigned; user decision/evidence required | Deferred: analytics enablement/provider, visitor/telemetry/log retention and privacy data-flow policy | **039** notice facts; telemetry activation **044**; member data **058/063/065**, copy **066** |
| OP-27 Operator identity, jurisdiction and legal facts | **Unresolved release blocker** | Obtain actual operator identity, audience/jurisdiction, lawful contact and owner-approved privacy/terms/dispute facts. “Prepared for” attribution supplies no legal identity, address, liability policy or signoff. Do not publish placeholders or invented legal assertions. §§13, 15; prompts 039–040. **Paid access (19 October 2026):** also decide the jurisdiction and governing law for paid subscriptions and whether selling football tips needs a licence under Ugandan gaming rules. Blocks paid switch-on (OP-40). | Unassigned; user decision/evidence required | Deferred: approved operator/legal/privacy/terms content and factual evidence | **039**; terms **040**; paid terms **066** |
| OP-28 Verified public contact route | **Unresolved release blocker; unavailable page implemented** | Supply a verified owner-approved public email or established destination, publication-approved operator details and correction recipient. Existing owner deferrals persist; 041 displays unavailable status and report guidance, not an operational intake. No mailbox creation, test message, form backend or response commitment is authorized by the plan. §15; prompts 039/041. | Unassigned; user decision/evidence required | Deferred: public contact destination and correction recipient/content | **039** lawful notice contact; contact page **041** |
| OP-29 Recovery watchdog ownership and thresholds | **Unresolved / live activation blocked** | Assign recovery/incident responsibility and approved detection/lease-staleness/stalled-job/missed-run/missing-lock thresholds, repair authority and independent scheduler-failure route. Prompt 043 implements private CLI inspection, reviewed durable recovery and an operator runbook; synthetic settings do not approve live thresholds. Recovery may not bypass cutoff, immutable manifests, budgets or quota. §§11, 13, 15. | Unassigned; user decision/evidence required | Deferred: watchdog thresholds, repair authorization, independent invocation frequency and recovery/incident owner | **043** |
| OP-30 Alerts, destinations and monitoring service | **Local verification only; live activation blocked by owner decision** | Prompt 044 implements authenticated private aggregate inspection, bounded MySQL alert state/fenced delivery and a local test sink. The owner explicitly keeps incident ownership, destinations, thresholds and retention unresolved. Approve the authorized monitoring service, actual outage/staleness/latency/quota/cost/expiry thresholds, recipients, privacy/retention and independent supervision before live activation; no external test message is authorized. §§11, 13–15. | Unassigned; user decision/evidence required | Deferred: monitoring provider, alert thresholds/destinations, telemetry retention and runbook ownership; infrastructure budget; see `docs/operations-monitoring.md` | **044** |
| OP-31 Recovery objectives, backups and history retention | **Local verification only; live recovery blocked by owner decision** | For 045 the owner explicitly keeps ownership, RPO/RTO, retention and hosted storage/PITR unresolved. Implement encrypted private snapshots, isolated restoration/log replay, integrity/access and conservative worker/quota acceptance locally. No live schedule, production restore, deletion period, approved objective or hosted DR proof is inferred. See `docs/backup-restore.md`. §§13, 15. **Paid access (19 October 2026):** backups and restores must cover payment submissions, access codes, settings and audit rows; screenshots copied into backups persist until those backups expire. Take and verify a private backup before applying the paid-access overlay. A production backup schedule and retention covering the new tables blocks paid switch-on (OP-40). **058 (19 October 2026):** the snapshot inventory covers the 90 tables, but local restore verification fails; a stale table count had hidden this. The append-only triggers of `20261012153531_goal_market_extension` end with `;`, so the mysqldump output does not import (ERROR 1064). Until a reviewed forward migration recreates them (owner approval pending), no backup counts as verified, including the one the paid-access overlay needs first. | Unassigned; user decision/evidence required for live recovery | Deferred: approved RPO/RTO, backup/PITR hosting, key escrow/access, snapshot/archive cadence and per-class source/history/backup retention | **045 local scope**; hosted proof **046/048**; source permissions **009/011**, visitor notice **039**; paid-access tables **058**, switch-on **067** |
| OP-32 Hosted deployment and account isolation | **Unresolved / evidence required** | Confirm actual web/database/queue/long-lived worker/poller infrastructure, scheduler/workload identity and authorized access. Choose account sharing vs genuinely separate provider accounts, durable cross-environment limits and poller observation/ownership transfer. Separate databases cannot create extra provider capacity. §§9, 11, 14–15; prompt 046. | Unassigned; user decision/evidence required | `GOAL_HINT_OPERATION_SCOPE`, infrastructure/provider/budget references; Deferred: environment isolation, hosted runtime and poller ownership plan | **046**; database/queue choices earlier **003/020** |
| OP-33 Quality qualification and measured commitments | **Evidence required** | Accumulate real prospective samples under the frozen protocol; prove market/source/horizon quality and coverage, calibrated-claim eligibility, full-slate cost/capacity and cadence/latency targets. Simulated load is not elapsed shadow observation or unapproved paid-call authority. §§8, 14–15; prompt 047. | Unassigned; user evidence/commitment decision required | `GOAL_HINT_QUALITY_QUALIFICATION_REF`, `GOAL_HINT_SHADOW_PROTOCOL_REF`; Deferred: qualification report and approved measurement-supported commitments | **047**, with protocol choices fixed **014** |
| OP-34 Release decision and signoff | **Unresolved / evidence required** | Assign production release authority and record actual go/no-go evidence tied to build/configuration. All required rights/account/budget/quality/recovery/monitoring/legal gates must pass; an environment reference cannot substitute for missing evidence or owner approval. §§14–15; prompt 048. | Unassigned; user decision/evidence required | `GOAL_HINT_RELEASE_APPROVAL_REF`, `GOAL_HINT_QUALITY_QUALIFICATION_REF`, `GOAL_HINT_OPERATION_SCOPE=production`; Deferred: release owner and readiness report | **048** |
| OP-35 Domain and production operation | **Evidence required** | Verify authorized domain registration/DNS/HTTPS/canonical redirects, current payable/account/budget state, deployment access and approved release/rollback/observation ownership. No purchase, deployment, production URL or successful scheduler run is established by the specification. §§12, 14–15; prompt 049. | Unassigned; user decision/evidence required | Public canonical origin remains fixed; server production scope/release references; Deferred: authorized domain/DNS/deployment and rollback evidence | **049** |
| OP-36 Odds display rights and odds operation | **Owner decisions recorded 10 October 2026; display rights and trial evidence required** | Public bookmaker prices, the `odds=` filter and market-implied probabilities need recorded evidence that the API-Football/API-Sports terms permit public display of odds (and, separately, bookmaker names or logos), plus the operator jurisdiction's gambling-advertising rules (OP-27). Until then odds are imported and kept privately, `publicPolicy.features.providerOdds` stays false, the public projection stays empty and `odds=` is an unknown key. The owner accepted the technical defaults: one documented bookmaker, `proportional-v1` de-margin per complete group, `DECIMAL(10,4)` with half-up hundredths, a 1.01–1000.00 range with a "20.00+" top stop, 12-hour freshness with write-time staleness and a frozen closing price, and normalized-only retention to kickoff + 30 days. Still open: the counted odds trial (needs the plan upgrade), the bookmaker id it selects, confirmation that the private-use reference covers odds history, and the rights evidence. No betting, bet slips, affiliate or bookmaker links are ever in scope. §§1, 6, 11, 14–15; prompt 052. **Paid access (19 October 2026):** when `providerOdds` is on, bookmaker prices, the `odds=` filter and market-implied probabilities are subscriber-only for unfinished fixtures; free viewers get `subscription-required` for `odds=`. | Owner (decisions recorded); evidence required | `GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF` (`football-odds-rights`), `GOAL_HINT_ODDS_IMPORT_ENABLED`, `GOAL_HINT_ODDS_BOOKMAKER_ID`, `publicPolicy.features.providerOdds` | **052**; gating **061** |
| OP-37 Paid-access scope and free/paid split | **Owner approved 19 October 2026 (spec v1.9); split confirmation pending** | Paid access adds phone-number accounts, manual mobile-money payment reports, owner-approved access codes bound to the paying account and a private `/admin` dashboard, behind `paywallMode` (`off` by default, `test`, `on`). Free: fixtures, scores, live clock, search, factual insights, which families have a published pick, performance aggregates, and finished, canceled and awarded fixtures (picks, outcomes, analysis, history). Subscriber-only for unfinished fixtures (scheduled, live, postponed, abandoned, unknown): picks, probabilities, alternatives, prices, AI analysis, revision history, slip results and probability filters and sort. The owner still confirms the split for finished, canceled and awarded fixtures (plan §§4, 12). It also removes unfinished-fixture picks from the reuse licence in `terms.use.body`, reversing the 12 October 2026 decision recorded in [terms-page.md](terms-page.md). Supersedes the Settled "Access and product scope" row. Spec §§1–3, 12, 15; [monetization plan](../prompts/monetization.md) §§3–4. | Owner (scope approved); split confirmation required | `paywallMode` (058); `src/domain/paywall.ts` (061); `publicPolicy.access` → `free-with-subscriber-predictions` (061); `terms.use.body` (066) | **061**; copy **066** |
| OP-38 Plans, prices and payment channels | **Plans decided 19 October 2026; payment channels pending** | Plans (owner, 19 October 2026): Daily, 24 hours from activation, UGX 1,000; Weekly, 7 days, UGX 5,000; Monthly, 30 days, UGX 20,000. Every plan gives full access to every feature and section; plans differ only in length and price, so there are no feature tiers. A day is 24 hours from activation (payment confirmation), never a calendar day or midnight EAT. Free trial (owner, 19 October 2026): a new number (no code ever) can ask once for 2 days (48 hours) free; the owner sends it as a `trial` code, which starts when sent and is never revenue. Access runs from payment confirmation (the owner's approval, or the owner creating a manual or number-change code), or from the end of the current period, to the expiry time; code entry only unlocks a device, and a code entered late gets no extra time. Payments are whole UGX to the owner's Ugandan MTN MoMo and Airtel Money numbers; accounts accept any country code as canonical digits (`256` numbers must be `2567` + 8 digits). Received 19 October 2026: the MTN MoMo number `256783230321`, which is also the contact (calls) and WhatsApp number; the owner enters it in Settings. Still needed: the MTN registered name; an Airtel Money number and name if Airtel is offered (until then the Airtel card stays hidden); the typical review time and any extra payment note; whether each network's send-money menu accepts `256…` or needs `07…` (the copy format); the tested menu shortcuts; each network's prefixes in full; and at least three real anonymized SMS samples per network (payer "sent" and owner "received") plus anonymized screenshot samples. Plan §12. **058 (19 October 2026):** the Plans and Settings pages are built; the owner enters the plans, numbers, names and shortcuts there (nothing is seeded). `networkPrefixes` ships empty, so no number pre-picks a network until the owner confirms each network's prefixes; that input keeps 058 ◐ Partial. | Owner | Dashboard plans and settings (058); `networkForPrefix` (058); `tests/fixtures/payment-sms/` (063) | **058**; SMS fixtures **063**, blocker at **067** |
| OP-39 Refunds, extensions, reversals and consumer duties | **Unresolved; blocks paid switch-on** | Decide the refund, extension, reversal and outage-compensation policy, including what happens when a payment was approved for the wrong account, and confirm Electronic Transactions Act 2011 disclosure and cooling-off duties. The app has no in-app refunds; the owner's tools are Extend, Reverse (`network-reversal`, `wrong-account`) and manual codes. Until resolved, the privacy and terms notices carry the `payments` and `refunds` blockers, so `on` stays refused. Plan §§5.3, 7, 12. | Owner; legal review required | Terms copy and `termsNotice` / `privacyNotice` blockers (066) | Owner tools **060/064**; copy **066** |
| OP-40 Paid launch approval | **Unresolved; blocks `paywallMode = on`** | Switching paid access on needs the owner's approval and date; privacy and terms release-ready and effective; the plan §12 legal confirmations (PDPO registration, cross-border basis and breach procedure, any tipping licence, API-Football's terms for paid access, Electronic Transactions Act 2011 duties, 18+ and personal non-transferable use); the host checks of plan §10; and decisions on OP-06, OP-08, OP-17, OP-26, OP-27, OP-31, OP-34 and OP-36. Building, local tests and `test` mode do not need it. Nothing is deployed to production unless the owner explicitly asks. | Owner | `paywallMode` (058); `scripts/verify-production-paywall.py` (067) | **067** |

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

## 004 — Shared EAT calendar values and temporal decisions

**Decision date:** 8 October 2026. **Status:** implemented for prompt 004.

Use a browser-safe domain module for Gregorian reporting-date strings and integer
UTC epoch milliseconds. Validate dates before arithmetic instead of allowing
JavaScript Date to normalize invalid input. Reporting years are `0001–9999`;
increments and seven-day windows that exceed those years fail. Millisecond
instants use the JavaScript Date range; persistence adapters retain responsibility
for MySQL's narrower `DATETIME(3)` range. Copy mutable Date inputs into primitives
and freeze run/query window objects so original boundaries cannot be rewritten.

Derive reporting days with an explicit `Africa/Kampala`, Gregorian calendar and
Latin digits using the
[ECMAScript Intl contract](https://tc39.es/ecma402/#sec-intl.datetimeformat).
Resolve day starts by a bounded millisecond search over named-zone reporting
dates, preserving historical offset/day-length changes without assuming UTC+03
for every archive date. Current EAT scheduling remains the settled 00:00 trigger
and `0 21 * * *` UTC cron. Extract existing calendar operating constants into
the shared module; the server runtime policy references the same frozen object.

Require an injected clock for current decisions and capture it exactly once.
Expose temporal eligibility requiring original-manifest membership, original
window membership, current rolling-window membership and strict cutoff. An
explicit earlier closing instant can only reduce the standard kickoff-minus-
five-minute deadline. Trusted status/start evidence, persisted manifest and cycle
identity, run ordering and transaction enforcement remain with prompts 019–025.

Historical query validation requires two inclusive dates and a caller-supplied
finite maximum day count. It does not apply the forward prediction window or
invent a product archive limit. Public query services in 028/030 own their caps.
Visitor display returns locale-neutral `Intl` inputs with a validated explicit
timezone; its optional local date never feeds reporting identity or eligibility.
See the [shared API and scheduling contract](calendar.md) and actual verification
in [development progress](development-progress.md).

## 005 — Versioned regulation-time markets

**Decision date:** 8 October 2026. **Status:** implemented for prompt 005.

The user explicitly selected probability sum tolerance `0.001` and consistency
tolerance `0.002` in this chat. They are probability units, respectively 0.1 and
0.2 percentage points. These approved defaults belong to
`regulation-markets-v1`; runtime settings may repeat the same values but cannot
silently override them. Production rights, evidence, freshness, calibration and
release gates remain independent. OP-02 is resolved for this version.

Use immutable, language-neutral contracts for the four source-owned market
families, regulation including stoppage time, stable selection codes and exact
specification tie order. Validate complete finite strictly interior probabilities
with exact decimal comparisons over their canonical JavaScript number strings.
Equality at approved tolerances passes without an arbitrary floating-point
epsilon. Never normalize accepted probabilities, infer missing complements,
convert odds implicitly, use verbal confidence as event probability or average
sources. Reject nonrepresentable derived double-chance boundaries atomically
with the parent match-result group.

For draw `D`, over-2.5 `O` and BTTS Yes `B`, enforce `B <= D + O` and
`D + O <= 1 + B`, each extended only by the approved consistency tolerance.
BTTS with under 2.5 implies a 1–1 draw; a draw with over 2.5 requires BTTS. These
are the feasible-marginal constraints available without inventing a score
distribution. No pair alone justifies an extra relationship.

The deterministic conflict policy preserves AI ahead of conflicting fallback:
omit all fallback source groups participating in a violated three-group check.
When all participants share one source, omit all jointly inconsistent groups;
do not invent a preference among market families. Omit match result and its
derived double chance together. Preserve unavailable states and related-group/
constraint reasons. Selecting/fetching replacement candidates, validating
fixture/cycle identity and provenance, and retaining old forecasts belong to
007–013/019–025, not this pure validator.

Tag probability presentation separately as `probability-display-v1`. Allocate
exclusive groups to 100 integer percentage points using exact largest remainders
and specification tie order; quotas adjust display only, not stored values or
chosen picks. Round overlapping double-chance alternatives independently.
Boundary-label and Estimated probability keys remain separate from UI language.

Adjudicate one selected pick only after an eligible final context and separately
verified regulation score. Live/nonfinal/missing or invalid scores stay pending;
ineligible cycles and postponed/canceled/abandoned/awarded games are void; absent
or unsupported picks are unavailable. Extra-time/shootout final totals cannot
replace regulation evidence. Persistence, locks, corrections and headline
aggregation remain with their owning later prompts. Exact score stays disabled.

See the [market API contract](markets.md) for input/output shapes, precedence and
later responsibilities, and [development progress](development-progress.md) for
actual validation results. No models/migrations or dependencies were changed.

## 006 — Durable account-wide API-Football quotas

**Decision date:** 8 October 2026. **Status:** local implementation and isolated
database verification; actual account/reset evidence remains OP-03/008.

Use one stable canonical account hash and one shared MySQL/InnoDB account row
across environments, tools, trials, replicas and workers. Hash account identity
independently of credential rotation. Serialize reservation and state changes
under that row lock with the existing bounded database transactions. MySQL UTC
time governs quota decisions; clock regression, corrupt state, connection errors
and lock failures pause outbound work. Retain period and attempted-request rows
through restart. Application callers cannot reset allowance by reinitializing.

The lower active limits apply against the source-owned 12/rolling second,
720/rolling minute and 120,000/provider-day caps. Even pacing uses the ceiling of
the stricter per-second/per-minute interval (84 ms under default terms). Protect
20,000 of the daily ceiling for results/cutoff safety, recovery and near-kickoff
fallback. Live/date sync, daily inputs and enrichment cannot consume the reserve.
Imported unknown prior spending is conservatively ordinary usage. Existing
verified-period refreshes may tighten terms, remaining allowance and expiry;
neither higher observations nor reset confirmation undo lower terms learned from
a probe. A separate trusted account-change process owns any eventual increase.

Each attempt commits its count before I/O and obtains a single-use launch claim.
Reservations remain spent on uncertainty, crash, expired permits and failures.
Each retry gets a new attempt ID. Queued/in-flight work hashes deduplicate under
the account lock; an urgent consumer can promote queued work without a second
dispatch. Observable priority ordering, lease fencing, deadline expiry and
remaining-lease transport bounds prevent queue or retry bypasses. The gateway
checks existing runtime/evidence authority around asynchronous coordination and
checks monotonic elapsed time immediately before I/O. No transport, automatic
retry, pagination or provider-specific mapping is implemented by the limiter.
Permit freshness is bounded separately to one second (or a shorter lease), so
durable commits need not fit inside the 84 ms pacing interval. Actual MySQL-clock
gateway validation verifies that the guarded callback can execute under this
bound; expired permits remain spent and cannot be replayed.

Daily/minute header floors subtract later reservations and unresolved earlier
attempts; late responses never restore spent allowance. Daily floors persist for
the verified period. Minute observations constrain a conservative trailing minute
from receipt and carry across provider-day boundaries. Late old-period minute
observations can tighten the active period without changing its daily allowance.
Honor normalized retry delays; a 429/body rate-limit error with no
usable delay pauses for a local conservative 60 seconds. Credential and
subscription failures pause the entire account with redacted structured reasons.
Stored reads remain available to callers when outbound state is unavailable.

The provider's [rate-limit article](https://www.api-football.com/news/post/how-ratelimit-works)
(read 8 October 2026; published 12 June 2026) documents daily/minute headers,
account/IP protections, smoothing and 429 handling. Its published Mega rate is
900/minute and 15/second; the application deliberately retains its stricter caps.
This document does not verify the current account, payable total, expiry or actual
daily reset boundary/protocol. No boundary is inferred from EAT reporting days.

At a trusted candidate boundary permit only one counted, paced probe. Bulk work
remains paused until that exact probe succeeds and trusted evidence confirms the
new provider period. Preserve the probe count, lower observed terms/floors and all
old counters. Stale responses, larger headers, restart, uncertainty and candidate
timestamps alone cannot activate capacity. Missed boundaries, failed probes,
account renewal and upgrades require operator reconciliation; do not invent
automatic recovery behavior before the authorized provider trial establishes it.

Migration `20261008182528_api_quota_limiter` adds the account, period and attempted
request tables with indexed rolling/priority/sequence projections and account
foreign keys. The original foundation migration remains unchanged. No new
dependencies or public UI are introduced. See the [quota contract](quota-limiter.md)
for the 007 gateway handoff and [development progress](development-progress.md)
for actual genuine-MySQL concurrency checks. All account/period/reset fixtures in
those checks are synthetic; they are not confirmed live subscription evidence.

## 007 — Protected direct-v3 API-Football adapter

**Decision date:** 8 October 2026. **Status:** implemented locally; account,
coverage and rights qualification remain pending prompt 008.

Use one server-only direct provider boundary, fixed to
`https://v3.football.api-sports.io` and the `x-apisports-key` header. Typed endpoint
operations route every HTTP attempt, including retries, through the existing
counted, single-use quota gateway. Credentials and provider diagnostics never
enter URLs, results, logs or caches. Redirects and framework HTTP caching are
disabled. Caller-supplied request/page/row/byte/time/retry bounds remain explicit;
OP-11 job/fallback allowances are not invented by this adapter.

### Official contract evidence and pagination

The [official beginner guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
(published 13 March 2026; read 8 October 2026) describes the direct origin,
authentication header, endpoint envelopes and selected operations. Its fixture
example returns a season's fixtures in one response; `/fixtures` has no invented
`page` loop. Bound a large fixture selection by supported date/range/round
queries and explicit response limits. The guide documents `/players` with a
`page` parameter and 20 players per page; only that implemented endpoint follows
a page loop. Unexpected pages, short intermediate player pages, changing totals,
duplicate identities and exhausted caller bounds produce incomplete results.
This resolves the prompt's general mention of paginated fixtures by following
its explicit requirement to use each endpoint's actual contract.

The [official fixture-ID tutorial](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league)
(published 12 December 2024; read 8 October 2026) describes hyphen-separated IDs,
at most 20 per request. Actual batch support still requires a trusted verifier
of supplied evidence; unverified support uses individually reserved `id` queries.
Missing requested IDs remain explicit. League/season coverage is independently
reported; the [provider's coverage guidance](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)
does not equate a coverage flag or endpoint access with populated fixture fields.

The [official rate-limit article](https://www.api-football.com/news/post/how-ratelimit-works)
(published 12 June 2026; read 8 October 2026) documents daily/minute headers,
body-level rate-limit errors, 429 behavior and account/IP protections. Missing or
malformed numeric headers remain unknown. Honor a valid `Retry-After` duration
or HTTP date; otherwise use caller-bounded exponential backoff with jitter. A
server delay longer than the job deadline stops work instead of being truncated.
Known HTTP 401/429 and 499/server failures have distinct handling; ambiguous
403/access errors do not automatically establish subscription expiry.

The [interactive v3 reference](https://www.api-football.com/documentation-v3)
did not expose readable endpoint schemas in this session. The accessible
official guides above support the selected contract; the attempted public schema
download was blocked. No full-current-schema or live-contract validation is
claimed. The adapter contract version records the reviewed examples' date.

### Data, cache and safety decisions

Validate the envelope's endpoint, echoed selectors, counts and actual paging
shape. Correlate fixture IDs, team assignment, competition/season, date/range and
round with the requested scope. Reject unrelated or duplicate observations;
preserve individually identified player competition aggregates without summing
across competitions. Empty enrichment, missing fields and unknown status values
stay unknown. Retrieval completeness and field coverage are separate result
metadata: an empty injury response cannot establish a healthy squad.

Every received response retains its original retrieval time independently of
provider update time. The reviewed shapes establish no per-entity update field,
so `providerUpdatedAt` remains null; kickoff timestamps and cache hits never
substitute for it. Failed HTTP observations retain timestamps and quota metadata
without response data or invented page counts. Live disappearance cannot create
a final result. Only separate `score.fulltime` fields in FT/AET/PEN records create
regulation candidates, and they remain unverified until a trusted verifier
approves the exact fixture/status/score. Extra-time/shootout aggregates cannot
fill a missing regulation score; FT totals must agree when both are supplied.

Structured process-local LRU caching requires trusted approval of actual data,
purpose, retrieval time and caller-supplied age before insertion and reuse.
Admission waits for complete operation/correlation checks; partial/failed
responses do not populate it. Preserve original times on cache hits. In-flight
duplicates share one safe dispatch within each caller's deadline; durable shared
coordination remains with 006. This is not a shared cache backend or an OP-24 TTL
decision. Approved lifetimes must remain compatible with the specification's
15/60-second cadences; shared invalidation/recovery belongs to 031.

Predictions are exposed only through `adapter.fallback`, with job-scoped reuse.
Reported 0–100 percentages, advice and goal thresholds remain provider payload
fields, not validated market probabilities or primary AI evidence. Unsupported
statistics such as unqualified xG remain explicitly unsupported. Approved logos
and player photos are credential-free HTTPS URL metadata, with independent
rights status. Exact URL approval is required; no image request, proxy, binary
storage or persistent image cache is implemented. The
[provider terms](https://www.api-football.com/terms) do not independently clear
third-party display or redistribution rights.

The gateway's new early-observation callback retains already received lower
quota headers and known HTTP failures when a body stalls. It cannot establish
success, accepts no observation after abort/deadline/completion, preserves lower
terms and longer delays across observations/final feedback, and does not expose
data before durable completion. This was verified through both isolated gateway
tests and an actual owned MySQL instance with mocked HTTP.

### Unverified mappings and coverage questions for 008

- OP-03/04: authorized canonical account identity, current direct-plan terms,
  actual daily boundary/reset/expiry and exact authentication/expired-subscription
  body shapes. Key presence, published reset prose and synthetic error fixtures
  are not account evidence.
- Confirm selected query echoes, pagination stability, batch limit/support and
  response-byte behavior on representative real league/cup/low-coverage fixtures.
- Verify every live/final/postponed/abandoned/awarded status, FT/AET/PEN
  `score.fulltime` semantics and per-record update fields if any. Default
  regulation candidates remain unverified until those mappings are qualified.
- Measure populated statistics, player aggregates, lineup/injury completeness,
  xG support and fallback market/percentage freshness per competition/season;
  never infer four-market or squad-fitness coverage from endpoint access.
- Qualify private/public data reuse, prediction storage/display, remote-media
  rights, credential-free URLs and independent media throttling. Keep cache/URL
  verifiers unapproved until applicable evidence is established.
- OP-11/12/24: job and fallback request/time allocations, billable egress,
  approved source-specific freshness and eventual shared cache strategy remain
  with their existing owners. No paid provider call or live trial ran for 007.

See [adapter usage](api-football-adapter.md) and the actual check results in
[development progress](development-progress.md). No database migration,
dependency change, polling, catalog persistence or publication belongs to 007.

## 008 — Bounded provider qualification tool

**Decision date:** 9 October 2026 EAT (8 October UTC). **Status:** local tooling
implemented; actual provider suitability remains incomplete. The reproducible
[offline report](reports/provider-trial-008.md) records zero dispatched requests
and all 34 live requirements untested. OP-03–08 retain their evidence owners and
unresolved decisions; no live account, subscription or permission is approved.

Use `npm run trial:football -- init|report|run` with a private ignored directory.
The [runbook](football-provider-trial.md) describes the versioned plan, evidence
format, trusted authority interface and failure outcomes. Offline generation
does not parse paid-operation policy, connect to MySQL or request provider data.
Live construction requires trial scope, verified runtime/private retention
authority, an approved account/period, selected competition seasons, cumulative
allowance, absolute deadline and explicit operation bounds. No default
competition, request allowance or freshness tolerance is invented.

### Durable requests and qualification boundaries

Hash and persist the whole immutable protocol before collecting observations.
The private journal commits each task's full reservation before I/O and preserves
completed observations. Crash recovery retains the full uncertain reservation
and never replays it. Only a known zero-dispatch quota/shared-work wait can defer
and resume; partial responses that consumed requests remain immutable and keep
their actual charge. Each resume retains the original deadline and cumulative
allowance. A new directory or regenerated report cannot reset account capacity.
All HTTP attempts, including retry/page requests and `/status`, use the existing
MySQL limiter and single-use gateway. The provider's quota-free status description
does not exempt it from the application's counted gateway.

The diagnostic accepts the documented `/status` object response and omitted
paging without fabricating pages. It exposes plan, active state, expiry and
request counters, strips account holder identity, and does not bootstrap a reset
or entitlement from those counters. The current verified provider period must
exist before collection. Published midnight prose cannot activate another day;
period changes still use the shared limiter's verified reset reconciliation.

Reports require source-specific verifiers and exact task/query provenance.
`live-provider`, a URL, an account reference or a successful synthetic response
cannot alone establish authenticity, rights or suitability. Selected competition
seasons constrain sample qualification; incomplete retrieval, absent fields,
unverified records and unsupported markets remain visible. Actual provider
limits are recorded independently of the application's lower 12/second,
720/minute and 120,000/day ceilings. Neither larger headers nor a restart restore
spent requests.

Fallback sampling requires earlier trusted fixture context, matching identity,
scheduled status and an independently known kickoff. The shared five-minute
publication cutoff bounds dispatch. A verified freshness policy must cover both
fixture context and prediction retrieval/source times; missing update time stays
unknown and requires an explicit retrieval-only decision to be eligible. A
qualified regulation-period mapping for complete `predictions.percent` values
uses the existing market validator and derived double chance. Advice, winner
picks and goal-threshold strings cannot establish complementary over/under 2.5
or BTTS probabilities. Regulation score qualification reuses shared settlement
rules and independently verified FT/AET/PEN mappings.

### Published information and outstanding actual evidence

Primary sources reviewed on **8 October 2026 UTC**:

- [Direct pricing](https://www.api-football.com/pricing) advertises Mega at
  US$39/month with 150,000 daily requests. This is not an itemized actual payable
  total; existing authorized account records must reconcile base price, taxes
  and payment charges to at most US$45, with no purchase or renewal.
- [Rate-limit guidance](https://www.api-football.com/news/post/how-ratelimit-works)
  (12 June 2026) describes 900/minute, 15/second and source-IP protections.
  Actual account terms, quota headers, remaining allowance and reset behavior
  still need recorded evidence.
- [Provider terms](https://www.api-football.com/terms) (updated 21 May 2025)
  describe direct-dashboard reset at 00:00 UTC and leave applicable publication
  and third-party permissions with the user. Published prose proves neither an
  active account period nor a redistribution/logo license.
- [Beginner guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
  (13 March 2026) describes percentage fields, indicative update cadence and
  separate media throttling. No complementary totals/BTTS distribution, actual
  source timestamp, freshness entitlement or numeric media limit is inferred.
- The [official v3 reference](https://api-sports.io/documentation/football/v3)
  provides the `/status` object example. Published identity and score semantics
  remain subject to representative recorded tests and independent verification.

OP-05 selected competition IDs/seasons and trial allowance remain unanswered.
No private key, actual account/payable/reset/expiry records, verified retention
and redistribution rights, approved media restrictions or freshness/mapping
authority is configured. No credentialed provider or image request ran. The
offline report confirms no account, coverage, field or market requirement.

Prompt **009** may implement catalog structure using these explicit pending
gates. Live import/reuse and public data/prediction/logo display remain blocked
until their actual evidence passes. AI quality is owned by **014**, and launch
remains independently blocked by the later qualification and release prompts.

## Prompt 009 — Canonical football catalog

The 008 baseline has 34 untested live requirements and zero provider requests.
These schema and import decisions implement the validated 007 contracts locally;
they do not declare real provider identities, score semantics, retention or logo
rights qualified. OP-03–08 remain pending. There is no live catalog authority,
automatic provider import, public endpoint or visitor-triggered work.

### Identity, schema and concurrency

Migration `20261008214325_canonical_football_catalog` adds twelve InnoDB tables
for canonical teams/competitions, provider mappings, aliases, competition
seasons, fixtures, imports, fixture audits, private identity review and a provider
write-lock row. Existing foundation/quota migrations remain intact. Binary
collations preserve exact machine identity; application-normalized NFKC,
lowercase search fields support case-insensitive names/aliases while preserving
accents. A matching name never establishes identity.

Unique provider/external-team and provider/external-fixture keys, unique
competition/season keys and restrict foreign keys protect reusable relationships.
External IDs are positive safe JavaScript integers persisted exactly as unsigned
BIGINT; fixture versions and import sequence remain exact `bigint` values.
Indexed dates/kickoffs, status, season/round, home/away, names, countries and
aliases support later stored-data searches.

Catalog writes acquire the provider row lock before fixture locks, keeping
identity creation and shared metadata/version updates atomic across replicas.
Provider requests occur before locks through the sole 007 adapter and 006 quota
gateway. Only internal transactional work retries genuine deadlock conflicts;
custom coordination and caller-owned transaction callbacks are not replayed.
Reusable transaction callbacks must contain database work only. Later cycle and
schedule services must supply the coordinator and share this lock order.

### Observations, updates and coverage

Input validation binds each normalized row to exact adapter query and original
page provenance. The immutable prepared batch is registered privately and bound
to the validating authority; fabricated objects or another authority cannot
enter persistence. Import IDs bind immutable request/content
fingerprints; completed intent replays return the original audit without another
provider call. Changed content under a persisted ID is rejected.

UTC instants use existing millisecond connection conventions. EAT dates are
derived with 004's `Africa/Kampala` calendar, including historical offsets. MySQL
checks paired kickoff/date nullness; a fixed UTC+3 check would contradict that
calendar. Unsupported DATETIME years and malformed/oversized values fail input
validation rather than being coerced or truncated.

Fresh non-null observations can update reliable fields. Missing names, kickoff,
country, round, scores and unknown status retain known values. Older retrieval
times or known older provider update times cannot replace newer attributes.
Last-known provider update times remain a watermark when a new response omits
them; original null values stay visible in import provenance and never qualify
fallback freshness. Historical attributable aliases may extend search even when
their observation is older than the current name.

Verified regulation scores require the shared 005 settlement rules, exact 007
fixture/status/source-field mapping and independent attributable evidence. Extra
time, shootout and aggregate goals never substitute. A changed status context
invalidates the prior verified score; a missing score within the same confirmed
context preserves it. Approved remote logo strings update shared records;
missing/unapproved replacements retain an approved prior URL, and loss of the
prior URL's approval clears it. No logo body is downloaded, cached or persisted.

Each material fixture or shared name/logo/alias change advances affected fixture
versions atomically, once per import, with unique version audits. Timestamp-only
updates do not advance versions. Shared changes retain normalized old/new fields
and alias additions in the same audit; coordinators receive the actual prior
shared attributes. Provider disappearance, partial responses and
outages preserve existing fixtures and cannot infer cancellation, deletion or
full time. Alternate IDs need independent mapping proof; contradictory canonical
assignments remain pending private resolution and are never retargeted by name.
Older/weaker duplicate reviews preserve existing resolution evidence; future
mapping observation times are rejected. The current 007 adapter rejects pre-1970
kickoffs; broader catalog storage/calendar tests do not assert that live provider
coverage exists for those dates.

Coverage belongs to the exact selection, including filters and EAT dates. A
repeatable-read snapshot orders original observation time then durable import
sequence, never UUID text. Only a complete empty exact-scope response with no
matching retained fixtures produces `complete-empty`; a competition/round
subset cannot establish a whole empty day. Incomplete, failed and independently
approved degraded subsets remain explicit, with the previous complete import
and known fixtures available.

### Retention and outstanding evidence

Retention verification explicitly covers permitted structured catalog and audit
history for the selection. It runs before provider I/O and inside the transaction,
including a final check before commit. Mapping writes have a separate operation
authorization hook and the same retention rechecks. Source verification, score,
mapping and logo approvals require trusted code; references or self-labelled
provider objects alone cannot grant permission.

Only normalized permitted fields, query provenance, original timestamps,
coverage reasons and attributable references are retained. Raw HTTP bodies,
headers/quota feedback, provider diagnostics, secrets and binary images are not
copied into catalog storage. No unlimited raw/structured retention or deletion
period is invented. Actual account entitlement, selected competitions/seasons,
retention/reuse terms, identity exceptions, regulation mapping, freshness policy
and public/logo rights still need source-specific 008 evidence before live use.
No actual ambiguous mappings have been collected; integration mappings are
explicitly synthetic. The runbook records the reusable private API and future
schedule integration contract.

## Prompt 010 — Separate research and AI spending ledgers

Implemented locally on **9 October 2026 EAT**. The reusable accounting engine,
MySQL store, runtime-policy wrapper and one-attempt transport gateway enforce
independent account/category budgets. Four new InnoDB tables are added by
`20261008221928_research_ai_cost_control`; existing foundation, quota and catalog
tables and migration history stay compatible. Read the
[cost-control contract](research-cost-control.md) for the private caller API.

Money uses exact USD picodollars and `DECIMAL(38,12)`, with conservative rational
currency conversion and explicit upward per-component rounding. Rates identify
provider/model/version, validity, billing units and measured versus
invoice-required reconciliation. Null rates are unpriced; an explicit approved
zero is distinct. Estimates, observed costs and invoices remain separately
labeled. These implementation rules do not establish any provider's rates.

Every worker and local trial must use the same opaque account identity and
durable ledger for a shared provider account. Atomic account/category locks,
unique attempt/work identities and immutable fingerprints prevent duplicate
dispatch or job-cap resets. A maximum reservation precedes a single-use durable
claim. Unknown and partial outcomes retain liability; confirmed cancellation
before claim can release it. Known usage and charges survive later receipts and
process restarts. Actual overages and verified opening debt block paid work
across periods; a new accounting window cannot hide them.

The application policy wrapper binds monthly caps and provider/model identity to
002 configuration and independently verifies explicit joint AI/research job
allocations. Their requests/tokens/primary times plus fallback reserve must fit
the global job limits. Per-category money, request, token, unit and time ceilings
remain independent. Nearest-kickoff priority applies only to eligible queued
work and starts no fixture selection, prediction, scheduler or public endpoint.
Safe internal summaries expose exact aggregate strings without prompts,
credentials, owner permits, provider bodies or private driver diagnostics.
Verified cache reuse preserves original source times and dispatches zero calls.

### Decisions still blocking paid work

| Decision | Actual input/evidence still required |
| --- | --- |
| OP-09 AI | Authorized provider/account and selected model; immutable rate versions and full billable dimensions/fees; source currency and approved conversion/rounding coverage; provider billing-window and usage-assignment rules; separate monthly cap and opening charges; per-job monetary allocation and documented measured/invoice reconciliation evidence. |
| OP-10 Research | Selected licensed provider/account; actual search/research unit rates, fees, currency, validity, exchange rules and billing periods; independent monthly cap and opening charges; explicit per-job cost/unit allocation and retry/unknown-usage billing rules. |
| OP-11 Bounds | Approved global request/token/time ceilings, explicit positive fallback time, per-service request/input-token/output-token/billed-unit/primary-time allocation and stable cross-category job/work identities. The football fallback request/quota allowance still belongs to the existing shared limiter. |
| OP-13 Permissions | Actual research source/license, extraction, attribution, reuse/display and retention evidence; separate provider adapter and evidence verification in prompt 011. |

These records are **unresolved**. No live rate, cap, exchange rate, free allowance,
job timeout or approval has been invented. Configuration references and synthetic
test verifiers cannot substitute for trusted actual records. The existing runtime
gate still blocks paid calls in test/disabled scope and enforces the separate
shadow/publication prerequisites. No live provider is enabled by completing
010's implementation or local acceptance.

## Prompt 011 — Immutable fixture evidence foundation

Implemented the independent local foundation on **9 October 2026 EAT**; the
actual licensed news adapter and operating rules remain pending. Read the
[evidence contract](fixture-evidence.md) for private caller APIs and permissions.

Evidence binds a canonical fixture/version, internal and provider team IDs,
kickoff, analysis time and cutoff. Cycle/run references are explicit nullable
caller inputs. Catalogue snapshots expose sorted provider aliases so the
collector can prove the selected external IDs without assuming one primary ID.
Football history and supported statistics come through the existing quota
adapter; form/rest derive only from eligible canonical regulation results.
Provider forecasts are outside its input interface. Home/away orientation is
retained; neutral venues, numerical home advantage and unsupported xG stay
unknown. Missing injuries do not establish squad fitness.

Each policy explicitly defines coverage, separate source freshness clocks and
age bounds, conflict/unknown-time behavior and source/claim/extract/byte bounds.
No defaults resolve OP-14. Canonical fact identities prevent changed extractor
keys from hiding conflicts or inflating history/statistics coverage. Syndication,
article-version and equivalent-content families retain attribution while
counting independent news once. Rumor alone cannot satisfy confirmed news
coverage. Optional research has an explicit acquisition target separate from
the primary evidence minimum; denied news can leave a sufficient structured
snapshot with `Limited news coverage`.

Stable content hashes cover immutable context, policy, sources, facts,
missingness, exclusions and coverage. Three incremental InnoDB tables persist
source versions, request snapshots and their bindings. Source and request rows
are append-only through SELECT/INSERT application grants; native checks,
restrictive foreign keys, sealed JSON projections and catalogue locking prevent
wrong fixture/team/version links or conflicting request replay. Archive reads
remain reproducible after upstream changes. New use rechecks current source
permissions and retention while preserving original observation times; archive
access has its own approved retention purpose.

The research bridge uses the existing cost gateway around one reviewed bounded
provider attempt. Matching names or environment references do not approve a
binding: trusted verification must bind the actual contract, license, fixture
and job/attempt identities, pricing/allocations and permitted extraction. No
provider-specific research transport is implemented before OP-13 selection.
Text stays inert data and grants no tools, instructions or credentials. Source
fetching requires HTTPS, approved hosts/queries, public DNS answers pinned to
the TLS connection and fresh checks on each redirect; bytes, text and elapsed
time are bounded. Provider bindings must separately count any source fetches.

OP-09–11 and OP-13–14 still need actual account/pricing/budget/bounds, provider,
source/license/reuse/archive rights and coverage/freshness decisions. Offline
synthetic contracts and MySQL acceptance do not verify live source coverage or
permissions. **011 remains unchecked** until its required selected adapter and
approved rules are implemented and checked.

## Prompt 012 — Primary predictor foundation (partial)

Implemented the independent local predictor contracts on **9 October 2026 EAT**.
The selected provider, exact model/version, concrete API adapter and approved
calibration configuration remain unresolved. Prompt/schema contracts are
`regulation-ai-prompt-v1` and `regulation-ai-output-v1`; neither selects a model.
Read the [predictor runbook](ai-predictor.md) for private caller APIs.

Immutable `ModelVersion` records bind provider/model/version, reviewed contract,
prompt/schema, known chronological windows, calibration/evaluation proof and
explicit output freshness/input bounds. A SHA-256 identity changes with any
configuration change. Registry pins bind both invocation and owning job; retries
cannot silently switch models. After restart, trusted owning-job proof must
restore a prior pin. Migration `20261008232332_ai_predictor_model_registry` adds
one append-only InnoDB table with binary identities, sealed native/JSON
projections, chronological constraints and SELECT/INSERT application grants.

Prepared prompts rederive immutable evidence under current permissions, prove
separate AI transmission rights and keep source text in bounded inert JSON.
Provider forecasts, full articles, tools, credentials and internal reasoning are
excluded. Output requests three regulation probability families, two to four
concise grounded reasons, one uncertainty and genuine supplied reference tuples.
Shared 005 rules own bounds, sums, consistency and derived double chance. Valid
families survive independent family failures; wrong identity, invalid timing or
invented references invalidate the whole candidate. Trusted explanation proof
must establish semantic grounding; matching IDs alone are insufficient.

Candidates preserve exact model/evidence/pin provenance, coverage/missingness,
original source clocks and distinct transport generation/retrieval/update times.
Generation normally follows the evidence cutoff. Unknown generation/update
clocks remain explicitly flagged under verified policy. Evaluated transforms
require exact registered artifacts and pass shared market rules again; there is
no default transform or quality claim. Provisional status follows independently
verified evaluation configuration. Permissions are rechecked after callbacks.

The provider bridge wraps one reviewed attempt in the existing durable cost
gateway and retains uncertain usage liability. Explicit input/output tokens,
request/time ceilings, actual rates, monthly/job budgets and positive fallback
reserve remain mandatory. Shared `dispatchCostProvider` now serves research and
AI final dispatch, counting synchronous approval latency against both wall and
monotonic deadlines. The predictor service bounds registry wait, prompt work,
provider/reconciliation and validation; it starts no automatic research, retry,
fallback selection, prediction revision, lock, scheduler or publication.

OP-09–11 and OP-13–16 still require actual account/pricing/budget/allocations,
source permissions and freshness, model/calibration selection and evaluation
proof. Source summary reuse does not automatically permit AI disclosure. No live
AI adapter, actual rate resolver or quality approval was invented. **012 remains
unchecked** until its required selected integration and checks are complete.

## Prompt 013 — Validated provider fallback

Implemented the local fallback adapter and complete candidate resolver on
**9 October 2026 EAT**. Read the [fallback runbook](provider-fallback.md) for
private caller contracts, market evidence and live qualification requirements.

Use the existing API-Football adapter and shared durable quota gateway. Resolve
the original, independently authenticated 012 result; acquire fallback only for
missing, invalid or expired source groups or an authenticated failed attempt.
Preserve valid AI distributions, evidence-grounded reasons, uncertainty,
coverage, model/evidence identity and original clocks. Match result and derived
double chance always share one complete distribution and source. Shared 005
rules validate the combined snapshot and omit conflicting fallback groups.

The current provider mapping accepts only complete `predictions.percent`
home/draw/away percentages, explicitly converted from percent to probability,
under independently verified regulation-period and response-correlation proof.
Goal thresholds, winner/advice fields and comparison statistics supply no full
over/under 2.5 or BTTS distribution. **Provider total-goals and BTTS fallback
remain unsupported; exact score remains disabled.** No complement, odds
conversion, averaging or unrecorded derivation fills those gaps.

The committed [008 trial report](reports/provider-trial-008.md) contains zero real
observations and zero dispatched requests. Official endpoint guidance identifies
the percentage fields and an hourly cadence, but establishes neither actual
account coverage nor a forecast's generation/update timestamp. The current
normalized response keeps both source clocks unknown. An explicit approved
policy must permit flagged unknown generation and, separately, bounded
retrieval-only treatment of unknown update time before an attempt can proceed.
There is no default age, retention permission or unknown-time acceptance.

| Operating record | Remaining actual evidence or decision |
| --- | --- |
| OP-03/04/06 Account and rights | Actual account/private-use entitlement, applicable quota/reset evidence, permitted attribution and public prediction display rights. Real source URLs require independent permission proof. |
| OP-07 Freshness and mapping | Separate fixture and forecast retrieval/source age limits, unknown generation/update handling, regulation mapping, supported coverage and actual pre-match availability. Hourly cadence cannot stand in for record timestamps. |
| OP-08 Structured retention | Permitted job-cache reuse/retention of normalized responses and attribution records; existing private permission grants no public redistribution rights. |
| OP-11 Job allowances | Original owning-job request, timeout and deadline ceilings, with separately allocated fallback opportunity. AI failure grants no extra football allowance. |
| OP-15 AI model | The unresolved selected 012 provider/model/calibration integration. A synthetic accepted AI receipt cannot qualify that integration. |

Within one job, authorized cached normalized responses retain their original
retrieval and source clocks. The adapter pins the approved job bounds; the
service's workflow deadline separately narrows an individual call. Repeated
cache access cannot renew spent requests or widen the original job deadline.
Final dispatch checks occur before quota reservation and immediately before
actual HTTP, with uncertain attempts conservatively accounted. All approval,
catalogue and source checks remain current through final candidate verification.

Return every launch family as available or explicitly unavailable, with original
source provenance and auditable omissions. Source expiry during final checks
permits one bounded recomposition that preserves the other source and makes no
extra request. Zero valid groups return `retain-previous-or-unavailable` for the
later publication transaction; this feature selects no old market and writes no
revision, lock or public endpoint. **013's local implementation and acceptance
are complete; live fallback qualification remains pending the records above.**

## Prompt 014 — Chronological evaluation harness (operating protocol pending)

Implemented the independent internal harness on **9 October 2026 EAT**. Read the
[evaluation runbook](forecast-evaluation.md) for precise metrics, private caller
contracts, immutable report archives and the prospective capture plan.
`chronological-evaluation-v1` reuses `regulation-markets-v1` and existing
regulation-only settlement. No actual model is selected, evaluated or promoted.

Protocol hashes freeze half-open training, validation, calibration and final-test
assessment periods, competition/horizon selection, baseline parameters, fixed
reliability-band edges, uncertainty configuration and explicit gate criteria.
Known model fitting/prior-evaluation windows remain separate from the planned
assessment schedule and must end before the original forecast evidence cutoff,
as required by 012. Unknown training or evaluated calibration provenance remains
provisional. A planned final period is not recorded as completed model training
or evaluation. Original model/calibration/source versions and as-of receipts are
independently verified; hashes alone establish no source availability or rights.

Every fixture/cycle belongs to one assessment split by kickoff. Each configured
horizon admits one selected capture per fixture/cycle; duplicate revisions in
that horizon are rejected. Comparisons use the exact shared fixture/version,
cycle, evidence cutoff and forecast-as-of instant. AI/provider/combined source
pairs and baselines use their matched intersection, with explicit counts and
keys hashes. Full-cohort source metrics cannot substitute for matched comparison.
Void, pending and unavailable rows stay visible; one selected pick per family
contributes to headline hit rate rather than counting alternative outcomes.

Match-result Brier is the sum of squared three-outcome errors, range 0–2.
Binary-family Brier is half the sum over both supplied outcomes, range 0–1.
Double chance is the per-fixture mean of three overlapping binary Brier/log-loss
events, with one headline pick. Natural-log loss uses original probabilities
without clipping or renormalization. Selection-specific reliability bins retain
counts, mean probabilities, observed frequencies and Wilson intervals under
the explicit frozen z value. Calibration error averages each selection's
count-weighted reliability gaps. Independent-fixture assumptions and insufficient
samples stay visible; lower loss alone establishes no calibration claim.

The reconstructable league baseline uses configured positive additive smoothing
of observed regulation results. The team-strength baseline uses deterministic
chronological Elo updates and a configured Davidson draw weight, supporting only
match result and derived double chance. Every probability group passes shared
validation/consistency. History must be independently verified, in the chosen
competition/lookback and actually available before that evidence cutoff; the
target fixture/cycle is excluded. No-history estimates are unavailable rather
than invented prior forecasts. These are versioned baseline definitions, not
approved numeric settings or quality guarantees.

Report archives preserve protocol, dataset, metrics, thresholds and source/model
identities. Only an original trusted harness receipt may create an evaluation
archive; source/model authority is rechecked. Exclusive writes and the pinned
first final-test report prevent changed datasets or thresholds from silently
replacing an independent result. A failed candidate gate retains an independently
verified previous approved model; otherwise status remains provisional with a
launch blocker. Passing results are eligible only for independent review and
perform no registry update, automatic promotion or public claim.

| Record | Actual status and remaining requirement |
| --- | --- |
| OP-16 Protocol | **Pending.** No actual periods, competitions/horizon cohorts, minimum samples, baseline parameter values, quality/coverage bounds or fixed reliability-band/uncertainty choices were supplied or approved. Freeze the complete protocol before the final test. Synthetic test policies are not operating approvals. |
| OP-17 Public claims | **Pending.** No source/market/horizon sample minima, permitted claim scope or independent supporting final-test observations exist. Report provisional/insufficient data until these are supplied and verified. |
| OP-15 Model/calibration | **Pending.** Actual selected provider/model/version and calibration artifacts remain unresolved. No actual previous approved model has been established. |
| OP-18/33 Prospective shadow | **Pending.** Capture original manifests, source/news availability, chosen receipts and regulation results through the later approved bounded private shadow pipeline. Applicable source/account rights, freshness, independent budgets and pipeline integrity still govern live work. |

The existing 008 report has zero real observations. Historical AI/provider
comparisons remain unavailable without original trustworthy snapshots; later
news or revised forecasts cannot reconstruct them. The factual readiness
artifacts record zero actual forecast observations and zero live requests in
this evaluation. No accuracy or calibration result is fabricated.
**014 remains unchecked** until its required approved operating protocol and
selected configuration are resolved; independent harness verification does not
clear those requirements or authorize shadow/public production operations.

## Prompt 015 — Shared light-theme styling

The existing Next.js 16.4.0, React 19.3.0 and styled-components 6.5.3 versions
remain pinned. `compiler.styledComponents` is enabled. The root Server Component
layout has one `StyleProvider` with one lazy per-instance `ServerStyleSheet`,
`useServerInsertedHTML` flush/clear arrangement, `ThemeProvider` and global
style. All styled definitions and providers live in Client Component modules;
the server layout and page still render readable initial content.

Typed semantic tokens preserve the exact navy/teal brand palette. The theme
contract can accommodate a later dark theme, but only light mode exists. Correct
uses green, Incorrect red, and Pending/Void/Unavailable gray as required by §4.
All outcome presentations include explicit text and distinct decorative icons.
The lighter brand border is a decorative divider; controls use a stronger
boundary. Focus uses a shared navy outline with explicit width and offset.

Manrope is loaded from the existing licensed variable source with
`next/font/local`, avoiding external font calls. Typography and control minimums
use rem units; spacing and page gutters use fixed pixel tokens to preserve
content width when text is doubled. Body text defaults to 16px and controls to
at least 44px. Layout and control corners remain square, with logical spacing
and wrapping. First-party SVG logos retain their ratios and clear space.

Shared exports cover layout, brand images, buttons/links, labeled input/select
controls, status text and empty states. Buttons default to native `type="button"`;
links retain navigation semantics. Field IDs and hint/error associations are
stable, supplied description IDs are preserved, and disabled controls retain
native tab behavior. Static statuses do not announce repeatedly; callers enable
polite announcements for meaningful changes. Styling-only fields use transient
props, and private-import lint restrictions also cover the new styles directory.

The component preview is conditionally imported on the development homepage.
Production builds omit its text/module from browser chunks and retain only the
honest development page. No extra application routes, feed, match cards,
locale navigation, state store or theme switch are implemented. The scoped
`test:styling` command creates an ignored, isolated production fixture using the
actual root layout and primitives for delayed streaming and browser inspection.
Synthetic interface examples never become football data or public application
routes. The fixture's fake secret canary verifies the client/server boundary.

Next.js's documented `agentRules: false` setting prevents development inspection
from creating unrelated managed `AGENTS.md` files; its own temporary managed
block was removed by Next.js. Version-matched local styling/font documentation
was read along with the specification and brand guide.

The production build, initial rendering without JavaScript, streamed navigation,
phone widths, doubled text, focus, native fields, reduced motion, contrast and
private-output checks passed. **015 is complete and ticked**. Its reusable
exports and acceptance workflow are documented in the [styling runbook](brand-styling.md).
Outstanding operating choices for 011/012/014 are unchanged.

## Prompt 016 — English routes and shared navigation

Implemented on **9 October 2026 EAT**, retaining the pinned framework baseline.
The [navigation runbook](locale-navigation.md) records the reusable contracts.

`publicPolicy.locales` remains the authority for published locales, with only
English enabled. `/` permanently redirects to `/en` regardless of browser
language. Unsupported locale-like prefixes redirect temporarily to English,
preserving path/query; the Next.js proxy excludes API/framework/assets and
performs no identity, cookie or provider work. Locale layouts reject unsupported
rendering values. Root `lang` remains the sole supported `en`; another complete
locale will require a locale root document plus 042 metadata relationships.

Today and Results select the **same dated feed**. Source-owned `feedDefaults`
sets Today to current EAT day/all statuses and Results to previous EAT
day/finished statuses. The specification leaves Results' initial day unspecified;
yesterday provides a useful completed-day starting point without creating a
second application. `finished` is a language-neutral group for terminal played
fixtures, not a prediction outcome. No result query or settlement is added.
`/en` uses the same feed presentation as `/en/predictions/YYYY-MM-DD`; no
`/results` route exists. Future URL state and filter features extend this shared
contract. Historical dates are independent of the seven-day prediction window.

One request-scoped date comes from `connection()`, React `cache` and the existing
EAT calendar. Navigation cannot retain a build-time date or use a visitor's
timezone. New requests roll at EAT midnight; already-open-tab refresh belongs to
037. Date-dependent links currently disable speculative prefetch.

Server page composition belongs in `src/app/_components`, with `server-only`
protection; client styling belongs in `src/components/navigation`. This preserves
the existing browser-import boundary without permitting `next/server` inside
browser component directories. The root registry/provider is reused once.
Pages supply active navigation on the server. The skip link uses a native
fragment anchor so activation moves focus to the focusable main landmark;
ordinary page links reuse the existing Next.js control primitives.

Flat namespaced keys live in `src/i18n/messages/en.ts`. Typed helpers provide
per-key English fallback, cardinal plurals and `Intl` number/date formatting.
Reporting labels always use explicit `Africa/Kampala` and Gregorian calendar
inputs from the existing calendar. The prepared match-count plural is not
displayed until real data exists. No market/status identity is translated.
The i18n directory shares the private-import lint boundary.

Interim pages all inherit **noindex, follow**. The feed labels its navigation
preview without inventing fixture availability or forecasts; 032 replaces it.
The methodology and information pages publish only preparation notices; 038–041
replace them. No legal policy or contact identity is invented. The match URL
builder reserves `/en/matches/fixture-id/home-v-away`, but no arbitrary fixture
placeholder is rendered; unknown matches return 404 until 035 provides verified
identity lookup and canonical-slug behavior. Full SEO remains with 042.

The public development demo was removed from the homepage when the shell took
over; the isolated 015 styling fixture remains the primitive acceptance surface.
No provider/database calls, visitor authentication, state store, feed query or
later feature is introduced.

## Prompt 017 — Request-safe state and versioned handoff

Implemented on **9 October 2026 EAT**. The [client-state runbook](client-state.md)
is the shared handoff for 028/032/033/034/037, including exact URL parameters,
validation limits, snapshot projection and reconciliation actions.

Each client provider lazily constructs a Redux Toolkit store and captures its
own initial `serverState` for hydration. No module exports a store instance;
Server Components pass typed data without accessing Redux. Applied filters
come from URL parsing, while Redux holds drafts, preferences and transient
fixture/list state. The interim feed initializes as unloaded (`data: null`) and
keys its provider by the resolved query plus route/page selection. Changing
provider `initial` props alone does not reset or refresh a mounted store.

`feed-query.ts` now owns the Today/Results defaults previously in navigation.
Both feed pages share strict parsing/serialization of explicit or relative EAT
dates, inclusive ranges up to seven days, normalized search, canonical league
IDs, status groups, the four approved markets, sort and bounded page position.
Unknown/repeated/mixed parameters fail; public pages return 404. Probability
sort carries its selected market and requires an explicit market in the URL;
incompatible `sortMarket` aliases fail. Canonical list identity excludes page,
includes resolved dates and all data filters, and preserves relative intent
separately. This prepares a shared read contract without implementing queries.

Visitor fixture snapshots reuse the market validator and canonical settlement
status type. The catalog's unsigned BIGINT data version crosses JSON as positive
decimal text; comparison is exact numeric arithmetic, never opaque ID order or
floating-point conversion. Only a strictly newer version replaces an entire
fixture/score/status/cycle/forecast snapshot. Equal versions preserve the accepted
snapshot. An older record rejects the whole incoming page and membership with
`stale-data`, allowing a current read to retry instead of mixing freshness.

Every read ticket also carries a store-local sequence, query generation, key,
page and mode. Latest-request matching prevents same-query races and A → B → A
responses from changing active membership. Replace/append own membership;
refresh updates entities while retaining loaded extent. Failure retains loaded
records and position. The future feed must explicitly rebuild membership when
needed. No browser provider requests, invented endpoints or poll timers exist.

Back checkpoints store serializable IDs/pagination/scroll against a navigation
entry, canonical query and starting page, with a 20-entry/30-minute limit.
Restoration preserves the newest fixture versions, invalidates pending reads
and rejects expired or mismatched checkpoints. Browser history, session storage
and DOM scroll wiring remain with 034. Explicit forward-only EAT calendar events
roll relative selections to page 1; historical applied dates/ranges and filter
drafts stay unchanged. Prompt 037 owns the clock and URL coordination.

Only the versioned anonymous density preference uses local storage. SSR and
hydration start comfortable; an effect validates and applies stored preferences.
Blocked storage is harmless. Fixture truth, searches and applied filters are
never persisted there. Default Redux serializability/immutability checks remain
enabled; the private-import lint boundary now includes `src/state`.

Acceptance uses isolated production Next rendering with four concurrent requests
and two providers per request, plus browser checks with gated JavaScript,
stored/blocked preferences and parent rerenders. Synthetic fixtures remain in
tests and temporary apps. No dependency versions, lockfile, schema, migration or
operating/launch decisions changed.

## Prompt 018 — Selected-market match-card presentation

Implemented on **9 October 2026 EAT**. The [match-card runbook](match-card.md)
defines the reusable components, optional public DTO fields, responsive layout,
accessibility, logo transport and acceptance workflow for later feed/detail work.

Cards receive validated visitor-facing snapshots and a canonical analysis slug.
They do not read stores, call providers, fetch forecasts or settle scores. The
selected family defaults to match result and owns its own deterministic pick,
estimated probability, source and outcome. Group rounding and boundary labels
come from the existing market domain; missing families remain Unavailable.
Known final scores are independent from prediction correctness. Only the outcome
badge uses its outcome tone, with explicit text and a non-color icon.

The shared snapshot now accepts optional logo, delayed/provisional/coverage and
per-market outcome metadata. An outcome binds to the current cycle, revision
and deterministic selection; Correct/Incorrect requires a played final status,
and Void requires a public reason. Missing or mismatched presentation outcomes
remain Pending. The future server projection must supply the correct published
or locked revision and its outcomes together. It must not attach a historical
settlement to a different current revision. All fields participate in the
existing atomic data-version replacement. No UI inference turns display scores
into verified regulation scores or settlement decisions.

Actual forecast publication and kickoff instants have machine-readable UTC
attributes and full EAT date/time labels. Immutable locale formatters are reused
without caching visitor data. English messages own user-visible labels and
single-pass placeholder interpolation. Provisional defaults to true, and other
notices render only supplied facts at fixture, forecast or selected-market scope.
The component cannot establish forecast calibration or provider coverage.

Native 32px remote images reserve square space and fall back to decorative
Unicode initials without hiding team names. The URL structural validator is
shared with existing catalog/provider approval paths; rights and exact-host
approval remain server responsibilities. No optimizer, proxy, binary storage
or provider asset is introduced. Load state handles cached pre-hydration images,
404/429 failures and new URLs; JavaScript-disabled rendering retains initials.

The article and single contextual analysis link reuse existing styling/navigation
primitives. A shared native list wraps to one column on mobile and at most two
at the large breakpoint. Tests and an isolated production fixture cover outcomes,
sources, coverage, boundaries, width/text scaling, reading/tab order, Enter,
SSR/hydration and image behavior. Synthetic data and the acceptance destination
are confined to tests/temporary apps. Public routes remain the honest development
shell; real feed/detail/polling and existing operating gates retain their owners.
No dependency, lockfile, schema or migration changed.

## Prompt 019 — Immutable prediction-cycle and revision storage

Implemented on **9 October 2026 EAT**. The
[history runbook](prediction-history.md) defines schema invariants, private APIs,
grants, transaction ownership and history-preserving migration rollback.

The additive migration extends canonical fixtures with an optional active-cycle
reference and reuses existing evidence snapshots/model versions. `DailyRun`
contains only one identity per EAT date and a deterministic numeric YYYYMMDD
order, so backfilled creation/worker completion cannot invert daily chronology.
Manifest completeness/membership, job state and dispatch remain with 020/021.

Cycles have durable caller creation keys, ordinals, schedule/mutation versions,
cutoffs, states, current/locked references, closure/void times and public reasons.
Schedule observations and audit events append; they do not replace earlier
history. Composite foreign keys bind fixture/cycle/set/run/order/evidence/model
references. One accepted `PredictionSet` per run/fixture/cycle identity survives
retries and model changes; changed replay input is refused. Each cycle's accepted
run order increases and its predecessor chain stays immutable. Exact older
replays return their record without altering the current reference.

Each set persists the complete resolved candidate and four explicit market rows.
Shared market validation governs probabilities, deterministic picks, derivation
and source consistency. DOUBLE/native JSON preserve binary64 probabilities;
unsigned BIGINT fixture versions remain exact. Unsupported families are explicit
unavailable rows, with no inheritance. Match result and double chance share
provenance/clocks/fallback reasons. Evidence cutoff, generation completion,
publication, recording and original provider clocks remain distinct; absent
provider update/generation times stay unknown. The existing regulation market
rule version also records the settlement rule contract.

Storage callbacks reuse catalog provider→fixture locking and one Prisma
transaction. They expose append-only revision writes and explicit versioned
cycle/reference changes, together with a scoped transaction for later services.
Any write failure rolls back the whole callback even if caught inside it.
Accepted sets/markets, reference decisions, schedules/audits and fixture version
changes commit atomically. Application grants deny payload/schedule/audit updates
and deletes; cycle updates are scoped to mutable columns. Closure cannot reopen
or replace locked picks through supported write paths.

Read-only repositories use coherent Repeatable Read snapshots. Open cycles show
current; closed cycles show locked or unavailable. Void cycles retain locked,
otherwise current/last accepted forecasts, with the reason, including empty
cycles. Explicit historical lookups and bounded revision/cycle/audit/schedule
cursors never change references, versions or settlement. Sealed payloads and
their native projections are revalidated when read.

These storage primitives make no publication-eligibility, postponement, lock
selection, settlement or provider-quality decision. 022–024/027 supply those
decisions under the same transaction boundary. No endpoint, live prediction,
seed, job/poller or UI was added. Production access/grants/retention and the
unresolved live 011/012/014 gates keep their existing owners. Code rollback
retains additive schema/history and disables writers; repairs roll forward
after checking actual schema and migration state, never by resetting history.

## Prompt 020 — Durable job delivery, attempts and fenced ownership

Implemented locally on **9 October 2026 EAT**. The
[durable-jobs runbook](durable-jobs.md) owns the private storage, registry,
worker/trigger contracts, grants and recovery instructions. MySQL 8.4/InnoDB
reuses the approved database technology for local implementation; deployment
approval, hosting/identity, itemized infrastructure budgets and representative
capacity remain OP-01/11/12/19/32 gates. No managed subscription is assumed.

The job row is both queue state and durable delivery intent. Business effects
and enqueue commit in one scoped transaction, so a crash after commit cannot
lose a second broker send. Claims reconcile committed due/expired rows through
Read Committed locking reads with SKIP LOCKED. Sixty-four static control locks,
sharded by refresh identity or stable job key, serialize concurrent initial
enqueues without a global mutex or retries of arbitrary business callbacks.
Multi-job transactions acquire shards in ascending exported bucket order.

Versioned strict JSON envelopes and typed Zod handler registrations bind durable
type/version/idempotency keys, payloads, original refresh/model references and
bounded availability/expiry/attempt/time/lease/fallback/backoff settings. The
optional refresh run/fixture/cycle has native FKs and unique identity. Another
model/job key cannot acquire a second refresh. Actual delivery attempts have
separate IDs, monotonic numbers/fences and retained original owner/deadline and
outcome timing. Existing prediction-set refresh uniqueness is preserved.

Database UTC time decides ownership, hard deadlines and expiry. Every renewal,
acknowledgement, retry and usage write checks the actual owner, attempt and fence;
expiry is exclusive even before another worker claims. Renewal cannot extend
the hard attempt/domain deadline. Dead owners are reconciled with stored capped
exponential equal-jitter backoff, a maximum of 16 attempts and structured
terminal reasons. Immutable operational identities/payloads and append-only
events/usage use least-privilege column grants and native state/projection checks.

Callers can fence business writes and acknowledge in their existing transaction;
publication must retain canonical provider→fixture→job locking and recheck its
domain policy. Provider I/O stays outside locks. External effects remain
at-least-once and need the stable business key, downstream idempotency and
existing account-wide cost/quota reservations. Request/cost-ledger references,
actual counts, duration and dispatch/completed/uncertain phases append without
credentials, raw responses, arbitrary error text or duplicated billing authority.

The worker provides abort/deadline checks, serialized heartbeat renewals, a
separate primary/fallback time budget and handler-supplied current eligibility.
It runs one handler per instance; authorized deployment chooses replica limits.
Cooperative signals bound waiting and subsequent context calls. Uncooperative
JavaScript/external calls require a supervisor and provider idempotency; a timed
out owner cannot finalize through fenced write paths. Graceful shutdown stops
claims, aborts work, retries if still owned and disconnects its pool. Abrupt death
is recovered by the next claim, retaining the same job identity.

The standalone entry uses pinned Node 24 native TypeScript stripping, explicit
relative `.ts` imports and `--conditions=react-server`, with repository type
checks rather than runtime transpiler dependencies. A trusted operator binding
must provide a registry and current workload authorization; no production
handler or permissive default exists. The private trigger validates current
identity before bounded body/payload parsing, durably enqueues and returns 202
without executing a handler. No route or visitor authentication was introduced.
Vercel Cron delivery, if selected later, needs independent reconciliation.

021 owns daily manifest transactions, 022–024 publication/lock/lifecycle
decisions, 025 the prediction handler, 026 the continuous poller and 043 watchdog
recovery policy. Queue rollback disables worker/trigger code and retains all
additive schema, jobs/attempts/events and forecast history; repairs roll forward
after actual schema/migration-state inspection. Production activation and
workload/host/budget/identity qualification remain explicit deployment blockers.

## Prompt 021 — Immutable daily selection and recovery

Implemented locally on **9 October 2026 EAT**. The
[daily-selection runbook](daily-selection.md) documents the protected scheduler
binding, storage grants, recorded policy/actions, cycle inputs and recovery.
Selection reuses the canonical importer, API-Football adapter/shared limiter,
history cycle writer and existing durable MySQL queue. No AI, publication,
postponement detection, continuous polling or new public route is implemented.

One original scheduled EAT midnight determines the run date, ordered `YYYYMMDD`
identity and half-open seven-day window. Configure `0 21 * * *` in UTC and retain
that occurrence across delivery retries. The private trigger only enqueues a
typed selection job; a trusted worker binding runs the service. Actual host,
identity and activation remain unselected deployment work.

Persist each date attempt before provider I/O and keep its original absolute
bounds. Retry incomplete imports before dispatch; reuse complete receipts and
reconcile catalog-commit crashes without fetching again. The adapter follows the
existing single-page fixture contract and treats unexpected pages as incomplete.
Canonical retained fixtures remain known data even if a newer response is empty;
failed current coverage never borrows an earlier completeness claim.

Database-UTC renewable leases and monotonic fences protect selection effects.
Run lock → canonical provider → fixture locks serialize manifest/cycle commit;
provider calls remain outside locks. Initial cycle creation and immutable
manifest/membership insertions share one transaction through the existing
history writer. Lease expiry or a precommit crash rolls them all back.

An append-only `DailyRunManifest` seals policy hash, boundaries, known coverage,
exclusions, kickoff/cycle identities, deterministic nearest-kickoff ranks and job
envelopes. `RunFixture` membership columns are immutable under application grants;
only dispatch/outcome projections change. The manifest is the durable enqueue
intent. One entry per transaction links missing queue jobs, and composite FKs
plus existing refresh uniqueness prevent cross-refresh links or duplicate work.
Late discoveries wait for another eligible run.

Only a configured degradation policy plus a separately verified, recorded
operator action can finalize an incomplete known subset. Preserve missing dates,
reasons and page evidence, mark the manifest partial, and never fill it in later.
Incomplete-date projections return partial/data-unavailable, never No fixtures.
The configured eligible pre-match status is `scheduled`; there is no guessed
competition list, cost allocation, model selection or permissive authority.

Current eligible open cycles are reused. A new ordinal after closure requires an
explicit `SelectionCycleEligibility` record for an already void or formally
postponed closed cycle, exact previous version and matching new kickoff. Consume
it once when the canonical fixture is scheduled. The old cycle remains closed;
024 owns observing formal postponements and supplying lifecycle transitions.

**OP-05/20 remain unresolved for live operation:** approved competition IDs and
trial-backed eligibility evidence are missing; the degraded-finalization policy
and operator action authority are unchosen. A complete import does not need a
degraded action, but missing policy blocks the affected incomplete live path.
OP-03–08 provider/account/retention qualification, OP-11 bounds, OP-19 host and
workload identity, and 022–025 pipeline integrity remain separate activation
gates. Synthetic verifiers and successful local checks approve none of these.

## Prompt 022 — Atomic ordered revision publication

Implemented locally on **9 October 2026 EAT**. The
[publication runbook](revision-publication.md) defines the sole acceptance API,
least-privilege grants, transaction boundary, refresh results and durable events.
The service consumes the existing complete AI/provider candidate rather than
introducing another source-selection path. No prediction worker, provider I/O,
public route, scheduled final lock or cache is activated.

Publication reuses canonical provider → fixture → owning job lock order in one
Read Committed transaction. The sealed original manifest/window, immutable
membership/job envelope, current rolling EAT window, active open cycle,
accepted schedule, canonical identities, stored evidence/model, source
consistency and trusted job/pin ownership must agree. Analysis follows manifest
commit/cycle opening. `UTC_TIMESTAMP(3)` supplies decision time and the final
cutoff/freshness check after provisional writes; worker completion time cannot
authorize publication. The history writer now uses database UTC by default,
retaining its explicit isolated-test clock option.

OP-21 is an explicit policy/authority contract with no guessed timing defaults.
Original retrieval age includes cache age; newer canonical observations win
over older eligibility evidence. AI's pinned model timing and approved
source-specific clock/unknown-time rules both apply. Generation, retrieval,
update, evidence cutoff, workflow completion and actual publication remain
distinct; unknown source times stay null with their flags. Source permissions,
grounding and independently verified model pins remain trusted binding duties.

Verified observed/canonical play inserts the append-only publication barrier;
later scheduled responses cannot reopen the cycle's publication eligibility.
Shared schedule eligibility and barrier reads prepare final locking in 023 and
actual-start/schedule correction in 024 without implementing those operations.
The first safety observation is retained; subsequent actual-start corrections
must preserve schedule/audit history rather than replace a locked pick.

Set/four-market insert, current reference, monotonic fixture version and history
audit are atomic with `PredictionRefreshResult` and `PredictionChangeEvent`.
Accepted refresh uniqueness and run sequence prevent duplicate acceptance and
older-run rollback. Accepted retries return the original receipt, including
changed composition, expired ownership and ambiguous commit responses; replay
never moves the current pointer. New fallback may supersede older AI. Partial
snapshots explicitly drop unsupported families. Zero-family decisions create
no set and retain only an eligible previous snapshot with its original age and
Update delayed, otherwise unavailable. Unpublished attempt keys support exact
replay and subsequent recovery; worker execution failures/costs belong to 025.

Change events use a per-fixture data-version cursor and composite result binding;
there is no assumed global completion-time/UUID commit ordering. Later caching
can replay/acknowledge durable invalidation intents, while uncached readers use
one Repeatable Read projection and remain correct without an event consumer.
The additive migration creates InnoDB tables with binary identities, native
checks and restrictive composite FKs. New tables need application SELECT/INSERT
only. Rollback disables bindings and retains all schema/history/events; schema
repairs roll forward after actual migration-state inspection.

OP-07/14/21 source/status freshness, rights, model/evaluation/quality, independent
budgets, selection choices and real host/workload authority remain live gates.
The production authority must enforce the existing runtime publication gate;
synthetic tests grant no release permission. Final locking, lifecycle handling
and worker integration in 023–025 must pass before scheduled predictions run.

## Prompt 023 — Irreversible cutoff locking

Implemented locally on **9 October 2026 EAT**. The
[cutoff runbook](cutoff-locking.md) defines the service, queue binding, closure
selection, correction void and recovery contracts. No provider calls, lifecycle
detection, settlement, public route or hosted job binding is activated.

Selection now requires the cutoff scheduler and schedules every eligible
committed member after refresh dispatch, with ownership checks before and after.
Stable cycle/schedule envelopes are queued under provider → fixture → queue
shard/job locks. A crash after a prefix retains the manifest and queued work;
retry fills only missing cutoff jobs. Changed schedules get a new close job,
without creating a prediction refresh or editing an existing envelope.

Close jobs have no kickoff-based expiry: use the supported maximum UTC instant,
while keeping explicit approved attempt, timeout, lease and backoff bounds.
Superseded jobs enqueue the accepted schedule and finish; an early same-version
delivery retries. Exhausted/missing work requires a verified recovery action/key,
whose actor, reason and evidence are retained in the new job envelope. Watchdog
and hosted workload qualification remain with 043/046 and OP-19.

One Read Committed history transaction shares publication/catalog/schedule
synchronization. It reconstructs the first deadline reached while each schedule
was in force and applies earlier actual-start/publication-barrier evidence.
Later kickoff extensions cannot undo an already reached deadline during downtime.
All schedule versions must be contiguous and coherent. Selection scans sealed
accepted publications in descending run order, checks their original schedule
and strict publication cutoff, and applies 022's shared schedule eligibility.
Scores, outcomes, confidence and the current pointer never choose a pick.

The operation stores one selected reference or no prediction. Effective
closedAt and actual lockedAt are separate; delayed jobs preserve both original
forecast timestamps and payload. An effective close before cycle opening is
retained in the receipt and selection rule, with stored closedAt clamped to
opening for the established history invariant. UTC_TIMESTAMP(3), final
ownership fencing and authority checks protect the transaction. Publication
continues to refuse writes at/after cutoff even before the lock job executes.

PredictionCycleOperation is an append-only sealed closure/void receipt, unique
per cycle and operation kind, bound to the same-cycle locked revision. Closure,
history audit, fixture version, receipt and durable invalidation commit together.
PredictionChangeEvent now binds exactly one refresh result or cycle operation
with a composite fixture/version FK. Existing publication rows remain valid;
cycle-closed and cycle-voided share the same per-fixture cursor for 031.
Application access to the new operation table is SELECT/INSERT only.

Retry returns the original closure even after acknowledgement, an ambiguous
committed response or later voiding. The audited void operation requires proven
correction authority and an already closed cycle, retains its selected reference,
payload and close/lock timestamps, and adds a reason, void time and event. It
never substitutes an earlier or more favorable pick. Current coherent readers
show current, locked/no-prediction or void according to cycle state. 024 owns
correction detection/coordination; 027 owns result settlement.

Actual workload/hosting, provider/rights/budgets/model qualification and
publication freshness gates remain unresolved. 024–025 must pass before scheduled
predictions run. Rollback stops bindings and preserves additive schema, forecasts,
schedules, audit, receipts and events; inspect migration state and repair forward.

## Prompt 024 — Audited schedule lifecycle

Implemented locally on **9 October 2026 EAT**. The
[schedule lifecycle runbook](schedule-lifecycle.md) defines the normalized
ingestion, evidence policy, coordinator and private writer grants. Production
bindings remain disabled; 025–027 own refresh execution, polling and settlement.

Use one private service for catalog imports and future polling. Keep the original
provider kickoff/status/result projection, retrieval/update clocks, separately
verified actual start, actor, evidence reference and approved policy hash. Require
the canonical provider fixture/team/competition/season identity; never deduplicate
or remap an observation by names. Status mappings and unknown-update/conflict
policy require synchronous evidence approval, with a second check before commit.
No default production mapping approval, retention permission or live-call authority
is inferred from synthetic tests.

Serialize with publication/locking through the existing provider → fixture boundary.
Canonical fields, append-only schedule/audit history, close/void receipts, cutoff
enqueues, selection handoff, lifecycle cursor/receipt and durable change events
commit together. Add transactional queue enqueue as a storage primitive; callers
must roll back failed domain work. Default catalog imports refuse active-cycle
kickoff/status changes without coordination. Empty feeds never create statuses.

An ordinary kickoff adjustment changes the same cycle's cutoff/version and cutoff
job, without a refresh job or manifest edit. Close passed corrected/previously
elapsed cutoffs using accepted publication history. Actual-start proof narrows the
safety boundary. A correction that invalidates an existing locked publication
voids it while retaining that exact reference, payload, close and lock times.
Closed cycles cannot reopen and no result selects a replacement prediction.

Formal postponement before play voids the old cycle and retains its last forecast.
An approved later scheduled observation prepares an unconsumed selection handoff;
only the next eligible run after its recorded boundary creates a later ordinal.
Repeated unchanged observations do not push that boundary forward. Repeated
postponements can produce successive void cycles through successive daily runs,
all under one canonical fixture. Handoff updates are a private mutable projection
of append-only evidence; selection's own UPDATE grant remains consumedRunId only.
Canceled/abandoned/awarded statuses void, while result observations and any verified
score survive for later settlement. A later response without a score does not
erase an already verified score for the unchanged status. Leaving the forward
window stops refresh eligibility and preserves result tracking.

Order by nondecreasing retrieval and known provider-update clocks. Store stale
observations without rolling back canonical fields. Proven earlier actual starts
remain safety evidence even when the enclosing observation is stale. Hold
equal-time contradictory content, unknown mappings/kickoffs, held unknown update
times and status regressions explicitly; selection/publication cannot proceed
while the issue remains. A newer verified unambiguous observation may resolve
the issue under policy. Independently verified mapped live proof still closes
publication during a conflict; the disagreement remains visible rather than
inventing a status or schedule winner.

The additive InnoDB migration adds sealed append-only lifecycle observations and
a mutable cursor/issue projection. PredictionChangeEvent has exactly one composite
fixture/version binding to a refresh, cycle operation or lifecycle receipt. Material
schedule/status/start/result/issue changes advance monotonic fixture versions.
Exact retries return their original sealed receipt, including response loss after
commit. Rollback disables bindings and preserves schema and immutable history;
inspect actual DDL state and repair forward. OP-07/14/19/21, real provider rights,
retention/conflict/freshness approval, budgets, model quality and workload/hosting
remain live gates. No UI or provider requests are introduced.

## Prompt 025 — One manifest-owned refresh orchestration

Use `createPredictionRefreshService` as an existing durable-worker job definition.
Verify the sealed manifest and exact entry/envelope/job, canonical fixture/team
identity, open cycle, schedule, current window, cutoff and ordered run before
outbound work. Persist an immutable plan/model pin once per job. Reviewed server
configuration supplies explicit evidence/model, separate research/AI account and
job allocations, total football request capacity, phase deadlines, fallback and
publication reserves and final-status freshness. No live choices are defaulted.

Reuse the evidence service, primary predictor, fallback service and atomic
publication service as the only forecast path. Provider forecasts remain outside
AI input. A timeout/interrupted provider attempt uses the shared fallback resolver
to preserve independent valid AI groups; match result and double chance retain
one owner. Missing news alone follows the approved evidence threshold. Never
copy previous markets into a partially supported replacement.

Store sealed, append-only intent, started/completed phase boundaries and final
operational outcomes. A started boundary without a completed receipt never
authorizes another dispatch in that phase. Recovery uses original evidence,
request IDs, cost policy, model configuration and timestamps. Potentially billable
attempts retain the existing cost ledger liability, including later receipt
reconciliation. Save phase completion and source-specific usage in one queue-owned
transaction so replay cannot duplicate counts or leave a completed stage without
its usage. Existing account/category locks and nearest-kickoff priority remain
authoritative; all external I/O stays outside database transactions.

Immediately before publication, obtain a bounded original fixture observation,
route it through lifecycle handling and recheck freshness/status/schedule/cycle.
Publication independently checks all invariants inside its existing transaction.
An already published refresh recovers the original revision before consulting
eligibility or current configuration. An empty valid snapshot uses existing
retain-previous/unavailable rules and preserves previous age. Interrupted
evidence/status acquisition fails conservatively rather than inventing eligibility.

Queue acknowledgement and progress are repairable projections of the immutable
operational/publication receipts. An optional awaited `settled` job hook runs after
acknowledgement or failure; hook errors never change a committed queue result.
`reconcileRun` repairs terminal receipts and aggregates, including pre-claim expiry
and a crash before progress recording. Completion means every selected job is
terminal, distinct from every job publishing a forecast.

The additive InnoDB migration uses existing binary identity collation, foreign
keys, JSON seals and shape checks; worker grants on new tables are SELECT/INSERT
only. Disable the trusted binding for rollback and preserve immutable history;
inspect actual DDL state and repair forward. Existing OP-07/14/19/21 rights,
coverage, model/evaluation, budgets/rates, freshness and hosting/binding evidence
remain activation gates. Synthetic MySQL/transport checks do not grant live
permission. No polling, settlement, visitor-triggered AI or new manifest members
are introduced.

## Prompt 026 — Shared fixture/result observations

Implemented locally on **9 October 2026 EAT**. The
[result synchronization contract](fixture-result-sync.md) defines binding,
cadence, immutable responses/results, event semantics, grants and recovery.

One continuous worker holds the existing provider account's renewable fenced
lease. Use database time and transactional ownership checks for persistence,
bounded adapter workflows and monotonic elapsed guards for dispatch. Reserve
cadence before I/O; persist schedules/backoff across process death. Cold starts
serialize against the permanent account row before lease insertion to avoid
INSERT IGNORE lock upgrades. Keep provider I/O outside database transactions.

Share the all-live response at 15 seconds during an explicitly approved approach
and active window. Current EAT date synchronization runs every 60 seconds and
detects resumption. Validate date boundaries and actual paging through the
existing adapter; unsupported fixture pagination remains incomplete. Batch
missing-live/cross-midnight IDs in groups of at most 20, excluding freshly
observed canonical records. Historical final checks run before optional feeds;
IDs and in-horizon finals use results-cutoff priority. Existing limiter caps,
reserve, in-flight deduplication and authorized fresh cache reuse govern every
request and retry. Failure backoff persists and never spends past the cap.

Polling policy requires explicit coverage, approachMs, activeWindowMs, finite
unresolved/corrections tiers, request/response bounds, lease and failure bounds.
No live values are inferred. Tier boundaries are exclusive and intervals strictly
increase from at least 60 seconds. Unresolved tier age begins after the active
window from kickoff/first tracking; correction age begins at the first observed
final, including original catalog observations. Corrections and restarts cannot
reset this anchor. Record polling-horizon-exhausted without deleting or resolving
the fixture. Approved real horizons, retention, rights, batching evidence,
coverage/account proof, lifecycle policy and hosting/binding remain live gates.

Persist sealed normalized ResultSyncBatch responses before applying them. Recover
all pending batches with original clocks before new dispatch; a changed policy
hash requires reviewed configuration. Apply each fixture under the existing
provider/fixture transaction and lifecycle service. ResultProviderObservation
retains unchanged/stale/conflicting evidence with same-fixture lifecycle foreign
keys. FixtureResult appends material status/score/timing snapshots and predecessor
links. Keep verified regulation separate from reported goals, extra time and
penalties; missing regulation remains unresolved. Unchanged retrieval updates
actual lastSyncAt without inventing new generation or result timestamps. An exact
old lifecycle replay retains its original receipt outcome; result application
also checks the current lifecycle/canonical cursor so an originally accepted
cached response cannot regress newer scores.

Material result revisions advance the shared fixture dataVersion and emit
PredictionChangeEvent(kind=fixture-result, fixtureResultId). The composite
fixture/version FK and exactly-one-binding shape check extend existing refresh,
cycle and lifecycle events. Lifecycle and result effects commit together and may
produce separate cursor versions. Consumers must be idempotent and read coherent
projections. 027 owns settlement against immutable locked picks; 031 owns event
delivery/acknowledgement and cache invalidation. No AI, refresh enqueue, manifest
mutation or locked forecast rewrite is introduced.

New tables use InnoDB and binary identity collation, with quota-account FK columns
matching the existing account collation. Application grants retain append-only
results/observations and response bodies; only response completion and mutable
lease/age projections need UPDATE. Stop the binding for rollback and retain the
additive schema and immutable evidence; inspect DDL state and repair forward.

## Prompt 027 — Audited settlement and applicable cycles

**Decision date:** 9 October 2026. **Scope:** persisted settlement only; no
hit-rate aggregation, optional exact scores, public result delivery or live
worker activation. See [market settlement](market-settlement.md).

Reuse the four-family domain rules and the history reader's verified immutable
locked snapshot. A current/unlocked forecast never becomes a settlement pick.
Missing families remain Unavailable; an open cycle awaits a lock and a closed or
void cycle without one has no prediction. Available locked selections use
verified regulation including stoppage time, excluding extra time and penalties.
Scheduled/live and unresolved final scores remain Pending. Ineligible cycles,
formal postponements, cancellations, abandonments, awards and invalidated cutoff
locks remain Void with their original cycle reason. A pre-lock void preserves
its forecast in prediction history without manufacturing a locked prediction.

Read FixtureResult through a shared sealed/versioned reader that checks body,
identity, indexed score fields and content hash. Require canonical status, score
and evidence agreement and no lifecycle issue before settling. Reverification
of the same score may advance canonical verification time without appending a
material result; retain and accept the original sealed verification time when
it is no newer than canonical verification. A changed score without a matching
result version suppresses stale settled counting immediately and remains
Pending until synchronization supplies verified evidence.

One MarketSettlement pointer per cycle/family references append-only
MarketSettlementRevision history. Its input fingerprint includes the rule and
result versions, immutable pick/source/probability and eligibility/outcome.
Duplicate events/replicas leave history and cursors unchanged. Result corrections
following Correct/Incorrect append an audited predecessor and database UTC
correction time against the same lock, including when the badge is unchanged.
Prior badges, reasons and original sealed results remain readable. First-time
pending-to-settled is a transition; later transitions preserve the last visible
correction time. Chain order is independent of millisecond timestamp ties.
Once recorded, void-cycle evidence is historical and later result corrections
do not multiply it.

Serialize with the established provider then fixture locks. Commit changed
family pointers/history, one SettlementBatch, one fixture dataVersion increment
and its PredictionChangeEvent(kind=market-settlement) together. Composite FKs
bind result, lock, predecessor, cycle and invalidation to the correct identity;
the event shape permits exactly one refresh/operation/lifecycle/result/settlement
binding. Runtime grants allow only pointer updates and append-only history.

Consume durable source events using per-event SettlementEventReceipt rows in
that transaction. Bounded discovery also finds cycles with missing family
projections. There is no global timestamp cursor or settlement feedback loop.
Private reconciliation recovers missed delivery, rollback, exhausted jobs and
lost commit acknowledgements. The existing durable worker can register the
fixture-scoped prediction.market-settlement handler; supplied leases are checked
before effects and before commit. Execution bounds and host/scheduler binding
remain explicit operator inputs; 043 owns watchdog activation.

The repository reads a repeatable snapshot with applicableCycleId from the
canonical fixture pointer, historical cycles, one active family projection,
isCurrent and eligibleForCounting. Counting eligibility requires a current
Correct/Incorrect selected pick on the applicable closed cycle. Historical void
cycles, alternatives, superseded audit revisions, missing/pending outcomes and
unreconciled stale results are excluded. 030 owns aggregation, and 031 owns event
delivery/cache invalidation. Synthetic acceptance proves mechanics only; existing
provider, model, rights, operating and deployment gates remain in effect.

## Prompt 028 — Anonymous stored match feed

**Decision date:** 9 October 2026. **Scope:** GET /api/matches and a reusable
server query service. The UI remains on its earlier preview; no detail endpoint,
hit-rate aggregation, cache, provider call or worker activation is introduced.
The complete response/error/pagination/operations contract is in
[match-feed-api.md](match-feed-api.md).

Reuse the existing date/filter URL validator and EAT calendar, with bounded
historical dates whose UTC bounds fit MySQL DATETIME. Default pages contain 30
records, maximum 100, page cap 10,000; ranges span at most seven days. Limit query
strings to 2,048 bytes and serialized responses to 1 MiB. Bind every SQL value,
including pagination. Search normalized team/league/country names and retained
aliases across the entire range before pagination; escape wildcard characters
literally. Reuse existing kickoff/name/alias indexes. The date predicate bounds
substring matching; no prefix-index performance claim is made for leading
wildcards. Default ties are kickoff/fixture ID; probability order uses only the
selected family's stored unrounded value, missing last, then the same ties.

Return shared FixtureSnapshot records with required cycle, unavailable-family,
update, score-period and seven-day-message metadata. A repeatable snapshot binds
counts, membership, applicable current/locked/void revision, sealed results and
settlement input hashes. Closed-without-lock never falls back to a preview; a
pre-lock void retains its last prediction and public reason. Historical closed
and void forecasts remain readable if their competition is later disabled.
Correctness refers only to current audited settlement against the immutable
selected pick; result corrections suppress old badges until settlement catches
up. Shared read modules now serve both private settlement/selection services
and the public feed, keeping writes outside the public dependency path.

Expose canonical dataVersion as unsigned decimal text. syncedAt is actual result
sync/catalog retrieval time, not request time. asOf dates the response's
operational observations. Coverage, job status and window messages may change
without a canonical fixture mutation; future consumers must refresh those
observations separately from version-gated forecast/result replacement. Every
family is explicitly available or unavailable. Per-market source and publication
references remain public, while raw payloads, provenance/evidence internals,
analysis text, prompts, worker logs and private void proofs remain private.

Exact-date latest import coverage is authoritative only when complete. Newer
partial/degraded/failed/pending imports cannot establish an empty date or be
overridden by older complete coverage. Return retained rows with coverage flags.
Separate no fixtures, no filter matches, insufficient selected-family data,
unavailable coverage and an out-of-range page. Today's run uses sealed manifest
membership and actual durable terminal/succeeded states plus accepted publication
receipts; projected counters are not trusted. Unknown/uncommitted totals stay
null. Historical/farther-future queries have no current-run progress. Ordinary
pagination links preserve filters and pin resolved dates across midnight.

Anonymous searches share a conservative fixed 60-second, 120-request aggregate
budget in one migration-created PublicSearchLimit row. MySQL UTC/row locking
bounds concurrent replicas. No IP, cookie, token, visitor ID or search text is
stored, and browsing without search does not consume this budget. This initial
privacy-preserving bound settles OP-23's implementation; production tuning still
requires real workload evidence. Application grants add only SELECT/UPDATE on
that permanent row. Reads require SELECT on the existing shared repositories.

Return structured 400 invalid-query, 429 rate-limited and 503 unavailable errors.
Only 429/503 are recoverable and carry Retry-After (remaining window or five
seconds). Database/integrity/configuration failures cannot turn into empty data
or leak diagnostics. Require no account or authentication cookie (from 061,
reads also resolve viewer access from optional member and owner cookies; see
[Paid access, Phase 0](#paid-access-phase-0-19-october-2026)). Every response
uses no-store headers; later cache work may wrap this contract. Existing database,
competition/provider/model/rights/hosting gates remain effective. Synthetic
acceptance establishes local query/concurrency mechanics, not live operation,
coverage, rights, forecast quality or deployment readiness.

## Prompt 029 — Match detail and read-only revision selection

Expose anonymous GET /api/matches/{canonical UUID} and the reusable stored query
service. Reuse the feed fixture serializer, sealed history/evidence/result and
settlement readers in one RepeatableRead transaction. Preserve intended public
404s across the database runtime's diagnostic-redaction wrapper. Shared feed and
detail HTTP errors retain 400/429/503 behavior and add nonrecoverable 404. Invalid
input is rejected before lazy database initialization. Reads require no account,
cookie, outbound call, pointer mutation, settlement write or durable job. (From
061, an optional member or owner cookie selects the gated or full view.)

The strict detail DTO separates current `fixture`/`currentRevisionId` from the
selected `snapshot` and nullable `selectedCycle`. Optional revision/cycle UUIDs
are mutually exclusive and must belong to the fixture. Current, locked, void and
historical identities are explicit. Closed-without-lock is valid unavailable
data; pre-lock voids retain their last preview and safe reason/time. Correctness
binds only to immutable locked picks with currently coherent audited settlement;
earlier alternatives have no outcomes. Correction and void timestamps are
separate from score data. Monotonic fixture versions, run/revision/cycle references
and original generation/evidence/publication/provider clocks support later
reconciliation. A decorative bounded team-name slug never changes UUID identity.

Paginate revision and cycle summaries independently by unique fixture revision
sequence/cycle ordinal, newest first. Default limit 10, maximum 20 per collection.
Inclusive anchors plus exclusive before cursors avoid shifting membership under
new publication/cycle creation; zero anchors pin empty history. Next links retain
both anchors, the other cursor and explicit selection. Membership is pinned,
while current metadata, cycle states, permissions and outcomes reflect `asOf`.
Query/response limits remain 2 KiB/1 MiB and transactions at most 30 seconds.

Complete source-owned probabilities, deterministic picks, alternatives and
per-family source/fallback triggers come from one revision. Revision-level
analysis exposes only validated original supported reasons, one uncertainty and
permitted attribution/safe HTTPS links. Unknown source times remain null. Filter
AI evidence by cited source IDs and stored reuse/retention permissions; expired
or unapproved citations withhold the whole explanation without replacing
probabilities or inventing reasons. Never serialize raw claims, payloads, prompts,
model pins, private proofs, denial details or logs. Provider fallback attribution
uses validated publication provenance. Offline link checks perform no DNS/I/O.

Reuse the feed's anonymous aggregate search policy: ID/history reads do not search
or mutate its counter. No new schema or grants are needed. Keep no-store responses
until 031 and leave detail-page rendering to 035. See
[match-detail-api.md](match-detail-api.md) for the full DTO/query contract. Existing
operating gates and the distinction between canonical versions and asOf-dated
operational observations remain unchanged.

## 9 October 2026 — Performance API cohort and claim boundaries (030)

Implement anonymous stored GET /api/performance with a reusable bounded batch
service. The headline cohort is canonical current kickoff in inclusive requested
EAT dates, using the feed's enabled competition/published-history scope. Default
period is 30 days, maximum 31. Each fixture/family contributes once, through its
applicable closed cycle's immutable lock. Open previews, unsupported families
and closed cycles without a lock are unavailable. Keep combined AI/fallback and
source cells explicitly labeled; match result and double chance remain separate.
Source, immutable model ID and exact provider-model/contract version filters
place nonmatching available forecasts in `filteredOut`. Preserve unattributed
unavailable/void coverage and disclose these accounting rules in the response.
Quality coverage uses available divided by the full nonvoid known fixture cohort;
filtered origins/versions cannot improve that rate by reducing its denominator.

Available equals settled plus pending, and settled equals Correct plus Incorrect.
Only coherent sealed settlement/result/lock input hashes supply settled picks.
Alternative selections, superseded sets, historical postponed cycles and failed
or delayed refreshes never increase this denominator. Historical void cycles use
their own original kickoff period even after the current fixture moves outside
that period. Operational measures use actual durable-job states and retained
refresh receipts for cohort fixtures and daily-run dates inside the requested
period. They do not label a still-usable forecast as unavailable.

Reuse evaluation-metrics.ts for full distributions, overlapping double-chance
binary-event scores and fixed-band Wilson uncertainty. Extract shared numeric
quality-gate diagnostics for both chronological evaluation and reporting.
Publication time defines forecast horizon, with evidence cutoff exposed
separately. Only identical family/source/horizon policy scopes may publish
descriptive numeric metrics; mixed horizon totals withhold values and retain
separate horizon cells. There is no matched AI/fallback pair in a single stored
lock. Mark source comparisons unavailable rather than using unlike fixture
cohorts or unselected revisions. Missing matched baseline evidence also keeps
baseline-required quality gates pending.

OP-16/OP-17 still have no actual approved numeric thresholds/qualification. Do
not invent production minimum samples, quality limits, bands or confidence Z.
A trusted server-only binding must parse and synchronously verify a frozen
evaluation protocol, including a second check after stored reads for revocation.
The route currently supplies no binding: factual counts remain public, metric
values are null with explicit unavailable reasons. Below-minimum verified-policy
cells are insufficient-sample; failed quality diagnostics withhold values.
Synthetic thresholds test these branches only. Passing descriptive diagnostics
does not authorize public claims or establish calibration: claim authorization
remains false and launch estimates provisional.

Batch SELECTs reuse extracted sealed cycle/revision/result/settlement/model row
parsers and the shared settlement projection. Normalize MySQL raw unsigned goal
bigints/booleans at the result read boundary while retaining seal/index/hash
checks. Bound fixtures/locks and historical cycles at 1,000 each, total selected
JSON at 16 MiB before loading it, operational rows at 31,000 and response/query
sizes at the existing 1 MiB/2 KiB. Fail safely on excess instead of silently
truncating reports. Existing kickoff, state/cutoff, daily-run sequence and
primary/foreign-key indexes support these queries; no schema or grants change.

Return known version labels and at most 20 locked detail evidence links per cell
with explicit total/truncated metadata. Never expose raw forecasts/evidence,
model configurations/pins or private approval references. Current corrections
first invalidate old scores, then expose the new private settlement revision at
the actual read asOf time. A deterministic snapshot key and invalidation
categories cover fixture/cycle/lock, result/settlement, refresh and policy changes
for 031; no cache or event worker is added here. Full query, cohort and metric
contracts are in [performance-api.md](performance-api.md).

## 031 — Shared public response cache (9 October 2026)

Reuse the selected MySQL 8.4 capability for shared response storage. No managed
cache subscription, framework process cache or CDN authority is assumed. All
three public service contracts share a versioned canonical key and fixture/date
tag strategy; competition/evaluation scope, locale, resolved EAT dates and every
validated filter/history/page parameter participate. Query validation, the shared
search budget and trusted evaluation-policy verification precede cache reuse.

Choose five seconds for mutable envelopes and six hours for immutable revision
markets/analysis. Source permission expiry caps both detail layers, and EAT
midnight caps mutable responses. Never refresh original sync/source clocks or
drop version, coverage/progress or correction fields on a hit. Keep immutable
payloads separate from current cycle/result/history applicability.

Invalidate generations and append a durable journal in the same source MySQL
transaction using triggers. Existing prediction change events invalidate fixture,
current date and all cycle dates; fixture updates invalidate old/new dates.
Run/import/job/lifecycle/catalog changes also invalidate affected responses,
including updates without prediction events. Global progress/catalog tags are a
deliberately conservative local choice. A pre-read generation stamp stays with
every fill and is compared on every hit, preventing an invalidated older read
from establishing new authority even if invalidation races the fill's commit.

Private bounded maintenance acknowledges only generations already applied and
sweeps expired bodies. Pending receipts, rather than a global time/ID watermark,
recover missed delivery, downtime and late commits. Retain journal/generation
history until the separately approved retention work; schedule cleanup before
hosted operation. Cache errors fall back to bounded stored reads, and database
errors remain truthful unavailable responses. HTTP headers remain `no-store`.

The isolated MySQL server explicitly permits trigger creation under binary
logging; migration roles gain schema-scoped `TRIGGER`, while applications only
read generations and update acknowledgment timestamps. Actual hosted trigger
definer/binlog privileges, maintenance scheduling, capacity and infrastructure
cost approval remain OP-01/12/19/32 gates. No remote setting, deployment, provider
operation or paid service is authorized here. [The cache runbook](public-response-cache.md)
records grants, rollback, lifetimes and recovery commands. Local five-second
freshness evidence supports the proposed 15/60-second cadence budget; actual
provider/worker/network and hosted final-badge measurements remain pending.

## 032 — Stored match feed page (10 October 2026)

Use the same server-only feed composition for API and page reads, including
configured competitions, validated URL parameters, the shared search limiter and
MySQL response cache. Call the service directly from Server Components. Reuse a
single request-scoped clock for reporting dates, navigation and service/cache
window resolution; a render crossing EAT midnight retains one coherent date.

Render the service's first page and bootstrap client state with that same data.
Preserve the existing approximately 30-card default, kickoff/fixture-ID order,
selected-market presentation and one/two-column list. Keep date navigation as
ordinary links with prefetch disabled. Date changes retain filters and restart at
page one. Previous/next links use explicit dates and stop at stored year bounds.
Extract canonical slug generation for shared feed/detail use rather than querying
detail analysis for every card.

Use coverage authority from the reader, never the absence of records alone, to
confirm no fixtures. Show incomplete imports independently of prediction data,
retain stored forecasts and publication/sync times, and render genuine run
completed/total counts with unknown totals omitted. Treat temporary reads and
search throttling as separate retry states. Existing cycle projections remain
authoritative for current, locked, void and missing locked predictions.

Provide server composition slots for later controls and pagination. Search UI,
Load more, Back restoration, real analysis pages and browser polling remain owned
by 033–037. One-tap links are qualified with an isolated canonical analysis target
until 035. No production synthetic-data switch, schema or scheduler is introduced.
The existing live database/provider/rights/budget/hosting gates remain pending;
local fixtures establish rendering and stored-read behavior only. See
[match-feed-page.md](match-feed-page.md) for the page and acceptance contracts.

## 033 — Search and filter controls (10 October 2026)

Use shared `SearchInput`/`FilterControl` wrappers over the existing native labeled
fields. Keep raw input in the per-provider Redux draft until explicit Apply;
normalization/validation belongs to `applyFeedDraft` and the shared URL parser.
No request is made while typing or choosing filters. Preserve mounted controls
and focus across server query changes by explicitly synchronizing the draft.

Use App Router transitions through canonical `feedQueryHref` destinations. Initial
SSR, Apply, reload, shared URLs and Back use the same stored service and parser.
Superseded navigation behavior is verified in Chrome, including A → B → A. If a
navigation is pending, Reset must push its destination even when it equals the
still-visible URL; refreshing that URL can otherwise refresh the pending search.
Refresh is reserved for reapplying the current query with no pending navigation.

Use a native GET form for progressive enhancement. Normalize its empty league
option to null; retain strict duplicate/unknown/other parameter validation. Reset
clears search/league, selects all statuses, match result and kickoff order, and
resets page one while preserving reporting dates/range and page size. Probability
sort always binds to the selected market; missing values remain last with stable
kickoff/fixture-ID ties.

Return bounded league options from the full date cohort in the records' existing
RepeatableRead transaction, independent of active filters/page. Limit to 1,000
unique public id/name/country entries, failing on overflow. Use feed projection
version 2 in the cache descriptor; retain existing catalog invalidation, response
size bounds and search budget. No migration is necessary.

Retain the last successful server projection outside Redux's mutable UI draft.
A failed query shows its own failure and labels retained cards with their original
query, dates and market. Use a native dismissible disclosure with Escape/Close
focus return, shared focus treatments and one restrained polite status region.
No provider/AI call, browser polling, scheduler or deployment is introduced.
Prompt 034 continues to own loaded-page/scroll restoration; 037 owns live refresh.
See [search/filter contracts](search-filter-controls.md). Existing live operating
and launch gates are unchanged.

## 034 — Pagination and navigation restoration (10 October 2026)

Keep server-rendered Previous/Next links for direct requests and no-JavaScript
browsing. Pin resolved reporting dates and preserve every validated query option.
Enhance Load more after hydration, without automatic scrolling loads or URL
changes. Bound the appended extent to ten pages; ordinary links continue beyond
that bound. Share the existing square controls, reserved native lazy logos and
one polite status region. Focus the first new article or the retry action without
moving the current viewport.

Offset pagination requires a cohort guard to avoid gaps after concurrent schedule
or probability changes. Add opaque `paginationVersion`, hashing the effective
query, competition scope and committed date/catalog generations read alongside
rows in RepeatableRead. Existing source triggers already update these generations
atomically. Progress acknowledgments do not change the guard; catalog invalidation
is deliberately conservative. Bump feed cache projection to 3, with no migration.
Reject changed totals, versions or overlapping pages. Retain all accepted cards
and offer an explicit refresh of the loaded prefix. Commit refreshed membership
only after every page agrees, preserving accepted whole records at equal versions
and rejecting older versions. No independent market merge occurs.

Keep appended records local to the feed projection. Save only bounded position
metadata in tab-scoped session storage: canonical query/route, starting and last
pages, scroll, focused fixture ID, opaque version, timestamp and random history
entry ID. Preserve Next.js-owned history fields. Cap records at 20, 30 minutes and
65,536 UTF-16 code units; reject malformed/expired/mismatched metadata and tolerate
blocked storage. Never store authoritative fixture data. On Back/reload re-read
the complete extent before DOM focus/scroll restoration, keeping the original
checkpoint if a read fails. Capture before link/form navigation and page exit;
avoid cleanup saves that can overwrite position after route scroll resets.

Use a synchronous request lock, AbortController and a 30-second operation bound.
Query changes cancel obsolete work and reset the extent. Anonymous browser reads
call only the stored-data API; no provider/AI work, polling, scheduler or deployment
is introduced. Real MySQL mutation tests and an isolated production analysis route
qualify membership changes and mobile/desktop Back behavior. Prompt 035 must
repeat those navigation checks through its real detail page. The existing live
operating gates remain unchanged. See [pagination contracts](pagination-navigation.md).

## 035 — Stored match detail page (10 October 2026)

Share `readPublicMatchDetail` between the anonymous API and Server Components,
retaining the stored service's selection, source-permission filtering and 031
cache. Request-scoped React caching supplies one response and request instant to
metadata and page rendering. Validate UUID/query before initializing storage;
unknown fixtures return 404, while storage failures remain retryable
unavailable pages. UUID establishes identity and stale slugs/uppercase UUIDs
redirect permanently to the service canonical path. Page query selection stays
reserved for 036; this prompt renders only the applicable revision.

Render every market from the selected immutable snapshot, including explicit
unavailable families. Reuse the shared shell, team rows, probability formatting,
outcome badges and square tokens. Keep the principal match-result prediction
visible, with other families following. Native disclosures expose alternatives
and source timing without hiding the principal prediction or adding alternative
outcomes. Use the source-owned fallback reason and per-family provisional flag;
do not describe provider estimates as AI or fill missing families from old data.

Keep all source/evidence/publication/lock/settlement/sync/observation clocks
distinct; unknown source times remain unknown. Preserve limited-news, retained
age, partial coverage and delayed updates. Render the resolver's supported reasons
and one uncertainty as untrusted text. At the HTML boundary reuse offline safe
HTTPS checks, require attributable citations, withhold unsupported explanations
and expose permitted links directly. Do not fetch source URLs or invent summaries
when permission has expired. No raw evidence, prompts, private reasons, credentials
or worker implementation crosses a client boundary.

Use supplied outcomes independently of live/verified regulation scores, retaining
pending settlement, corrected outcomes and void reasons even without a locked
forecast. Keep historical snapshots useful beyond the forward window. Optional
exact-score prediction remains excluded by the existing recorded launch decision.
An optional server composition slot reserves read-only history for 036 without
presenting unfinished controls. Unique metadata uses the existing brand Open
Graph PNG and canonical origin; prelaunch `noindex, follow` remains in effect
until 042 qualifies indexing.

Qualification uses real MySQL-captured DTOs, the same route factory with an injected
stored reader, and isolated security/layout variants. Linked-evidence URLs and
permissions are explicitly synthetic and are never fetched. Mobile/desktop Back
through this real page completes 034's deferred destination check. No migration,
provider/AI invocation, job, polling, deployment or live operating gate is added.
See [match detail page contracts](match-detail-page.md).

## 036 — Read-only publication inspection (10 October 2026)

Use the canonical match route with the API's validated revision/cycle/keyset query
parameters. Keep the applicable forecast as primary content and render one
selected full snapshot in a separate expanded history disclosure. Fixture UUID
ownership is verified by the existing stored service; malformed, missing and
cross-fixture combinations return safe 404s. Preserve the history query on stale
slug redirects. Canonical metadata always excludes history parameters, and the
existing explicit `noindex, follow` policy covers revision and pagination views
until 042 consolidates indexing.

Choose server-rendered ordinary-link pagination rather than a second client data
store. Both lists keep the 029 default ten/maximum twenty bounds and independent
keyset cursors. Links pin both persisted high-water marks and preserve selection
and the other cursor. “Latest history” resets anchors. Browser Back and native
disclosures work without JavaScript. Only the chosen full snapshot is rendered;
list rows carry public summaries, never complete private candidates. The schema
adds persisted run date, source kinds and the safe cycle projection to revision
summaries; existing sealed readers and a bounded batch run lookup supply them.
No migration is required. Old cache envelopes fail strict parsing and rebuild
through the existing cache recovery path.

Reuse square native disclosure controls and primary snapshot presentation with
scoped DOM IDs. Browser-native expanded state and Enter/Space behavior are
available before hydration, with visible focus. Preserve complete snapshot
semantics and original provenance; old missing families stay unavailable.
Superseded publications have no settlement badges; locked/void historical
outcomes remain bound to their own revision. Show only schedule clocks already
in the public cycle contract, and safe void reasons; internal schedule evidence
and audits remain private.

Cache the independent primary and optional historical reads per request, shared
with metadata. A failed extra history read leaves the primary forecast and its
initial publication list visible, with inline same-query retry. History does not
alter current/locked references, settlement, results, cohorts, jobs or feed cards.
No live polling or later feature is activated. See
[revision-history contracts](revision-history-page.md).


## 037 - Live client refresh

- Initial SSR is the single handoff into the feed's loaded-prefix state or the
  detail's applicable snapshot. The request-owned Redux store adds a concrete
  RTK Query API for existing feed/detail GETs. No Server Component reads Redux.
  Endpoint keys normalize pinned dates/query/page; overlapping subscribers share
  a request, and one consumer's cancellation does not abort other subscribers.
- Active visible views use a serial 20-second loop, quiet historical/final views
  60 seconds. Hidden/offline views pause; visibility, reconnect and persisted
  browser-cache restoration resume safely. Initial pageshow does not duplicate
  hydration. Each endpoint has a 30-second transport deadline; loaded feed batches
  also have a bounded deadline. Failed or obsolete consumers cannot commit.
- Background feeds re-read the full bounded loaded prefix and commit membership,
  coverage and progress atomically after existing cohort/overlap checks. Changed
  cohorts rebase only when the whole prefix is consistent. Background batches
  preserve focus/scroll and never emit pagination loading/success announcements.
- Fixture versions fence complete records; cycle ordinals, same-cycle lock/void
  state, persisted decimal run sequences, publication times and revision IDs add
  consistency checks. Opaque IDs are never ordered. Feed cache projection 4 and
  detail projection 3 include the additive provenance/progress contract.
- Equal fixture versions retain forecast content but can advance the separately
  read observation/job envelope (sync time, coverage and delay/window labels).
  These fields legitimately change without a material fixture-version bump.
  Read-envelope asOf cannot move backwards; publication/generation/source times
  are never replaced by request completion or cache-hit times. Expired analysis
  may be withdrawn while probabilities stay unchanged.
- Detail reads reuse storedFeedRun in the fixture's RepeatableRead transaction.
  Manifest/job counts remain shared across filters and independent visitors.
  Complete available/unavailable snapshots replace each other without inheriting
  older families. Locked references, jobs, provider polls and settlements remain
  server-owned and untouched by browser reads.
- Historical selections remain a separate server-rendered subtree. Current
  polling always omits history parameters. History labels include their original
  read time and latest-history navigation explicitly obtains a newer anchored
  view; old snapshots never become the live current state.
- The loop wakes at EAT midnight, before any obsolete relative-range fetch.
  Server refresh recomputes dates, navigation and rolling windows. Relative page
  URLs reset to page one while preserving filters; explicit historical dates,
  ranges and loaded position remain. The provider dispatches the existing
  forward-only calendarChanged event for the new server reporting day.
- Failure UI retains loaded data and reports its last successful stored read,
  independently of actual provider/source sync clocks. Partial imports remain
  distinct from confirmed empty dates. Stable repeated failures do not change
  their polite live-region message; ordinary successful ticks/run counts are
  silent. Retry uses the same serialized request boundary.
- Shared offline URL/presentation helpers were extracted for client rendering;
  evidence network authorization, DNS, transport and credentials stay server-only.
  No migration, paid call, scheduled worker, deployment or later prompt is added.
  RTK Query usage follows the official custom queryFn and endpoint initiate APIs:
  https://redux-toolkit.js.org/rtk-query/usage/customizing-queries
  and https://redux-toolkit.js.org/rtk-query/api/created-api/endpoints.

## 038 - Methodology and measured performance

- Replace the interim methodology surface with readable server-rendered content,
  native GET cohort filters and the existing stored performance service. Share
  `readPublicPerformance` with HTTP; do not fetch loopback endpoints, aggregate
  outcomes in client components or trigger evaluation/provider/prediction work.
- Keep OP-16/OP-17 unapproved. Production binds no policy and exposes counts with
  withheld rates/scores/calibration. No public minimum or quality number is
  selected. Verified-policy acceptance inputs are synthetic test evidence only;
  even passing descriptive metrics retain provisional status and no public claim
  authorization. Failed/absent/small gates never render zero substitutes.
- Preserve exact period/source/model/version identity and all service counts.
  Combined/source/family/horizon rows overlap; denominators are never added
  together. Old void cycles and repeated failed/delayed refresh attempts remain
  separately labeled measures. Unknown-lock horizons do not become coverage.
- Retain complete probability-score semantics, overlapping binary double-chance
  events and the service's actual uncertainty parameter. Use accessible data
  tables, fixed-band/event-count labels and named horizontal scroll regions on
  small screens. Model/provider/calibration artifact names are provenance, not
  validation or calibration claims.
- Add canonical exact-revision page links and match labels to bounded stored
  evidence references, using shared slug rules and batch-selected team names.
  The evidence remains in deterministic service order, not selected by success.
  Bump performance cache projection to 2; keep existing API evidence URLs.
- Explain the implemented daily EAT schedule, five-minute strict publication
  boundary, earlier-play closure, complete replacement/retention, source clocks,
  independent score polling, regulation-only settlement and audited corrections.
  Do not promise last-minute lineups, guaranteed results or faster actual sync.
- **OP-25 remains unresolved and blocks release.** When asked during 038, the
  user selected "Keep unresolved and record the release blocker." No actual
  correction/dispute owner, intake channel, review/evidence process or response
  commitment is approved. Public copy says submissions are not yet available;
  implemented correction audit mechanics are separate. No owner/contact/policy
  is inferred from specification attribution. Future terms/contact work needs
  the owner's approved facts.
- Credit API-Football by API-Sports and retain per-match original-source links.
  The official provider page was checked for attribution; no expanded coverage,
  source reuse rights, operational subscription or qualification is inferred.
  Retain prelaunch noindex and add the canonical methodology URL; broad SEO and
  the remaining legal/contact pages are outside 038. See
  The former methodology page has since been replaced by [Help](help-page.md).

## 039 - Privacy notice and visitor data inventory

- Implement a server-rendered English privacy page in the reusable information
  shell. Keep the existing footer route, square tokens, readable paragraphs,
  section anchors, absolute canonical and prelaunch noindex. Review date is
  10 October 2026, the actual technical review date; no effective date or legal
  approval is asserted.
- **Final notice and public release remain blocked.** OP-26/27/28 still lack
  owner-approved analytics/log-retention decisions, operator/audience/jurisdiction
  facts and a verified public privacy contact/rights process. The user explicitly
  chose "Keep unresolved and record release blockers" and "Keep current
  implementation; record unresolved decisions" during 039. Hosting/locations,
  contracts/transfers and source/evidence/audit/backup retention also need their
  OP-08/13/31/32 evidence. These facts remain unresolved; deferral is not operating
  approval. Author attribution and the user's timezone are not
  a legal operator, jurisdiction or public contact.
- `privacyNotice` records a prelaunch summary, `releaseReady: false` and a null
  effective date. Visible copy explains this gate and the missing facts. Do not
  substitute invented identities, addresses, email contacts, legal basis,
  regulators, rights deadlines or expiry guarantees. Any final publication needs
  actual owner decisions and jurisdiction-specific review; existing runtime
  approvals do not satisfy this notice gate.
- Inventory includes URL/search/filter requests, network/hosting logs, aggregate
  search accounting, shared response caches, optional layout local storage,
  tab/history restoration, page memory/refresh, remote image requests, external
  links and separate source/football records. The shared search counter stores
  no visitor identity/search string, **but cached pagination links can include
  search text**. Hashing cache keys is not an anonymity guarantee.
- Explain actual retention boundaries: layout preferences have no automatic
  expiry; tab records older than 30 minutes are ignored/pruned on later saves,
  not erased exactly at expiry; cache reuse lasts five seconds or at most six
  hours with source/invalidation bounds, while deletion needs maintenance and
  audit/backup retention is unresolved. Import/reuse permission deadlines do not
  prove deletion of all stored source copies.
- Current code sets no visitor cookies and enables no visitor analytics or ad
  tags. Advertising stays disabled. No auth, consent platform, analytics,
  messaging, hosting or retention service is introduced by this feature. Host
  logging and external media cookies remain separate, unverified arrangements.
  **Superseded in part (19 October 2026):** spec v1.9 paid access adds a member
  cookie, phone-number accounts, payment uploads and an owner dashboard behind a
  switch that stays off ([Paid access, Phase 0](#paid-access-phase-0-19-october-2026)). This bullet still records what 039
  found; prompt 066 rewrites the privacy copy, and anonymous visitors still get no
  cookies.
- Approved team logos load directly from their actual remote host through native
  images with `no-referrer`; the host still receives IP/request/browser data.
  Competition URLs are stored but not currently displayed. First-party brand
  assets/fonts stay bundled. Visiting/searching reads stored data and does not
  send visitor searches to football/research/AI providers.
- Reviewed Mozilla's storage/referrer documentation and EDPB transparency/rights
  guidance as a conditional completeness reference. No law's applicability or
  compliance is inferred while operator/audience facts are absent. See the
  factual inventory, references and explicit release requirements in
  [privacy-page.md](privacy-page.md). Terms/contact work remains with 040–041.

## 040 - Terms page and factual service limits

- Implement the English terms document in the existing public/information shell,
  with externalized copy, semantic topic links, bounded mobile typography and
  existing square tokens. Privacy and terms reuse `InformationNotice` for their
  review-date and publication-status header. Keep the existing footer entry and
  prelaunch noindex; add the absolute canonical terms URL.
- `termsNotice` records a prelaunch draft, `releaseReady: false`, no effective
  date and the actual technical review date, 10 October 2026. Initial server HTML
  prominently identifies the draft and the final-publication/public-release
  block. There is no final-document branch or runtime setting that establishes
  approval. This is a documented release gate, not an automated deployment lock.
- Carry forward the user's explicit 038 and 039 deferrals. **OP-25/27/28 remain
  unresolved release blockers**: no correction/dispute owner, verified contact,
  intake/evidence/review process, legal operator, audience or jurisdiction has
  been approved. Do not ask again or infer these facts from GitHub authorship,
  specification attribution, the product name or the user's timezone. The interim
  Contact page is not an operational intake channel. No response SLA is invented.
- Describe the actual free, account-free information service and four regulation
  markets. Probabilities are estimates; neither wins nor accuracy are guaranteed.
  AI-valid groups take priority over supported validated API-Football fallback.
  The daily midnight EAT run covers today plus six days; partial/delayed/missing
  information, original clocks, strict cutoff and separate score checks remain
  visible. This is implemented behavior, not an assertion of live source/model
  activation, subscriptions, qualification or uptime. **Superseded in part
  (19 October 2026):** the "free, account-free" scope is replaced by spec v1.9
  paid access (OP-37); prompt 066 rewrites the terms, including the narrowed
  `terms.use.body`.
- Link the actual methodology's probabilities, sources, measured performance,
  schedule, settlement and correction anchors and the current privacy summary.
  Keep detailed operational documentation there. The public dispute process
  remains unavailable even though stored provider corrections can resettle the
  same immutable locked pick.
- State supported public browsing/search/filter access without inventing a
  content licence or ownership assignment. Credit API-Football by API-Sports and
  original reporting; claim no ownership of team/provider/reporting assets,
  endorsement or affiliation. **OP-06/08/13 evidence remains required** for public
  display, redistribution and retention; private API access, attribution and
  original bundled branding do not resolve downstream rights.
- Final publication also needs the privacy page's unresolved hosting, logging,
  analytics and source/evidence/audit/backup retention decisions. OP-26 and
  related OP-31/32 gates remain open. The current implementation is retained;
  no acceptance tracking, account, paywall, betting/payment, analytics, contact
  backend or deployment is introduced. **Superseded in part (19 October 2026):**
  accounts, a paywall and manual payments are now in scope (spec v1.9, prompts
  057–067); betting stays out. This remains an accurate record of what 040 added.
- Reviewed the current [WIPO copyright FAQ](https://www.wipo.int/en/web/copyright/faq-copyright)
  and [CMA fair-contract guidance](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers)
  (updated 22 July 2026). These inform rights/clarity review only; the CMA source
  is conditional on actual UK applicability. No jurisdiction, liability waiver,
  indemnity, age restriction, forum/arbitration requirement or enforceability
  guarantee is selected. Actual operator/audience facts, permissions, owner
  approval and applicable legal review must precede a genuine effective date.
  See [terms-page.md](terms-page.md) for evidence and the remaining decisions.

## 041 - Contact availability and correction guidance

- Replace the interim Contact page with a short, server-rendered English page in
  the shared information/public shell. Reuse `InformationNotice`, square tokens,
  semantic sections and externalized strings; add the absolute canonical contact
  URL while preserving prelaunch noindex and footer/current-page navigation.
- **OP-25/27/28 remain unresolved launch blockers.** No verified public route,
  approved operator information, correction/dispute owner, evidence/review process
  or response commitment has been supplied. Carry forward the owner's explicit
  038/039 deferrals without asking again or treating deferral as approval. Do not
  infer a name or inbox from attribution, GitHub, branding or timezone. OP-29/30
  incident/alert ownership also remains unresolved; no public incident service
  is established by this page.
- `contactNotice` records a prelaunch unavailable state, `releaseReady: false`,
  null destination and the actual technical review date, 10 October 2026. The
  visible status says that reports are not collected/sent and public release is
  blocked. There is no final active-contact branch, environment bypass, fake
  destination, disabled form or operational support claim. Release review must
  enforce this documented gate; noindex/copy is not a deployment lock.
- Give future report guidance for fixture/team identity, source mistakes and
  result/outcome concerns. Request only the public match/revision URL, observed
  issue/proposed correction and a supporting public source if available. Personal
  or sensitive details are unnecessary. The page itself collects nothing.
- Explain the existing verified-result correction behavior: audited settlement
  uses the same locked pick, can be pending while correction settlement is due,
  and never substitutes a more favorable historical forecast. A public report
  does not itself mutate a record. No intake-review or turnaround policy is
  fabricated from these stored-data mechanics.
- Add ordinary links to privacy, terms, methodology and settlement, plus
  contextual contact-availability links in the privacy choices, terms outcomes
  and methodology corrections sections. Existing unavailable-process statements
  remain accurate and visible on all policy pages.
- All contact-page links use fixed internal paths via `informationHref`; the
  page never reads request query text for markup, destinations or mail headers.
  No arbitrary contact URL builder is added while no route is approved.
  Destination/evidence matching remains blocked. Once the owner supplies an
  approved email/HTTPS destination, validate that exact route and its scheme,
  encoding and control/header boundaries without sending a message. Never create
  a mailbox, messaging service or form backend as part of this feature.
- No accounts, uploads, public comments, tracking, paid provider calls, worker
  changes, incident-monitoring activation or later feature is introduced. See
  [contact-page.md](contact-page.md) for the evidence boundary and remaining
  owner-dependent checks. Prior privacy/terms/source-rights release gates remain.
  **Superseded in part (19 October 2026):** spec v1.9 paid access adds accounts
  and payment-screenshot uploads on `/en/subscribe` and `/en/account`, not on the
  contact page, which stays free of database reads; 066 adds one line pointing to
  Get access.

## 042 - SEO and crawlable discovery

- Fix all canonical and social URLs to `https://goalhint.com`; reuse the brand
  kit and complete each page's Open Graph/Twitter metadata. Redirect the root
  permanently to `/en` and configure the application's www host redirect while
  leaving actual DNS/HTTPS/deployment verification to its owning prompts.
- Reuse shared stored-read route factories and request-owned EAT clocks. Preserve
  dated pagination canonicals, including page numbers. Relative date aliases pin
  to a dated collection; search/filter variants retain their normalized query and
  receive noindex. Revision variants receive noindex and the fixture canonical.
  Robots permits these pages so crawlers can read the directive. Unknown fixtures
  remain actual 404s; known unavailable fixtures remain meaningful valid pages.
- Share the public fixture SQL predicate with sitemap discovery so retired
  competition scopes retain closed/void historical forecasts. Use native dynamic
  metadata routes with 2,000-entry match/date shards, advertised through robots.
  Reject absent shard IDs before large-offset reads. Lastmod uses creation,
  material fixture audits and public change events, never retrieval/request clocks.
  Omit lastmod where no reliable aggregate stamp exists; never invent dates,
  filtered destinations or revision sitemap entries.
- Classify deployment at request time using
  `GOAL_HINT_DEPLOYMENT_ENVIRONMENT`; unknown/missing/staging/development remains
  noindex, including a production-mode staging build. Actual production indexing
  also requires verified source-owned release approval and publication-ready
  privacy/terms/contact. Those facts remain false, so no indexing is activated
  and current sitemaps remain empty. Environment strings cannot clear the gates.
  Carry forward the owner's OP-25/27/28 deferrals, rights/quality and operational
  launch blockers. Prompts 048–049 own verified release/deployment integration.
- Emit only the visible English WebSite identity, safely escaped as JSON-LD.
  Preserve locale infrastructure without empty locales, selectors, fabricated
  operators/ratings, traffic claims or rich-result promises.
- Acceptance injects genuine isolated SQL projections and synthetic release
  evidence only into an ignored standalone test app. The same staging-built
  artifact is checked under staging and production runtime classifications.
  This proves local behavior, not live rights, provider coverage, domain hosting
  or release approval. See [seo-discovery.md](seo-discovery.md).

## 043 — Private recovery watchdog

**Decision date:** 10 October 2026. **Status:** local implementation; OP-29 live
activation remains blocked pending owner evidence.

- Use read-only, bounded inspection and exact reviewed plans, executed as
  `operations.recovery` jobs in the existing queue. The same worker provides
  leases, fencing, monotonic deadlines, finite attempts and exponential equal
  jitter. Persist append-only, sealed `RecoveryAudit` intents, completion receipts
  and sanitized failures; retry the original idempotent action after a crash.
- Detect missed midnight EAT runs within an explicitly approved 1–7 day lookback,
  expired database-clock leases, stalled pending jobs, missing due/observed-play
  locks and overdue/unresolved result work. Thresholds, plan TTL and resource
  bounds have no production defaults. The [operator runbook](recovery-watchdog.md)
  defines every field and private inspection/plan/apply/worker/audit command.
- Resume selection with its stored approved policy and original requests and
  envelopes. Keep committed and degraded manifests immutable; later discoveries
  cannot expand a cohort. Use the canonical locker and settlement service rather
  than another publication or outcome path. Queued/stalled jobs require their
  ordinary registered worker; recovery does not duplicate them or renew budgets.
- Compare queue versions, preserve attempt caps and reclaim only expired
  ownership through existing transactional transitions/backoff. Reuse the
  refresh store's full member eligibility checks. Published receipts return the
  existing revision. Immutable retained-previous/failed/unavailable/skipped
  receipts remain final: do not delete receipt/stage history to buy another
  attempt. Eligible operational failures without final receipts may resume the
  original job; locked cycles, cutoff and chronological ordering remain binding.
- Bound result backlog recovery to its existing `maxBatchesPerTick` and abort
  signal, before new dispatch. Preserve the original account lease, cadence,
  polling/correction horizons, quota reserves and spending gateways; missing
  responses do not establish emptiness, FT or a settled market.
- Bind every repair to validated current service/workload/hosting identity and
  exact plan approval; actor text and references are not credentials. Use coded
  incident reasons, affected IDs and redacted state in audits. No payloads,
  secrets, lease-owner tokens or raw errors are copied. Require SELECT/INSERT
  audit privileges and fail closed on corruption or missing approval.
- Mapping actions require confirmed numeric provider IDs and source/retention
  proof through the existing canonical catalog service. Resolve missing aliases;
  hold conflicting existing canonical bindings for a separately reviewed history
  preserving migration. Never infer identity from names, force a merge or rewrite
  historical fixture/prediction bindings.
- The private CLI supplies an independent detection and repair route when a
  hosted enqueue-only cron fails. OP-29 still needs primary/backup incident
  owners, approved thresholds, allowed automatic actions, reviewers and independent
  invocation frequency. OP-30/31/32 monitoring, restoration/retention and hosting
  gates and earlier source/budget/model/quality and public-policy blockers remain
  open. No live watchdog binding, external message, provider call, production
  migration, worker activation or deployment is approved by synthetic tests.

The owner separately approved a local MySQL 8.4 instance on port 3307 after
identifying the existing port 3306 service as MariaDB 10.4.32. Local development
now uses `goal_hint_db`, separate application/migration accounts and private
generated administration credentials. All committed migrations are applied;
this establishes no hosted or production qualification and does not resolve
OP-29/30/31/32. See [local-database.md](local-database.md) for operating commands.

## 044 Private monitoring and local verification

**Decision date:** 10 October 2026. **Owner direction:** keep incident ownership,
alert destinations, live thresholds and telemetry retention unresolved; implement
local verification only. Preserve the existing no-visitor-analytics implementation.
This is not approval of hosted monitoring, notification delivery or data recipients.

- Private operator inspection reads canonical run/job/publication/lock/result,
  recovery and shared quota ledgers. It uses the database clock, aggregate indexed
  windows and bounded EAT run/fixture/cycle/job/model correlations, without raw
  evidence, credentials, URL/query text, payloads or owner tokens. It never acquires
  a poller/job lease or dispatches providers/recovery work.
- `OperationsMonitorState` is one seeded MySQL row with at most 64 rule/scope
  slots and 128 KiB. Fixed rules/scopes bound cardinality. Fenced claims and stable
  delivery IDs support deduplication/retry across replicas and restarts; external
  sinks must deduplicate uncertain sends. Unknown or older evidence cannot clear
  newer incidents. No live destination or permissive operator binding is shipped.
- Policy contracts require explicit verified incident owner, destination, every
  threshold, finite retention/reminder/freshness intervals and approval references.
  There are no live defaults. Approved finite alert retention is bounded at seven
  days; active incidents remain one slot, and pruning occurs on authorized access.
  Stopped processes/backups do not imply physical deletion. Canonical history
  retention remains with OP-08/13/31. The local synthetic sink has bounded memory
  and TTL; test owners/thresholds/recipients are not production decisions.
- Critical severities cover outage, missing run, failed job, cutoff/lock failure,
  credential/subscription failure and cost cap. Warning severities cover degradation,
  staleness, impending expiry, pressure and missing evidence. Messages include the
  owner, coded destination/approval, incident/delivery IDs and
  [operations runbook](operations-monitoring.md). Primary/backup owner, response
  procedure, independent heartbeat/schedule and approved severity routing remain
  unresolved. No operating response-time commitment is made.
- The US$45 football **monthly payable** ceiling stays separate from AI, research,
  database, hosting/queue/workers, monitoring, network and domain caps. Cost inputs
  require actual verified period/usage/rate/invoice evidence and explicit coverage.
  Canonical AI/research liability is estimated rather than an invoice. Missing,
  partial and stale bills stay pending, cannot be treated as free capacity, and
  cannot clear known cost incidents without complete evidence. No alert changes
  rates/plans/budgets or authorizes spend. Infrastructure/football billing adapters,
  actual caps/fees and monitoring spend approval remain pending OP-12/14/30/32.
- Reusable server HTTP/cache hooks start disabled. An approved private bootstrap
  may install fixed process-local histograms/counters (five families, 25 series,
  explicit window of at most one day). No visitor ID, cookie, beacon, SDK, raw
  request, analytics upload or public diagnostic endpoint is added. OP-26/30/32
  still gate activation and recipients/retention; [privacy data flows](privacy-page.md)
  record both the disabled hooks and private alert state.
- Mobile aggregate summaries preserve mobile laboratory/field and environment
  labels, units, sample counts and nearest-rank p75 targets (2500 ms LCP, 200 ms
  INP, 0.1 CLS). Synthetic/lab checks prove neither production traffic nor field
  target compliance. Field source authorization, sampling qualification and real
  traffic remain pending. Search impressions/indexed pages/CTR need an authorized
  search source; return visits/match-detail visitor use remain disabled pending
  analytics choices. No traffic numbers or service property are invented.

OP-25/27/28 publication/legal/contact blockers and OP-29/30/31/32 operating gates
remain open. The local database schema/grants can support this implementation,
but its monitoring row stays empty and no live monitor/sink/scheduler is enabled.
Prompt 045 has not been started.

## 045 Backup and isolated restore verification

The owner explicitly selected **keep unresolved; verify locally only** on
10 October 2026. OP-31 remains a live release blocker. No primary/backup recovery
owner, RPO/RTO, source/history/backup retention, hosted storage/PITR capability,
key escrow or scheduled cadence is approved by this implementation.

- Private one-shot commands require a trusted operator binding, full-policy
  authorization, storage/access verification and a verified writer/DDL fence.
  Local mode accepts only process-owned disposable MySQL sources. No public
  recovery route, permissive live binding, persistent database change, scheduler,
  provider call, paid service or production restore is introduced.
- InnoDB snapshots stream through gzip and AES-256-GCM, with authenticated source
  identity, exact binlog coordinate, migration checksums, schema/dependency hashes,
  grants/policy references and complete table inventories. Snapshot consistency,
  table counts/row hashes, foreign keys and trigger definitions must match.
  Encryption keys/credentials stay outside Git. Test keys are ephemeral; live
  access, ACLs, independent encrypted storage and key recovery require proof.
- The local ROW-log archive seals contiguous closed logs and a recovery-point
  catalog. Replay uses one mysqlbinlog process and one SQL session through an
  exact completed-transaction position. Hosted log transport is deliberately
  unavailable until the selected infrastructure is qualified; the runbook gives
  the configuration, privileges, overlap, retention and off-host drill steps.
- Restore authenticates artifacts and exact schema/release compatibility before
  creating a new owned target. There is no target-URL or promotion operation.
  Events are disabled, workload credentials are absent, and a required trusted
  verifier checks history/access and conservative reconciliation. Only reviewed
  database-scoped principals/trigger definers are recreated with fresh secrets;
  server accounts and old authentication material are not imported.
- Original forecasts, evidence/publication clocks, canonical IDs, locked/current
  references, manifests, audit/correction history and idempotency receipts remain
  authoritative. Existing fenced recovery transitions handle stale leases. Before
  any future outbound activation, independently establish current account-wide
  capacity, reconcile lost/uncertain dispatches conservatively and use the
  existing counted reset-probe protocol. An older backup cannot grant spending
  capacity, reopen a closed cycle or duplicate a published forecast.
- Permission revocations, expiry and deletion obligations must be reapplied from
  an independent current record before any future promotion. Integrity does not
  grant reuse rights or unlimited retention. Privacy inventory records actual
  synthetic local artifacts and possible future cache/source/operational data;
  public retention claims and the no-visitor-analytics implementation stay as-is.
- Allowlisted backup events measure elapsed time and recoverable UTC points.
  The private monitor accepts only fresh approved aggregate backup evidence and
  explicit age limits; absent or unverified evidence stays pending. No live sink
  or threshold is inferred. Local restore duration includes allocation, import,
  verification, reconciliation checks and cleanup, but excludes live incident
  response/promotion. Null objectives are reported as **unapproved**.

See [backup and restore runbook](backup-restore.md) for procedures and
[development evidence](development-progress.md) for executed checks. OP-08/13/26/
29/30/31/32 and existing legal/contact/source/model/release gates remain open.
Prompt 046 has not been started.

## Live API-Football operation (10 October 2026)

Owner decisions in chat, recorded locally in the ignored `.goal-hint/owner-approvals.json`.
See the [live operations runbook](live-operations.md).

- **Fallback-only forecasts.** AI and research stay disabled until 011/012 have a selected,
  integrated provider. Publication and shadow gates no longer require AI configuration when
  `GOAL_HINT_AI_ENABLED=false`; enabling AI restores every AI and calibration requirement.
  Refresh plans may set `ai: null` with `modelVersionId: null` (null pin), admitted by the
  forward migration `20261010170000_fallback_only_refresh_intent`.
- **Provisional publication before 047/048.** The owner recorded release and quality
  approvals for local provisional publication. API-Football forecasts keep the existing
  *Provisional estimate* label; no accuracy or calibration claim is made.
- **Loopback production scope.** `GOAL_HINT_OPERATION_SCOPE=production` may run in
  development mode only when `DATABASE_URL` is loopback. Any remote/hosted target still
  requires `NODE_ENV=production` and verified TLS.
- **Free-plan operation.** `API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS=0` is now a valid recorded
  amount (still capped at US$45). The essential reserve is 20,000 of the 120,000 ceiling and the
  same one-sixth share on smaller plans; the previous rule made every plan below 20,000/day
  essential-only, so daily imports could never run.
- **Provider-day reconciliation.** Each account, plan and UTC provider day has its own durable
  limiter account seeded from the provider's `/status` remaining count (an uncounted endpoint),
  opened one minute after 00:00 UTC. This is the operator reconciliation the limiter runbook
  requires for missed periods and plan changes; old counters remain intact.
- **Budget-sized workload.** Refresh capacity, worker count and result cadence derive from the
  verified daily limit. Daily selection may cap refreshes by nearest kickoff (`refreshCapacity`)
  and records deferred fixtures; result sync accepts an optional slower `cadence`. Both are
  optional, so existing policy hashes are unchanged.
- **Single-dispatch pacing retries.** Refresh fallback/status bounds may retry only when
  `maxRequests` is 1, so retries wait out limiter pacing without a second HTTP request.
- **Append-only catalog receipts.** The catalog importer previously inserted a `FootballImport`
  row and later updated its fixture ID lists, and updated `FootballFixtureAudit` rows to merge
  shared-identity changes. The local role grants both tables insert-only (their intended
  semantics), so the importer now inserts the receipt and its audits once, at the end of the same
  transaction, with final values. Integration tests grant both tables insert-only.

## 050 — Feed query extensions (10 October 2026; verified 11 October 2026)

The code landed in commit `3d827f4` with the 051 screens. The choices below are
recorded from that code; the MySQL acceptance run is in the progress log.

- **One canonical URL per selection.** `league`, `country` and `market` are comma
  lists. Repeated list keys from plain checkbox forms join exactly like commas;
  every other key must stay unique, and an empty value cannot be combined with
  another value. League and country lists are deduplicated and sorted (at most
  50 each). Markets are put in policy order, and a repeated market is rejected
  rather than silently collapsed. Equivalent URLs therefore share one cache key,
  pagination marker and page link.
- **Countries come from stored competitions.** `country` matches
  `FootballCompetition.country`. It accepts letters, marks, digits, spaces and
  `.'()&-`, up to 128 characters. Country options are derived in the browser
  from the league options (distinct countries, summed fixture counts), so the
  response keeps a single bounded option list.
- **`sortMarket` is removed, not reinterpreted.** It is now an unknown key and
  returns 400. Sort direction is the separate `dir=asc|desc`. Defaults are
  kickoff ascending and probability descending, and a default direction is
  omitted from canonical URLs.
- **Shown pick.** Each fixture is ranked and filtered by one pick: in the
  displayed revision, the available family among the selected families with the
  highest stored unrounded `selectedProbability`, ties in policy order. The SQL
  uses one correlated `ORDER BY … LIMIT 1` subquery in the `MarketPrediction`
  join, so a fixture never appears twice. `bestCardFamily` applies the same rule
  to the same doubles, so the card shows the pick that ordering used.
- **Inclusive unrounded probability bounds (updated 12 October 2026).**
  `prob=MIN-MAX` accepts integer or plain decimal percentages in 0–100 with
  MIN ≤ MAX. Equal bounds are valid. The shown pick's stored unrounded
  probability must lie inside both inclusive endpoints; the earlier
  half-percentage-point display-rounding window is superseded. Decimal-text
  scaling preserves endpoint equality without multiplying or dividing binary
  floats. Fixtures without a shown pick are excluded whenever a non-default
  `prob` or `picks=only` is set. `0-100` is omitted.
- **Ordering ties.** Missing shown picks sort last in both probability
  directions. Ties fall back to kickoff ascending, then fixture ID ascending, in
  both directions; `sort=kickoff&dir=desc` reverses kickoff and fixture ID
  together.
- **Longer ranges, same forecast window.** Presets add Next 3 days and Next 30
  days, and explicit ranges allow 31 days (coverage dates are bounded to 31).
  Forecasts are still created only for today plus six days; later fixtures keep
  the existing seven-day `availabilityMessage`.
- **League options for suggestions.** Options gain `logoUrl` (approved remote
  image or null) and `fixtures`, the count in the unfiltered date cohort. The API
  keeps its name/country/ID order; the browser orders suggestions by fixture
  count, then name. Older DTOs parse with `logoUrl: null` and `fixtures: 0`.
  Fixture snapshots gain an optional, nullable `competition.logoUrl` so older
  snapshots still parse. Feed cache projection goes from 4 to 5.
- **Browser helpers.** `paginationItems` returns at most seven slots
  (`1 2 3 4 … N`, `1 … N-3 … N`, `1 … p-1 p p+1 … N`). `feedRowNumber` continues
  numbering across pages.
- **Reset keeps the status entry.** Reset clears search, leagues, countries, the
  probability range and the picks-only filter, and selects match result and
  kickoff ascending. It keeps dates, page size and the status entry, so the
  Results route keeps its `finished` status. This replaces the 033 rule that
  selected all statuses.
- **Picks-only filter.** `picks=only` keeps fixtures that have a shown pick. It
  backs the "With predictions" toggle, shortened to "Picks only" on phones.

## 051 — Feed screen layout (10 October 2026; acceptance pending)

The screens landed in commit `3d827f4` and were refined in later commits. A
concurrent workflow is still revising `src/components/**`, so only the
structural choices are recorded here:

- Cards below 64rem, an aligned table above it. Between 64 and 80rem the table
  uses the compact column set from `match-columns.ts`.
- League, country and market chips are ordinary links to canonical URLs, so
  filters work without JavaScript. Desktop edits stay drafts until Apply. The
  Apply label shows the draft's live count from `/api/matches` with
  `pageSize=1&leagues=0`, requested on desktops only. Phones apply choices
  directly.
- Numbered pagination replaces Load more and uses the 050 helpers.
- Odds controls render disabled, with the `feed.filters.oddsPending`
  explanation. They stay disabled until odds display rights are recorded and
  `publicPolicy.features.providerOdds` is enabled (prompt 052).

The 051 visual and keyboard acceptance (renders at eight widths, focus,
screen-reader names, reduced motion) has not been run; see the progress log.

## 052 — Provider odds import (10–11 October 2026; tracker blocked)

Implementation is complete for the rights-off state; the tracker row stays
unchecked (see the progress log). Runbook: [provider odds](provider-odds.md).

### Owner decisions (chat, 10 October 2026)

1. **Order.** Prompts run 052 → 053 → 054. This run implemented 052 only.
2. **Build now, run later.** The import is fully built but off:
   `GOAL_HINT_ODDS_IMPORT_ENABLED` defaults to `false`. The runner also needs a
   plan with spare ordinary quota, so the current Free plan (and every slow-paced
   plan) is never eligible. Live calls stay within existing budgets. The counted
   odds trial is **not** run now: it needs the upgraded plan. Its command,
   findings and ~20-request allowance are built so the owner can run it later.
3. **Display rights unconfirmed (OP-36).** Odds are imported and stored
   privately only. `publicPolicy.features.providerOdds` stays `false`. A new
   evidence requirement `football-odds-rights`
   (`GOAL_HINT_FOOTBALL_ODDS_RIGHTS_REF`) gates public projection writes; it is
   never required to start the runner. The public projection stays empty, the
   odds UI controls stay disabled, and while the flag is off `odds=` is an
   unknown feed key (400 on the API, not-found on pages). Ignoring the key
   silently was rejected: it would create cache keys for no-op filters.
4. **Technical defaults accepted** as recommended:
   - **One documented bookmaker**, fetched with `bookmaker=` and set by
     `GOAL_HINT_ODDS_BOOKMAKER_ID` (required when imports are enabled; chosen
     from the trial's coverage). Every bet that bookmaker publishes is stored.
     `basis = 'median'` is reserved in the schema as a later additive change.
   - **De-margin `proportional-v1`** per complete group of one bookmaker and one
     bet: implied_i = coverage × (1/o_i) / Σ(1/o_j), exact BigInt arithmetic,
     12 places, half-up. Double chance is normalized within its own bet (sums to
     2). A missing selection gives no group. An overround below 1 is still
     normalized and recorded; one of 10 or more is not a usable book.
   - **Precision.** `priceDecimal DECIMAL(10,4)` keeps the provider decimal;
     `displayHundredths` is rounded half-up once at write time, and a `CHECK`
     ties the two. Display and the filter use that value with inclusive bounds,
     never the probability filter's half-point widening.
   - **Range.** `odds=MIN-MAX` takes exactly two places, 1.01 ≤ MIN ≤ MAX ≤
     1000.00. The slider runs 1.01–20.00; a top thumb at 20.00 reads "20.00+"
     and serializes 1000.00. Both extremes mean no filter.
   - **Freshness.** A price must be reconfirmed within 12 hours before kickoff.
     Staleness is decided at write time (each runner tick, and on a complete
     sweep that omits the fixture), never at read time. After kickoff the last
     valid pre-kickoff price is frozen as the closing price.
   - **Retention.** Normalized fields only (`structured-odds-history`,
     `rawPayloadsStored: false`); snapshots carry `retainUntil` = kickoff + 30
     days; unchanged prices add no rows (`valuesHash` dedupe). No purge job. The
     owner still has to confirm that the private-use reference covers odds.
   - **Quota.** The existing `enrichment` priority (no new priority), 3-hourly
     UTC slots nearest EAT date first, a dedicated worker, and a gate that
     gives odds the spare above the day's ordinary floor (floor/spare: Free
     99/1 ineligible, Pro 6,639/861, Ultra 30,264/44,736, Mega 46,014/73,986).
     The gate counts odds' own dispatches against the spare; see "Review
     fixes" below for why `remaining ≥ floor + maxRequests` was replaced.
   - **Contract version.** `ODDS_CONTRACT_VERSION = "direct-v3-odds-2026-10-10"`;
     `API_FOOTBALL_CONTRACT_VERSION` is unchanged, so fallback and evaluation
     cohorts are not split.
   - **Bet-level quarantine** for malformed odds (see below).
   - **Gates first.** 050/051 were closed or recorded before 052.
5. **Tracker.** Row 052 stays unchecked. Blockers: the counted odds trial
   (pending the plan upgrade) and OP-36 odds display rights. 050 was checked
   after its MySQL acceptance passed; 051 stays unchecked.

### Provider contract and trial

- **Separate `odds` adapter namespace** outside `evidence` and `fallback`, so
  prices can never reach AI or fallback inputs. Odds callers never cache
  (`cacheMaxAgeMs: 0`). Pages hold 10 fixtures (`pageSizeOf`).
- **Bet-level quarantine** (deliberate deviation from row-level `invalid()`). A
  bet with a malformed, numeric or ≤ 1 price, a non-string or duplicate label, a
  label longer than 64 UTF-16 units, 0 or more than 1,000 values, or an id that
  does not fit an unsigned 32-bit column is dropped. It is listed in
  `rejectedBets` and `odds-bet-rejected:<bookmaker>:<bet>`. Without this, one bad
  bet would make the whole multi-page import a schema error. A bad fixture id, a
  bad or future `update`, or a duplicate bookmaker or bet id still invalidates
  the row.
- **Over-long names become null.** A bookmaker name over 128 characters, a bet
  name over 256, or one with control characters is stored as `null` with
  missing coverage (`odds-bookmaker-name:*`, `odds-bet-name:*`), matching
  `odds-input` and the column widths. A null name never matches a mapping.
  Before, such a name passed the normalizer and then rejected the whole fixture.
- **Provisional launch bet ids.** `launch-odds-v1` pins Match Winner (1),
  Double Chance (12), Goals Over/Under (5) and Both Teams Score (8) from the
  documented examples, before any trial evidence (the plan said "after"). This
  is safe because a price needs the id **and** exact name to match both the
  latest stored `/odds/bets` catalog and the `/odds` row; a mismatch only
  withholds the price. The trial's `odds-bet-catalog` finding confirms or
  replaces them.
- **`oddsSuitability` is separate.** The trial report gains `oddsSuitability`,
  built only from `odds-pagination`, `odds-update-times`, `odds-bet-catalog` and
  `odds-coverage`. Odds findings no longer affect `liveSuitability` or
  `liveOperations`; bounded odds samples are left out of the core pagination and
  update-time findings. `odds-display-rights` (rights scope `odds-display`)
  gates only public prices. `PROVIDER_TRIAL_VERSION` stays 1 (additive).
- **Trial allowance.** About 20 owner-authorized requests: account, bets,
  bookmakers, D with two pages, D+1..D+6 with one each and one `fixture=` query
  (at most 13), leaving 7 for a second bookmaker. A sample is bounded by the
  task's `maxRequests`, because a `maxPages` stop reads as pagination-incomplete.
  The report does not measure response bytes per page; read them from the
  journal.

### Storage

- **Five tables** (migration `20261010200505_provider_odds_import`): append-only
  `OddsImportBatch`, `OddsBetObservation` and `ProviderOddsSnapshot`; mutable
  `FixtureOddsState` and `FixtureOddsPrice` with column-scoped updates and no
  `DELETE`. Odds never bump `FootballFixture.dataVersion`, never write
  `PredictionChangeEvent` and never touch `FootballImport`, so in-flight fallback
  work and global caches are not disturbed.
- **Snapshot change detection** compares the canonical values **and** the
  recorded bookmaker and bet names; the snapshot id fingerprints both names. A
  rename with identical prices therefore appends a chained snapshot. Chains are
  walked by `previousId` from a single head; forks, gaps and cross-fixture links
  are refused.
- **Price times are first-observation times.** A `FixtureOddsPrice` row's
  `retrievedAt` and `providerUpdatedAt` come from its source snapshot, so they
  say when that exact price was first seen. Reconfirmations move
  `FixtureOddsState.lastRetrievedAt`, which staleness uses. This keeps an
  unchanged price from invalidating caches every slot.
- **A later observation wins over a sweep's absence**: withdrawal skips a
  fixture whose `lastRetrievedAt` is after the sweep's receipt.
- **Write retries.** The store retries a genuine deadlock or write conflict
  twice; its callbacks hold no provider I/O. Candidate reads for withdrawal and
  expiry run in transactions so they share the database clock with the
  per-fixture re-check.
- **Cache triggers** fire only when `publicVersion` changes (no `DELIMITER`).
- `test:odds` runs `odds.test.mjs`, `odds-import.test.mjs` and
  `odds.integration.mjs`.

### Jobs and runner

- **Disabled jobs expire** through the job definition's `eligible()` hook
  (`eligibility-expired`) and write no receipt. This supersedes the plan's
  "return succeeded with a disabled receipt".
- **A refused slot expires** instead of retrying as rate-limited. The gate's
  slack never grows within a provider day and 3-hour UTC slots never span two
  days, so a retry cannot succeed; retrying would exhaust 8 attempts and fire
  the failed-jobs alert daily on Pro once the spare is spent. While no provider
  day is open (UTC rollover settling) the job retries instead.
- **`oddsJobOutcome`** decides each receipt: a non-retryable quota denial
  (essential reserve, daily limit) expires; transport, 429, deadline,
  shared-work and pacing waits retry within the slot; credential, subscription,
  authorization and invalid-request failures fail without retry (so the alert
  fires); schema, coverage, pagination and size faults and every partial sweep
  end `succeeded` and keep their receipt. The adapter's `retryable` flag is
  honoured.
- **Catalog first.** `odds.catalog` has priority 8, above every price sweep
  (7 down to 1), and is enqueued before each slot's imports (one row per UTC
  day).
- **Shared ceilings.** `oddsMaxRequests` (154 per sweep, 3 per catalog) feeds
  both the adapter bounds and the job gate.
- **Monitoring.** An informational `odds-requests` metric (sum of
  `OddsImportBatch.requestsDispatched` in the window) with no alert rule. The
  dedicated odds worker polls every 10 s when idle.
- **Costs.** Odds stay out of the AI/research ledger. Football money remains the
  flat `API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS` (≤ US$45). Each odds request is
  attributed three ways: `OddsImportBatch.requestsDispatched`, `DurableJobUsage`
  (provider `football`, no cost reference) and `ApiQuotaAttempt` at enrichment
  priority.
- **Deferred budget note.** `/odds?date=…&bookmaker=` returns every league the
  bookmaker prices, while only imported fixtures are applied. On Pro the 861
  spare requests fund about five full 150-page sweeps a day; smaller dates cost
  far less (seven ten-page dates per slot cover all eight slots). If dates are
  large, the spare runs out in the morning and evening kickoffs go stale before
  kickoff. Once the trial shows fixtures and bytes per page, consider
  league-scoped queries (league + season + date); that would need adapter,
  trial and validation changes. The gate already prevents overspending.

### Read path

- **The effective flag drives SQL and prices together.** `feedSql`,
  `storedFeedFixture`, the detail service and query parsing all take the same
  effective `providerOdds` value (the global flag unless an isolated test
  overrides it), so the SQL join and filter can never disagree with record
  prices. While it is off, the feed SQL never references the odds tables.
- **Extremes are omitted.** `odds=1.01-1000.00` parses to no filter and is
  omitted, like `prob=0-100`, so one cohort has one canonical URL and cache key.
  Hand-built invalid bounds fail serialization rather than being normalized.
  `serializeFeedQuery` re-checks a query that already holds bounds with odds
  enabled (bounds can only come from a parse that accepted them), while
  `applyFeedDraft` keeps the global flag, so a forged draft fails closed.
- **Shown pick only, exact match.** The filter joins the shown pick's family and
  selection, `stale = FALSE`, 1:1 by the primary key. Fixtures without a pick or
  a fresh price drop out, and another family's price never qualifies a fixture.
  Record `prices` carry one entry per published family's pick by the same rule;
  `selectedCardPrice` never falls back across families.
- **Observation fields.** Prices and the detail `odds` envelope change without a
  fixture-version bump. `mergeFixtureObservation` adopts `prices` at an equal
  version (feed reducer, pagination merge and live detail), and `sameCardFixture`
  compares them so cards re-render.
- **Detail groups** require every selection of the family to be fresh, from one
  snapshot, with one overround, basis and retrieval time. They are labelled
  `market-implied` and never enter `snapshot` or forecasts.
- **No bookmaker identity in public responses**: no name, id, snapshot id or
  link; `basis` and the method are the only provenance.
- **Cache.** Feed projection 5 → 6 and detail 3 → 4. The odds bounds enter the
  feed key through the canonical query. The flag itself is not part of the key:
  flipping it is a code change, and mutable entries live five seconds.
- **One runbook.** [provider-odds.md](provider-odds.md) holds storage, import
  and read-path rules; there is no separate import document.

### Review fixes (11 October 2026)

- **The odds gate counts ordinary use once.** The first gate was
  `remaining ≥ floor + maxRequests`. `remaining` already excludes the ordinary
  requests spent today, but the floor is the whole day's ordinary need, so each
  spent ordinary request also stayed reserved. On Pro the gate closed after 707
  requests of any kind; the one-minute date poll alone reaches that near 11:47
  UTC, after which every slot expired and evening kickoffs went stale without a
  closing price. The gate now gives odds their own budget:
  `oddsUsed + maxRequests ≤ spare` and
  `remaining − maxRequests ≥ max(reserve, floor − (used − oddsUsed))`.
  `oddsUsed` is the count of dispatched `enrichment` attempts in the open
  period, the limiter's own ledger. It includes uncertain dispatches that never
  got a receipt, so it is more complete than summing
  `OddsImportBatch.requestsDispatched`. Odds are the only live caller at that
  priority. The second check binds only when the provider reports fewer requests
  left than the limiter counted, or when ordinary work runs past its plan; odds
  then still leave the reserve (`liveWorkload(...).odds.reserve`, 750 on Pro).
  The stricter gate was rejected because it made Pro odds nearly useless after
  midday.
- **The write phase has its own time budget.** The provider walk now ends 180
  seconds after the attempt starts (it was 270 of the 300-second job), leaving
  at least two minutes for writes. Two changes make the writes cheaper. The
  store verifies each receipt once and keeps up to 16 verified bodies, which is
  safe because receipts are append-only and sealed; before, each fixture
  re-read and re-parsed the whole receipt. Each fixture's changed bets go in
  multi-row `INSERT IGNORE` statements (up to 100 rows each) with one sealed
  `SELECT … WHERE id IN` re-read, instead of two round trips per bet. Resuming a
  timed-out import from its stored receipt was not built: receipts hold
  observation hashes, not prices. A retry walks the pages again and is charged
  to the odds spare. Re-size `maxPages` and the timeouts from the counted
  trial's fixtures- and bets-per-page evidence.
- **Withdrawn display rights hide existing prices.** `expire()` runs on every
  runner tick, even with imports off. When `football-odds-rights` does not
  verify, it first stales every fresh `FixtureOddsPrice` row, including frozen
  closing prices after kickoff and fixtures no sweep reaches. The sweep is
  bounded per call, makes no provider call and raises each changed fixture's
  `publicVersion` once. Before, prices written under the rights stayed fresh,
  hidden only by the code flag.
- **Each snapshot links to the receipt that observed it.** `applyFixture`
  requires the receipt's entry for the fixture to carry outcome `apply` and the
  row's own observation hash, and one of the receipt's pages to carry the row's
  retrieval time. Otherwise it refuses with `invalid-request`.
- **Grant order.** The odds grants can only be applied after
  `npm run db:deploy`: MySQL refuses table and column grants on tables that do
  not exist yet (ERROR 1146). The runner's `expire()` and the monitoring
  collector both need SELECT on the odds tables as soon as the migration is
  deployed.

### Flagged, not changed

- Pre-existing: `live-authorities.ts` refresh `verifyPlan` calls
  `fallbackRefreshPlan` without `workload.pacing`, so refreshes on slow plans
  (the current Free plan) are refused. The odds authority shares the runtime's
  own `oddsPolicy` object and does not repeat it. Raised as a separate task.
- The odds subtests in `tests/live-runtime.integration.mjs` skip themselves when
  fewer than three minutes remain in the current 3-hour slot (about a 1–2%
  chance per run); slot boundaries are covered by unit tests.

## Team codes for tight phone cards (11 October 2026)

Owner request (chat): the code should stand in for long names in tight spots
such as phone cards, and the full name shows when there is no code. Owner
decision: "Import codes + safe shortening". A low-priority team-code import
uses spare quota only (slow on Free, quick after the plan upgrade). Until a team
has a code, the card uses the safe shortening rules, then an ellipsis.

### Read path

- **Shape.** Fixture snapshot teams gain an optional, nullable `code` with the
  strict pattern `^[A-Z0-9]{2,5}$`. The feed and detail read publish
  `validTeamCode(FootballTeam.code)`, which takes trimmed ASCII letters and
  digits only and uppercases them; anything else is null. `validTeamCode` now
  checks ASCII before uppercasing, so "ß" (which uppercases to "SS") can never
  become a code. The field is optional, so payloads cached before codes still
  parse.
- **Cache.** Feed projection 6 → 7 and detail 4 → 5, following the
  per-endpoint projection convention for additive fields. The global
  `public-response-v1` key contract is unchanged: revision and performance
  payloads carry no fixture teams.
- **Card.** `MatchCard` passes `team.code ?? null` to `ShortTeamName` for both
  teams. The memo comparator is unchanged. Team fields change only with
  `dataVersion`: the catalog's shared-identity path bumps every fixture that
  renders a changed team, and equal-version merges keep the previous teams.

### Import and markers

- **No migration.** The team-code job writes no codes. It runs the ordinary
  catalog teams import (`/teams?league&season`), whose append-only
  `FootballImport` receipt (kind `teams`, scope key and `observedAt`, already
  indexed) is the per-competition-season "checked at" marker. A complete,
  partial or degraded receipt settles the league for 30 days. A failed receipt
  backs it off for one day. Rejected alternatives:
  - A marker column on `FootballSeason`: its cache trigger invalidates
    `global:catalog`, so every marker write would flush the public cache.
  - A new marker table: it needs a reviewed migration, owner grants and a new
    backup table, and records nothing the receipt does not already hold.

  Limitation: an import that throws before writing its receipt (authorization,
  retention, an invalid result) leaves no marker. The job then fails without
  retry, so the alert fires, and the next slot asks again. Those faults affect
  every import, not one league.
- **Selection.** Each sweep reads competition-seasons with a fixture kicking off
  from 3 hours ago to 8 days ahead whose home or away team has `code IS NULL`
  (nearest kickoff first, in keyset pages of 200, at most five pages). It skips
  leagues checked recently and imports at most 4, one at a time. A failed
  receipt ends the sweep. See "Review fix" below for the paging.
- **Shared spare.** Team codes use the odds gate (`oddsQuotaAllows`) with the
  slot's whole ceiling of 8 requests (4 leagues × one page plus one retry).
  `oddsUsed` counts every dispatched `enrichment` attempt, so odds and team codes
  share one spare and together never exceed it or take the reserve. Team codes
  get no reserved share: the job has priority 0, below every odds job, on the
  same single enrichment worker, so the two gates are never checked
  concurrently. Eligibility is `workload.odds.eligible` (at least 200 spare,
  standard pacing), so imports are off on Free and slow plans. This supersedes
  the 052 note that odds are the only live enrichment caller.
- **Switch.** `GOAL_HINT_TEAM_CODES_IMPORT_ENABLED` defaults to true (an
  `enabledByDefault` schema). It is still gated by spare quota, and `false`
  turns imports off on any plan.
- **Schedule and outcomes.** `teams.codes` v1 runs once per UTC hour (payload
  `{ slot }`, expiring at the slot end, 4 attempts, 600-second timeout). A
  refused gate, a disabled switch or an ended slot expires the job
  (`eligibility-expired`). Storage unavailability retries within the slot. A
  refused import fails without retry. Failed receipts, time-outs and aborts
  succeed and keep what was stored. A league starts only while 3 minutes remain
  in the attempt and the slot. Its provider window ends after 60 seconds.
- **Wiring and monitoring.** The live runner's dedicated odds worker becomes the
  enrichment worker (`runtime.enrichment.registry`; log events
  `enrichment-job-*`, which replace `odds-job-*`). The maintenance loop enqueues
  each slot's job (`team-codes-scheduled`). The `ready` line and
  `npm run live:status` report the switch and eligibility. Recovery repair
  expires a stalled `teams.codes` job after its slot ends. The informational
  metric `team-code-requests` sums `requestsDispatched` of `teams` receipts in
  the lookback window. It reads `FootballImport` without an index on
  `kind`/`recordedAt`, which is acceptable at tens of receipts a day.

### Review fix: paged selection (11 October 2026)

- **Defect.** The selection read the nearest 200 candidate competition-seasons
  and only then dropped the ones checked recently. Leagues that stay codeless
  after their check (youth, women's, small clubs) remain candidates, and a
  worldwide date import puts far more than 200 competition-seasons in an 8-day
  window. Whenever the nearest 200 had all been checked, a sweep made no
  request even though unchecked leagues kicked off later, so nearest-first was
  not honoured and spare slots were wasted.
- **Fix.** `candidates(window, limit, after)` takes a keyset cursor (earliest
  kickoff, league id, season; a `HAVING` on the grouped row) and
  `createTeamCodeService` pages through that order: 200 per page, at most five
  pages (1,000 competition-seasons) per sweep, stopping once it has the sweep's
  due seasons. Each page's markers are read by scope key as before (indexed).
  Past five pages the sweep waits for the window to move. No schema change.
- **Free plan (open owner decision).** The owner asked for "slow on Free,
  quick after the plan upgrade". With the odds gate the Free plan gets no
  imports at all. `teamCodeImportsEnabled` requires `workload.odds.eligible`,
  and `liveWorkload(100, 1, "Free", 10)` gives floor 99, spare 1, reserve 14 and
  slow pacing, so it is false. A later review confirmed this. The import code
  stays as it is because the choice spends Free-plan quota, which is the
  owner's to decide.
  - **(a) Off on Free.** Accept the current behavior and record it here as an
    owner decision. Until the upgrade, phone cards show the card's derived
    abbreviation for codeless teams ([match card](match-card.md)).
  - **(b) A Free trickle with its own gate.** At most one league a day (2
    requests: one page plus one retry). It runs only after the day's refresh
    jobs (21:00–24:00 UTC) have run. The provider-reported remaining quota must
    still cover those 2 requests, the reserve and every ordinary request still
    due before the UTC rollover. This needs a new gate, separate from
    `oddsQuotaAllows`, so the shared odds gate is not loosened and odds stay off
    on Free. It yields about 30 leagues per 30 days.

  Until the owner chooses, behavior is (a). The open decision is listed under
  "Owner actions" in [development progress](development-progress.md).
- **Card follow-up.** The owner asked again (11 October) that phone-card team
  names stay abbreviated. The UI workflow is changing the card to always show
  the valid provider code, or else a derived three-letter abbreviation
  (`src/domain/team-name.ts`). That supersedes the "Card" bullet above and the
  "shortening rules, then an ellipsis" fallback. The read path and the import
  are unchanged by it. The card's rules are recorded in
  [match card](match-card.md).

### Flagged, not changed

- A shared team change bumps every fixture of that team, history included,
  inside one catalog transaction (live timeout 120 s). The database holds days
  to weeks of fixtures, so a league is a few hundred fixtures at most. Revisit if
  history grows large.
- Match insights (head-to-head and form lists) and the detail banner do not use
  codes; they are not tight spots.

### Review follow-up (11 October 2026, second pass)

- **Re-checked and kept.** The keyset cursor (a `HAVING` on the grouped
  earliest kickoff, then league id and season, matching the `ORDER BY`), pages
  of 200 with at most five per sweep, per-page marker reads by scope key, the
  30-day and 1-day markers, the Free/slow-plan gate (`teamCodeImportsEnabled`
  needs the odds eligibility, and the job re-checks the shared spare for its
  whole 8-request ceiling before any call) and the per-slot bound (4 leagues,
  2 requests each) are correct. The selection does at most 5 candidate reads
  and 5 marker reads per sweep.
- **Fixed: a season could be requested twice in one sweep.** Pages are separate
  reads. If a catalog write between two reads moved a season's earliest
  codeless kickoff past the cursor (its first fixture's team got a code, or the
  fixture moved), the keyset read returned that season again and the sweep could
  import the same league twice. `due()` now considers each `(league, season)`
  once per sweep.
- **Fixed: a short page now always means the end.** The store dropped rows with
  an unusable league id or season after `LIMIT`, so such a row would make a full
  page look short and end the paging early. Those bounds are now in the SQL
  `WHERE` (the in-memory filter stays as a re-check).
- **Fixed: the marker read could drop a settled receipt.** `checks()` read the
  raw `teams` receipts of a page's leagues newest first with a 5,000-row cap.
  A league retried after daily failures keeps adding failed receipts, so enough
  of them across a page could push another league's only settled receipt out of
  the read, and that league would be requested again inside its 30 days. The
  read now groups by scope key and status and takes `MAX(observedAt)` (at most a
  few rows per league, on the existing `(scopeKey, observedAt, sequence)`
  index), so every marker is exact and the cap is gone.
- **Card display.** The owner has since said codes are no longer shown on
  cards; the card is the UI workflow's ([match card](match-card.md)). The read
  path keeps publishing `code` and the import stays as committed.

## Country flags beside competitions (11 October 2026)

Owner: "The country should be displayed alongside its flag on the left." No flag
was stored: the normalizer kept `country { name }` only and
`FootballCompetition` had `country` and `logoUrl`. The card itself is the UI
workflow's; this records the data side.

- **Sources.** `/fixtures` `league.flag` (the regular date sync, so no extra
  requests) and `/leagues` `country.flag` (the `competitions` catalog import;
  a league-level `flag` is accepted when the country has none). The official v3
  examples show `https://media.api-sports.io/flags/<code>.svg` and `null` for
  "World" competitions. No recorded real payload in the repository contains the
  key (the synthetic fixtures omit it), and no live call was made to confirm it,
  so absent and null are both handled as "no flag".
- **Leniency.** The key was stripped before this change, so a malformed value
  (anything but a string) counts as no flag instead of rejecting a fixture row
  that used to be accepted. Strings go through the logo path unchanged.
- **Rights.** The same checks as logos: `isSafeRemoteImageUrl` (credential-free
  HTTPS, no query or fragment, at most 2,048 characters) in the normalizer, the
  catalog batch and the read; `verifyLogo` in the normalizer, the batch and the
  store. The live authority's media pattern now also accepts
  `https://media(-N).api-sports.io/flags/<xx>.svg` and `<xx>-<sub>.svg`, under
  the same owner-recorded public-rights reference as logos.
- **Storage.** `FootballCompetition.countryFlagUrl VARCHAR(2048) NULL`, migration
  `20261011075627_competition_country_flag`: one additive nullable column, no
  backfill (MySQL 8.4 adds it in place). A later null, absent or unapproved flag
  keeps the stored one, as for logos. The exception is a row that changes the
  competition's country: the flag belongs to the country, so such a row stores
  its own flag or none, never the previous country's.
- **No fixture version bump for a flag alone.** Shared competition changes
  version every fixture of the competition, history included, in the import
  transaction. A flag is new for every competition at once, so the first date
  sync after the migration would have versioned nearly every stored fixture in
  one transaction (live timeout 120 s) and risked failing the date sync. A flag
  is decoration of the already versioned country name, so it is written without
  marking the competition changed. The public cache still invalidates (every
  `FootballCompetition` update advances `global:catalog`, and feed/detail entries
  live 5 seconds). A page left open shows the flag after that fixture's next
  version bump or a reload. When a flag changes together with a versioned field,
  the shared-identity audit records both.
- **Publication.** Optional nullable `competition.countryFlagUrl` on the fixture
  snapshot (`src/domain/fixture-snapshot.ts`), so the feed record, the detail
  fixture and the client refresh parse it, and older cached payloads still
  parse. `fixture-read.ts` publishes the stored value only if it is still a safe
  URL. Feed cache projection 7 → 8, detail 5 → 6. The catalog fixture snapshot
  (coordinator input) carries it too. The feed's league filter options and match
  insights are unchanged.
- **When flags appear.** The catalog date sync is the runner's daily selection:
  seven `/fixtures?date=` imports at each 21:00 UTC occurrence (00:00 EAT), or as
  soon as the runner starts when that night's run is missing. The result poller
  and the refresh status reads do not write competitions. So after the migration
  is applied, every competition with a fixture in those seven dates gets its
  flag at the next daily selection (tonight, 11 October 21:00 UTC, if the runner
  is up). Competitions with no fixture in the synced dates get one when they next
  appear. International competitions never get one.

## Search: exact and similar results (18 October 2026)

Supersedes the substring wording of the 9 October feed record and extends the
ranked matcher of a852296.

- **Normalization.** Case, accents, Unicode compatibility forms, other scripts'
  decimal digits, invisible format characters, spacing and punctuation fold
  before matching. Numbers keep their value in the request locale: grouping
  separators drop ("10,000" = "10000"), a decimal stays one word with trailing
  fraction zeros removed, and a comma that cannot group thousands separates two
  numbers ("1,5" is never 15). Numbers never match a neighbouring number.
- **Spelling tolerance.** One edit up to five letters, two up to eight, three
  from nine, at most 30% of the word; beyond one slip the first letter must
  agree. Fallbacks: abbreviations that keep at least 60% of a word in order
  ("Mchster", "Untd") and equal consonant outlines. Alternate forms (demonyms,
  "liga"/"pokal" for league/cup, "W" for women) match exactly or as prefixes only.
- **Aliases.** Established abbreviations apply to whole stored names only; in a
  query they also apply as phrases. Words that are also ordinary name parts
  ("Juve", "Wolves", "US", "UK") apply only as a whole query. Nicknames and
  demonyms are read in queries only, never in stored names. Name articles ("La",
  "Al", "de") join the club words that never decide a match.
- **Sentences and several teams.** Filler words are dropped. A name mentioned in a
  longer query covers only its words, and a fixture combines the words its teams
  and competition cover. Leftover generic words or numbers in a mentioned name
  ("City", "U21") may not stand against an unmatched generic word or number of
  the query, and an alias expansion counts as one team.
- **Tiers.** Direct matches (exact, alias, reordered, prefix) score 700–1000;
  corrected, inner-fragment and partial matches score below 700. A fixture is
  exact when every word is matched directly. Exact fixtures sort first, then
  wider coverage, then the strongest name, then the chosen sort. The response
  carries `search: { exact, similar }`; the feed labels the first similar record
  and the league/country checklists group options the same way.
- **Unchanged.** Every other filter, counts, league options, pagination by SQL
  LIMIT/OFFSET, the catalog bounds (50,000 rows, 10,000 identities), the search
  rate limit and "no broad fallback": a search with no credible match is empty.
  Feed cache projection 12 → 13 and pagination contract v3 → v4.

### Review follow-up (18 October 2026)

An adversarial review of the matcher against the stored catalog found gaps;
all are fixed with regression tests written in stored-name forms.

- A word shared by two named teams ("Man Utd vs Man City") belongs to both alias
  groups, and the words of an expanded alias count as distinctive.
- Club forms (AC, FK, RB, SV, FF, IS, US, ...) and name articles join the club
  words. A mention may leave other name words over when it matched a distinctive
  word of the name directly ("Bayern" in "Bayern München"), never through a
  spelling correction ("rice" is no mention of "Costa Rica").
- Words resembling a generic word are ambiguous: abbreviations such as "Cty" or
  "Un" stay qualifiers, while "Reading" or "Internacional" become distinctive
  when a searched name contains them (the feed checks its whole date cohort, the
  checklists their options). Generic leftovers conflict with unmatched
  qualifiers, and numbers only with numbers.
- Stored names containing a phrase the query expanded are read the same way, so
  "PSG U19" and "Singida Black Stars" stay findable in sentences. Two teams set
  apart by "vs" never join into one alias.
- Filler is removed before articles are judged ("Serie A matches"); filler words
  in stored names are optional; Roman numerals behave as numbers; a subject "I"
  before a verb is filler. A last one- or two-letter word reads as a prefix.
- The Athletic Club alias meets "Athletic Bilbao"; initials skip age groups;
  "U-19", "1º", Arabic separators, locale space grouping, Hangul fillers and
  Greek final sigma normalize.

### Second review follow-up (18 October 2026)

A second adversarial pass over the stored corpus found regressions from the
first follow-up and further gaps. All are fixed with stored-form tests.

- Queries split into sides at "vs", "versus", "against" or a "v"/"x" between two
  words. Each side reads whole aliases and nicknames, alone or before qualifiers
  ("US vs Mexico", "US W", "Spurs U21"); a nickname inside a longer name stays
  literal ("Singida Black Stars"). Qualifier conflicts only look at the side a
  mention answers ("Boca vs Racing"), and one stored name that covers two sides is
  a similar result ("Inter Milano W" for "Inter vs Milan").
- "US" is a word again, not a club form. Stored names read aliases before
  qualifiers too ("USA W", "PSG U19"), plus stored short forms ("Inter",
  "Tottenham"); queries never use those, so "Inter" still finds Inter Miami.
- A record or fixture stands when a team or competition name covers a distinctive
  word, so "Leeds United" finds the stored "Leeds" as a similar result.
- A half-typed last word never matches numbers, age groups or numerals; a name
  keeping another division marker beside the matched one is a similar result.
- Women's forms ("W", "women's", "ladies", "Femenil", "Frauen") read as one word;
  plural age groups ("U21s"), letter ordinals ("1a", "2nd") and elided articles
  ("L'Aquila") normalize; joined spellings also compare with every typed word
  ("ACMilan", "LaLiga"); a run-on word is no spelling slip ("ManchesterUtd");
  one-slip misspellings of longer filler words are dropped ("tomorow").

## Paid access, Phase 0 (19 October 2026)

The owner approved paid access ([monetization plan](../prompts/monetization.md))
and specification v1.9. Phase 0 records the change; it adds no application code.

- **Recorded:** specification v1.9 (sections 1–3 and 12–15); the rewritten
  account-free invariant, the gated-reads invariant and the amended 028–031 gate
  in `dev-plan/000-index.md`; prompts 057–067 and their tracker rows; edits to
  the pending prompts 053–056; OP-37–OP-40; and the paid-access extensions of
  OP-06, OP-26, OP-27, OP-31 and OP-36.
- **Superseded:** the Settled "Access and product scope" row and the
  no-account/no-paywall statements in the 039–041 entries, each marked in place.
  The 028–029 anonymous-read statements stay true; from 061 an optional member or
  owner cookie selects the gated or full view.
- **Pending prompts:** 053–054 tie the family-total invariant (and the gated
  `families` list) to `publicPolicy.markets`; per-market performance stays
  aggregate-only. 055 reads My Picks through the gated reads, ignores
  subscriber-only Profile defaults for free viewers and makes the avatar the
  account entry. 056 makes Tips subscriber-only for unfinished fixtures, never a
  probability-ordered list for free viewers. 055–056 now depend on 061–062.
- **Design choices carried by 057–067** (plan section 3):
  - The phone number identifies; the access code is the secret. Phones are
    canonical digits with the country code and no plus (`256772123456`),
    `VarChar(15)`, unique and not hashed.
  - A session sees picks only while the account has a running period and one of
    the account's codes was entered in that session. A code works only on its own
    account and never moves; a number change is one audited owner action that
    revokes the old codes and issues one new code.
  - The owner approves a reported payment (payer number, transaction ID, amount,
    screenshot) only after finding the money in their own wallet; nothing is
    approved automatically. (network, `txnKey`) is unique among approved payments.
  - Policy lives only in `src/domain/paywall.ts`. Redaction happens on the server
    after the cache read, through `src/server/members/gated-reads.ts`, with
    explicit `gated` wire variants. Finished, canceled and awarded fixtures are
    free; metadata is generic.
  - `paywallMode` is `off` (default), `test` or `on`; a valid owner session sees
    full content. The owner dashboard reuses the analytics owner login, session
    table and cookie. No new env keys and no new npm dependencies.
  - `publicPolicy.access` stays `free-and-account-free` until 061 changes it, so
    it always describes the running code.
- **Owner decisions, later on 19 October 2026:** the plans are Daily (24 hours from
  activation, UGX 1,000), Weekly (7 days, UGX 5,000) and Monthly (30 days, UGX 20,000), all
  with full access. Access starts when the payment is confirmed, not when the
  code is entered (this replaces the plan's start-at-code-entry rule), and ends
  at the expiry time. Recorded in OP-38, the specification, the plan and prompts
  058, 060 and 062–066. New numbers get one free 2-day (48-hour) trial,
  sent by the owner as a code (plan 5.10).
- **Unchanged:** no code, schema, copy or deployment. The public site behaves as
  before. Nothing is deployed to production unless the owner explicitly asks.

### OP-38 follow-up — network selection (19 October 2026)

The owner accepted leaving network auto-selection unset until full prefixes are
confirmed. Keep `networkPrefixes` empty and let the payer choose the receiving
network; do not guess prefixes or ask for this same choice again. This does not
block independent member-session implementation. The other recorded payment,
SMS, menu and legal inputs remain outstanding.

## 057 — Owner admin foundation (19 October 2026)

**Status:** implemented in the working tree; the manual 375 px Browser pane check
is pending, so tracker 057 is ◐ Partial. The owner foundation only: no member
tables, settings, sign-in or payments, and `paywallMode` does not exist yet
(058). No env key, npm dependency or migration. No OP row changes state: 057
needs no owner input. The owner's sign-in length choice (plan §12) is still
open, so the 12 h / 2 h limits stay as the prompt requires.

- **One owner login.** `/admin` reuses the analytics administrator: one login,
  session table, Strict cookie, 12 h / 2 h limits and the existing
  `GOAL_HINT_ANALYTICS_ADMIN_*` keys. `src/server/admin/owner-auth.ts` names it
  `Owner` and holds the fixed `ownerRoutes`, so later prompts import owner names
  instead of analytics internals. `tests/admin-routes.test.mjs` checks that the
  admin foundation reads no environment variable.
- **Shared helpers.** The nine helpers move to `src/server/http/private-http.ts`
  and `analytics-http.ts` re-exports them, so analytics callers are unchanged.
  `privateHeaders` now also carries `X-Frame-Options: DENY`,
  `frame-ancestors 'none'` and `Referrer-Policy: same-origin`, the values
  `next.config.ts` already added by path, so a private response carries them
  even from a route outside that list. `cookie` gains `sameSite` (default
  Strict; member cookies may use Lax so links from WhatsApp keep the session).
  `readLimitedBody` gains an optional deadline that rejects with
  `BodyDeadlineError` and cancels the reader (063's 90 s upload read); the
  existing login and collector reads pass none, so their behaviour is unchanged.
- **Fixed landing.** `createLoginHandler` and `createLogoutHandler` take `home`
  from the route, never from the request, so no outcome can redirect elsewhere.
  The defaults stay `/analytics` with no audit. `loginNotice` moves from the
  analytics page into `analytics-http.ts`, so both sign-in pages accept only the
  redirect's known `login` and `retry` values.
- **One guard, two forms.** `adminRoute` checks same-origin first for every
  request that is not a read, so a cross-site post never reaches the database,
  then answers 503 without storage and 401 without an owner session.
  `adminPageGate` is the page side, built on the server gate of
  `src/app/analytics/page.tsx`. The route-guard test checks that every `/admin`
  page uses the gate and every `/api/admin` route except login is wrapped.
- **Sign-out needs no live session (departure).** The prompt puts every route
  except login behind the owner-session guard. Review found that a guarded
  sign-out after the session lapsed, or while storage failed, answered 401 and
  left the cookie behind, while the page said the session had ended. Sign-out is
  therefore wrapped with `session: "optional"`: still same-origin only, but it
  neither checks nor extends the session, and always clears the cookie. The
  route-guard test allows the option for sign-out alone.
- **One private-path list.** New `src/domain/private-paths.ts` names the owner
  pages (`/analytics`, `/admin`) and the member pages (`/en/account`,
  `/en/subscribe`). A prefix matches the path itself or a path below it, so
  `/administrator` is not under `/admin`. The proxy, robots.txt and the tracker
  read it. robots.txt disallows the owner pages only, so crawlers can still read
  the member pages' noindex. The proxy sends `noindex, nofollow` for every
  private page, and its attribution redirects, under any discovery policy.
  `next.config.ts` keeps its own literal list of the eight header sources, and
  `tests/admin.test.mjs` asserts that list and each rule's headers.
- **Three throttle keys.** Per address and per (username, address): the fifth
  failure inside 15 minutes locks that key for 15 minutes. Username-wide: only
  the 50th failure inside an hour locks it, also for 15 minutes. The old
  username key locked everywhere after five failures, so one network could lock
  the owner out of every other. Keys are HMACs (`config.key`), so no username or
  address is stored; the (username, address) key joins the two with a NUL.
- **Each attempt is counted before scrypt.** Review found that the lock check
  was a plain read before the password check, so a concurrent burst all passed
  it. `reserve()` now counts the attempt in one ReadCommitted transaction before
  the check. It takes the three rows with `SELECT ... FOR UPDATE` in one fixed
  key order, so concurrent sign-ins queue instead of deadlocking. A preceding
  `INSERT ... ON DUPLICATE KEY UPDATE` creates a missing row, so that row is
  locked too. A key that is already locked refuses the attempt uncounted. The
  read-only `lockedFor` check stays as a fast path, so attempts during a lock
  usually write nothing. A 30-attempt burst from one address now gives 4
  invalid, 1 newly locked and 25 locked, in the unit test and on MySQL 8.4.
- **A right password hands its attempt back.** Since every attempt is counted
  first, a success would otherwise count as a failure. The success transaction
  (same key order) deletes the address and (username, address) keys. It
  decrements the username-wide key by one in the same window, and clears a lock
  that attempt started. "50 failures an hour" stays exact, and the owner's own
  sign-in never locks the username. Other failures on the username-wide key run
  out their hour, so a success does not reset an attack's count.
  `newlyLocked` is true only for the attempt whose reservation started a lock.
- **Audit hook, bounded.** `SignInAuditEvent` is `sign-in` or `sign-out` with
  the username, or `sign-in-refused` with a reason only, never the typed
  username or password. 057 connects no writer; 058 does. A refusal is reported
  only when the typed username, trimmed and lowercased, is the owner's
  (`ownerUsername`) and the attempt was counted (a wrong password, or the attempt
  that started a lock). The username-wide limit then bounds refusals to 50 an
  hour, plus one each time a lapsed lock re-locks inside the hour. Random
  usernames from rotating addresses write nothing. Review found that auditing
  every refusal let them grow the never-purged audit without limit (OP-26 keeps
  audit rows unpurged). The refusal report is not awaited, so response timing
  never shows whether the typed username was the owner's. Success and sign-out
  reports are awaited. An audit failure never blocks signing in or out. 058's
  writer must be self-contained, because refusal writes finish after the
  response.
- **`verify({ touch: false })`.** Checks a session without writing `lastSeenAt`,
  for the sign-out audit read and for 060's viewer-access check, so pages and
  polls never extend the owner's 2 h idle window. The idle limit still expires
  an untouched session.
- **Phone-first shell.** `AdminShell` reuses `dashboard-styles.tsx`: one column
  up to 48rem, a top tab strip (Overview only; later prompts add tabs and the
  pending count) and 44 px targets (`theme.control.minHeight`) for the brand
  link, header actions and tabs. Review found the brand link was about 26 px
  tall. Sign-out is a plain form POST, so it works without JavaScript. The new
  `HeaderLink` shares `HeaderButton`'s styles and joins the two dashboards'
  top bars. Owner copy is hard-coded English. The empty Overview says which
  sections arrive as each part lands.
- **Login form.** `AnalyticsLogin` takes `action` and `title` (defaults
  `/api/analytics/login` and "Analytics sign-in"); `/admin` passes "Owner
  sign-in". The small print now reads "Five failed attempts from one network
  pause sign-in there for 15 minutes; 50 in an hour pause it everywhere." The
  `username` and `current-password` autocomplete stay.
- **Unchanged.** Cookie names and attributes, the session limits, the session
  table, the collector's owner-cookie exclusion and every analytics route. The
  throttle reuses `AnalyticsLoginThrottle`, whose rows `analytics:purge` still
  deletes once their window is a day old and any lock has passed, so there is no
  migration.

## 058 — Data model, settings, plans and audit (19 October 2026)

**Status:** implemented in the working tree; tracker 058 is ◐ Partial. Still
missing: the manual 375 px check, each network's prefixes from the owner
(OP-38), and three local failures that predate 058 (see Flagged, not changed).
Paid access stays `off`: nothing is seeded, and a missing settings row reads
`off` with a 2-day trial. One migration (`20261019142209_subscriptions`) and its
MariaDB overlay. No env key or npm dependency. OP-38 and OP-31 gain a 058 note;
no other OP row changes state.

- **Nine tables, stated engine and collation.** Every `CREATE TABLE` in the
  migration and the overlay states `ENGINE=InnoDB` and `utf8mb4_bin`. The host
  can default to MyISAM, which has no transactions, row locks or foreign keys.
  Phones, hashes, codes and references must compare exactly. Prisma cannot
  express CHECK constraints, so 11 named checks repeat the validators:
  - canonical phone digits;
  - the documented states, sources, networks and reasons;
  - the plan and settings ranges;
  - an approval key that exists exactly for approved and reversed payments;
  - an unlock that always names its code;
  - a submission only on `payment` codes.

  A session's code is a composite foreign key `(accessCodeId, accountId)` →
  `AccessCode(id, accountId)`, so the database itself stops one account's code
  from unlocking another account's session.
- **Later prompts' tables land now.** `MemberSession`, `PaymentSubmission`,
  `PaymentScreenshot`, `AccessCode` and `RateLimitBucket` are created but not yet
  written; 059–064 write them. The `RateLimitBucket` comment forbids
  read-then-create, and the integration test counts every hit of a concurrent
  burst through one atomic upsert.
- **Overlay: verify before recording.** The order is:
  1. the guard;
  2. the tables in foreign-key order, with keys and checks inline (the prompt
     allowed inline or `ADD CONSTRAINT … IF NOT EXISTS`; inline means a table
     never exists without them);
  3. a verification block, an addition to the prompt;
  4. the `_prisma_migrations` insert with the committed checksum, once, skipped
     when Prisma's table is absent;
  5. the closing check.

  The verification refuses unless there are nine InnoDB `utf8mb4_bin` tables, 9
  foreign keys and 11 checks. `CREATE TABLE IF NOT EXISTS` skips a leftover table
  without checking its shape, and without this block that leftover would be
  recorded as migrated. The MariaDB syntax was not run locally. On MySQL, each
  `BEGIN NOT ATOMIC` block runs as a procedure. The overlay builds tables
  identical to the deployed migration (`SHOW CREATE TABLE`), and a rerun
  records nothing. A MyISAM or wrongly collated leftover stops the import. Review
  fix: the runbook applies the overlay before the 058 release, not from 059. The
  owner audit and the Plans and Settings pages already use these tables, and a
  missing table loses audit rows silently.
- **Least privilege.** The application gets SELECT, INSERT and UPDATE on all
  nine. DELETE is granted only where a purge or sign-out removes rows:
  `MemberAccount`, `MemberSession`, `PaymentScreenshot` and `RateLimitBucket`.
  Plans, settings, payments, codes and audit rows are never deleted (OP-26 keeps
  them unpurged).
- **Phones.** Canonical digits with the country code and no plus; a `256`
  number must be `2567` plus 8 digits. Input over 64 characters is refused
  before parsing. `networkPrefixes` ships empty until the owner confirms each
  network's prefixes (OP-38), so no number pre-picks a network.
  `networkForPrefix` takes the longest matching prefix and returns null when two
  networks tie. `smsHref` uses `?&body=`, the form both Android and iOS messaging
  apps read. The plus appears only inside `tel:` and `sms:` links.
- **Settings: one row behind a cache.** `current()` keeps a value for 30 s.
  After a failed read it serves the last good value and retries after 5 s. With
  no good value it reports `unavailable`, and `accessMode` resolves that to
  `free`, so a settings outage never opens subscriber content. There is one
  service per database runtime per process, kept across development reloads. A
  generation counter stops a read that started before a save from replacing the
  saved value. The owner's page reads uncached (`overview`).
- **One lock serializes owner decisions.** `lockSettings` creates the defaults
  row with `INSERT … ON DUPLICATE KEY UPDATE`, then takes `SELECT … FOR UPDATE`.
  Saves, mode switches and plan activation all take it first, so none decides on
  a stale mode or plan count. `decide()` rolls back a refused or empty change,
  so it writes nothing, not even the defaults row.
- **Mode rules.** `test` and `on` need three things: an active plan, a payment
  number with its registered name, and a contact or WhatsApp number. `on` also
  needs release-ready privacy and terms notices; neither is ready, so `on` is
  refused today. While the mode is `test` or `on`, two changes answer 409: a
  save that breaks a requirement the current settings meet, and deactivating
  the last active plan. A requirement that is already unmet (a notice withdrawn
  after switch-on) blocks no other save. The mode is never part of a save. It
  has its own control, which needs a second tap within 8 s.
- **Shortcuts follow their numbers.** The owner tested a menu shortcut against
  the old number, so changing a payment number clears its shortcut, unless the
  same save sets a new one. A shortcut without its number is refused.
  Shortcuts lose their spaces and accept `[0-9*#]` and `{amount}`, at most 60
  characters.
- **Password re-entry is the login's own check.** The sign-in path is split into
  `check` and `release`. `confirmPassword` uses the same lock check, reservation,
  keys and limits. It creates no session and never extends one. A stolen
  session therefore guesses no faster than the login form, and failed
  re-entries lock sign-in from that address too. The password is checked before
  the row lock, because scrypt is slow. The transaction then applies the change
  again to the locked row, and answers `password-required` if it now touches an
  unconfirmed protected field. Answers: 429 with `Retry-After` when locked, 403
  for a wrong password, 503 when sign-in is unavailable. A refused re-entry is
  audited (`settings_password_refused`) only when it was counted, so the
  throttle bounds those rows.
- **The audit trail.** `writeOwnerAudit` writes inside the caller's transaction,
  so a change and its row commit together. `auditDetails` accepts plain JSON
  only. It refuses binary data, access-code shapes, and phone-shaped digit runs
  outside an owner settings field (where the owner's own numbers may appear). A
  save of owner-typed text the trail would refuse answers 400 before its
  transaction (`auditTextErrors`), instead of failing inside it as a 503. The
  trail is operational, not tamper-proof: the application role writes it.
  `accountId` has no foreign key, so rows outlive a purged account. Review fix:
  both patterns now need no letter, digit or dash beside them. About 1 random
  plan UUID in 120 has all-digit middle groups that read as a code, and Reorder
  failed with a permanent 503 for those plans. The integration test uses such a
  UUID.
- **Sign-in audit on both surfaces.** `ownerSignInAudit` is the 057 callback,
  connected by default in `createOwnerLoginHandler` and
  `createOwnerLogoutHandler`. It also runs on `/api/analytics/login` and
  `/logout`: the analytics dashboard shares the owner login, so its sign-ins are
  owner sign-ins. `details.surface` says which. The callback resolves its own
  services, so the unawaited refusal write can finish after the response, and
  the login's wrapper swallows its failures. With the writer connected,
  sign-out reads the session once with `verify({ touch: false })` to name the
  owner. It still never extends the session, and a session that storage cannot
  read writes no row. The 057 route test now asserts "never extends" instead of
  "no session read".
- **JSON-only owner actions.** `readJsonBody` accepts only `application/json`
  (415 otherwise), at most 16 KiB within 15 s, and only a JSON object (400
  otherwise). A cross-site page cannot send JSON without a CORS preflight, so
  this backs the guard's same-origin check. The routes export only GET and
  POST. The plans `delete` action answers 400 "Plans are never deleted.
  Deactivate it instead."
- **A committed change is never reported as a failure (review fix).** After a
  save or mode switch commits, the reply reads the page data again. If that read
  fails, `savedReply` still answers 200 with the saved settings, `changed`,
  `cleared`, `protectedFields` and the diagnostics, without `source` and
  `requirements`. The page keeps what each mode needs and asks for a reload.
  Before the fix, the failed read reached the handler-wide 503, so the owner saw
  a failure for a change that was already stored and audited.
- **Plans.** Nothing is seeded: the owner enters Daily, Weekly and Monthly on
  the Plans page (OP-38). A name has at most 40 plain characters, a length 1–366
  whole days, a price UGX 100–10,000,000. There are no feature tiers. Edits never
  rewrite history, because codes and submissions keep their own snapshots. A
  new plan goes last. Reorder must name every plan once, and it locks every plan
  row in id order. Equal positions fall back to creation time, then id.
- **Pages.** Both pages render stored data on the server before any script
  runs. If the read fails, they show an "unavailable" notice, and Settings adds
  that paid access stays as it was. Settings shows the client-address
  diagnostics: seven common address headers, and the address the throttles key
  on. Comparing them with a request that forges `X-Forwarded-For` answers the
  plan section 10 host check. The password field appears once a protected field
  changes. Fields use 16 px text, so phones do not zoom on focus. Targets are
  44 px, and the layout is one column on phones. Owner copy is English.
- **Backup count.** `tests/backup-restore.integration.mjs` line 68 now expects
  90 tables: 89 models plus `_prisma_migrations`. The prompt expected 81 → 90.

### Flagged, not changed

- **`test:backup` restores fail (pre-existing).** The append-only triggers in
  `prisma/migrations/20261012153531_goal_market_extension/migration.sql` (lines
  197–216) end with `;`. mysqldump writes them as `…'append-only'; */;;`, and the
  mysql client import stops with ERROR 1064. The restore step reports this as
  "artifact-authentication-failed" from its decrypt step. The stale 68-table assertion failed first
  and had hidden it. A fix needs a new forward migration that recreates the
  triggers, or restore-side handling. That is outside 058 and waits for owner
  approval (OP-31). A real restore of a database migrated the same way would
  probably fail too.
- **`npm run check` fails at `next build` with the local `.env.local`.** The
  database capability is on, and in production mode it needs TLS, access and
  budget refs. The build passes with `GOAL_HINT_DATABASE_ENABLED=false` set on
  the command line only. No env key or file was changed.
- **`db:verify` drift on the developer database.** The local-only migration
  `20261015072524_match_facts` (`fixturefacts`, `footballvenue`,
  `seasonstandings`) is not in the repository. Removing it would be a destructive
  change to the developer database, so it waits for the owner.

## 059 — Phone sign-in and member sessions (19 October 2026)

- Reuse 058's database tables, cached settings and the analytics keying config;
  no new auth package, secret or settings row. Production missing-secret behavior
  stays unavailable; analytics' existing development defaults remain local only.
- Atomic account upsert holds the account row while the ten-session cap is
  enforced. Compare the inserted UUID with the stored UUID to count new accounts
  once, without relying on MySQL/MariaDB affected-row flags. A refused new-account
  budget rolls back its account and session together.
- Fixed UTC hour/day throttle windows use `INSERT … ON DUPLICATE KEY UPDATE`
  with a capped counter, read in the same transaction. HMAC purpose strings
  separate member buckets from analytics. Unknown addresses create no bucket.
- Expired sessions cannot slide. A conditional daily update prevents concurrent
  readers from repeatedly touching one session. No browser/user-agent record is
  added. Codes, entitlement and account-period output belong to 060.
- Member cookie names are independent of owner analytics cookies. Lax keeps
  link navigation signed in. Sign-out clears the cookie even if deleting its
  server row temporarily fails, matching the existing owner sign-out behavior.
- `/en/account` uses `PublicShell` as a non-app page. Its shared controls retain
  existing chrome; the member panel supplies 44 px actions, 16 px inputs and
  square corners. Initial HTML includes the native form; JavaScript supplies
  preview, paste replacement, draft clearing and back/forward-cache recovery.
- Native form redirects only select Account/Get access plus a validated English
  feed or canonical match return path. Neither a request URL nor an arbitrary
  destination is trusted. JSON replies contain only the next path.
- Real MySQL concurrency and eviction tests use the existing isolated harness
  and least-privilege application role. Browser scenarios live only in the
  existing rendering-fixture system. Owner mode remains off throughout testing.

## 060 — Access codes and subscription periods (19 October 2026)

- Reuse the existing nine paid-access tables, member session issuer, settings
  lock, private HTTP helpers and owner audit writer. No migration, dependency,
  environment key, production setting or external message is needed.
- Codes use the specified 60-bit Crockford alphabet and versioned salted SHA-256
  without a secret. References are independent. Database-only transactions may
  retry a rolled-back reference collision or deadlock up to three times; no
  external effect occurs inside a retryable callback.
- Confirmation locks the account and sets its period immediately. Revoke
  rechains the remaining queue; extend adds the exact number of days to the
  target end and every later period, including a renewal already in progress.
  Reissue copies only the three period dates and the specified snapshot fields,
  never the payment foreign key or another code's identity/storage fields.
- Both approval paths take the existing singleton settings lock after their
  account lock. This serializes the owner's confirmations across accounts and
  networks without another mutex table or a key that changes on secret rotation.
  Approved/reversed transaction lookup spans both networks. Although the queue
  describes a cross-network warning, approval refuses that reused ID as required
  by the plan's explicit rule that a network swap cannot approve one payment
  twice. Reversal retains its unique key.
- Number changes lock both accounts in ID order and create a new code; historical
  account IDs never change. Reversal discovers the replacement-chain account
  locks, rechecks the chain under them, and retries discovery if a concurrent
  number change reached another account.
- Existing number-only sessions rotate on unlock. Phone-plus-code creates and
  unlocks one fresh session in the same transaction, never creating an account.
  Wrong-code throttles are checked after matching, so they cannot reject a correct
  code. Device limits clear the oldest unlock and record an audit event.
- Both viewer entry points use one resolver. Entitlement reads the session,
  account and current account period in one indexed SQL read; it does not expire
  an unlocked device merely because its originally entered code's period ended.
  Only a daily sliding-session touch may add a conditional write. Owner checks
  run only with an owner cookie and never touch the owner's idle expiry.
- Account UI keeps PublicShell, shared fields/actions and the square member
  panel. A root client boundary consumes private fragments even in refusals.
  Deferred `replaceState(null, ...)` keeps Next's router state synchronized;
  subsequent unlock navigation replaces the page. Fixtures alone expose a
  history-inspection control for browser verification.
