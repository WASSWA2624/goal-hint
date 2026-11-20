# 01 — Audit the existing application

**Step:** 01\
**Key prerequisites:** None; start here.  
**Consolidated source:** Section 1

## Focused task

Trace the actual application end to end and establish the evidence-backed baseline and modification map for the remaining steps.

## Execution order

The nine active prompts are listed in execution order. Each owns a related workstream, and its internal steps stay together. Follow this sequence once. When work from the old sequence already exists, verify and reuse it instead of redoing it.

| Step | File / focused workstream | Consolidated source |
|---|---|---|
| 01 | [01-audit-baseline.md](01-audit-baseline.md) — Audit the existing application | Section 1 |
| 02 | [02-data-contracts.md](02-data-contracts.md) — Establish the shared data contracts | Section 2; the registry contract in Section 6.6 |
| 03 | [03-shared-ingestion.md](03-shared-ingestion.md) — Implement the shared ingestion pipeline | Section 3; endpoint/field contracts established in 02 |
| 04 | [04-coordinated-workers.md](04-coordinated-workers.md) — Implement the coordinated worker lifecycle | Section 4 |
| 05 | [05-odds-coverage.md](05-odds-coverage.md) — Complete independent odds coverage | Section 5; catalog reconciliation in Section 6.6 |
| 06 | [06-evidence-models.md](06-evidence-models.md) — Build the evidence-based numerical models | Sections 6.1–6.3 and 6.5 |
| 07 | [07-forecast-pipeline.md](07-forecast-pipeline.md) — Complete the forecast decision pipeline | Sections 6.4, 6.6 and 6.7; completion of the 04 prediction-worker interfaces |
| 08 | [08-publication-settlement.md](08-publication-settlement.md) — Repair the published match lifecycle | Section 7 |
| 09 | [09-testing-rollout.md](09-testing-rollout.md) — Validate and roll out the completed improvements | Section 8 |

The shared market contract is established in 02 before its consumers. Endpoint handlers are built in 03 before workers schedule them. Worker interfaces from 04 are completed by 05 (odds), 07 (forecast execution), and 08 (publication/settlement); unfinished new paths remain gated. Step 06 owns evidence/models, while 07 owns their engine routing and final market outputs. Step 09 owns consolidated acceptance and rollout.

The repository, credentials, production logs, source screenshots, and complete market files are not bundled here. Inspect only assets actually provided or accessible during implementation; report any missing evidence. All operational defaults and source reference notes are retained, not replaced with new requirements.

The [consolidated production improvement prompt](../goalhint-improvement-prompt.md) covers the same backend scope. Use it as a reference when following this sequence.

## Objective and boundaries

Improve the backend of the existing GoalHint Next.js application. Implement these phases in order: audit → data contracts → imports and workers → odds → predictions → publication and settlement → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, and unrelated features. Inspect the repository before choosing infrastructure or changing schemas. Reuse existing backend services, contracts, and workers. Keep paid-access enforcement in place.

**UI boundary:** Treat the current desktop and mobile interfaces as fixed. Preserve their components, layouts, styles, copy, labels, controls, and interactions. Limit screen work to read-only observation and regression checks of existing behavior. Use existing server-side contracts to supply improved data to current consumers.

**Implementation defaults:** Operational intervals and retry settings below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

## Execution protocol

Execute steps 01–09 in order. Work on this file's focused workstream and its related checks; do not add unrelated refactors. Reuse the actual repository's existing abstractions and prior handoffs. Implementation steps require working code/configuration and focused checks, not merely proposals.

This package replaces the earlier 61-prompt package. The numbered requirements below correspond to sections in the consolidated prompt. Section 2 is in 02, Section 6 is split between 06 and 07, and the early shared market contract is in 02. R-numbered references are included in the files that use them. No support folder or separate original-source file is required.

Use mocked/replayed responses before production quota. Keep unfinished new paths gated, preserve existing working behavior, and report missing access/evidence without pretending work was verified. Reference URLs are retained from the supplied prompt, not independently verified by this consolidation; check current documentation and actual account access when implementing.

## Task instructions and scope

Inspect the repository and accessible operational evidence before recommending changes. Record the actual modules, functions, deployment/runtime constraints, and existing implementations that subsequent steps must reuse. Reconcile the reported symptoms with fixture-level evidence rather than treating screenshot counts as permanent constants.

This is the audit phase of a complete implementation sequence, not permission to stop the project at an audit report. Finish this phase's handoff, then proceed to 02. Do not implement unrelated fixes during the audit. When screenshots, production logs, credentials, or the market file are unavailable, state the evidence gap; do not claim to have inspected them.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

## 1. Audit the existing application and establish the baseline

1. Trace the complete path: provider request → raw response → normalized records → prediction engines → publication query → API response → existing match screen. Observe the screen to verify what it already consumes.
2. Locate existing workers, schedules, queues, locks, API clients, caching, pagination, market registries, bookmaker mappings, prediction adapters, settlement rules, and admin counters.
3. Investigate the screenshot showing **1,008 stored fixtures, 1,008 in public scope, but 674 published**: reconcile the **334-fixture difference** by fixture ID and explicit exclusion reason. Do not assume that a missing prediction should exclude a fixture.
4. Investigate the visible **“Import failed,” “No recent imports,” “Waiting on quota,”** and unavailable odds-mapping states. Inspect actual logs, response errors, credentials configuration, endpoint parameters, pagination, and quota allocation. Screenshots identify symptoms, not root causes.
5. Trace matches that remain “upcoming” after their scheduled kickoff. Check timezone conversion, provider coverage, missing refresh jobs, cache invalidation, incorrect status mapping, and delayed provider updates.
6. Trace repeated **double-chance selections and 90% probabilities** to their source. Determine whether they are genuine provider values, incorrect mappings, fixed defaults, or a selection bias. Never replace them with different invented percentages.
7. Record baseline API usage, data coverage, worker lag, publication counts, prediction availability, and desktop/mobile screenshots before making changes.

Deliver an audit-to-requirement map naming the actual files and functions to modify. Continue into implementation; do not stop at an audit report.

## Acceptance checks

- [ ] Trace provider request → raw storage → normalization → engines → publication → API → existing screen, naming the backend files and functions and recording which fields the current screen reads.
- [ ] Explain the reported publication gap, import/quota/mapping symptoms, overdue status problem, and repeated double-chance/90% outputs where evidence is accessible; explicitly identify remaining unknowns.
- [ ] Record baseline coverage, quota usage, queue/worker lag, prediction availability, publication counts, and available desktop/mobile screenshots.
- [ ] Produce a requirement-to-code map and a handoff for the remaining steps without assuming a replacement stack or disabling paid access.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so Step 09 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [02-data-contracts.md](02-data-contracts.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **User-supplied product reference:** GoalHint screenshots of `/en/matches`, desktop/mobile filters, and `/admin`, dated 14 November 2026. Live source code was not inspected during prompt preparation.
