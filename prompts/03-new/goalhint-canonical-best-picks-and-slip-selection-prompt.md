# GoalHint — Canonical Best-Pick and Automatic-Slip Selection Improvements (Revised)

## Implementation request

Review GoalHint's **current codebase and repository instructions** and make **only the minimal, canonical changes** needed to improve (a) qualified, well-supported and reasonably priced featured picks, (b) **strict kickoff-time cohesion** within automatically published **Best Slips**, and (c) **fair opportunity to generate valid slips across all six existing odds bands**, including bands currently empty. **Do not manufacture slips when the qualified fixture pool cannot support them.**

**Canonical means one authoritative implementation:** update the existing decision, candidate, ranking, and publication paths in place. Do **not** discard working logic, rebuild the engine, create parallel selectors, duplicate business rules, introduce a second publisher, or make broad refactors. The actual current source code takes precedence over these uploaded overview documents if work has advanced since their review.

The football scheduler/odds/live-data reliability changes are **already being implemented by another agent**. Do not overwrite, reverse, recreate, or compete with that work. Coordinate against the current branch and make small, conflict-free changes to selection logic only.

## 1. Goal and selection priorities

Automatic recommendations should have **strong qualified winning likelihood**, genuinely obtainable bookmaker selections and sensible pricing. Automatically published slips should contain matches that **kick off close together**, not combinations spread from early morning until afternoon or night. Every one of the **six existing odds bands** must receive a fair, bounded search for eligible slips.

Apply this hierarchy **after** all existing hard eligibility, forecasting, pricing, fixture and publication rules:

1. **Win likelihood and evidence quality come first.** Preserve the qualified Local Engine, existing price/value tiers, conservative combination ranking, abstention when not qualified, and the distinction between a ranking bound and a validated actual whole-slip probability. Do not trade material deterioration in estimated win likelihood for a shorter wait or a fuller odds band.
2. **Verified bookmaker support comes next.** Prefer an exact selection offered by more distinct eligible bookmakers when compared with similarly qualified candidates. Availability is a practical-use signal, not proof of a higher winning probability. Each published slip must still use **one verified bookmaker throughout**.
3. **Kickoff cohesion matters more than chasing slightly higher odds.** Prefer same-time or near-time kickoffs. Treat a within-slip kickoff span as an **eligibility constraint** for new automatic slips (see Section 5), rather than a weak tie-break that allows ten-hour spreads.
4. **Odds and price quality remain necessary.** Every slip must fall inside its requested **existing exact odds band**, at genuine matching prices, with the canonical price/value safeguards. Within the band, do not seek higher odds by sacrificing the above priorities.

An odds-band target is a hard product requirement **only for any slip that is actually published in that band**. It is **not** permission to loosen evidence, winning likelihood, exact odds, bookmaker support, time cohesion, or the one-to-eight-leg limit just to produce a slip. Use sensible transparent comparisons, not unsupported one-size-fits-all scoring weights.

## 2. Audit first — retain existing decisions

Inspect and map the real current implementation before editing. The uploaded documentation identifies likely canonical entry points; verify them rather than assuming they are unchanged:

- `next-js/src/domain/local-featured-decision.ts` — featured selection policy.
- `next-js/src/server/slips/best-slip-recommendations.ts` — candidate/price qualification.
- `next-js/src/domain/best-slips.ts` — automatic combination search and ranking.
- `next-js/src/domain/slip-builder.ts` — shared combination utilities; avoid changing on-demand Builder semantics accidentally.
- `next-js/src/server/slips/daily-slip-publication.ts` and `next-js/src/server/slips/published-slips.ts` — eligibility, atomic publication, immutable history.
- `next-js/src/domain/reference-odds.ts`, `next-js/src/domain/market-registry.ts` and existing quote/odds stores — exact market identity and bookmaker coverage.
- Existing tests for featured picks, odds matching, automatic-slip ranking, odds bands, set allocation, and publication.

Identify which parts already implement bookmaker filtering, pricing/value tiers, kickoff clustering, conservative slip ranking, bookmaker uniformity, and publication safeguards. Keep correct behavior unchanged. Record genuine gaps and select the smallest edits that address them.

**Investigate these documented characteristics rather than assuming a new engine is needed:** The existing automatic selector processes the six bands in ascending order, uses adaptive kickoff groups, and keeps the **earliest** match inside a six-hour release horizon while allowing **later** matches to extend beyond that horizon. This may contribute to both very wide kickoff spans and starvation of higher bands through cross-band fixture allocation. Verify with current source, logs and the actual candidate sets; do not declare causation without evidence. The publisher already allows up to 32 new slips **per band per half-hour slot**, subject to qualified supply; there is no modern ten-slip daily cap. Preserve those limits unless a confirmed defect is found.

Record a read-only baseline **for each band**: number of eligible fixtures and exact prices, feasible same-book combinations, actual published slips, rejected combinations and reason codes, kickoff-spread distribution, ranked probability/risk, fixture reuse conflicts, and search-budget or pagination truncation. Distinguish true shortage of eligible candidates from algorithmic coverage/allocation defects.

## 3. Bookmaker availability: compare the *exact* pick

For each **eligible** fixture and qualified selection, derive a bookmaker-support measure from **already stored, rights-permitted, fresh provider quotes**; do not add new API calls or schedulers for this feature.

- Count distinct eligible bookmakers actually offering the **same fixture, period, market, team/side, goal line and exact outcome**. Never count merely offering the parent market as support for an unavailable selection.
- Exclude stale, withdrawn, suspended, invalid, unmapped or disallowed quotes, using existing freshness, market-registry and rights policies.
- Avoid double-counting repeated bookmaker rows; distinguish `not observed`, `provider unavailable`, and verified absence. Use the available-fixture/bookmaker denominator carefully when reporting a coverage ratio.
- Reuse existing stored odds and canonical market mappings. Calculate support in bounded batches and avoid repeated per-candidate database queries.
- A selection with one eligible book can remain eligible under existing rules, but **should normally rank below** a similarly probable, reasonably priced selection offered by several books. Never invent availability or declare an unsupported pick supported.
- Do **not** combine prices from different bookmakers within one published slip. The existing rule of **one verified bookmaker per slip** remains mandatory; the support measure only informs confidence that the selection is commonly obtainable.
- Do not impose an untested global minimum bookmaker count that could eliminate otherwise sound selections in competitions with sparse provider coverage. Evaluate suitable thresholds/tie-breaks on real historical and current data, and use graceful fallback or abstention consistent with existing rules.

**Example:** If Under 5.5 is estimated at very high probability but is rare and priced very poorly, while a qualified Over 1.5 has competitive probability, better expected value and wider bookmaker support, the latter should be able to win the canonical ranking **if supported by the actual forecasts and quotes**. Do not infer Over 1.5 from an Under 5.5 forecast; these are distinct outcomes needing their own qualified estimates.

## 4. Price and profitability safeguards

Preserve current canonical featured-pick pricing tiers, including standard-value and priced-fallback behavior, unless a specific, reviewed defect requires a minimal adjustment. Documentation currently describes a standard tier requiring an exact quote of at least **1.10** and positive estimated net return, and a separately identified fallback tier from **1.01**; audit the **live source of truth**.

- Use actual eligible decimal odds and qualified outcome probabilities; for simple win/lose outcomes, estimated net return per unit is `probability × decimal_odds − 1` (use market-specific settlement terms for pushes and Asian/quarter lines).
- Favor a meaningful value margin and practical price where alternatives exist, but do not mislabel a positive expected value as guaranteed profit or use raw bookmaker popularity as proof of edge.
- If the existing fallback admits break-even or negative-value picks, **evaluate and report** whether/how to deprioritize or abstain from them rather than silently deleting a released business rule.
- Preserve exact quote-to-selection identity, bookmaker availability, existing minimum odds policy, market grading and forecasting cutoffs.

## 5. Tight kickoff windows for automatic Best Slips — critical revision

**Reported behavior to prevent on future publications:** slips created around 03:00 Kampala time have paired an early-morning kickoff with one in the afternoon; other examples combine **04:00 with 14:00**, or **14:30 with 22:30/22:45**. Even **14:30 with 15:30** is less cohesive than desired. These are user observations to investigate, not evidence that every named fixture was eligible under the current dataset. Never edit or retract previously sealed slips to fix them.

Strengthen the **existing adaptive kickoff grouping and combination search**, not the football scheduler or a separate new slip-generation pipeline:

- **Default proposed policy for new automatic slips:** Prefer **simultaneous** starts first, then starts within **15 minutes**, then within **30 minutes**. Define the span as `max(verified kickoff times) − min(verified kickoff times)` across **all legs** of the same slip, not just adjacent matches or the earliest match's release window. Use **30 minutes as the normal hard maximum**, including for the 10–20, 20–50, 50–100 and 100–200 bands. The agent should validate and make the value configurable within the current policy mechanism where appropriate; do **not** silently expand it to 60 minutes, multiple hours, or morning-to-evening to produce more slips. Escalate to the owner if evidence suggests a materially different maximum is necessary.
- Apply the span during **candidate generation, ranking, and final atomic eligibility recheck**, including changes to kickoffs or postponed matches. Across-midnight intervals must use real timestamps, not clock-hour subtraction. Use the existing Kampala operational window, public cutoff and **30-minute pre-kickoff buffer** unchanged.
- Minimize the difference in **expected finish times** as an optional *secondary* factor only when trustworthy match-duration information exists; close kickoffs do not guarantee simultaneous finishes.
- Analyze overlapping kickoff clusters as alternative slip groups across the day. For example, 14:30, 14:45 and 15:00 may form one candidate group if all eligibility requirements hold, whereas a qualified 22:45 fixture belongs to a different group rather than extending the afternoon slip.
- Do not include a fixture that is already live or started in a **new pre-match** slip. The goal is to group matches *before* kickoff so they subsequently play within a similar period, never to build retroactive betting tickets.
- When no combination meets the hard maximum for a band, report **no eligible time-cohesive slip** and retry in later natural publisher slots as new eligible fixtures or odds arrive. Do **not** fill gaps by lowering a risk, bookmaker, market, price or time threshold.
- Keep the existing search deterministic and bounded. Prefer reuse of the current grouping utilities and data already loaded in memory; avoid new requests to API-Football, expensive unbounded enumeration, or per-combination database reads.

**Acceptance example:** At comparable qualified risk and support, the selection must choose a 15:00/15:15/15:30 group over a 04:00/14:00/22:45 group. A 14:30/15:30/15:30 group must **not** qualify under the proposed 30-minute maximum, even if its displayed total odds look attractive.

## 6. Empty higher odds bands — diagnose and fairly search all six

The reported empty bands are **10.00–20.00, 20.00–50.00, 50.00–100.00, and 100.00–200.00**. The goal is **better legitimate coverage**, not a fabricated promise that every band will always have slips.

1. **Audit causes per band and per slot.** Determine whether each band is empty because of genuinely insufficient eligible fixtures or exact same-book prices; insufficient qualified probability/value; the one-to-eight-leg constraint; the narrow kickoff span; no valid product of odds inside the exact band; cross-band fixture reuse; the earlier bands' allocation precedence; limited search pages/beam width; candidate truncation; or a failed/late publisher readiness gate. Distinguish these causes with counts and real examples. Do not assume the issue is solely due to probability thresholds.
2. **Evaluate feasibility before allocation.** Search for qualifying combinations **for every band** using the same retained fixture pool, each band's exact odds interval, the same bookmaker, the time cap and existing risk policy. Confirm whether higher bands had possible candidates that an ascending greedy allocation consumed on lower bands. Preserve existing exact odds boundary semantics (inclusive lower bound, exclusive upper bound except 200.00).
3. **Fix proven starvation in the canonical selector.** Where real feasible candidates exist, prefer a minimal fair, deterministic **cross-band allocation** (or bounded reservation/selection improvement within the existing code) so one band is not systematically starved merely because lower bands were processed first. Consider the tradeoff for **all** bands and overall risk; preserve fixture uniqueness across bands and neighboring sets and do not create a second planner/publisher.
4. **Preserve win-focused quality across bands.** A 100–200 odds slip is structurally different from a 2.5–5 slip: higher combined odds generally imply less likelihood of winning. Rank **the best genuinely eligible alternatives within that band**, without claiming that all bands can have the same win probability. Do not add unjustified legs, downgrade the model, accept missing prices or mix bookmakers to hit a target.
5. **Do not confuse search coverage with permission to wait all day.** Explore enough distinct nearby kickoff clusters, candidate pages and applicable publisher slots to find valid candidates, but **never widen the within-slip 30-minute span** solely to fill an empty band. Preserve the existing earliest-fixture release horizon and operational set boundary unless a distinct demonstrated bug requires change.
6. **Avoid duplicate allocation and preserve publication safety.** The final store remains the only authority for fixture exclusivity, locking and sealed append operations. Retain the current per-slot append cap, 30-minute publication cadence and original identities. Previously published slips cannot be reassigned to other bands or changed for a better distribution.
7. **Report empty bands honestly.** For every slot or representative sampled day, output `band -> feasible before allocation -> selected -> published -> unfilled reason`, plus counts of time-cap failures, book/odds mismatches, probability/risk exclusions, fixture conflicts and bounded-search limitations. An empty band caused by hard constraints is an **acceptable, correctly explained outcome**, not permission to violate them.

**Explicit goal:** Maximize legitimate, high-quality coverage across all six exact bands **subject to** the same risk, market support, price, single-bookmaker, kickoff-cohesion and publication restrictions. Do not guarantee minimum slip counts when the evidence does not support them.

## 7. Non-negotiable existing business rules

Preserve, unless the latest code and repository instructions show an explicitly authorized change:

- Six exact total-odds bands: **2.50–5.00, 5.00–10.00, 10.00–20.00, 20.00–50.00, 50.00–100.00, 100.00–200.00**, with the existing exact boundary rules.
- **One to eight matches per slip**; product odds calculated from the actual same-book quotes before display rounding; preserve exact boundary semantics and no more than 30-minute within-slip kickoff span under the proposed new default.
- **One bookmaker per published slip** and exact market/line/selection pricing.
- Existing **30-minute minimum pre-kickoff eligibility**, scheduled/status and forecast-cycle checks, and prevention of early-start or ineligible fixtures.
- Current Kampala reporting-day/set definition, the half-hour publication cadence, slot ownership, per-band append limits, and existing pool/fixture reuse exclusions across bands and neighboring sets.
- Existing conservative whole-slip ranking/risk policy, Local Engine qualifications, settlement rules and immutable originally published records, rankings, odds and links.
- Separate on-demand **Slip Builder** behavior, user-specified filters, reuse setting, saved presets and other unrelated features.
- Existing odds-data and live-data workers, shared quota, API request paths and deployments already being modified in the parallel task.

**No changes to user interfaces**, layouts, labels, mobile or desktop rendering, access/paywall rules, registration, payments, or provider collection schedules. Do not revise historical picks or regenerate sealed publications.

## 8. Prove the improvement before rollout

1. Establish a **read-only baseline** from available retained, point-in-time fixture forecasts and bookmaker quotes (use publication cutoffs; no future prices or results when constructing past decisions). Measure bookmaker support, price and model-estimated return per selected pick; measure kickoff spread and distribution, band, conservative slip ranking bound, distinct fixtures, feasible and published counts **per band**, and why all reported high bands were empty.
2. Run the proposed changes in a **comparison/shadow mode or deterministic replay** using existing test infrastructure, without modifying real published history. Compare old and proposed outcomes on the **same eligible cohort**. Replay all six exact bands together to test order-dependent starvation and cross-band fixture allocation.
3. Check that the change improves bookmaker availability and kickoff cohesion **without material deterioration** in qualified probability/risk, exact-price value or eligibility. Measure the share of **new** slips with kickoff spans of 0–15, 16–30 and over 30 minutes; the final category should be **zero** under the proposed hard limit. Compare filled-band counts and empty-band reasons before/after. Report fewer slips honestly if tighter grouping reduces supply.
4. Use meaningful tests: zero/one/multiple bookmakers; exact-market versus parent-market mismatch; stale or withdrawn prices; absent versus genuinely unavailable quotes; one-book consistency; simultaneous starts, 15-minute and 30-minute boundary, 60-minute and multi-hour exclusions; across-midnight timestamps; insufficient eligible fixtures; all six exact odds bands; candidate feasible for high band but consumed by lower band; zero feasible high-band combinations; no publisher readiness; cross-band fixture reuse; rescheduled fixtures; publication retry/atomicity; locked old publications; deterministic tie-breaking and search limits.
5. Verify on staging. Preserve rollback capability and do not deploy to production without the normal required authorization. Do not interfere with the other agent's in-progress scheduler/worker changes. If a current policy truly makes the high bands infeasible, **report the conflict and ask for a separate product-policy decision; do not silently change the rules**.

## 9. Expected agent output

After implementation, report concisely:

- The **existing canonical logic** found and what was preserved.
- Confirmed behavior gaps, exact small modifications and file paths.
- Final selection priority/threshold rules, including the actual maximum kickoff span, quote/bookmaker thresholds and measured trade-offs or intentionally unchanged fallback rules.
- **Six-band coverage report:** baseline and after-change feasible/published slips for every band, whether greedy ordering caused starvation, any remaining empty bands, and exact reasons.
- **Kickoff-cohesion report:** before/after median, high-percentile and maximum within-slip spans, with real examples of morning-to-evening combinations eliminated.
- Before/after examples for bookmaker support, probability, odds/value and kickoff spread using real test fixtures or explicitly labeled synthetic test cases.
- Tests and staging results, effect on slip availability, and any outstanding limitations.
- Deployment status, explicitly separating code changes, staging verification and production authorization.

**Final instruction:** Make the *smallest correct canonical delta* to GoalHint's **existing** best-pick and automatic-slip selection logic. Prioritize qualified likelihood of winning, practical bookmaker support, genuine price/value and **near-simultaneous within-slip kickoff**. Give all **six odds bands** a fair chance to produce valid slips and explain every empty band; **never relax hard criteria or fabricate coverage**. Do not reinvent the wheel, alter sealed history, change the UI or collide with the ongoing scheduler work.
