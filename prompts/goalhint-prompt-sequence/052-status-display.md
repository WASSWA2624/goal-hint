# 052 — Render compact, accurate and accessible match status

**Phase:** Interface  
**Key prerequisites:** [020 — Implement Worker 1: live match updates](020-live-worker.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md); [050 — Refine desktop match rows without increasing their height](050-desktop-match-rows.md); [051 — Refine mobile cards within the existing compact structure](051-mobile-match-cards.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Replace the live badge styling on both layouts with the specified plain status/time text and adjacent dot.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Shared status rendering

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 378–380.*

Remove the live badge's background and border. Show compact status/time text with the pulsing dot immediately to its left, starting with a **4px gap**, without the old badge's excess padding.

Use accurate provider-derived timing. If only minutes are supplied, display minutes rather than an invented second-by-second clock. Freeze clocks for halftime/interruption and label statuses correctly. Respect reduced-motion preferences and provide a non-color-only status label.

## Scope boundary

Implement status presentation only. Do not infer outcomes or replace the backend provider/status logic.

## Acceptance checks

- [ ] Remove badge background, border and excess padding; place the pulsing dot immediately left with a named starting gap of 4px.
- [ ] Render provider-derived minutes without manufacturing seconds and freeze clocks for halftime/interruption.
- [ ] Label phases accurately, respect reduced motion and convey status without relying only on color.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [053 — Apply shared server-side Live first sorting before pagination](053-sorting-filters.md).
