# GoalHint — Comprehensive Prediction Engine Improvement Prompt

**Task type:** Implement targeted improvements to the **existing** GoalHint prediction engine, based on the current repository and the existing document headed **“Goal Hint prediction engine.”** This is **not** a new application, UI redesign, or replacement of the production prediction system.

## 1. Mission and absolute constraints

Act as a senior football-modeling engineer, statistical validation specialist, and Next.js/Prisma/MySQL backend engineer. Audit the actual repository before making changes. Improve the accuracy, calibration, robustness, data coverage, and **risk-adjusted expected profitability** of GoalHint's football forecasts and featured selections, while preserving all production safety guarantees.

**Non-negotiable rules:**

1. **DO NOT MODIFY THE USER INTERFACE IN ANY WAY.** Do not change React components, pages, styles, themes, markup, text, layout, spacing, filters, dialogs, navigation, frontend behavior, or user-facing interactions. Do not introduce new visible controls, labels, badges, warnings, or confidence indicators. Preserve current public route paths, API payload compatibility, access gating, and subscription behavior. Backend implementation and compatible persistence changes are allowed; adapt internally without requiring a UI update. If a proposed improvement genuinely requires a frontend change, do not make it—document the blocker and request authorization.
2. **Enhance rather than rewrite.** Reuse existing workers, adapters, market registry, forecasting code, orchestration, publication/lock/settlement services, Prisma models, test harnesses, and existing historical evaluation paths. Avoid unrelated refactoring.
3. **Preserve historical truth.** Never modify previously published/locked prediction revisions, settled records, or original odds and evidence clocks. All new forecasts must be versioned. Never backdate newly gathered information into a historical forecast.
4. **Respect the current pre-match cutoff:** normally scheduled kickoff minus five minutes, or earlier when early play is proven. Allow valid pre-cutoff revisions only; no retroactive replacement of locked picks. Respect postponements and occurrence/cycle identities.
5. **No invented data or probabilities.** If a data field, API endpoint, history period, quote, full-time score, or verified statistical observation is unavailable, record its absence. Do not synthesize evidence and present it as observed. A legitimate, properly labeled model estimate is different from fabricated source data.
6. **Separate probability from confidence.** A supported model estimate of 85% must not become 40% solely because confidence is limited. Confidence describes the quality of evidence/model validation, not the event's probability. If evidence is insufficient to support a defensible forecast, mark that market unavailable rather than assign a fake number.
7. **Never promise 95% or 100% accuracy or profitability.** Treat >95% observed win rate as an ambitious *selective-pick evaluation target*, not a guaranteed outcome or a reason to manipulate thresholds/probabilities. Optimize on unseen data and report coverage and odds alongside win rate.
8. **Only enable a candidate after evidence-based qualification.** Every substantial modeling, ranking, or data feature must run in private/shadow mode, outperform an appropriate baseline on a held-out matched cohort, and pass existing safety tests before production rollout. Never activate unqualified experimental models automatically.
9. **Respect provider permissions and budgets.** Reuse the authorized API-Football adapter, quota controls, and odds-display rights. Do not add paid providers, external data transmission, public bookmaker-odds display, new secrets, or extra API volume without verified capability, legal authorization, and explicit approval.
10. **After implementation and verification, update the existing prediction-engine documentation** to describe what *actually* changed, what remains experimental, and exactly how the new data is collected and used. Documentation updates are mandatory before calling the work complete. Do not replace the document with speculative plans.

## 2. Starting architecture: verify, preserve, and build on it

Locate the current engine documentation and confirm the implementations in the checkout. Its relevant established behavior includes:

- Private API-Football ingestion with canonical fixture/team/competition/season identities, source clocks, validation, historical backfill, and a database-backed public feed.
- Daily and eligible hourly selection/refresh with fenced jobs, quotas, coalescing, sealed inputs, atomic prediction revisions, and a five-minute-before-kickoff normal lock.
- A Local Engine-first route (`qualified-local-provider-v2` where authorized), with independently qualified market groups and a verified API-Football **1X2-only** fallback where eligible.
- A released, regularized independent Poisson model (`regularized-poisson-v1`) with a default **730-day** history window, **180-day recency half-life**, and current minimum weighted support of **30 league / 6 each team**. The historical reader may cap the scoped sample at 1,500 verified matches.
- A private fitted **Dixon–Coles** low-score adjustment model, not yet qualified for automatic promotion. The November 20 report noted **31 estimates among 82 final-block targets**, an insufficient calibration cohort, and stronger matched league-frequency baselines on tested totals lines. Do not characterize this experiment as already superior.
- Current goal-market probability derivation, recommendation/featured-pick selection, exact bookmaker quote verification, odds-dependent expected return, and historical replay/evaluation facilities.
- Supported confidence labels `calibrated`, `supported`, `limited`, separate from numerical winning probabilities.
- Distinct consumers: Matches/Match Details, user Builder slips, and hourly Best Slips. The public Best Slips **joint-win probability is currently `null`**; its displayed arithmetic mean of leg probabilities is **not** an all-legs-win probability.
- Historical study with temporal splits, matched baselines, Brier/log loss and reliability; private promotion requiring review rather than automatic activation.

**Relevant starting points to inspect** (paths may have moved; locate their current equivalents):

`next-js/src/server/intelligence/local-goals-model.ts`, `local-goals-fit.ts`, `live-local-engine.ts`, `fitted-goals-model.ts`, `live-local-history.ts`; `next-js/src/server/evidence/`; `next-js/src/server/refresh/`; `next-js/src/server/predictions/`; `next-js/src/domain/score-distribution-markets.ts`, `market-payout.ts`; `next-js/src/domain/local-featured-decision.ts`; `next-js/src/server/slips/`; `next-js/src/server/football/`; `next-js/src/server/live/`; `next-js/src/server/evaluation/`; `next-js/prisma/schema.prisma`; and the current runbooks/reports.

**First deliverable:** A concise actual-versus-documented implementation audit. Flag mismatches, missing rights, absent data, and unqualified experiments. Do not blindly implement duplicate features or change validated defaults.

## 3. Required data coverage and exact incorporation rules

For **each** input, inspect actual API-Football responses, stored records, refresh status, historical coverage, timestamps, and rights. Build a private, testable **data coverage inventory** by competition, season, fixture, team, market, and source. Capture counts, percent complete, last observed/source-updated time, verified time, earliest available time, missingness, and reasons for exclusion. Distinguish “contract supports field” from “field is populated for this competition and date.”

The following table is a **requirements matrix**, not a claim that every input is already available. Where a source lacks the data, do not improvise it: retain a neutral/no-adjustment path, mark missingness, and keep candidate features private.

| Input / coverage to evaluate | Historical scope and validation | How to incorporate into the model or selection | Refresh / missing-data behavior |
| --- | --- | --- | --- |
| **Fixture and regulation scores** | Verified home/away score, actual competition/season, kickoff, status; use all eligible historical fixtures **including fixtures that GoalHint never predicted**. Retain separate half-time, extra-time, shootout and corrections. Compare 180/365/548/730-day windows, subject to available evidence. | Train league/season scoring baselines, home advantage, attack/defense strengths; reconstruct the eventual outcome of any supported score-derived historical market. | Historical imports/backfill use original availability clocks; corrections are versioned. Never treat missing scores as 0–0. |
| **Team strength and recent form** | Team results with home/away orientation, opposition strength, league/competition identity, days since play, deduplication; preserve existing up-to-eight-matches/120-day support checks initially. | Fit regularized and recency-weighted team strengths; add opponent-adjusted form only if held-out evidence helps. Avoid double-counting the same result in both a goal model and independent “form bonuses.” | Recompute from stored verified results as new finals arrive; use broader hierarchical league baseline when support is weak. |
| **Head-to-head (H2H)** | Previous meetings with correct home/away orientation, competition, date, goals, and sample size; account for manager/squad turnover. | Treat as a **regularized supplemental signal**, not a hard “usually wins” rule. Test whether it adds predictive value beyond team strengths and league context. | Do not boost confidence from 2–3 H2H games; shrink small samples toward league/team priors. |
| **League/competition/season patterns** | Historical exact market outcomes and scoring environment for each league/season, separated by regulation period, goal line and market. | Create hierarchical league/market priors, score-rate adjustments, and league-specific calibration **only** when effective sample sizes and independent validation support them. | For sparse leagues, shrink to pooled priors or label insufficient rather than extrapolating unreliable rates. |
| **Historical market success without prior predictions** | Reconstruct outcomes of full-time result, double chance, exact/ranged totals, team totals, BTTS, and other markets **only when the required actual statistics exist**. Preserve exact line, period, payout/void rules, team orientation. | Compute smoothed, time-weighted **conditional** historical success rates for comparable situations; evaluate their incremental contribution to calibrated selection/ranking. Do not substitute raw frequency (e.g., 18/20) for a modeled 90% probability. | Refresh cached aggregates when verified results change. Never infer corners/cards from full-time scores. |
| **Injuries, suspensions and availability** | Verified player identity, team, season, minutes, historical availability state and timestamp, position, replacement evidence. Distinguish injured, suspended, doubtful, unavailable and unknown. | Learn **out-of-sample fitted** effects of relevant absentee/replacement information on expected goal rates, if the data support it. Preserve existing veto checks until a superior candidate qualifies. | Increased checks nearer kickoff, only within quota. Missing/contradictory news implies uncertainty, not automatic absence. |
| **Confirmed lineups and tactical setup** | Starting XI, bench, formation, confirmation/source time, player contribution histories available before the forecast; stable identity/version/hash. | Compare forecast with and without lineup-derived information. Where qualified, adjust attack/defense goal rates or a model input—not arbitrary probability multipliers. | Trigger a coordinated pre-cutoff recalculation on **material verified changes**, not on repeated identical snapshots. |
| **Rest, fixture congestion and travel** | Dates/times of recent matches, days of rest, home/away sequence, comparable verified travel geography if actually available. | Fit nonlinear rest/congestion effects and optional travel effect on goal rates; regularize against league/team effects. | Derived from stored fixtures; absent travel data means no travel adjustment. |
| **Manager changes, transfers and major squad changes** | Reliable as-of dates for coaching changes and player arrivals/departures plus actual roster/minutes where licensed and stored. | Test regime-change down-weighting or faster team-strength adaptation; avoid assuming a named manager guarantees a direction of effect. | When not reliably sourced, rely on recent-form decay and do not fabricate event flags. |
| **xG, shots, chances, other match statistics** | Verify **actual provider entitlement and competition coverage**; do not assume API-Football provides historical xG. Require consistent statistic definitions and pre-cutoff availability. | Optional fitted shot-quality/xG features or separate model(s); compare directly to the goals-only baseline. Other stat markets need independently qualified numerical distributions. | Feature-gated; no substitute using final goals for unavailable xG. |
| **Cards / red cards / discipline** | Verified player/team red cards, suspensions, card counts, counting rules, match phases and historical sequence where supplied. | Pre-match: use proven suspension impacts and optionally fitted discipline tendency. Do **not** assume future red cards. For live displays, reflect verified event status only under existing product behavior; **in-play probability modeling is out of scope** unless separately authorized. | Differentiate confirmed absence from predicted disciplinary risk; no red-card market probability without its own trained/calibrated model. |
| **Weather and pitch** | Authenticated, attributable weather forecast/observation and actual stadium/fixture time; pitch condition only when sourced reliably. Verify separate provider access/cost/permission before integration. | Test conditional impacts on scoring only where credible and validated, not universal hand-tuned coefficients. | Optional, disabled until permissions and improvement are verified; no weather request just to fill a field. |
| **Bookmaker odds and odds movement** | Exact fixture/market/selection/bookmaker/period/line; quote times, source updates, suspended state, same-book grouped offers, legal usage/display rights. Collect opening/intermediate/near-close quotes **only where actually observed**. | Calculate implied break-even probabilities and modeled **expected net return**; evaluate margin-adjusted market priors as an optional separately tested feature. Track large changes as **recheck signals**, not evidence of certain injury/news. | Reuse existing pre-match sweep (~3 hours under eligible quota); prioritize nearer kickoff only where budgeted. Never reconstruct unavailable old odds. |
| **League promotion / new teams** | Team histories across verified leagues/seasons, promotion status and identity mapping, sufficient sample of comparable promoted-team cases. | Hierarchical prior / partially pooled team strength with explicit higher uncertainty; never transfer league strength naively. | If too little verified evidence for defensible estimates, withhold that market but keep other independently qualified markets. |
| **Verified half-time / event outcomes** | Separate as-of and result-verification requirements for HT scores, corners, cards, period markets, player markets, ordered events. | Develop separate statistically qualified models when justified; do not derive unsupported events from full-time Poisson goals. | No publication or historical evaluation without the market's required proof. |

**For every feature actually implemented, define in code and documentation:** source/endpoint and rights, exact input schema, canonical IDs, observation and effective timestamps, historical lookback, calculation/transformation, missing-data semantics, minimum effective sample, freshness policy, cost per polling path, affected model coefficient/distribution, replay treatment, and failure/rollback behavior.

## 4. Improve the statistical forecasting core

### 4.1 Keep a reproducible regularized Poisson benchmark

Retain the current independent-goals model as the unmodified baseline. Its conceptual form is:

- `log(lambda_home) = league_baseline + home_advantage + attack_home + defense_away + validated_covariates_home`
- `log(lambda_away) = league_baseline + attack_away + defense_home + validated_covariates_away`

Keep coefficients fitted on historical training data only, with regularization and a versioned configuration. Preserve numerical bounds, normalization, convergence checks, support checks, source identity and the ability to abstain from unsupported outputs. Do not add covariates unless they pass point-in-time validation and independent predictive-value testing.

**Experiment, do not guess:** lookbacks of approximately 180, 365, 548 and 730 days; alternative time-decay half-lives (e.g., 30/90/180/365 days); ridge strengths; sufficient effective-support thresholds; and season/manager regime changes. Tune using validation data, not the final test cohort. Report relative calibration, scoring losses, coverage, sample size and profitability for each variant.

### 4.2 Integrate Poisson and Dixon–Coles as one **candidate** scoring model

Use the existing private fitted Dixon–Coles implementation as a starting point rather than implementing an unrelated library. Compute the Poisson-based full-time joint goal-score distribution, then apply a **fitted Dixon–Coles low-score dependence correction** to the appropriate cells (0–0, 0–1, 1–0, 1–1). Fit the dependence parameter on training data with safe/valid parameter bounds, regularization and documented time weighting. Normalize the resulting grid, prove finite/nonnegative entries and sum-to-one tolerance, and keep exact provenance/parameter hashes.

Derive all supported **full-time score-based markets from this single coherent joint grid**: 1X2, double chance, total goals, team totals, BTTS, scores, goal ranges and relevant handicap/Asian payouts. Ensure mutually exclusive outcomes sum correctly; ensure dependent/overlapping markets remain mathematically consistent; correctly account for push/half-win/half-loss. Maintain residual mass protections. Do **not** apply a Dixon–Coles correction independently to already computed 1X2, BTTS and totals probabilities, as that can create contradictions.

Evaluate Poisson versus Poisson+Dixon–Coles on matched pre-match fixtures and explicit league/market slices. The historical private Dixon–Coles evidence is presently **not sufficient for automatic activation**. Keep the current qualified model in production unless the combined model improves held-out Brier/log losses and calibration without unacceptable coverage or operational regression. Provide controlled opt-in and rollback.

### 4.3 Other models: only if independently qualified

Where data support it, evaluate hierarchical models, alternative count dispersion, opponent-adjusted form, qualified xG covariates or carefully calibrated ensembles. Do not add complexity because a method sounds sophisticated. An ensemble must learn fixed combination weights on training/validation folds, be coherent for joint markets and beat simpler baselines on held-out observations. Do not use actual later full-time scores as an input to a *prospective* half-time prediction.

## 5. Historical market-pattern intelligence

Implement or strengthen a backend-only market evidence service that can reconstruct **historical actual outcomes even for matches GoalHint did not previously predict**.

- Key each observation by canonical fixture occurrence, competition, season, team orientation, time, exact market, selection, period, goal/handicap line and settlement rule. Deduplicate by source identity and verified result version.
- Derive only outcomes with sufficient verified facts; for example, verified regulation 2–1 can establish Over 2.5, BTTS Yes and home win, but not corner count or first-card team.
- Produce effective sample size, decayed count, observed success rate, smoothed success estimate, credible/uncertainty interval, opponent and venue mix, recency and source coverage.
- Implement **hierarchical shrinkage**: exact H2H/venue/team-specific effects move toward a well-supported league/market prior when examples are sparse. Treat H2H as supplemental and account for squad/manager change.
- Train any mechanism that blends these patterns with model probabilities on preceding historical data only. No arbitrary fixed `0.7 * model + 0.3 * historical` without measured qualification.
- Prove whether the new evidence helps selection, rather than merely reusing the same scores twice as if they were independent proof. Store each candidate's decision explanation/feature contributions in private audit receipts, without altering public UI or response formats.

## 6. Calibrated probabilities versus confidence

Keep the existing outward confidence categories `calibrated`, `supported`, `limited` unchanged; do not add frontend indicators.

- **Probability** is a numerical estimate of a defined event, derived from an evaluated distribution, with a documented source and version.
- **Confidence/evidence support** reflects model qualification, historical effective sample, freshness/completeness of source data, stability of the estimate, relevance to the current league/market and calibration evidence.
- Give `calibrated` only if a qualifying calibration procedure and independent validation demonstrate reliability for an appropriate cohort. Do not use that label merely because a formula returned a number.
- Keep a defensible low-confidence estimate available to existing supported-market reads when its source contracts permit. Do not secretly lower the estimate solely due to a `limited` label.
- For truly insufficient/invalid evidence, preserve explicit unavailability and an audit reason. Do not publish a fabricated low probability to avoid an empty slot.
- Calibrate independently where adequate support exists (e.g., by 1X2, totals, BTTS, league groups) with training/calibration/test separation; use pooled/hierarchical calibration if a league cohort is too small. Preserve coherent market probabilities and normalization after calibration.
- Report reliability curves and proper scoring rules; define and log precise rules behind each confidence category and verify them in tests.

## 7. Featured-pick selection: accuracy **and** expected value

Separate **forecast availability** from **recommended action**. All defensible market probabilities may remain available within existing contracts, including low-confidence ones where permitted; a featured pick or Best Slip may still decline a poorly priced selection.

For each supported candidate, calculate its properly calibrated `pWin`, mutually exclusive payout-grade probabilities, model provenance/confidence, exact eligible decimal price `d`, and payout-aware expected **net return per unit stake**:

- For a simple win/lose event: `EV = pWin * (d - 1) - pLoss = pWin * d - 1`.
- For Asian/quarter lines: `EV = pWin*(d-1) - pLoss + pHalfWin*(d-1)/2 - pHalfLoss/2`; push returns zero net, with all grades explicitly represented.

Do not mistake high win probability for good value. For example, an illustrative 95% win chance at 1.04 implies `0.95*1.04 - 1 = -0.012` expected net per unit; a 75% chance at 1.40 implies `0.75*1.40 - 1 = +0.05`, if the probabilities are calibrated. These are **examples**, not real bets.

Review existing `local-featured-pre-match-v3` behavior (standard priced tier ≥1.10, modeled positive return, probability ladder down to 60%, then other fallback/forecast-only tiers). Propose and evaluate a **qualified, risk-aware policy** that:

1. Ranks eligible actionable priced picks using **reliability and defensible positive EV**, not odds or raw probability alone.
2. Preserves the existing contract and user-visible behavior unless an approved backend policy switches to a tested winner. Do not silently change a long-standing semantic requirement.
3. Avoids recommending **negative-EV priced fallback** as a value pick. When quotes are missing/invalid, distinguish a legitimate forecast-only pick from a priced recommendation; never invent odds.
4. Applies sample-support/uncertainty constraints and real quote freshness; does not require every match to have a qualifying featured bet.
5. Evaluates decision trade-offs at multiple coverage levels (e.g., all valid predictions versus high-confidence/value-only subsets). The 95% aspiration must be examined alongside typical odds, pick count and realized unit-stake return.
6. Keeps exact tie-breaks deterministic, odds linkage to the **same** selection/market/bookmaker, and existing rights/access restrictions.

Do not present simulated positive EV as guaranteed real-world profit: report estimation uncertainty and sample size.

## 8. Best Slips and user Builder

Treat **individual-leg probability**, **arithmetic average leg probability**, **combined decimal odds**, and **joint probability of every leg winning** as four different quantities.

- Respect existing distinction between personal Builder slips and hourly editorial Best Slips, original pick/quote snapshots, distinct fixture rules, compatible bookmaker rules, odds bands and settlement behavior.
- Never label the arithmetic mean of leg probabilities as the chance that the full slip wins.
- The product of leg probabilities is valid as joint probability only under defensible independence; examine shared league/day, common underlying information, or other dependence when backed by actual data. Do not assert correlations from intuition.
- Implement a separately trained and **qualified** joint-probability estimator only when enough matched historical slips and leg outcomes are available. Compare it against independence and a simple baseline on held-out data. Until qualified, preserve the current `null` joint-probability binding rather than fabricate a number.
- Optimize prospective slip composition for stronger **joint win probability and positive expected return**, within the existing odds bands, minimizing unnecessary legs and honoring existing constraints. Report the effect of correlation and combination length. Do not force inclusion of lower-confidence or negative-value legs merely to fill a daily quota.
- Retain immutable snapshots of originally offered legs, prices, revision identities and settlement, even after reprediction or later quote movement.
- Do not alter Builder UI, Best Slips UI, preview text, access restrictions or public API schemas.

## 9. Adaptive refreshing, API quota protection and idempotence

Preserve the architecture where **private backend workers call API-Football** and public GoalHint routes read projections from **GoalHint's database**. Never let viewer page loads or user actions directly request the paid provider API. If needed, add efficient read caching that does not change results or access rights.

Audit actual job schedules, caps, and provider costs. Existing documented paths include: broad live polling around **one minute active / five minutes idle** with quota adjustment; daily and authorized hourly fixture selection; hourly date sweep; bounded refresh near kickoff; approximately **three-hour pre-match odds sweeps** when enabled; and unresolved result rechecks hourly through **48 hours**, then daily. Treat those as documented defaults, not promises of actual production frequency or fixed per-fixture polling.

Implement or strengthen **change-aware / budget-aware polling**:

- Slow or stop refreshing immutable verified historical data except for bounded correction checks; moderate polling for distant future fixtures; more focused checks for nearer kickoff; prompt but quota-safe updates for active fixtures and post-match verification.
- Focus pre-match lineup/availability requests around their expected publication window, with verified source clocks. Avoid many identical calls when no material change occurred.
- Deduplicate requests by provider, endpoint, normalized scope and observation freshness; coalesce simultaneous user-independent jobs; use fenced leases/single-flight and durable idempotency keys to protect concurrent workers and restarts.
- Reuse complete scoped provider observations for multiple fixtures where supported; honor pagination completeness and detect missing/conflicting identities.
- Skip numerical recomputation for price-only changes when model evidence is unchanged; re-evaluate odds-dependent featured choice separately within its allowed time window.
- Enforce hard shared daily quota, request admission, critical reserve, per-endpoint/worker budgets, retry limits, uncertain-dispatch accounting, backoff/jitter and circuit breakers. Do not assume a 7,500-request daily allowance unless the account verifies it.
- On stale/missing provider data, serve stored truthful projections with existing freshness behavior or explicit unavailability; never invent “real-time” status.
- Record dispatch count, cache/coalescing savings, read freshness, missed updates, retry outcomes and quota consumption. Create tests for duplicate triggers, crashes, multi-worker races, stale leases and provider out-of-order observations.
- Preserve the existing difference between **Kampala daily selection** and **UTC provider-quota reset**.

## 10. Material-change pre-kickoff reprediction

A match already predicted **may be recalculated before cutoff** when verified material information changes. Ensure this is correctly implemented and tested, not simply assumed from the write-up.

1. Maintain an immutable initial forecast and a durable hash/version of its **as-of** model input evidence, confirmed lineups, team availability, fixture occurrence/kickoff and model configuration.
2. Detect materially new validated evidence: confirmed starting lineup, important player absence/replacement, formation data where proven useful, significant relevant historical result/context update, or source-verified schedule/team change.
3. Queue only **one coordinated** refresh for the new material identity, respecting quotas and the existing job fencing/leases. Identical observations must not generate duplicate predictions.
4. Compute a new model distribution (if the candidate model is qualified); reassess all supported markets and featured eligibility with current permissible exact quotes. Keep probability and confidence separate.
5. Accept a new immutable revision **only if** every lifecycle/status/clock/source/lease/authority check passes strictly before effective close. Keep the old revision and every historical receipt.
6. At cutoff, freeze the correct eligible revision and featured pick. Never use evidence first obtained after cutoff to change a prior or locked prediction. Early actual play or reschedules must obey existing occurrence/cycle logic.
7. Define meaningful material-change thresholds from validation; do not fire needless API calls and repredictions for noisy player availability fields. Record *why* a reforecast did or did not occur.
8. Verify that hourly Best Slips/Builder resolve the allowed original/current revisions correctly, and previously published slips remain historical snapshots.

## 11. Backtesting, validation, reliability and profitability qualification

Reuse the current historical replay/evaluation infrastructure wherever possible. **The evaluation must be point-in-time correct.**

- Use chronological, walk-forward or rolling-origin splits, separating **training**, model tuning/validation, **calibration**, and a never-touched **final test**. Ensure a prediction uses only input data that were actually available at the simulated decision cutoff, and only quotes actually recorded by that moment.
- Treat fixture occurrence corrections, early play, postponed games, canceled games, pushes/half-payouts, missing sources and settlement corrections explicitly. No cherry-picking only already-forecast matches, high-odds survivors, or “won” picks. Report excluded and unavailable counts.
- Compare each candidate on **exact matched fixture/market/decision cohorts**, alongside appropriate benchmark models: original regularized Poisson, current featured policy, league-frequency/market-prior baselines, and provider probabilities when legitimately available.
- Report probability quality using multiclass/binary **Brier score**, **log loss**, calibration/reliability tables and curves, error by probability bucket, and confidence intervals. A raw hit rate alone is insufficient.
- For pick selection and profitability report pick count, fixture coverage, selection rate, mean/median quoted odds, actual win/loss/push frequencies, yield/ROI per fixed unit stake, net units, expected versus realized return, odds/closing-line comparisons where eligible quote history exists, losing streaks/drawdown, results by market, competition, time-to-kickoff, confidence and odds bands.
- Report separately: (a) forecast accuracy for *all qualified outputs*, (b) accuracy of *selected featured picks*, and (c) joint slip outcomes/profitability. These are different populations.
- Check calibration stability and performance drift over time, particularly by league, promoted teams, new managers, and lineup-availability cohorts. Retraining should never self-promote on one good week or small samples.
- Correct for selection bias and multiple model/threshold trials; require meaningful matched cohort sizes, sensible uncertainty bounds, and an honest assessment of statistical significance/practical improvement.
- Add unit/property tests for distribution mass, market cross-consistency, odds grades, Asian settlement, numeric stability, missing data, temporal leakage, H2H orientation, historical market reconstruction, and confidence labeling. Run existing synthetic suites and genuine disposable MySQL integration tests where authorized.
- Model/candidate decisions must include **a reproducible version ID, fit parameters/config hash, training cohort identity, evaluation report, source rights and rollout approval**. Never automatically promote due to an attractive historical win rate.

### Explicit release gates

An improvement may be promoted only after it:

1. Passes all existing safety, numeric, idempotence, publication and settlement tests.
2. Preserves the UI/public-contract invariants and archived predictions.
3. Has adequate point-in-time data coverage and authorized source rights.
4. Demonstrates improvement in held-out calibration/proper scoring loss **or a clearly justified selection/profitability objective** without materially degrading other critical metrics, at matched coverage.
5. Produces interpretable per-league/market evidence and uncertainty estimates.
6. Has a flag-controlled rollout, pre-production shadow comparison, monitoring plan and tested rollback path.
7. Receives explicit review/approval for any newly enabled production model or cost-incurring provider path.

If no candidate clears these gates, **keep current production behavior** and report exactly why instead of claiming the engine was improved.

## 12. Operational safety and observability

Maintain existing quota gateways, model-source routing, access control, odds-use rights, publication idempotency, result verification and immutable settlement corrections. Avoid introducing paid AI calls or remote provider fallback beyond the current authorized policy. Do not log secrets or leak private source rights. Any database migration must be additive/backward-compatible where practical, tested, and accompanied by a rollback procedure. Add private structured diagnostic receipts for data coverage, model feature availability, model/quote age, confidence reasons, reforecast triggers, pick-selection rationale, candidate-versus-baseline evaluation and provider-call savings. Use the current private status, replay, forecast-coverage, evaluation, and watchdog tooling rather than creating overlapping operational systems.

## 13. Mandatory documentation update **after** actual implementation

The **existing** document titled **“Goal Hint prediction engine”** is the canonical engine reference. After code changes and validation are complete, update that document **in place in the repository** (locate its real path first). Keep its lifecycle organization and accurate links to actual source files. Do not replace it with a hypothetical architecture or silently alter claims about the current deployment.

The updated documentation MUST include:

1. What was **already implemented**, what **changed**, what is **feature-gated/private**, what is **blocked**, and what is **live and verified**. Explicitly distinguish checked-in defaults, staging and production deployment evidence.
2. A detailed data coverage/source matrix: actual provider/endpoint/entitlement, league/season coverage, history window, refresh behavior, clock semantics, completeness, retention/rights, validation, missing-data fallback, and exact role in model equations or selection.
3. Final mathematical model specifications and formulas (regularized Poisson, fitted Dixon–Coles if qualified, any justified covariates, normalization, dispersion and calibration), tuned parameter values, regularization, confidence-classification rules, effective sample thresholds and provenance/version IDs.
4. Exact historical market reconstruction rules, selection/value formulas including pushes/half grades, quoted-price eligibility, featured-pick thresholds, and Best Slips/Builder joint-probability behavior. Clearly state if joint probability still returns `null`.
5. Reforecast triggers, freshness policies, idempotency keys, worker timing, daily quota assumptions, publication/lock boundaries and lifecycle safety.
6. Test commands actually run, test results and dates, temporal evaluation cohorts, matched baseline comparisons, Brier/log/calibration metrics, realized unit-stake ROI where genuinely measurable, coverage/abstention, deployment/rollback instructions, and known remaining limits.
7. A concise implementation changelog with affected files and why each change was made. Add/runbook updates as necessary; keep the canonical reference synchronized with actual code.

**Do not declare completion if the code has changed but this documentation has not been updated.** If permission or access to the canonical document prevents editing, report it as a blocker—not “documentation updated.”

## 14. Required work sequence and final response

Perform the work in small, independently testable phases:

**Phase A — Audit and evidence:** Read the engine documentation and actual repository; catalog current model/source/market/worker behavior; verify provider coverage, rights and quotas; reproduce baseline evaluation.

**Phase B — Backend data coverage and tests:** Fix identifiable historical-data gaps, support safe unpredicted-match market reconstruction, add as-of data audits, source freshness and idempotency tests.

**Phase C — Private statistical candidates:** Tune time weighting; evaluate Poisson+Dixon–Coles, historical conditional market evidence, league calibration and separately warranted context features. Preserve existing model as baseline.

**Phase D — Private ranking/slip candidates:** Evaluate value-aware selection, quote movement signals and correctly modeled slip joint probabilities; use no fabricated prices or unsupported correlations.

**Phase E — Pre-match update improvements:** Implement/test materially changed lineup/context-triggered reprediction before the exact existing cutoff; maintain full revision history and avoid duplicate jobs.

**Phase F — Qualification and guarded rollout:** Report full held-out evaluation, approved feature flags, production safeguards, shadow evidence and rollback. Do not turn on weak candidates.

**Phase G — Documentation:** Update the **canonical prediction-engine documentation after implementation**, run final contract/regression checks, and reconcile all claims with tested code.

At completion, provide:

- A before/after table of genuine code-level improvements and their status (`implemented`, `tested privately`, `qualified`, `enabled`, `deferred`, `blocked`).
- The exact changed files, migrations, flags and worker/query behavior.
- A data-coverage table by source and league/market, including missing or unlicensed inputs.
- Reproducible commands, test outputs and held-out metrics compared with the original engine (do not invent results).
- Verified API-quota impact and race/idempotency protections.
- Explicit confirmation that **no UI/frontend files, designs, routes, filters, dialogs, layouts, access flows or public API contracts were altered**—or an exact list of deviations requiring approval.
- The **path and sections of the prediction-engine documentation actually updated**, plus a list of unqualified features and next steps.

**Final acceptance principle:** The goal is an honest, auditable, reproducible, quota-efficient football forecasting system that estimates genuine probabilities, evaluates evidence strength separately, identifies positive expected-value selections when the data justify them, and preserves every pre-match historical record. It must remain completely compatible with the existing GoalHint user interface.
