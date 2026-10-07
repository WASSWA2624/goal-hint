# Implementation decisions

This register records implementation choices and their evidence without changing
the product requirements in [the specification](../app-write-up.md). Prompt 002
will extend it into the operating decision register. Verification results belong
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
