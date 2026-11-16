# 053 — Apply shared server-side Live first sorting before pagination

**Phase:** Interface  
**Key prerequisites:** [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md); [050 — Refine desktop match rows without increasing their height](050-desktop-match-rows.md); [051 — Refine mobile cards within the existing compact structure](051-mobile-match-cards.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement one server-side fixture comparator and default-filter behavior shared by desktop and mobile.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Sorting and filter requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 384–392.*

Implement the same server-side comparator for mobile and desktop, **before pagination**:

1. Live matches first, with the most advanced match phase/progress first: later live phases, then greater elapsed time/added time. Missing-progress live matches follow live matches with known progress. Use a stable fixture-ID tie-break.
2. Upcoming matches next, ordered by nearest scheduled kickoff ascending.
3. Overdue-unverified, postponed, suspended/nonactive and completed fixtures remain visible in clearly defined subsequent groups; document their stable ordering and preserve explicit status filters. Do not disguise overdue fixtures as future upcoming matches.

Set **Live first** as the default for a new/reset filter state. Preserve explicitly selected alternatives: probability high-to-low, probability low-to-high, earliest first and latest first. Preserve match-status, date/time, league, country, probability, odds and recommended-only controls.

Test phase changes, missing times, extra time, cross-midnight fixtures and pagination so matches are not duplicated, lost, or differently ordered across devices.

## Scope boundary

Implement listing order and filter integration only. Do not overwrite user-selected alternatives or confuse fixture sorting with top-pick probability ranking.

## Acceptance checks

- [ ] Sort live fixtures by later phase/progress then elapsed/added time, with known progress before unknown and a stable fixture-ID tie-break.
- [ ] Sort upcoming fixtures by nearest kickoff; explicitly define stable later groups for overdue, postponed, suspended/nonactive and completed fixtures.
- [ ] Apply sorting before pagination and use Live first only for new/reset filter state.
- [ ] Preserve explicit probability/earliest/latest sorts and every listed status/date/time/league/country/probability/odds/recommended-only control.
- [ ] Test phase changes, missing timing, extra time and cross-midnight boundaries for stable identical device ordering.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [054 — Show supported market forecasts and correctly sourced bookmaker prices](054-market-details.md).
