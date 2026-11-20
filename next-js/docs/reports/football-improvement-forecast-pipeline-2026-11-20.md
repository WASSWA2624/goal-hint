# Forecast decisions and recommendation ranking — 20 November 2026

The coordinated worker freezes `qualified-ai-local-provider-v1` in the refresh intent. It evaluates AI, local and API-Football in that order per supported group, verifies shared numerical coherence, and records each source transition and reason. A qualified numerical distribution and independent provenance are required before an AI or local estimate can publish on this path. The configured AI model and the fitted local and period models lack that qualification. The worker therefore uses independently supported provider groups when available and records an abstention otherwise. Existing stored forecasts and legacy refresh intents retain their reviewed policies.

The AI resilience policy caps each dispatch at 60 seconds. It can retry one transient failure under a separate reservation in the same owning workflow when the approved request, time and token budgets allow it. Five consecutive provider-level failures open a process-local circuit for ten minutes. Restarting the worker clears the circuit state. Invalid or unqualified model output defers to the next engine. The provider adapter preserves advice, structured flags and signed thresholds separately from the documented home, draw and away percentages. Compatible double-chance probabilities derive from the result distribution. [API-Football prediction field documentation](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

The evaluation registry describes the market, period, exact line and outcome semantics. Full-time and supported period estimates share a qualified score distribution. The evaluator retains outright win, half-win, push, half-loss and loss separately, with explicit residual uncertainty. Unsupported family and parameter combinations carry reasons. The public legacy extension allowlist retains its existing behavior. Activation of additional variants requires a qualified model and its exact supported scope. The supplied GSB page did not expose a complete catalog in its retrieved source. [User-supplied vocabulary reference](https://gsb.ug/sportsbook/upcoming)

The coordinated publication transaction seals versioned decisions in its existing immutable refresh receipt. It retains available groups, unavailable reasons, forecast type, material and provenance references, model versions, the cutoff and generation clock. Unavailable exact market keys are grouped by reason to bound storage. The fixture feed uses the ordinary published forecast projection. A replay returns the original receipt under its existing identity. Hourly recovery checks committed results and respects an active lease and immutable attempt history. Exhausted jobs without a committed receipt do not hide later eligible jobs. Result evidence after the cutoff cannot generate a pre-match decision. Rights-verified odds use a separate observation and retain their original source and clocks.

The `probability-confidence-odds-v3` recommendation selects the greatest estimated probability among eligible forecasts. Evidence confidence breaks exact probability ties. Fresh exact comparable odds then break a remaining tie, followed by the market and selection key. A missing or unavailable price leaves an otherwise qualified recommendation eligible. Existing feeds and details keep their published selection identity. Slips continue to require a qualified whole-slip probability model for joint claims and keep the leg-average statistic separate.

## Validation

The 160-check routing and resilience suite covered per-family authority, partial success, transient retries, separately counted reservations, the circuit threshold, timeouts and invalid responses. The 42-check evaluator suite covered exact lines and Asian grades, period dependence, bounded score mass and unsupported definitions. The coordinated refresh test passed through the live plan, fallback and publication authorities with a supported recommendation and no odds. Recommendation, feed ranking, match details and slip regressions passed with synthetic inputs. All 21 isolated MySQL publication and recovery checks passed, including cutoff rollback, accepted and abstained receipts, replay from a second connection, and repair of an exhausted queue entry without a new forecast attempt. TypeScript and ESLint passed. The step adds no schema migration and used no live provider requests.

## Local-first rollout

New prospective worker intents seal `qualified-local-provider-v1` and the
recorded fallback allowance. Qualified Local Engine estimates supply each
eligible group first. Trusted API-Football match result and derived double
chance can fill an unresolved result group. Set
`GOAL_HINT_API_PREDICTION_FALLBACK_ENABLED=false` on the forecast worker to
disable that fallback for new intents. Previously sealed intents retain their
original source order and allowance.

The local-first registry applies the approved full-match total-goals range
from 1.5 through 5.5 inclusive. It records the regulation count model's
exact lines and separate outright, push and half grades. Legacy odds and
published markets outside the range retain their identities. The regulation
count projection also supports team totals, exact counts, count ranges and
odd/even. Team-to-score and clean-sheet have registered identities and abstain
while the public projection lacks support. Unqualified model scopes also keep
an abstention reason. The chronological check for the existing count model
records coverage and the comparison results separately.
[Chronological model evidence](football-improvement-evidence-models-2026-11-20.md)

Version 2 seals the model-backed outcome distributions together with the
same revision's goal extension, exact evidence cutoff and generation clocks.
The decision records decimal probability text so MySQL cannot change the
binary64 value when reading JSON back. A price is optional for every market.
The top pick uses win probability, confidence, an exact price verified at
cutoff when available, and the stable market and selection keys. Immutable
version 1 receipts remain readable under their original rules.

An isolated MySQL 8.4.11 run published and reread the unrounded top pick
without any odds and verified idempotent replay from a second connection. A
MariaDB 10.4.32 probe verified numeric-column compatibility and exact decimal
readback. This update uses the existing publication tables.
