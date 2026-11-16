# 047 — Reconcile admin fixture totals and publication exclusions

**Phase:** Publication and administration  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md); [046 — Settle and correct predictions using exact market rules](046-settlement.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement precise admin fixture counters and an ID-level exclusion reconciliation that explains the observed publication gap.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Admin coverage totals

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 355.*

6. Keep distinct admin totals for discovered, stored, public-scope, visible, prediction-ready, priced, awaiting data, and excluded fixtures. Every excluded ID must have a reason. Reconcile the original 334-fixture gap without hardcoding the screenshot's counts.

### Original gap investigation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 19.*

3. Investigate the screenshot showing **1,008 stored fixtures, 1,008 in public scope, but 674 published**: reconcile the **334-fixture difference** by fixture ID and explicit exclusion reason. Do not assume that a missing prediction should exclude a fixture.

## Scope boundary

Implement admin coverage counters/reconciliation only. Operational worker telemetry and performance hit-rate definitions are separate tasks.

## Acceptance checks

- [ ] Keep discovered, stored, public-scope, visible, prediction-ready, priced, awaiting-data and excluded counts distinct.
- [ ] Provide an explicit reason for each excluded fixture ID and reconcile counts against actual query results.
- [ ] Explain the original 334-fixture discrepancy when the relevant data is available, without baking 1,008 or 674 into application logic.
- [ ] Do not treat missing predictions or optional data as automatic exclusion reasons.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [048 — Expose truthful worker, quota and completeness health](048-operational-dashboard.md).
