# GoalHint — Current Implementation Documentation Audit

## Your assignment

Thoroughly inspect the **existing GoalHint application codebase** and produce accurate, concise Markdown documentation describing **what is currently implemented and how it works**. This is an **as-built documentation task**, not a feature request, refactor, redesign, or implementation of proposed functionality.

Do not rely on assumptions, old plans, prompts, or existing documentation as proof of current behavior. Treat the current source code, database schema/migrations, runtime configuration references, tests, automation, and deployment scripts as the primary evidence. Existing documentation should be cross-checked against that evidence.

## Deliverables and locations

Create a folder named `implementation-docs/` **at the repository root**, containing **exactly these seven topic documents**:

1. `implementation-docs/authentication.md`
2. `implementation-docs/prediction-engine.md`
3. `implementation-docs/payments.md`
4. `implementation-docs/subscriptions.md`
5. `implementation-docs/automatic-slips.md`
6. `implementation-docs/slip-builder.md`
7. `implementation-docs/deployment-and-version-control.md`

**Do not create a `README.md`** in this folder or add other overview documents unless they are explicitly requested later.

Keep the existing **root-level `AGENTS.md`** in place, and update it as described below. Do not relocate or replace it wholesale.

When complete, package the seven Markdown documents into **`goalhint-implementation-docs.zip`**, retaining their `implementation-docs/` paths. Include the updated root-level `AGENTS.md` in the ZIP so all documentation-related deliverables are available together, while keeping that file at the repository root in the actual codebase. Provide the ZIP and individual Markdown files as downloadable artifacts if your working environment supports file delivery.

## Required content by document

### 1. `authentication.md`

Document the implemented authentication and account lifecycle: registration and its required fields; validation and account creation; login and logout; session/token/cookie persistence and expiration; authenticated versus anonymous behavior; route/API authorization; password changes, forgotten-password or recovery flow; rate limiting and other controls; errors and edge cases. Explain user and administrator differences only where implemented. Identify the actual entry points, handlers, middleware, relevant models/tables, and configuration references. Clearly indicate when an expected function is absent or only partially implemented.

### 2. `prediction-engine.md`

**Locate the existing prediction-engine documentation first.** Move it into `implementation-docs/` (prefer a history-preserving move where practical), retain useful and accurate content, and reconcile every important description against current source code. Document the actual data provider integrations; fixture/data ingestion; storage and preprocessing; historical or statistical inputs; prediction calculations, models, market selection, odds/probability handling, confidence or calibration if implemented; processing schedule, retries and refreshes; outputs and how they reach app pages; configuration, errors, and known limitations. Remove or explicitly label outdated, planned, or unsupported claims. Do not create a competing duplicate of the existing document.

### 3. `payments.md`

Document the real payment lifecycle: supported providers and methods; initiation and checkout/authorization flow; requests, callbacks/webhooks, verification and status transitions; transaction identifiers, persistence, failure/timeout/retry handling, duplicate prevention and reconciliation where implemented; how successful payment is communicated to subscription/access logic; relevant configuration and security checks. Do not imply a provider, safeguard, refund, or flow is functional unless confirmed in code.

### 4. `subscriptions.md`

Document the implemented plans, pricing configuration, subscription/trial creation and start points, validity rules, renewal, expiration, cancellations if present, and how payments affect entitlement. Trace how access is decided for anonymous users, authenticated users, trial users, paid users, and expired users, including which pages/actions are locked or unlocked. Describe relevant administrator settings, storage models, background jobs, and edge cases. Distinguish intended policy from enforced behavior if they differ.

### 5. `automatic-slips.md`

Document how slips shown on the **Slips page** are actually generated: trigger/schedule, fixture and prediction eligibility, market/pick selection, match count, odds targets or bands, probability/ranking calculations, reuse/duplicate controls, time-window and kickoff handling, publishing, refresh/regeneration behavior, persistence, and UI/API presentation. Cover cancellation/postponement and already-started fixture handling only as supported by code. If the application separately generates **Best Slips**, explain that distinction and its rules here rather than assuming it is the same pipeline. Trace calculation and filtering logic to source code.

### 6. `slip-builder.md`

Document the implemented **user-controlled Slip Builder** end to end: available input filters and defaults; validation; selected markets; total-odds targeting; match-count constraints; reuse-matches behavior; generation/search algorithm and prioritization; result limits; failure/no-result behavior; state/storage, API interactions, and presentation; authentication/subscription restrictions. Explain how this differs from automatic slips. Include precise handling of boundary conditions where code establishes them.

### 7. `deployment-and-version-control.md`

Document the actual development, testing/staging, and production environments (only those verifiable); Git branches and workflows; GitHub integration; deployment mechanism and scripts/CI workflows; build/run steps; dependencies/services; environment-variable **names and purpose only**; database setup and migration creation/application process; deployment order, checks, rollback/recovery procedures and operational constraints **only if evidenced**. Identify manual versus automated steps. State any unclear or undocumented operational process as a gap; do not invent commands, credentials, infrastructure, or environment arrangements.

## Standard for every document

Use a consistent, practical structure suited to the subject:

- **Purpose and scope** — what this subsystem actually does.
- **Current implementation** — verified behavior, not an aspirational specification.
- **End-to-end flows** — triggers, inputs, key decision points, outputs, and user-visible outcomes.
- **Implementation references** — real repository-relative paths to important files/functions/routes, database entities and configuration keys; use actual names.
- **Rules and edge cases** — relevant defaults, constraints, error handling, authorization, and fallback behavior.
- **Gaps or uncertainties** — clearly distinguish **implemented**, **partial**, **not implemented**, and **not verifiable from the repository**, but include only categories that apply.

Keep writing **precise, complete, concise, and maintainable**. Explain complex logic clearly enough that another developer can follow it without reconstructing the system from scratch. Use small tables or examples only where they materially clarify real behavior. Do not pad documents with generic software explanations, duplicate the same narrative across files, or paste large source-code blocks.

## Required investigation and verification process

1. Inspect the repository structure and applicable agent/project instructions first. Identify the app's architecture, pages, routes, services, API integrations, database schema/migrations, jobs/queues/schedulers, scripts, tests, CI/CD workflows, and existing docs.
2. Trace **each** requested subsystem from the user-facing entry point through its backend and persistence to the result. Verify critical claims against actual implementation and cross-reference dependent subsystems (for example, payments → subscription activation → page access; prediction engine → automatic slips and builder).
3. Inspect existing prediction-engine documentation and preserve useful historical content, but prioritize current code where a conflict exists. Avoid unnecessary duplication or re-creation.
4. For behavior dependent on external services, production secrets, runtime data, or infrastructure unavailable in the repository, document **what the code is configured to do** and clearly label any real-world behavior that cannot be verified. Never claim an integration works in production solely because related code exists.
5. Check internal consistency of names, thresholds, statuses, rules, calculations, links, and file paths across all seven documents. Ensure references point to files that exist.
6. Where tests or safe read-only checks help confirm a claim, use them. **Do not** initiate real payments, modify production data, run potentially destructive migrations, or perform deployments as part of this documentation task.

## Root `AGENTS.md` maintenance requirement

Keep `AGENTS.md` at the repository root. Preserve its existing applicable instructions, making only a focused addition or adjustment that establishes these rules:

- Before completing **any future code change**, identify whether it alters behavior, APIs, schema, jobs, configuration, deployment, access control, or user flows covered by `implementation-docs/`.
- Update **each affected documentation file in the same change** so it accurately reflects the **post-change implementation**. Do not update unrelated files unnecessarily.
- For newly introduced behavior in an existing topic, update the corresponding document; for removed behavior, remove or correct outdated descriptions.
- Treat current implementation—not proposals or old prompts—as authoritative. Do not document intended behavior as implemented.
- Check documentation consistency before declaring the coding task complete. If no documentation update is needed, state briefly why in the change summary.

Avoid rewriting unrelated sections of `AGENTS.md` or introducing conflicting instructions.

## Scope limits

- **No application-feature development or behavior changes.** Do not refactor business logic, UI, APIs, authentication, payments, prediction algorithms, or slip generation.
- Do not run deployments, execute migrations against environments, alter secrets, or push commits unless separately instructed.
- Keep existing folder organization intact except for creating `implementation-docs/` and relocating the existing prediction-engine documentation as needed. If other files link to the moved document, repair those documentation references without modifying runtime behavior.
- Do not place API keys, tokens, passwords, personal data, or environment-variable values in the documentation or ZIP.
- If a subsystem cannot be fully inspected, document only what is verified and flag the gap rather than guessing or silently omitting it.

## Completion criteria and report

Before finishing, verify that all **seven** Markdown files exist; there is **no `implementation-docs/README.md`**; the old prediction-engine document has been relocated rather than needlessly duplicated; the root `AGENTS.md` remains present and enforces ongoing documentation maintenance; links and source references resolve; and the ZIP contains the requested paths.

Return a concise completion report with: documents created or relocated, major mismatches/gaps found during the audit, any verification limitations, confirmation that application behavior was not changed, and links/paths for the ZIP and individual Markdown files. Report what you actually did—do not claim deployment, migration execution, commit, or push when none occurred.
