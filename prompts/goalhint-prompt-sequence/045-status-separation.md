# 045 — Separate match, freshness, forecast, publication and settlement states

**Phase:** Publication and administration  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Repair state fields and their API/view-model mapping so elapsed kickoff time never masquerades as an authoritative match outcome.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Independent state fields

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 352–353.*

3. Use distinct fields for provider match status, data freshness, forecast availability, publication state, and prediction settlement. “Pending prediction result” is not the same as “upcoming match.”
4. A scheduled kickoff passing must not automatically produce void, cancellation, loss, or completion. Show an awaiting-update state where appropriate while retaining the source status and next check.

### Authoritative live/final transitions

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 162–164.*

5. When a match disappears from the live feed, request its current fixture state. **Disappearance is not proof of full time.** Handle halftime, interruption, suspension, extra time, penalties, postponement, abandonment, and final states explicitly.
6. After an authoritative final state, save results and enqueue settlement. Schedule final-detail reconciliation after **15 minutes** and **24 hours** to capture delayed data/corrections, then archive complete records. Still-missing sections remain tracked separately.
7. Never infer that a match is finished merely from kickoff plus 90 minutes. Never manufacture seconds when the provider supplies only elapsed minutes.

### Unresolved queue behavior

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 174–175.*

5. Revisit every unresolved fixture whose scheduled kickoff has passed, including fixtures from earlier dates. Maintain a durable unresolved queue independent of “today.”
6. Retry unresolved results **hourly for the first 48 hours**, then **daily**; flag them for investigation after 48 hours without inventing a result or cancellation. A provider-verified unavailability decision may close a specific missing-data task, but must retain its reason.

## Scope boundary

Implement the state model and mappings only. Rendering the compact status indicator is task 052; authoritative market settlement is task 046.

## Acceptance checks

- [ ] Keep provider match status, data freshness, forecast availability, publication and prediction settlement distinct.
- [ ] Display an awaiting-update state for overdue unverified fixtures while retaining source status and next check.
- [ ] Never infer completion, void, cancellation or loss from elapsed kickoff time or live-feed disappearance.
- [ ] Verify that unresolved fixtures continue through the existing durable hourly/daily queue across midnight.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [046 — Settle and correct predictions using exact market rules](046-settlement.md).
