# 07 — Complete the forecast decision pipeline

**Step:** 07\
**Key prerequisites:** [02-data-contracts.md](02-data-contracts.md); [04-coordinated-workers.md](04-coordinated-workers.md); [05-odds-coverage.md](05-odds-coverage.md); [06-evidence-models.md](06-evidence-models.md)  
**Consolidated source:** Sections 6.4, 6.6 and 6.7; completion of the 04 prediction-worker interfaces

## Focused task

Connect the existing engines to validated market evaluation, versioned forecast storage, and probability-first recommendations through the worker built in 04.

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

Reuse the existing three engines, shared registry, evidence/model interfaces, and Worker 4. Implement market-family routing, strict output validation, supported provider interpretation, probability invariants, transactional versioned output storage, top-pick ranking, and slip-integrity behavior as one end-to-end forecast decision path.

Reuse the registry contract already defined in 02 and mappings populated in 05; do not create a new competing registry or rerun ingestion independently. The market-registry wording below also specifies how the evaluator must consume that contract. Preserve successful independent market families while enforcing coherence for coupled outcomes.

Complete and test all deferred prediction-consumer interfaces from 04, including one-active-fixture orchestration, full versioned idempotency, meaningful-change triggers, hourly recovery, fairness, and resumable per-fixture saves. Wire durable outputs into the existing read services and the publication and settlement paths in 08. Maintain new-path gates until validated; do not create post-result pre-match predictions.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

### 6.4 Preserve the requested engine priority

Use **AI → local engine → API-Football predictions**.

1. Attempt the configured AI engine when available and suitable for the market family.
2. Validate its structured response, evidence grounding, numerical coherence, model provenance, and calibration/quality eligibility.
3. On failure, timeout, missing capability, or invalid/unreliable output, try the local engine for the affected market family.
4. If local support fails, use the provider forecast only for outcomes it actually supports and for which a defensible probability is available.
5. If none qualifies, store an explicit abstention reason. Do not invent a prediction to make the catalog look complete.

Fallback should preserve successful independent market families rather than discard an entire fixture. However, coupled probabilities must come from one coherent distribution or pass reconciliation checks; do not combine contradictory AI/local/API outputs.

For the API adapter, preserve the documented meaning of every field: `win_or_draw` is a flag, not a probability; home/draw/away percentages refer to those outcomes; signed goal/under-over strings may describe thresholds, not expected-goal means. Derive double-chance probability only from compatible outcome probabilities. Retain advice without a defensible numeric probability as provider advice and exclude it from probability-based ranking.

An AI language model's unsupported percentage is not a validated probability. AI may structure evidence, produce bounded sourced adjustments, explain results, or invoke a validated numerical model. Without a supported numerical basis, it must defer. Record the numerical source in forecast metadata. Attribute local calculations explained by AI to the local engine.

Use a **60-second AI-call timeout**, one transient retry, then local fallback. After **five consecutive provider-level AI failures**, open a **10-minute circuit breaker** and use local/API during that period. Log engine transitions and per-market reasons.

### 6.6 Shared market registry and per-market evaluation

Use one **versioned market-definition registry across fixtures**. Each entry defines period, selection set, line/player/team parameters, settlement rules, evidence needs, model capability, source mappings, and canonical English market name in the domain contract. The registry is shared; applicable players, lines, available odds and supported predictions vary by fixture.

Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupported/unmapped entries with reasons rather than silently dropping them. Do not guess the contents of an unprovided market file.

Evaluate these families wherever the required evidence and models support them:

| Family | Required variants to consider |
|---|---|
| Results | Full-time home/draw/away; supported first-half and second-half results. |
| Double chance | Home/draw, home/away, draw/away for supported periods. |
| Draw no bet/handicaps | Supported draw-no-bet, European and Asian lines, with push/partial-settlement rules. |
| Total goals | Over/under **0.5, 1.5, 2.5, 3.5, 4.5 and 5.5**, plus other legitimate registered lines; handle integer/quarter lines correctly. |
| Team goals | Each team's supported totals, scoring yes/no and clean-sheet markets. |
| BTTS / goal-goal | Yes/no at full time and supported half-specific variants. |
| Correct score/ranges | Full-time and supported half scores; exact totals and registered bands such as 1–2, 1–3 or 1–4. |
| Half relationships | Highest-scoring half including equal; half-time/full-time outcomes; supported scoring-in-both-halves variants. |
| Combined outcomes | Result/double chance with goals, BTTS with totals, and other mapped combinations using their joint probability. |
| Players | Anytime/first/last scorer, player goal totals, assists, shots or bookings only with suitable models and participation evidence. |
| Discipline/set pieces | Team/match corners, cards, red cards and relevant handicaps/periods where supported. |
| Other catalog markets | Register, map and evaluate with an appropriate model or give an explicit unsupported reason. |

For each supported **parameterized market**, compute its outcome distribution and choose the highest-probability supported outcome. For example, over/under 1.5 and over/under 2.5 are separate market instances. A recommended pick is not a claim that it is highly likely; correct-score markets can have low top probabilities.

Keep the following probability invariants:

- Every probability is finite and within [0, 1]. Mutually exclusive, exhaustive outcomes sum to 1 within numerical tolerance.
- `P(1X) = P(home win) + P(draw)`. The three double-chance selections overlap; do not normalize them to sum to 1.
- Goal-threshold probabilities are monotone: `P(over 1.5) >= P(over 2.5) >= P(over 3.5)`.
- Under the same period/settlement rules, BTTS implies at least two goals, so `P(over 1.5) >= P(BTTS yes)`.
- Combination probabilities cannot exceed either component probability.
- Push/no-action/half-win/half-loss possibilities remain separate from outright win probability where applicable.
- Correct scores, ranges, half results and player-related forecasts must not contradict the underlying modeled scenario definitions.

Never fabricate unrealistic new goal lines solely to obtain near-100% recommendations. Legitimate registered markets can be predicted without current bookmaker odds, but must have clear, meaningful settlement definitions.

### 6.7 Top pick, stored output, and historical integrity

For each supported market save: fixture ID, market key/parameters, recommended selection, outcome probabilities, confidence/support diagnostics, optional uncertainty interval, explanation/evidence references, engine/model version, evidence hash/cutoff, generation time, forecast type, and status. Join odds separately with source and timestamp. Save unavailable-market reasons as well.

Choose the fixture’s top recommendation from eligible supported predictions by **estimated win probability descending**, then **confidence**, then available comparable odds only as a final tie-break, followed by a stable market/selection key. Do not force double chance, artificial diversity, minimum odds, or fixed 90% probabilities. Diversity should follow the evidence, not a quota for different market labels.

Keep each supported market’s pick, probability, confidence, and available exact-match bookmaker prices available to existing read services. Record unsupported-market reasons and leave their probabilities unset.

Freeze and retain each published pre-match forecast version. If live forecasting exists or is added within the approved scope, store it separately with a distinct forecast type, conditioned on current time/score. Never overwrite a pre-match forecast with hindsight, silently change its outcome after kickoff, or count post-event forecasts as successful pre-match predictions.

For slips, retain existing functionality but do not claim that many low-odds selections are collectively safe. Multiplying probabilities assumes independence; correlated selections require dependence-aware handling. Do not promise that a target combined odd can also achieve a guaranteed hit rate.

## Acceptance checks

- [ ] Enforce AI → local → API-Football routing per supported market family, with validated numerical grounding, accurate source metadata, explicit abstention, and retained partial successes.
- [ ] Verify the 60-second AI timeout, one transient retry, five-failure trigger, and 10-minute circuit breaker; test invalid/unreliable output as well as transport failures.
- [ ] Interpret provider flags, percentages, and threshold strings correctly; unsupported advice does not receive fabricated probabilities or enter probability ranking.
- [ ] Evaluate every supported parameterized market and preserve an explicit reason for every unsupported/unmapped family; all listed probability and settlement-state invariants hold.
- [ ] Save every specified diagnostic/version/evidence field and unavailable reason, join odds separately, and freeze published pre-match history without hindsight overwrites.
- [ ] Rank by estimated win probability, confidence, comparable odds only as the last numerical tie-break, then stable key; retain slips without false independence or guaranteed hit-rate claims.
- [ ] Process and resume the full eligible queue without restarting long runs at hourly sweeps or stopping after one fixture fails; persist each supported market result and its evidence for the existing read services.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so Step 09 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [08-publication-settlement.md](08-publication-settlement.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **R9 — Dixon and Coles (1997), “Modelling Association Football Scores and Inefficiencies in the Football Betting Market”:** a baseline modeling reference, not evidence of GoalHint's performance. `https://academic.oup.com/jrsssc/article-abstract/46/2/265/6990546`

- **R10 — scikit-learn, probability calibration documentation:** reliability and probability evaluation. `https://scikit-learn.org/stable/modules/calibration.html`

- **R11 — scikit-learn, TimeSeriesSplit documentation:** avoiding future-to-past validation leakage; implement chronological football-data splits appropriate to the dataset rather than assuming equally spaced fixtures. `https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit`

- **User-supplied market-vocabulary reference, not a verified complete catalog:** `https://gsb.ug/sportsbook/upcoming`
