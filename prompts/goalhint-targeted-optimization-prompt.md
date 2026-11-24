# GoalHint — Targeted Prediction and Slip-Generation Optimization Prompt

## Your role

You are a senior software engineer auditing and improving the **existing GoalHint application**. This is a **targeted enhancement of the current implementation**, **not a rewrite, redesign, or new feature build**.

First inspect the actual repository, existing business rules, data models, services, background jobs, scheduler, API endpoints, tests, and prediction/slip-generation flows. **Do not assume a feature is missing just because it is described below.** For every requirement:

- **Already implemented correctly:** Keep it exactly as it is.
- **Implemented but incomplete, unreliable, or incorrect:** Make the smallest safe correction.
- **Not implemented but required by this prompt:** Add it by extending existing architecture, reusing established services and conventions.
- **Existing feature not covered by this prompt:** Leave it untouched unless it directly prevents a requirement here; explain any unavoidable change.

Do not reinvent the wheel, replace working algorithms without evidence, introduce competing implementations, or make speculative improvements outside this scope.

## Non-negotiable safeguards

1. **Do not change the user interface** of the Matches, Automatic Slips, or Builder screens: no layout, styling, component structure, copy, navigation, routes, filters, controls, or interaction redesign. Preserve existing public/API contracts unless a narrowly scoped, backward-compatible change is essential.
2. **Protect prediction quality.** The existing prediction engine reportedly performs well (approximately 70–80% accuracy as observed by the owner, not a verified benchmark). Establish a reproducible baseline; do not assert or promise that any modification will preserve or increase accuracy without evidence. Prefer reusing its existing prediction outputs and adjusting slip **selection/availability logic**, not changing the core predictive model.
3. Preserve all established functionality, market definitions, odds handling, permissions, subscription access, and operational behavior outside the stated scope.
4. No destructive resets or unnecessary database/schema migrations. Preserve historical data and the original selections and odds associated with already-published slips.
5. Reuse existing project conventions, libraries, jobs, caches, transaction boundaries, timezone settings, and data-access patterns. Add configuration or infrastructure only when necessary and justified.
6. Use accurate, observed fixture status and kickoff information. Never fabricate matches, predictions, probabilities, odds, market eligibility, or settlement outcomes.
7. If a proposed change conflicts with existing behavior or data contracts, identify the conflict, choose the least disruptive safe implementation, and document the decision. Do not silently change semantics.

---

## Screen 1: Matches — preserve existing behavior

The Matches screen displays fixtures and their individual predictions. The owner considers the current screen and predictions satisfactory.

- **Do not modify the Matches UI.**
- Do not rework how its match predictions are displayed or introduce new prediction logic simply to support slips.
- Continue using the application's existing, authoritative prediction engine and prediction records as inputs to both slip-generation flows.
- Only fix a confirmed underlying defect that directly affects the requested slip improvements; protect compatibility and add regression tests.
- If prediction outputs are recalculated upstream, keep historic published-slip prediction snapshots intact.

## Screen 2: Automatic Slips — reliability and availability

The app automatically generates recommended daily slips, currently beginning at midnight. Improve the **selection and lifecycle logic** without changing the screen UI.

### A. Preserve all existing total-odds bands

Keep the following six supported bands and their existing display/selection behavior:

1. **2.5–5**
2. **5–10**
3. **10–20**
4. **20–50**
5. **50–100**
6. **100–200**

Respect the application's existing inclusivity rules at band boundaries rather than accidentally double-classifying or dropping a slip. Do not redesign the bands or invent new ones.

### B. Generate throughout the day, not only at midnight

- Keep the existing midnight processing where appropriate, but implement or validate **incremental refresh checks approximately every 15–30 minutes** using the existing scheduling architecture.
- A refresh must **not rebuild, mutate, reshuffle, or republish existing slips**. It should seek **new, eligible opportunities** using unused matches and create additional slips **only when quality and constraints permit**.
- Before generating, evaluate the actual **current time in the application's configured operating timezone** and the latest reliable fixture information. Use event timestamps correctly across timezones.
- For a **new slip**, include only fixtures that are genuinely upcoming and normally **at least 30 minutes away from kickoff**. Exclude already-started, completed, cancelled, postponed, unknown/unsafe-status, or otherwise ineligible fixtures.
- Prefer a reasonably cohesive kickoff window (a **3–6-hour range is a configurable preference**, not a reason to violate stronger quality rules). Avoid combining a match around midnight with an evening match when more sensible alternatives exist.
- Make quality opportunities available later in the day rather than consuming all eligible premium matches in the initial midnight batch. Use cautious, time-aware allocation **without hoarding good matches so aggressively that valid slips disappear**.
- If no sufficiently strong unused matches are available, generate **nothing**; do not relax quality or eligibility simply to fill a quota.

### C. Prioritize quality over quantity

Apply these selection priorities in order:

1. **Hard eligibility**: valid upcoming fixtures, market availability, kickoff buffer, correct odds band, and all existing business rules.
2. **Highest defensible estimated probability that the whole slip wins**, while keeping constituent prediction quality high.
3. **Higher total odds among similarly reliable eligible options**, not at the cost of substantially lower winning probability.
4. **As few matches per slip as practicable** while meeting the target odds band and other constraints.
5. Sensible timing and diversification when candidates remain comparable.

Use the prediction engine's existing probabilities/confidence appropriately. Account for meaningful correlation between selections where the current architecture supports it; **do not blindly treat correlated events as independent**. Do not invent probability estimates. Derive any confidence thresholds from existing policy or evidence-based validation, not arbitrary new constants.

**Ten slips is a target, not a mandatory quota.** Publishing six high-quality slips is preferable to publishing ten with weak or duplicate selections. Some high-odds bands inherently imply lower win probability; never claim those slips are guaranteed or equivalently reliable.

### D. Strict no-reuse rule for automatic slips

- Within the **automatic daily published-slip set**, a fixture/match must appear in **at most one published slip**, regardless of the prediction market chosen for it.
- The no-reuse rule covers all six odds bands within the same automatic daily set.
- It must remain enforceable across retries, concurrent workers, and repeated scheduled refreshes. Use stable fixture IDs, correctly scoped database transactions/uniqueness or reservations, and idempotency as appropriate to the existing schema.
- Do **not** apply this automatic-slip uniqueness policy globally to the separate Builder workflow.
- If an already-published slip becomes inactive, withdrawn, or later voided, do **not** quietly recycle its fixture into another published automatic slip for the same daily set; retain the audit trail.
- Avoid placing the same match more than once **within an individual slip**.

### E. Published slips are immutable in selection, but statuses can change

Once published:

- **Never silently replace, remove, reorder, or re-predict its selections** as part of a refresh. Preserve the original chosen matches/markets, selection odds, total odds, predictions, and publication timestamp as historical snapshots.
- Update the **operational status** of fixtures/slips as reliable fixture information changes, without altering those original snapshots.
- When **any constituent match kicks off**, the entire slip should cease to be presented or classified as **available to place as a new pre-match bet**. Retain it in the appropriate existing historical/in-progress record; do not delete it.
- If new information materially undermines a published recommendation **before kickoff**, any existing withdrawal/inactive mechanism may mark it unavailable for new bets, but must never silently alter its contents; preserve its original record.
- For **cancelled matches**, reflect cancellation and only apply a **1.00 void multiplier when the relevant settlement policy confirms that outcome**.
- For **postponed matches**, reflect postponement and follow the relevant bookmaker/provider settlement rules. A postponement is **not automatically a void**.
- When a selection is officially void, recalculate **effective/settled odds** appropriately while preserving the **original displayed/stored slip odds snapshot** separately. Do not invent settlement outcomes or assume every bookmaker has the same rules.
- Newly generated slips must exclude ineligible cancelled/postponed fixtures until eligible again.
- Preserve existing result settlement, accounting and history behavior unless a concrete bug requires a narrow correction.

## Screen 3: Builder — respect the user's filters exactly

The Builder generates a requested **set** of slips based on the user's filters. It is a separate, **user-triggered** workflow; the automatic scheduled refresh policy must **not** regenerate past Builder results.

### A. Preserve every existing control and its semantics

Keep all existing UI and validation behavior for:

- **Number of slips** requested, subject to the actual eligible match pool.
- **Minimum individual selection odds** (the existing filter permits an input minimum of **0.01**, as described by the owner). Respect the existing input, validation and provider odds conventions rather than reinterpreting or normalizing them arbitrarily.
- **Total slip odds**: an exact target (where existing tolerance/precision permits), or a user-selected minimum and maximum, such as 4–5 or 20–50.
- **Matches per slip**: user-defined minimum and maximum (including wide ranges where supported).
- **Markets and market-specific selections**, for example total-goals markets with specified thresholds (such as over 1.5 or over 2.5), or the existing automatic market-selection option. Preserve equivalent flexibility for the other supported markets.
- Any other currently existing Builder filters, defaults, sorting, permissions, and controls, whether or not explicitly named here.

All selected filters are binding constraints. Never quietly loosen them merely to generate a requested number of slips.

### B. Exactly honor the existing **“Reuse Matches”** checkbox

This checkbox controls **reuse across different slips in the single current Builder request**:

- **Checked / enabled:** The same match **may occur in multiple generated slips, even in all of them**, provided each slip meets the user's filters. **Do not impose an unrequested cross-slip diversification cap or no-reuse policy.**
- **Unchecked / disabled:** A match may occur in **only one slip** in that generated result set. Enforce the rule across the complete set, not merely within each slip.
- Reuse settings for one Builder request **must not block another independent Builder request**, and Builder results **must not consume or be blocked by the Automatic Slips daily uniqueness pool**, unless the existing product explicitly already does so and a change is discussed as a compatibility concern.
- Even with reuse enabled, do not place the identical fixture multiple times *within the same single slip*.
- Do not confuse **allowing a match to recur** with any separate, existing behavior about identical whole slips. Preserve existing behavior on identical slips; do not introduce a new de-duplication restriction without a specific requirement.

### C. Optimize only within the specified constraints

- When several combinations satisfy the user's filters, prefer higher estimated **whole-slip win probability** and then favorable odds, using as few matches as practical **within the user's selected match-count range**.
- Respect market constraints and reliable market-specific probabilities; do not substitute an unselected market or line.
- Detect impossible or insufficient filter combinations efficiently. If a request asks for 20 slips and only 7 qualifying slips exist, **return the 7 qualifying slips through the existing response conventions**, without inventing 13 weak or non-compliant slips. If none qualify, preserve the existing empty-result/error UX rather than redesigning it.
- Evaluate newly built slips against current fixture status and availability; do not select started or ineligible matches when producing new pre-match slips.
- Preserve existing Builder results and user expectations; do not add scheduled background regeneration of their previously generated slips.

---

## Shared engineering requirements

### 1. Audit first, then make minimal changes

Trace the real flow from fixture feeds and prediction outputs through slip candidate generation, ranking, persistence, refresh, publication, expiry, settlement, and UI/API consumption. Document which requirements **already pass**, which **fail**, and which need narrowly scoped implementation. Reuse existing services instead of creating parallel logic. Keep changes localized.

### 2. Reliability, atomicity, and idempotency

- Prevent duplicate slip creation and duplicate match allocation during simultaneous jobs, retries, and manual/admin triggers.
- Scope uniqueness correctly: **Automatic Slips = one match per published daily set; Builder = checkbox-defined one request at a time.** Never place a blanket uniqueness constraint on fixture IDs that would break Builder reuse.
- Use transactions, constraint handling, scheduling leases/locks, and idempotency keys only as appropriate to the existing architecture.
- Handle failed or partial jobs safely; avoid orphaned allocations and historical data corruption.
- Avoid unnecessary database writes, slow combinatorial searches, repeated expensive prediction calculations, and large unbounded scans. Reuse existing performance safeguards, and add bounded search/pruning if required.

### 3. Performance, data correctness, and security

- Read fixture states from authoritative current data and handle stale caches, delayed provider updates, rescheduling, edge times, and missing data safely.
- Preserve correct permissions, user entitlements, server-side filtering, existing endpoints, and sensitive information handling.
- Minimize load on the application database and external football-data providers; honor existing rate limits.
- Use existing telemetry/logging and add only targeted metrics required to validate these changes.

### 4. Evidence-based validation and testing

**Before implementation:** Establish the current baseline from reproducible historical data and existing tests. Do not rely on an anecdotal 70–80% figure as proof. Avoid look-ahead bias: for backtests, make each decision using only data available **at the historical decision time**.

**After implementation:** Compare old and new behavior on the same holdout periods and selection opportunities, reporting where data exists:

- Per-selection prediction accuracy and calibration.
- Whole-slip win rate and loss rate, by odds band.
- Coverage/number of usable automatic slips by time of day.
- Fraction of slips containing a match that had already started at the viewing/generation time (target: **zero for newly actionable slips**).
- Duplicate-fixture overlap between published automatic slips (target: **zero within the daily set**).
- Builder compliance with every requested filter and the reuse checkbox (target: **100% constraint compliance**).
- Odds-band accuracy, published-slip immutability, cancellation/postponement behavior, and effective-odds settlement correctness.
- Any available ROI/yield, sample sizes, uncertainty, and trade-offs, without making unsupported profitability claims.

Add or update focused automated tests for at least:

1. Midnight initial generation and periodic incremental checks throughout the day.
2. A user opening slips after earlier matches started: earlier slips remain in history and are **not** marked newly actionable.
3. Upcoming fixtures within the 30-minute buffer and matches with very distant kickoff times.
4. Fewer than ten valid automatic slips, including sparse high-odds bands.
5. Concurrent refreshes, retries, crashes, and duplicate-match allocation races.
6. Automatic no-reuse across all six odds bands.
7. Builder checkbox **on**: the same match can occur across multiple generated slips, potentially all; **off**: no cross-slip reuse in the same result set.
8. Builder requests being independent from one another and from automatic daily match allocation.
9. Builder exact/ranged total odds, individual odds filter, match-count range, selected markets/lines, and impossible/insufficient combinations.
10. Cancellation, postponement, confirmed void, rescheduling, kickoff/status transitions, and preservation of original published-slip selections and odds.
11. Regression checks proving Matches, Automatic Slips, and Builder UI behavior/contracts have not been changed unintentionally.

If reliable historical odds, fixture status or settlement data is missing, clearly flag the limitation; do not manufacture results.

### 5. Deployment safety

- Prefer backward-compatible incremental changes and existing feature flags/configuration when available.
- Check migration safety and retain historical data; do not reset databases.
- Run project-native lint/typecheck/tests/build and targeted regression tests; describe any commands that cannot be run in the environment.
- Provide a safe rollback approach for the changed generation logic without altering or deleting published-slip history.
- Do not deploy production changes without the normal project approval process.

---

## Required execution sequence

1. **Inspect** the actual codebase and identify the relevant existing files, logic, configuration, data models, and tests.
2. **Map each requirement** to its current implementation: `Compliant — leave untouched`, `Partially compliant — minimal fix`, `Missing — targeted extension`, or `Conflicting/unclear — explain`.
3. **Implement only necessary changes**, prioritizing safe automatic-slip selection/availability, correct no-reuse and immutable publication, and exact Builder filter/reuse semantics.
4. **Test and backtest** as feasible, compare with baseline, and resolve any regressions. Do not make unsupported performance claims.
5. **Report concisely**:
   - What was already correct and deliberately left alone.
   - Precisely what was changed and which files/services were affected.
   - How automatic daily no-reuse differs from Builder request-scoped reuse.
   - Tests executed, measured results, and any unverified assumptions or blocked tests.
   - Confirmation of unchanged UI and preservation of published-slip history.
   - Any remaining risks, required configuration, and rollback steps.

## Success criteria

The improvement is successful only if **GoalHint's existing UI and unrelated features remain intact**, automatically generated slips are timely and usable, the automatic daily set cannot reuse a fixture, published slips retain their original selections, Builder filters and reuse settings behave exactly as specified, and the new logic passes relevant regression tests without evidence of unacceptable degradation in prediction quality.

**Guiding principle: Keep what already works. Fix what is demonstrably wrong. Add only what is necessary. Never trade prediction quality, historical integrity, or user-selected Builder constraints for a larger number of slips.**
