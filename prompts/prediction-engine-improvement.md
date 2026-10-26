# Improve the prediction engine with probability-qualified odds selection and optional AI precedence

Implement this task in the existing Goal Hint application. The owner has approved the behavior below. This is a prediction-mechanism task: keep business logic in `next-js/` and make no UI, layout, styling, navigation, or Flutter changes.

## Intended behavior

For each eligible upcoming fixture, build a dependable non-AI prediction from API-Football predictions, historical football data, team and player performance, and available bookmaker odds. First establish which market selections have sufficiently strong winning probabilities and supporting evidence. Among the eligible selections, choose the highest available decimal odds.

An optional AI layer independently analyzes the fixture using verified football evidence and reliable current research. When it produces a usable recommendation, that recommendation takes precedence. Otherwise, automatically use the non-AI engine. Both paths use the same probability, evidence, market, quote, and publication validation rules. Neither a prediction nor a high probability guarantees a win.

Deliver working implementation and verification, not another proposal or a flag-only change. Preserve unrelated working-tree changes and follow `AGENTS.md`.

## 1. Inspect and reuse the current architecture

Read the relevant repository instructions, `app-write-up.md`, the development tracker and plan index, and the existing code before deciding which files need changes. Starting points include:

- `next-js/src/domain/markets.ts`, `market-ranking.ts`, `odds.ts`, `odds-markets.ts`, and the existing market definitions and settlement rules.
- `next-js/src/server/football/api-football-adapter.ts` and `api-football-normalize.ts`.
- `next-js/src/server/fallback/`, `evidence/`, `predictor/`, `odds/`, `refresh/`, and `predictions/`.
- `next-js/src/server/live/live-runner.ts`, `live-authorities.ts`, `live-ai.ts`, `live-ai-plan.ts`, and `live-ai-evidence.ts`.
- `next-js/docs/provider-baseline.md`, `provider-fallback.md`, `provider-odds.md`, `fixture-evidence.md`, `ai-predictor.md`, and `prediction-refresh-worker.md`.

These are investigation starting points, not a mandatory edit list. Reuse the current adapters, quota and cost controls, evidence snapshots, durable jobs, probability validators, exact odds arithmetic, and atomic publication services. Avoid a parallel prediction pipeline or duplicated ranking logic.

Account explicitly for these current constraints:

- The production `provider-baseline` policy keeps AI in shadow, and live publication authority independently blocks AI. Merely changing `sourceOrder` does not implement AI precedence.
- Existing `bestPublishedFamily` chooses the highest probability and uses odds only for an exact probability tie. That is different from the approved probability-eligibility-then-highest-odds rule.
- The current normalized API prediction probabilities cover home win, draw, and away win. Double chance is derived from that distribution. Textual goal advice is not a validated goal-market probability distribution.
- Current live AI evidence and authorization are tied to AI capability. The non-AI engine must also be able to collect and use football evidence when AI is disabled.
- The AI transport currently has no search tools, and live research allocations are absent. An enabled model does not by itself search the internet.
- Odds acquisition, internal use, public display, and their permissions are separate concerns. Public odds display is currently disabled; this task must not enable or redesign it.

The owner's approved AI-precedence requirement supersedes the old product rule that AI must always remain in shadow. Reconcile that rule deliberately across runtime policy, frozen plans, source resolution, publication authority, tests, and documentation. Preserve genuine source authorization, secret handling, evidence validation, publication locks, and resource controls. Do not fabricate promotion evidence or claim demonstrated accuracy to satisfy an old guard.

Before using or extending external provider endpoints or model/search capabilities, verify their current official documentation and the actual account's supported data. Do not assume every competition, subscription, fixture, or market has the same coverage.

## 2. Define one reproducible decision contract

Create or extend reusable, typed server/domain contracts for:

- A versioned selection policy with minimum winning probability, evidence sufficiency, historical windows, freshness bounds, eligible market definitions, and deterministic tie-breaking.
- Candidate identity: canonical fixture/version, team identities and orientation, market, selection, period, line, forecast source, probability, evidence snapshot, and original source clocks.
- Raw provider probabilities, any separately derived engine estimates, and optional AI probabilities, with their provenance retained independently.
- Quote identity: exact market and selection, period/line, bookmaker, decimal price, snapshot reference, and original observation/update timestamps.
- A final recommendation or explicit no-qualified-recommendation outcome, including policy version, chosen source, eligibility decisions, fallback reason, and a concise evidence-based explanation.

Keep a numerical probability distinct from evidence coverage or confidence in the quality of the analysis. Preserve complete, valid distributions and shared cross-market consistency checks. Double-chance probabilities must remain coherent with their underlying match-result distribution.

Use an existing applicable approved minimum probability if one exists. Otherwise, use a centrally configured, documented provisional default of `0.65`, inclusive. This is an engineering starting point, not an accuracy claim or a historical owner-selected threshold. Do not silently lower it when no candidate qualifies. Keep all thresholds and weights explicit, versioned, and testable; do not scatter magic numbers through services.

## 3. Build the non-AI engine

### Provider predictions and supported markets

Retrieve and normalize the API's available prediction distributions through the existing bounded adapter. Evaluate the supported selections in each usable distribution instead of assuming that its single most likely selection is the only possible recommendation. Preserve the original distribution and do not change an established argmax-based family contract in place merely to select a higher-priced alternative; model the chosen recommendation separately where necessary.

Start with existing supported markets: match result, derived double chance, total goals, and both teams to score where a trustworthy probability basis exists. Preserve exact goal lines and regulation-time settlement semantics. Existing extended markets are eligible only when their probability source, exact price mapping, and settlement semantics are already supported.

Never invent total-goals or BTTS probabilities from home/draw/away percentages, text advice, predicted score strings, or bookmaker odds. If a non-AI statistical model is added to estimate a missing family, give it an explicit reproducible method, version, sufficient historical input, provenance, and validation. Keep unsupported families unavailable. Do not expand into new UI, player props, stadium bets, or a general market catalog project.

### Historical and team evidence

Use verified matches completed before the analysis cutoff to assess:

- Recent team form, home/away splits, goals scored and conceded, and available reliable performance statistics.
- Head-to-head results, with canonical team orientation and deduplication across data sources.
- Historical occurrence rates for the candidate market events: home/away wins, draws, double chance, the exact supported goal line, and BTTS.
- Comparable conditions where data supports them, such as venue orientation, competition context, opponent strength, rest, and squad continuity.

Retain cohort definitions, sample sizes, recency, and supporting match references. Derive historical market outcomes using the existing settlement rules for the exact period and line. Weight recent and relevant observations sensibly; use documented smoothing or minimum samples so a few old head-to-head results cannot dominate. Distinguish a venue's identity from verified pitch condition or actual home advantage. A future fixture has no completed result; do not treat its eventual outcome or later news as historical input.

Make this evidence affect a documented eligibility decision or an explicitly modeled probability adjustment. Simply attaching statistics to an unchanged explanation is insufficient. Keep any adjusted estimate separate from the API's original probability, validate the resulting distributions, and avoid counting the same information repeatedly through provider predictions, form, and H2H summaries.

Treat historical event frequencies and the app's prior prediction win rate as different measurements. Use settled prediction performance for evaluation and policy improvement, with point-in-time data and adequate samples; do not substitute it blindly for the probability of this fixture's market winning.

### Players, injuries, and availability

Use available player statistics, recent contributions and minutes, confirmed absences, suspensions, and confirmed or clearly labeled expected lineups. Connect an absent player's identity to their attacking or defensive contribution, including whether they have been important scorers or creators. Join stable player/team identities and the correct competition/season. Season aggregates establish season contribution, not recent form; later season totals must not leak into an earlier analysis. Reuse the available player-statistics adapter where appropriate; existing injury collection alone does not establish player impact.

Distinguish confirmed absence, doubtful status, an expected lineup, and a confirmed lineup. Consider replacements when reliable information exists. Apply documented rules or a validated model; do not invent injury-impact percentages. Missing reports mean unknown availability, not a fully fit squad. Optional missing player or lineup data must not automatically disable an otherwise sufficiently supported baseline forecast.

## 4. Select the highest odds after probability qualification

Keep football probability estimation separate from bookmaker-implied probability and price selection. For each candidate:

1. Validate fixture, market, selection, period/line, forecast probability, evidence sufficiency, and source freshness.
2. Apply the configured minimum winning probability and explicit evidence rules.
3. Require a valid, fresh, permitted bookmaker quote for that exact candidate before offering an odds-based recommendation.
4. Among all remaining eligible candidates in the applicable source pool, select the highest exact decimal odds. Break equal-price ties by higher unrounded winning probability, then stable configured market/selection order.

Use the existing precise decimal utilities. Compare full stored precision, not formatted or rounded UI values. Respect the configured bookmaker policy. If several bookmakers are supported, preserve the exact bookmaker and quote used; never manufacture a complete distribution from prices taken from unrelated books or snapshots.

For illustration, at a `0.65` minimum, a candidate with probability `0.70` and odds `1.90` outranks one with probability `0.82` and odds `1.40`, assuming both meet the evidence rules. A candidate with probability `0.30` and odds `5.00` is ineligible. Odds must have an effect beyond exact probability ties.

Bookmaker-implied probabilities, even after de-margining, are separate from independently estimated winning probabilities. If expected value or edge is recorded, calculate and label it correctly; do not let an unapproved extra ranking rule silently replace the requested highest-odds selection.

Missing, expired, suspended, mismatched, unpermitted, or invalid odds exclude that candidate from the priced recommendation. Preserve a valid probability-only forecast where existing contracts allow it, but record that a priced recommendation is unavailable. If nothing qualifies, abstain explicitly; do not guess a price, choose an unsupported market, or force a low-probability pick.

Reuse permitted internal odds data without coupling engine functionality to a public-display flag. Do not bypass acquisition/use permissions or enable public odds display. Resolve superseded documentation restrictions narrowly so forecasts remain independent of price even though the selection engine now uses price.

## 5. Implement optional AI analysis and real research

Compute or retain the non-AI result so it remains available within the existing job deadline. AI is optional at startup and per fixture: a missing key, disabled provider, exhausted allocation, timeout, provider error, insufficient evidence, or invalid response must not break the baseline path.

Reuse the existing predictor and evidence contracts. Give the model the verified football context, relevant team/player evidence, and attributable current research. The existing prompt excludes provider prediction votes and odds; either preserve independent AI probability estimation and apply the common price selector afterward, or deliberately version and validate any necessary input-contract change. Do not silently inject unsupported fields.

Implement a concrete optional research/search binding through the existing research, evidence-network, and accounting abstractions. Research should cover relevant, reliably available factors such as:

- Club and competition announcements, credible team news, injuries, suspensions, and squad updates.
- Important players' form, availability, and expected participation.
- Confirmed venue changes, neutral grounds, pitch/stadium condition reports, and weather relevant to kickoff.
- Schedule congestion, travel, managerial changes, and competition incentives supported by factual sources.

Use a documented, bounded source policy and a supported provider configuration. Keep credentials private and configuration optional. If a research provider is unavailable, record that fact and continue with sufficient structured football evidence or use the baseline according to the evidence policy. Missing optional news is not automatically an unusable AI result. Do not require every conceivable factor or claim complete internet coverage.

Persist source URLs, publisher, original publication/update time where known, retrieval time, attribution, and the exact evidence used. Apply source-specific freshness and identity checks. Prefer authoritative sources, distinguish rumors and conflicts, and avoid counting syndicated reports as independent confirmations. Do not infer pitch condition from a stadium name or weather at another place/time. No search-result snippets, uncited model memory, or invented citations may be presented as verified research.

Keep retrieved text inert. Preserve existing network restrictions, source permissions, bounded requests, cancellation, deduplication, and cost accounting. Search, model use, and source fetching need explicit time/request/token limits; failures must leave enough capacity to complete baseline publication. Do not add unlimited searches or retries.

### AI precedence and fallback

- Produce an AI recommendation using validated AI forecasts and the same probability/evidence/odds selector. Its final explanation must identify the evidence supporting it and material uncertainties.
- If that AI recommendation is usable, it becomes the final recommendation even when the independently retained baseline chose a different market. A provider result must not override it merely because the old production policy preferred the provider.
- If AI produces no eligible, supported recommendation, use the qualified baseline recommendation. A response that merely parses as JSON is not automatically usable.
- Preserve complete-family and cross-market consistency rules. Where existing multi-family output supports partial fallback, use baseline groups only for missing or rejected AI groups without presenting their probabilities as AI-generated. Partial supplementation must not silently override the valid final AI recommendation.
- Record whether the final source is AI or the baseline, why AI was skipped/rejected, and which evidence was unavailable. Keep forecast probabilities, evidence quality, and source identity distinct.
- Do not weaken canonical identity, source freshness, authorization, cutoff, or atomic publication checks to make an AI response publishable. An invalid fixture or expired publication window is not a reason to publish stale fallback data either.

The approved precedence is a product behavior change, not evidence that AI is more accurate. Preserve honest provisional/calibration labels and retained source receipts for later comparison.

## 6. Integrate without UI changes or historical rewrites

Connect the decision to the actual refresh worker and publication/read paths. Ensure existing cards, detail responses, feeds, and slips that consume the recommended pick receive the same authoritative decision through their existing data contracts. Preserve family-specific forecasts and explicit user-selected market behavior.

Do not leave the new engine as an unused helper. Do not let a read-time ranking helper silently replace the published recommendation when odds later change. Persist the recommendation, policy/evidence versions, source decision, and exact quote snapshot with the appropriate immutable revision, including permitted internal quote provenance when public display is disabled. Replaying the same job must reproduce the same decision without renewed source timestamps or extra paid calls. New odds or news can affect a new permitted revision, never rewrite an earlier one.

Make only the additive schema/contract changes necessary, following the existing MySQL/MariaDB migration and integrity conventions. Keep historical revisions readable, access controls intact, settled results unchanged, and no-recommendation states compatible with existing availability behavior. Preserve schedule/version changes, kickoff locks, retries, concurrency protections, and eligible previous-publication retention under existing rules.

No component, JSX, CSS, layout, label, navigation, or Flutter redesign belongs in this task. New explanations and source metadata should use existing server fields or private audit records. Do not add controls or public diagnostics. Prediction values and existing explanation content may naturally change as the engine improves.

## 7. Verification and acceptance criteria

Use deterministic fixtures and injected transports; automated tests must not require paid calls. Add meaningful behavioral coverage and extend relevant existing tests rather than only asserting implementation details.

Prove at least:

1. The qualifying higher-odds candidate wins even when another qualifying candidate has a higher probability; a high-odds candidate below the threshold loses eligibility.
2. Threshold equality, exact decimal comparisons, stable ties, invalid probabilities, and no-qualified-candidate outcomes behave as documented.
3. Missing/stale/suspended/wrong-selection/wrong-line quotes cannot win selection, and bookmaker-implied probabilities cannot masquerade as independent forecasts.
4. Team form, supported historical market frequencies, and verified scorer absences affect the documented baseline rules; tiny H2H samples, missing injuries, and reversed home/away orientation are handled correctly.
5. Text-only provider advice does not manufacture totals/BTTS probabilities, and derived double chance remains consistent.
6. With AI disabled or no key installed, the enriched baseline still collects eligible evidence and publishes successfully when its own requirements are met.
7. A usable AI recommendation supersedes a conflicting baseline recommendation through the actual production resolution and publication-authority path.
8. Timeout, exhausted budget, invalid schema, unsupported selections, ungrounded citations, stale evidence, and unavailable research cause the specified continuation/fallback without taking down the fixture or job batch.
9. A configured research binding is actually invoked and its attributable evidence reaches AI; an unconfigured one makes no search request and records limited coverage accurately.
10. Partial-family fallback does not create contradictory probabilities or override the valid final AI recommendation.
11. Point-in-time cutoffs exclude later results/news/quotes; restart and replay preserve the original decision, source clocks, and bounded attempt counts.
12. Published quotes/recommendations remain stable after subsequent odds updates; historical reads, settlement, and existing multi-market consumers remain compatible.

Review relevant tests under `next-js/tests/`, especially market ranking, API normalization, fallback resolution/service, provider baseline, evidence, predictor, live AI/binding, odds, quote capture, prediction refresh, publication, and history. Update old shadow-only assertions to the new approved behavior while retaining their integrity and failure-path coverage.

Run appropriate targeted tests, `npm run lint`, `npm run typecheck`, and `npm run build` from `next-js/`. Run the repository's relevant refresh/publication/odds/history integration checks against its owned disposable database harness when available. Report commands, actual results, skipped checks, and environmental limitations accurately; do not claim live provider or accuracy verification from synthetic tests.

Where historical evaluation is feasible, compare the original and revised engine on chronological held-out, point-in-time data. Report coverage/abstention and probability quality alongside selection outcomes, with cohort size and limitations. Keep provider and AI measurements separate. Do not tune thresholds on future outcomes, fabricate a backtest, or promise profitability.

## 8. Documentation, delivery, and Git

- Add the next available numbered implementation plan under `next-js/dev-plan/` after checking current numbering, and update the relevant tracker and engine runbooks to reflect actual implemented behavior.
- Document selection defaults, historical/player rules, source precedence, research setup, optional configuration, failure reasons, known data gaps, and rollback behavior. Update obsolete provider-only/shadow-only descriptions.
- Keep secrets, private configuration, dependencies, generated output, and real licensed payloads out of commits. Use synthetic examples and existing environment-example conventions.
- Keep production configuration, workers, public odds flags, paid services, and deployment unchanged unless separately authorized. Missing production credentials may remain an activation limitation; they must not block implementing and testing the baseline and optional adapters.
- Commit only the intended changes, integrate into `main`, verify and push `main`, and follow the repository's branch/worktree preservation rules. Preserve unrelated changes and existing stashes.
- Finish with a concise account of what changed, the actual ranking and AI fallback behavior, verification results, and any configuration or coverage limitations. Do not mark incomplete integrations as finished.
