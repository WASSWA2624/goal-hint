# 051 — Refine mobile cards within the existing compact structure

**Phase:** Interface  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md); [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Apply the specified mobile sequence-number, date/time, league placement and font-weight changes.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Mobile requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 370–374.*

- Remove the match sequence number and reclaim its space.
- Stack date above time, keeping a compact two-line block. Move the league logo/name left into the newly available space.
- Continue omitting the country from the mobile card; do not introduce another column.
- Slightly strengthen small text using font weight, not an outline/stroke. Start with weight **500** for secondary information and **600** for key values; retain hierarchy and confirm legibility on real mobile widths.
- Preserve the existing card structure and avoid unnecessary additional height or horizontal scrolling.

## Scope boundary

Change mobile match cards only. Preserve the established card structure and unrelated visual design.

## Acceptance checks

- [ ] Remove the match sequence number, stack date above time and move the league logo/name into the reclaimed space.
- [ ] Continue omitting the country and avoid adding a column, horizontal scrolling or unnecessary height.
- [ ] Start secondary text at named weight 500 and key values at 600, preserving hierarchy and checking real mobile widths; use no text outline/stroke.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [052 — Render compact, accurate and accessible match status](052-status-display.md).
