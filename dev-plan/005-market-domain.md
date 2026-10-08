# 005 Regulation-time market domain

**Feature:** Define reusable probability validation, selection and settlement rules.

**Depends on:** [002 Runtime policy](002-runtime-policy.md), [004 East Africa calendar](004-eat-calendar.md).

**Source:** [App specification](../app-write-up.md), sections 4, 7–8, 10 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and current domain code. Implement shared, versioned contracts and pure functions for match result, double chance, total goals at 2.5 and both teams to score. Every market uses regulation time including stoppage time, excluding extra time and penalties. Keep stable market/selection codes independent of display language.

Require finite probabilities strictly between zero and one, complete mutually exclusive groups, documented sum tolerances and cross-market consistency rules. Resolve the numeric tolerances and deterministic conflict policy from the decision register before accepting production output; do not silently normalize invalid or missing values. Derive double chance from the same accepted match-result distribution. Its overlapping alternatives do not sum to one. Treat these two families as one source group.

Choose each family's highest unrounded probability, resolving exact ties in the specification's listed order. Build a presentation helper that rounds exclusive groups together to 100%, preserves stored precision and returns boundary-label keys for “Less than 1%” and “More than 99%”. Labels must say estimated probability. Do not equate model verbal confidence or evidence completeness with an event probability.

Define pure result adjudication from a verified regulation score and eligibility context. Return Correct, Incorrect, Pending, Void or Unavailable with reasons; a live score cannot settle a pick. Include the 2/3-goal and BTTS zero-score boundaries. Keep lifecycle persistence, locking, correction history and headline aggregation outside this feature. Expose contracts they can use without duplicating rules.

Exact scores remain excluded unless the recorded decision enables them with a validated score distribution, separate probability and separate reporting. Do not add guessed values or implicit conversions from odds.

## Acceptance checks

- Meaningful tests cover complete distributions, invalid/missing/nonfinite values, tolerance boundaries, deterministic ties and derived double chance.
- Display rounding handles equal probabilities and extreme probabilities without altering selected picks or stored values.
- Draws, regulation-time boundaries, BTTS, live status and absent regulation scores produce the required outcomes.
- Unsupported families remain unavailable; the validator never manufactures a probability group.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, rule-version choices and test results in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with resolved tolerances/conflict policy or the exact remaining blocker.
