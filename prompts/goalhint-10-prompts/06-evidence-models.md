# 06 — Build the evidence-based numerical models

**Step:** 06\
**Key prerequisites:** [02-data-contracts.md](02-data-contracts.md); [03-shared-ingestion.md](03-shared-ingestion.md); [04-coordinated-workers.md](04-coordinated-workers.md); [05-odds-coverage.md](05-odds-coverage.md)  
**Consolidated source:** Sections 6.1–6.3 and 6.5

## Focused task

Build one provenance-aware evidence representation and validated numerical modeling layer that can support the requested market families without fabricated confidence.

## Objective and boundaries

Improve the backend of the existing GoalHint Next.js application. Implement these phases in order: audit → data contracts → imports and workers → odds → predictions → publication and settlement → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, and unrelated features. Inspect the repository before choosing infrastructure or changing schemas. Reuse existing backend services, contracts, and workers. Keep paid-access enforcement in place.

**UI boundary:** Treat the current desktop and mobile interfaces as fixed. Preserve their components, layouts, styles, copy, labels, controls, and interactions. Limit screen work to read-only observation and regression checks of existing behavior. Use existing server-side contracts to supply improved data to current consumers.

**Implementation defaults:** Operational intervals and retry settings below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

## Execution protocol

Execute steps 01–09 in order. Work on this file's focused workstream and its related checks; do not add unrelated refactors. Reuse the actual repository's existing abstractions and prior handoffs. Implementation steps require working code/configuration and focused checks, not merely proposals.

This package replaces the earlier 61-prompt package. The numbered requirements below correspond to sections in the consolidated prompt. Section 2 is in 02, Section 6 is split between 06 and 07, and the early shared market contract is in 02. R-numbered references are included in the files that use them. No support folder or separate original-source file is required.

Use mocked/replayed responses before production quota. Keep unfinished new paths gated, preserve existing working behavior, and report missing access/evidence without pretending work was verified. Reference URLs are retained from the supplied prompt, not independently verified by this consolidation; check current documentation and actual account access when implementing.

## Task instructions and scope

Reuse trustworthy existing model components. Build direct/indirect relationship features, bounded evidence packages, market-specific evidence gates, coherent outcome models, context adjustments, and time-ordered calibration/validation as parts of the same modeling task.

Read the market definitions in 07 so supported distributions and diagnostics fit the shared registry from 02. Return versioned outcome distributions, evidence/support/uncertainty diagnostics, provenance, and explicit unsupported reasons through existing or audited model interfaces. Do not invent a universal weight, substitute current information into a historical forecast, or treat code-test success as forecasting validation.

Do not implement a parallel worker or engine router. The caller, AI → local → provider selection, final stored forecasts, and top-pick selection are completed in 07 using this model layer. A family lacking sufficient data or measured validation must remain honestly unsupported/ineligible rather than being advertised as validated.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

## 6. Upgrade the prediction mechanism

### 6.1 Define triangulation correctly for this project

**Triangulation means connecting and combining relevant direct and indirect evidence to estimate an outcome when evidence is diverse or incomplete. It does not mean only checking the same fact against independent sources.**

Examples include team A's and B's direct history; their performance against common opponents; wider opponent-strength relationships; player performance before and after transfers; lineup availability; changes in coach, formation or venue; and season, home/away and timing patterns. These examples are not an exhaustive feature list.

If A performed well against C, and C performed well against B, that can inform A-versus-B analysis. It **does not prove** that A must beat B. A transferred striker's past goals can inform a new team's attack, but those goals do not automatically transfer unchanged to the new team.

### 6.2 Build one evidence representation per fixture

1. Read every relevant available dataset, not merely head-to-head matches. Organize evidence by team, player, coach, opponent, competition, season, venue, period and observation time.
2. Evaluate direct history, recent and longer-term form, opponent-adjusted attacking/defensive strength, table context, home/away/neutral performance, scoring/conceding timing, player roles and expected minutes, availability, transfers, goalkeeper performance, discipline, rest, scheduling, coach/formation changes, and supported contextual information.
3. Build reusable relationship features from the historical match graph. Use regularized team/opponent strength estimates across connected fixtures, rather than endless recursive A→C→D comparisons or assumed transitive wins.
4. Track provenance and avoid double-counting the same match as direct history, common-opponent evidence, and a season aggregate. Distinguish independent observations from multiple summaries of one observation.
5. Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingness. Learn or validate numerical weights; do not invent universal weights that merely produce confident-looking outputs.
6. Missing head-to-head history alone must not block a prediction. Evidence for an apparently missing team may exist in opponent fixtures, player histories or the wider model. If there is genuinely no reliable signal for that team/market, use a validated prior with disclosed uncertainty or abstain.
7. Produce a bounded, structured evidence package with source-record references. Do not send unrestricted raw archives, secrets, or unrelated account data to an AI service. Treat imported news/text as untrusted data, never as executable instructions.

### 6.3 Keep probability, confidence, and ranking distinct

- **Win probability:** the model's estimated chance of the specified outcome under that market's settlement rules.
- **Evidence/model confidence:** reliability of that estimate, considering support, completeness, freshness, disagreement, domain fit and measured calibration.
- **Ranking score:** an internal selection aid, if needed; keep it distinct from probability in the model contract and preserve the required ranking order.

Low confidence does not automatically mean a low probability. For example, a likely outcome can still have an uncertain probability estimate. Do not multiply probability by a made-up confidence percentage. Store uncertainty and support diagnostics. Define confidence in the model contract as a reliability measure separate from the estimated probability of the outcome.

Define versioned, market-specific evidence gates and validate thresholds on held-out data. Do not require every optional field, use one universal minimum-match count, or consider team names and kickoff alone sufficient evidence.

### 6.5 Local numerical mechanism

Audit the existing local mechanism. Retain proven working components, but ensure the following explicit modeling capabilities or document a validated equivalent:

1. **Result/goal baseline:** fit regularized, time-weighted attack/defense parameters with opponent strength, competition context and home advantage. Use a Poisson score model with an appropriate low-score dependence correction, such as Dixon–Coles, as the baseline—not a guarantee of superior performance. Compare alternatives through chronological validation. [R9]
2. **Sparse-data handling:** use hierarchical/league priors and shared-opponent information with uncertainty. Connected history should influence team strengths; do not turn a single indirect chain into certainty.
3. **Coherent goal distribution:** generate a joint distribution of home/away goals. Extend the score grid until omitted probability mass is below **0.000001**, or explicitly retain a tail bucket. Derive result, double chance, totals, team totals, BTTS, correct scores, goal ranges and compatible handicap markets from this shared distribution.
4. **Half/time markets:** fit period-aware scoring using actual period/event history. Derive half/full-time and combination markets from a joint time/score model or simulation that preserves dependence. Do not simply halve full-time rates or multiply correlated marginal probabilities without validation.
5. **Player scoring:** model expected participation/minutes, role, scoring contribution, penalties where evidenced, team scoring environment and opposing defense. Represent lineup uncertainty. Do not force a player forecast when participation or historical evidence is insufficient.
6. **Cards/corners/other statistics:** use separate suitable count/event models with their own historical inputs and validation. Do not estimate cards, corners or player bookings from the goal model. Missing relevant models/data means unsupported, not fabricated coverage.
7. **Context adjustments:** integrate verified injuries, transfers, formations and related features with learned or validated effects and limits. Derived referee/coach trends need real historical support; no invented provider ratings.
8. **Calibration:** validate with time-ordered holdouts, appropriate probability calibration, reliability curves, Brier score and log loss, alongside coverage and abstention. Use only evidence available before the forecast time; avoid future-data leakage. [R10, R11]

Training/calibration may run as maintenance jobs managed by the prediction infrastructure; do not retrain the entire model for every fixture. Version all fitted models and feature definitions. A market without a tested model must not be advertised as validated.

## Acceptance checks

- [ ] Build bounded fixture evidence from every relevant available dataset with source-record references, temporal cutoffs, meaningful evidence hashing, and no secrets.
- [ ] Use direct history, shared opponents, player/transfer/context relationships, and validated priors without assumed transitive wins, double-counting, or future leakage.
- [ ] Keep estimated probability, model/evidence confidence, and any ranking score distinct; validate market-specific gates instead of requiring every optional field.
- [ ] Implement or document validated equivalents for the regularized goal baseline, coherent score distribution/tail handling, period-aware dependencies, player participation models, and separate statistic models.
- [ ] Validate learned/context effects and calibration on chronological holdouts; record reliability, Brier/log-loss results, coverage/abstention, model/feature versions, and actual limitations.
- [ ] Expose a reusable fitted-model lifecycle; do not retrain the whole model for every fixture or claim unsupported markets are calibrated.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so Step 09 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [07-forecast-pipeline.md](07-forecast-pipeline.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **R9 — Dixon and Coles (1997), “Modelling Association Football Scores and Inefficiencies in the Football Betting Market”:** a baseline modeling reference, not evidence of GoalHint's performance. `https://academic.oup.com/jrsssc/article-abstract/46/2/265/6990546`

- **R10 — scikit-learn, probability calibration documentation:** reliability and probability evaluation. `https://scikit-learn.org/stable/modules/calibration.html`

- **R11 — scikit-learn, TimeSeriesSplit documentation:** avoiding future-to-past validation leakage; implement chronological football-data splits appropriate to the dataset rather than assuming equally spaced fixtures. `https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit`
