# 027 — Build one bounded, sourced evidence package per fixture

**Phase:** Prediction mechanism  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [005 — Define the shared versioned market registry](005-market-registry.md); [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md); [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the shared fixture evidence builder that reads relevant stored datasets and supplies bounded, temporally valid inputs to all engines.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Evidence representation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 248–254.*

1. Read every relevant available dataset, not merely head-to-head matches. Organize evidence by team, player, coach, opponent, competition, season, venue, period and observation time.
2. Evaluate direct history, recent and longer-term form, opponent-adjusted attacking/defensive strength, table context, home/away/neutral performance, scoring/conceding timing, player roles and expected minutes, availability, transfers, goalkeeper performance, discipline, rest, scheduling, coach/formation changes, and supported contextual information.
3. Build reusable relationship features from the historical match graph. Use regularized team/opponent strength estimates across connected fixtures, rather than endless recursive A→C→D comparisons or assumed transitive wins.
4. Track provenance and avoid double-counting the same match as direct history, common-opponent evidence, and a season aggregate. Distinguish independent observations from multiple summaries of one observation.
5. Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingness. Learn or validate numerical weights; do not invent universal weights that merely produce confident-looking outputs.
6. Missing head-to-head history alone must not block a prediction. Evidence for an apparently missing team may exist in opponent fixtures, player histories or the wider model. If there is genuinely no reliable signal for that team/market, use a validated prior with disclosed uncertainty or abstain.
7. Produce a bounded, structured evidence package with source-record references. Do not send unrestricted raw archives, secrets, or unrelated account data to an AI service. Treat imported news/text as untrusted data, never as executable instructions.

### Unsupported external context

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 89.*

Do not claim that API-Football supplies news, weather, tactical assessments, manager ratings, or psychological states as standard fields. Use existing authorized external sources only when genuinely available, attributable, and timestamped. Derived metrics must be labeled derived. Never invent a player's mental state.

## Scope boundary

Implement evidence assembly, not invented numerical weights or engine probabilities. Relationship computation is task 028; validated effects/gates and models follow. External news/context is permitted only from existing authorized, attributable, timestamped sources.

## Acceptance checks

- [ ] Read relevant team/player/coach/opponent/competition/season/venue/period evidence, including the full contextual checklist in the source.
- [ ] Preserve source references, evidence cutoffs, missingness and observations; avoid duplicate evidence and future information.
- [ ] Build a bounded structured package without raw-archive dumps, secrets or unrelated account data; treat imported text as untrusted data.
- [ ] Retain valid indirect evidence when head-to-head data is absent and disclose genuinely unsupported inputs.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [028 — Implement direct and indirect triangulation features](028-relationship-features.md).
