# 020 — Implement Worker 1: live match updates

**Phase:** Coordinated workers  
**Key prerequisites:** [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the live-update responsibility using shared ingestion, independently of whether any predictions exist.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Live worker requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 154–164.*

**Purpose:** keep match facts current, independently of prediction generation.

**Default schedule:** every **60 seconds** while matches are live or scheduled to start within 15 minutes; otherwise perform live discovery every **5 minutes**. Quota rules may degrade this explicitly.

1. Retrieve `/fixtures?live=all`; update all returned fixtures, including previously unknown ones. Reuse any events already included.
2. Refresh due enriched live-fixture details every **120 seconds**, batching at most **20 fixture IDs** per request. Store the full response. Fetch separate subresources only for missing supported data, including required half statistics.
3. Capture available in-play odds every **60 seconds**, using the broadest documented useful scope and preserving all returned markets. Avoid redundant per-fixture requests when a broad response already covers them.
4. Starting **90 minutes before kickoff**, check missing lineups every **15 minutes**, preferably through due enriched batches. Stop redundant lineup-only polling once confirmed data has been captured; continue ingesting authoritative changes from normal fixture refreshes.
5. When a match disappears from the live feed, request its current fixture state. **Disappearance is not proof of full time.** Handle halftime, interruption, suspension, extra time, penalties, postponement, abandonment, and final states explicitly.
6. After an authoritative final state, save results and enqueue settlement. Schedule final-detail reconciliation after **15 minutes** and **24 hours** to capture delayed data/corrections, then archive complete records. Still-missing sections remain tracked separately.
7. Never infer that a match is finished merely from kickoff plus 90 minutes. Never manufacture seconds when the provider supplies only elapsed minutes.

## Scope boundary

Implement only Worker 1. Persist live-odds payloads through the shared receipt path now; task 025 wires price normalization without adding a second polling loop. Enqueue settlement through the durable interface; task 046 supplies its rule-specific consumer.

## Acceptance checks

- [ ] Configure the 60-second active/near-kickoff sweep, five-minute idle discovery, 120-second enriched batches and 60-second available live-odds capture.
- [ ] Capture missing lineups from 90 minutes before kickoff at 15-minute intervals and stop redundant lineup-only polling after confirmation.
- [ ] Discover unknown live fixtures, reconcile disappearing fixtures authoritatively and retain all special match phases.
- [ ] Enqueue authoritative final settlement and 15-minute/24-hour final-detail reconciliation while tracking remaining missing sections.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md).
