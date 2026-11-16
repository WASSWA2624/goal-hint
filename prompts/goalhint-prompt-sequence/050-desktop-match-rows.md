# 050 — Refine desktop match rows without increasing their height

**Phase:** Interface  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md); [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Apply the specified desktop date/time and league-column adjustments within the existing wide-table design.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Desktop requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 363–366.*

- Keep the existing wide-table layout and **do not increase the current row height**.
- Stack the **date above kickoff time** in one narrow column. Start with **12px text / 14px line-height** and adjust against the actual existing row height; the objective is two readable lines within the previous vertical space, not blindly halving text into unreadability.
- Move the country flag/name and then the league logo/name left into the freed space. Give the league flexible width so fewer names truncate. Preserve team, score, prediction, odds and probability information.
- When truncation is unavoidable, provide full league text through an accessible tooltip/focus or equivalent interaction.

## Scope boundary

Change desktop match-row layout only. Do not redesign the table, remove data or force unreadably small text merely to meet a suggested measurement.

## Acceptance checks

- [ ] Stack date above kickoff in one narrow column, starting at named 12px/14px typography and checking actual existing height.
- [ ] Move country flag/name then league logo/name into freed space, giving the league flexible width while preserving all existing match values.
- [ ] Provide accessible full league text when truncated and verify the row height does not increase.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [051 — Refine mobile cards within the existing compact structure](051-mobile-match-cards.md).
