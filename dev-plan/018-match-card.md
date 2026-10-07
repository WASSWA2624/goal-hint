# 018 Match card

**Feature:** A reusable accessible match card and its supporting display components.

**Depends on:** [005-market-domain.md](005-market-domain.md), [015-brand-styling.md](015-brand-styling.md), [016-locale-navigation.md](016-locale-navigation.md), [017-client-state.md](017-client-state.md)

**Source:** [app-write-up.md](../app-write-up.md) §§2–4, 6–8, 13, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, brand guide, repository instructions and existing code. Implement the shared card feature only, using existing domain formatting and theme primitives. Keep components independent of provider/network calls and persistence.

Build `MatchCard`, `TeamRow`, `ProbabilityLabel` and `OutcomeBadge` around typed visitor-facing data. Use an article with competition/kickoff, Home row, Away row, selected prediction, estimated probability, outcome and a clear View analysis link in that reading order. Display final scores separately from prediction correctness. Default to match result; accept a selected family without combining unrelated probabilities. Include source and actual publication time, and distinguish update-delayed, limited-news, unavailable and partial-coverage information where supplied.

Reuse deterministic selections and probability formatting from the market domain. Show boundary probabilities as Less than 1%/More than 99%; keep complementary group rounding consistent where displayed. Never synthesize a forecast from absent fields or allow a correct family to color other families. Give Correct, Incorrect, Pending, Void and Unavailable explicit text and a non-color cue.

Reserve approximately 28–32 px for logos. Third-party logos must use native `img`/`styled.img` with approved remote HTTPS URLs, no optimizer, proxy or binary persistence. On error or missing URLs, show styled initials while retaining team names as identity. Avoid duplicate screen-reader logo announcements. Use responsive wrapping, square corners and shared tokens; support a one-column mobile list and at most two columns at larger widths through a reusable container.

Use labeled examples only in tests or development previews, never as production fixtures. Do not build the feed page or live polling in this prompt.

## Acceptance checks

- Exercise every outcome, source, missing-logo, delayed-update and unavailable state with deterministic component fixtures.
- Verify reading/tab order, keyboard link activation, long names, 320 px width and 200% text zoom.
- Confirm direct remote image loading, reserved dimensions and independent score/outcome labels.

## Handoff

Record changed files, visual/accessibility checks and blockers in `docs/development-progress.md`; record shared presentation contracts in `docs/implementation-decisions.md`.
