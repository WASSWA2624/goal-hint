# 028 — Implement direct and indirect triangulation features

**Phase:** Prediction mechanism  
**Key prerequisites:** [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Build reusable relationship features from the historical match and player/career graph using the project-specific meaning of triangulation.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Triangulation definition and examples

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 240–244.*

**Triangulation means connecting and combining relevant direct and indirect evidence to estimate an outcome when evidence is diverse or incomplete. It does not mean only checking the same fact against independent sources.**

Examples include team A's and B's direct history; their performance against common opponents; wider opponent-strength relationships; player performance before and after transfers; lineup availability; changes in coach, formation or venue; and season, home/away and timing patterns. These examples are not an exhaustive feature list.

If A performed well against C, and C performed well against B, that can inform A-versus-B analysis. It **does not prove** that A must beat B. A transferred striker's past goals can inform a new team's attack, but those goals do not automatically transfer unchanged to the new team.

### Graph and provenance requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 250–253.*

3. Build reusable relationship features from the historical match graph. Use regularized team/opponent strength estimates across connected fixtures, rather than endless recursive A→C→D comparisons or assumed transitive wins.
4. Track provenance and avoid double-counting the same match as direct history, common-opponent evidence, and a season aggregate. Distinguish independent observations from multiple summaries of one observation.
5. Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingness. Learn or validate numerical weights; do not invent universal weights that merely produce confident-looking outputs.
6. Missing head-to-head history alone must not block a prediction. Evidence for an apparently missing team may exist in opponent fixtures, player histories or the wider model. If there is genuinely no reliable signal for that team/market, use a validated prior with disclosed uncertainty or abstain.

## Scope boundary

Implement relationship features and provenance only. Do not interpret triangulation as merely checking one fact against independent sources or hardcode universal weights.

## Acceptance checks

- [ ] Combine direct history, common opponents, wider strength relationships, transfers and relevant contextual connections.
- [ ] Provide regularized opponent/team-strength features rather than recursive transitive-win claims.
- [ ] Trace underlying observations so direct, common-opponent and aggregate summaries do not triple-count one match.
- [ ] Show that a single A→C→B chain or a transferred striker informs an estimate without guaranteeing outcomes or unchanged goal contributions.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md).
