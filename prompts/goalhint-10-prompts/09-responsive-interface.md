# 09 — Apply the agreed match-interface improvements

**Step:** 9 of 10  
**Key prerequisites:** [01-audit-baseline.md](01-audit-baseline.md); [05-odds-coverage.md](05-odds-coverage.md); [07-forecast-pipeline.md](07-forecast-pipeline.md); [08-publication-settlement.md](08-publication-settlement.md)  
**Original source:** Section 8; match-detail display requirements from Sections 5 and 6.7

## Focused task

Update the existing desktop/mobile match presentation and shared sorting while exposing the completed forecast/odds data without changing the established design.

## Objective and boundaries

Improve the **existing GoalHint Next.js application**, not a replacement application. Implement the following phases in order: audit → data contracts → imports and workers → odds → predictions → publication → interface → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, unrelated features, and established visual design. Inspect the repository before choosing infrastructure or changing schemas. Reuse and repair existing components and workers instead of creating competing implementations. Do not disable paid access as part of this work.

**Implementation defaults:** Operational intervals, retry settings, and layout measurements below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

## Execution protocol

Execute these files in ascending order, 01 through 10. Work on this file's focused workstream and its related checks; do not add unrelated refactors. Reuse the actual repository's existing abstractions and prior handoffs. Implementation steps require working code/configuration and focused checks, not merely proposals.

This package replaces the earlier 61-prompt package. The original numbered source sections below are preserved for traceability; they are not additional prompt files. Section 2 is in 02, Section 6 is split between 06 and 07, and the early shared market contract is in 02. R-numbered references are included in the files that use them. No support folder or separate original-source file is required.

Use mocked/replayed responses before production quota. Keep unfinished new paths gated, preserve existing working behavior, and report missing access/evidence without pretending work was verified. Reference URLs are retained from the supplied prompt, not independently verified by this consolidation; check current documentation and actual account access when implementing.

## Task instructions and scope

Use the existing layouts and styles as the baseline. Implement the specified compact desktop rows, mobile cards, live status display, shared server-side sorting before pagination, and supported market-detail presentation as related parts of the same match-interface task.

Use the prices, source/fallback/freshness metadata, frozen forecast versions, unavailable reasons, and lifecycle states from 05–08. Do not recompute probabilities or choose bookmaker prices in UI code. The extra source excerpts below define required display behavior; the underlying logic remains owned by earlier steps.

Preserve explicit user filters/sorting, subscription restrictions, match details, slips, and unrelated routes. Do not add mobile country/sequence columns, increase desktop row height, manufacture elapsed seconds, or replace the app's visual design.

## Original requirements

The following text retains the supplied requirements and their original section numbers. Implement this file’s assigned scope; references to later consumers are fulfilled by the named later files, not by inventing substitute behavior.

## 8. Apply the agreed desktop and mobile improvements

### 8.1 Desktop match rows

- Keep the existing wide-table layout and **do not increase the current row height**.
- Stack the **date above kickoff time** in one narrow column. Start with **12px text / 14px line-height** and adjust against the actual existing row height; the objective is two readable lines within the previous vertical space, not blindly halving text into unreadability.
- Move the country flag/name and then the league logo/name left into the freed space. Give the league flexible width so fewer names truncate. Preserve team, score, prediction, odds and probability information.
- When truncation is unavoidable, provide full league text through an accessible tooltip/focus or equivalent interaction.

### 8.2 Mobile match cards

- Remove the match sequence number and reclaim its space.
- Stack date above time, keeping a compact two-line block. Move the league logo/name left into the newly available space.
- Continue omitting the country from the mobile card; do not introduce another column.
- Slightly strengthen small text using font weight, not an outline/stroke. Start with weight **500** for secondary information and **600** for key values; retain hierarchy and confirm legibility on real mobile widths.
- Preserve the existing card structure and avoid unnecessary additional height or horizontal scrolling.

### 8.3 Status on both layouts

Remove the live badge's background and border. Show compact status/time text with the pulsing dot immediately to its left, starting with a **4px gap**, without the old badge's excess padding.

Use accurate provider-derived timing. If only minutes are supplied, display minutes rather than an invented second-by-second clock. Freeze clocks for halftime/interruption and label statuses correctly. Respect reduced-motion preferences and provide a non-color-only status label.

### 8.4 Shared default sorting

Implement the same server-side comparator for mobile and desktop, **before pagination**:

1. Live matches first, with the most advanced match phase/progress first: later live phases, then greater elapsed time/added time. Missing-progress live matches follow live matches with known progress. Use a stable fixture-ID tie-break.
2. Upcoming matches next, ordered by nearest scheduled kickoff ascending.
3. Overdue-unverified, postponed, suspended/nonactive and completed fixtures remain visible in clearly defined subsequent groups; document their stable ordering and preserve explicit status filters. Do not disguise overdue fixtures as future upcoming matches.

Set **Live first** as the default for a new/reset filter state. Preserve explicitly selected alternatives: probability high-to-low, probability low-to-high, earliest first and latest first. Preserve match-status, date/time, league, country, probability, odds and recommended-only controls.

Test phase changes, missing times, extra time, cross-midnight fixtures and pagination so matches are not duplicated, lost, or differently ordered across devices.

## Related source requirements for presentation

Use the already implemented service/model behavior for these requirements; this step owns their UI integration.

Match details must expose every supported market's pick, probability, confidence and available bookmaker prices. Unsupported markets may show an explanation but no invented percentage.

4. For the displayed reference price: use the configured preferred bookmaker if its exact selection is available and fresh; otherwise the configured fallback order; otherwise the freshest valid exact match, with bookmaker/source ID as a deterministic tie-break. Do not compare different lines or periods as though they were the same selection.
5. Preserve other bookmaker prices for match-detail comparison. Honor an existing user-selected bookmaker; identify when the displayed source is a fallback. Never present another bookmaker's price as the user's chosen bookmaker's price.
6. Reject malformed prices and respect suspension flags. Label stale prices with their timestamp rather than presenting them as current offers.
7. A supported forecast remains visible without a price: **“Odds unavailable.”** A bookmaker offering a price does not prove that GoalHint has enough evidence to forecast that market.

## Acceptance checks

- [ ] Keep desktop row height unchanged, stack date/time, shift country/league left, and provide accessible full league text when truncated.
- [ ] Remove mobile sequence numbers, continue omitting country, reposition league/date/time, and apply the specified weight-based legibility improvements without unnecessary height/scrolling.
- [ ] Render plain compact live/status text with the dot/gap, accurate provider timing and paused clocks, reduced-motion support, and non-color-only labels.
- [ ] Use one server-side comparator before pagination: progressed live fixtures first, upcoming kickoff ascending, then documented stable remaining groups; retain all explicit alternatives and controls.
- [ ] Expose every supported market pick/probability/confidence and available bookmaker prices, including truthful fallback/source/freshness and unavailable/unsupported states.
- [ ] Check light/dark modes at 360, 390, 412, 768, 1280, and 1440px, including phase changes, unknown progress, extra time, cross-midnight ordering, and pagination continuity.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so 10 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [10-testing-rollout.md](10-testing-rollout.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation policy, and acceptance criteria above are implementation requirements—not provider guarantees. Recheck the current documentation and account access during implementation.

- **User-supplied product reference:** GoalHint screenshots of `/en/matches`, desktop/mobile filters, and `/admin`, dated 14 November 2026. Live source code was not inspected during prompt preparation.
