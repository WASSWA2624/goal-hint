# 001 — Audit the existing application and record the baseline

**Phase:** Audit  
**Key prerequisites:** None. Start here with the actual repository and available source evidence.

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Inspect the existing GoalHint repository and available operational evidence. Produce a verified audit-to-requirement map naming the actual files and functions that later prompts must change.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Audit requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 17–25.*

1. Trace the complete path: provider request → raw response → normalized records → prediction engines → publication query → API response → rendered match.
2. Locate existing workers, schedules, queues, locks, API clients, caching, pagination, market registries, bookmaker mappings, prediction adapters, settlement rules, and admin counters.
3. Investigate the screenshot showing **1,008 stored fixtures, 1,008 in public scope, but 674 published**: reconcile the **334-fixture difference** by fixture ID and explicit exclusion reason. Do not assume that a missing prediction should exclude a fixture.
4. Investigate the visible **“Import failed,” “No recent imports,” “Waiting on quota,”** and unavailable odds-mapping states. Inspect actual logs, response errors, credentials configuration, endpoint parameters, pagination, and quota allocation. Screenshots identify symptoms, not root causes.
5. Trace matches that remain “upcoming” after their scheduled kickoff. Check timezone conversion, provider coverage, missing refresh jobs, cache invalidation, incorrect status mapping, and delayed provider updates.
6. Trace repeated **double-chance selections and 90% probabilities** to their source. Determine whether they are genuine provider values, incorrect mappings, fixed defaults, or a selection bias. Never replace them with different invented percentages.
7. Record baseline API usage, data coverage, worker lag, publication counts, prediction availability, and desktop/mobile screenshots before making changes.

Deliver an audit-to-requirement map naming the actual files and functions to modify. Continue into implementation; do not stop at an audit report.

## Scope boundary

Audit only in this step. Do not replace the application or begin unrelated repairs. The source instruction to continue into implementation is fulfilled by running the remaining numbered prompts, not by merging them into this audit.

## Acceptance checks

- [ ] Trace the complete provider-to-rendered-match path and identify the existing implementation for each responsibility.
- [ ] Record the publication gap, failed-import symptoms, overdue statuses and repeated prediction values with evidence; distinguish confirmed causes from open questions.
- [ ] Capture available baseline metrics and desktop/mobile screenshots without exposing credentials. List missing logs, screenshots or access explicitly.
- [ ] Deliver the file/function change map and implementation handoff; the audit is not completion of the full improvement project.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md).
