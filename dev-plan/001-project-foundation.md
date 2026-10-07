# 001 Project foundation

**Feature:** Establish the supported Next.js application and shared TypeScript workspace.

**Depends on:** [000 Index](000-index.md).

**Source:** [App specification](../app-write-up.md), sections 1, 9, 13, 14 and 15.

## Prompt

Implement the project foundation for Goal Hint. First read `dev-plan/000-index.md`, the source sections, repository instructions and existing files. Preserve the specification, brand sources, public assets and unrelated work. Inspect the existing package manager and lockfile before creating or changing project files.

Verify the specification's checked Next.js 16.4 and Prisma 7 baseline against current official compatibility documentation. Select exact compatible stable versions of Next.js, React, TypeScript, Redux Toolkit, react-redux, styled-components and a supported Node.js LTS runtime; pin them and record the compatibility evidence. Do not replace the required stack with another framework or claim a version is current without checking. Prisma database integration belongs to prompt 003.

Create the App Router application, strict TypeScript configuration, package scripts and clear reusable boundaries for server services, shared domain contracts, browser components and workers. Keep credentials, provider adapters and worker-only dependencies out of browser imports. Establish lint, type-check, production-build and a suitable test command. Prefer a small maintainable toolchain over speculative infrastructure.

Add only a minimal honest application entry point sufficient to verify compilation. Product routes, branding presentation, styled-components rendering, navigation and feature UI are later prompts. Do not create account screens, an authentication SDK, visitor/session tables, a dashboard, payments or sample forecasts presented as real. Do not purchase services or deploy.

Document local setup, supported runtime, commands and expected environment-variable workflow in the existing project documentation. Keep secrets out of committed files. Create `docs/development-progress.md` if needed and record version decisions in `docs/implementation-decisions.md`; do not overwrite existing records.

## Acceptance checks

- A clean dependency installation, lint, type-check and production build pass using the pinned runtime and lockfile.
- Server-only modules cannot be imported into a client bundle; use a focused boundary check if required.
- The minimal page works without visitor credentials, cookies or tokens, and preserves existing first-party brand assets.
- No real provider calls, manufactured predictions or deployment changes occur.

## Handoff

Record changed files, commands and results, pinned-version rationale and real blockers in `docs/development-progress.md`. Add unresolved implementation choices to `docs/implementation-decisions.md` with the first dependent prompt. State exactly which checks were run and which remain pending.
