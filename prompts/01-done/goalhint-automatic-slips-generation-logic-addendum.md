# GoalHint — Automatic Slips Generation Logic Update (Targeted Addendum)

## Purpose and precedence

You are a senior engineer working on the **existing GoalHint application**. This is a **narrow addendum** to **“GoalHint — Targeted Prediction and Slip-Generation Optimization Prompt”**. **Apply both prompts together.** The original prompt remains in force in full **except where this addendum explicitly changes Automatic Slips generation/selection logic**.

**Do not rewrite the app, start a new slip engine, redesign any interface, change the Matches prediction engine, or change the user-triggered Builder.** Inspect the repository first. Leave working code untouched; make only the smallest safe changes required for the behavior below. Keep all original safeguards for data integrity, no-reuse, publication immutability, settlement, testing, deployment, and backward compatibility.

### Exact changes authorized by this addendum

1. **Daily cycle and midnight start:** Begin initial generation at **12:00 AM**, but assign each day's new Automatic Slips to a **3:00 AM–3:00 AM next-day fixture window**.
2. **Chronological, nearby kickoffs:** Generate from the earliest relevant eligible upcoming kickoff groups toward later groups; prioritize matches with nearby start times, using **adaptive groups, not fixed clock-time buckets**.
3. **Probability-first, conservative odds:** Prefer combinations with higher defensible *whole-slip* win probability; where comparable, favor lower-risk/lower-odds individual selections rather than chasing higher total odds.
4. **Remove the slip-count cap:** No fixed maximum of 10 slips per odds band per day. Generate as many **distinct, qualified** slips as the usable fixture pool permits, without lowering quality or reusing a fixture.
5. **Continue replenishment:** Recheck for new opportunities approximately every **15–30 minutes** without modifying previously published slips.

All other requirements in the original prompt remain unchanged. Where an old selection preference conflicts with these five items (for example, maximizing total odds among comparable slips or treating a 3–6-hour grouping range as a preset), follow **this** addendum **only for Automatic Slips**.

---

## 1. Midnight generation and the 3 AM operational-day boundary

**The automatic daily generation job starts at midnight. It does not start at 3 AM.** The 3 AM mark is the **fixture-coverage boundary**, not the job start time.

For each local date **D**, use the application's configured operating timezone consistently:

- **First run:** At **D 00:00**, begin generating the new Automatic Slips set labeled/assigned to **D**.
- **New set's fixture coverage:** Kickoffs from **D 03:00 inclusive** through **D+1 03:00 exclusive** — a **24-hour** fixture window. Use precise timestamp comparisons to prevent gaps or overlaps.
- **Cross-midnight continuity:** From **D 00:00 until D 03:00**, previously published, still-actionable slips from the **D−1** set can remain available because that set covered **D−1 03:00 through D 03:00**. They must not be deleted, relabeled, or silently rebuilt at midnight.
- **Parallel handoff:** Between midnight and 3 AM, previous-day slips for imminent fixtures and the new day's slips for kickoffs after 3 AM may coexist as the existing page/API permits. Preserve the existing UI; adapt only data selection/status filtering as required.
- **Incremental processing:** Continue approximately every 15–30 minutes. Checks may fill new opportunities in the applicable set(s) while their fixtures are still upcoming, provided they respect cutoff, eligibility, historic preservation, and the no-reuse rule. Never republish a previous slip.

**Example:** At **Thursday 12:00 AM**, begin Thursday's set for matches **Thursday 3:00 AM to Friday 2:59:59...**. Matches at **Thursday 12:30 AM or 2:00 AM** belong to **Wednesday's** set and should already have been considered during Wednesday's runs. At **Friday 12:00 AM**, Friday's set begins for **Friday 3:00 AM onward**, while any still-actionable Thursday slips for **Friday 12:00–3:00 AM** remain available.

Keep the original safety condition for a new slip: all fixtures must be confirmed **not started**, otherwise eligible, and normally **at least 30 minutes from kickoff** when published. A slip becomes **non-actionable** when **any** constituent fixture starts; it remains in existing in-progress/history handling. **Do not promise a slip at every moment when eligible candidates are insufficient.**

## 2. Choose nearby kickoffs, in chronological order

Within the active operational day's fixture window:

1. Pull current eligible fixtures and existing authoritative prediction records; sort candidate fixtures by **actual kickoff time ascending** (with stable tie-breaking).
2. Start from the **earliest actionable** kickoffs. Identify nearby fixtures that can form a compliant slip, prioritizing close kickoff times so a single slip does not unnecessarily mix morning, afternoon, and evening fixtures.
3. **Use adaptive proximity, not rigid time bands.** Prefer the tightest practical kickoff span that meets the odds band and prediction-quality requirements. Do not hard-block a strong combination solely because it crosses an arbitrary 3-hour or 6-hour boundary; equally, do not reach many hours ahead if a suitable nearby group exists.
4. **Advance forward** through kickoff times as earlier groups are handled or exhausted; do not jump to distant evening fixtures and later return to consume morning fixtures. When early groups have too few safe candidates, look progressively forward only as much as necessary. Leave opportunities for later refreshes rather than unnecessarily consuming all of tomorrow-morning/late-evening fixtures in the midnight batch.
5. Continue to seek qualifying slips later in the day as new fixture data and predictions become available. Do not withhold all viable slips merely to reserve fixtures for later; maintain availability where the underlying match pool allows.
6. Within a nearby kickoff group, optimize **quality before quantity**. If a group cannot produce a compliant slip, skip it rather than forcing unrelated distant fixtures together or lowering standards.

The aim is that visitors at different times find **currently actionable** slips, preferably containing matches kicking off reasonably close to one another. Chronological processing must not override hard eligibility or whole-slip winning probability.

## 3. Adjust selection ranking: probability first, odds conservatively

Preserve all six **total-slip decimal odds** bands exactly as implemented, including existing boundary rules:

- **2.5–5**
- **5–10**
- **10–20**
- **20–50**
- **50–100**
- **100–200**

For a given chronological candidate group and a target odds band, prioritize:

1. **Hard constraints:** Correct band; eligible, current, not-started fixtures; kickoff buffer; supported selection market/odds; original business rules; no match reuse; and other existing safety rules.
2. **Maximum defensible whole-slip win probability**, based on the existing prediction engine and any supported correlation adjustments. Keep per-selection prediction quality high; do not invent probabilities or treat correlated bets as independent.
3. **Lower-risk constituents when combinations are comparably reliable.** Prefer selections with strong estimated win chances and, where the evidence supports it, lower individual decimal odds over needlessly risky long-shot selections. Lower odds **alone** do not prove higher actual win probability; evaluate the engine's probabilities and historical calibration rather than assuming favorites always win.
4. **Do not chase a higher total-odds number once the band is satisfied.** If a more conservative compliant slip has a better chance of winning, select it even if its total odds lie toward the lower end of that band. Consider favorable higher total odds **only when estimated reliability remains materially comparable**, using evidence-based rather than arbitrary tolerances.
5. **Keep match count and kickoff span reasonable**, while preserving the above priorities and the application's existing legitimate slip-size rules. A few strong low-odds selections can be preferable to a single speculative high-odds selection; however, adding legs can also lower the overall win probability, so evaluate the **whole slip**, not just each individual pick.

Higher target bands naturally involve a lower possible whole-slip success probability; **never force weak, exaggerated, or invented selections to fill them**. Apply the same principled ranking across all bands without guaranteeing outcomes.

## 4. Remove every fixed per-band daily publication limit

- **Remove or neutralize any fixed maximum of 10 Automatic Slips per odds band per operational day**, including hard-coded limits, scheduler limits, query caps mistaken for publication caps, validations, or implicit downstream truncation, **only where those limits restrict genuinely qualifying publication**.
- The number of published slips must be determined by the actual usable, **non-reused** fixture pool and all existing eligibility/quality constraints: **2 eligible slips → 2; 10 → 10; 20 → 20**.
- No replacement quota, hidden daily cap, or mandatory minimum. **Zero** is valid when there are no safe opportunities.
- Retain bounded searches, efficient pruning, resource budgets, provider rate limits, transaction safety, and idempotency. Removing the business cap **must not** mean unlimited CPU, DB load, network calls, or duplicate generation. Ensure any performance-related paging/search limits do not silently prevent discovery of additional qualified slips.
- Apply strict match uniqueness across **all six odds bands within the same 3 AM–3 AM Automatic Slips set**; a fixture used in one published automatic slip cannot be reused in another in that same set, even after it becomes inactive/void. Safeguard the midnight handoff and fixture reschedules against accidental duplicate publication across adjacent sets where existing records would otherwise conflict.
- **Builder is unchanged:** Its separate user-controlled “Reuse Matches” checkbox and requested slip count continue to work precisely as defined in the original prompt.

## 5. Refresh, immutability, existing integrations

- Preserve the **midnight initial job** and the **15–30-minute incremental refresh** schedule, using existing scheduler/services.
- Refreshes may **append** new qualifying slips only; they must **never mutate, reorder, rebuild, replace, or re-predict published selections**. Preserve original selected matches, markets, odds, total odds, publication timestamp, and other historical snapshots.
- Continue correct in-progress/expired/withdrawn handling and provider-confirmed settlement rules for canceled, postponed, rescheduled, and void fixtures, exactly as prescribed in the original prompt.
- Keep the **Matches page, Builder, interfaces, routes, wording, filters, permissions, subscriptions, API contracts, historical records, and unrelated jobs unchanged**.
- Follow the application's authoritative configured timezone and use consistent UTC-backed timestamps as appropriate; handle date boundaries, concurrency, retries, restarts, and midnight overlap safely. Do not reset data or add duplicate implementations.

## 6. Required implementation approach and targeted tests

**Audit before editing.** Trace the existing daily slip-count limit, calendar-day queries, job schedules, fixture filtering, selection ranking, odds handling, cross-band match allocations, publication, API filtering, and any date-based UI assumptions. Record which parts already comply and the exact files that need minimal fixes.

Add or update targeted tests demonstrating:

1. **Midnight trigger:** At `D 00:00`, create the set for kickoffs in **`[D 03:00, D+1 03:00)`**, not `D 00:00–D+1 00:00`; confirm boundary inclusivity and timezone correctness.
2. **Midnight overlap:** From `00:00–03:00`, previous-cycle slips for not-yet-started games remain available, with new-cycle slips for after `03:00` also accessible under existing product behavior. No missing coverage due solely to date rollover.
3. **Chronological proximity:** Nearby kickoffs form slips ahead of distant combinations where constraints permit; generation progresses forward without returning to exhausted earlier windows; no rigid clock windows unnecessarily prevent valid groupings.
4. **Probability/odds preference:** A higher-probability, lower-risk valid slip outranks a riskier slip with larger total odds in the same band; do not infer win probability from odds alone. Test whole-slip probability versus number of legs.
5. **No 10-slip cap:** With 2, 10, and 20+ actually qualifying opportunities in a band, publish the available number without violating fixture uniqueness or quality standards.
6. **All six bands:** Maintain existing boundaries, accurate multiplied odds, no-fixture-reuse across all bands in the operational set, and no duplication under concurrent runs.
7. **Refresh/lifecycle:** New eligible slips may be added throughout the day, but existing published slips never change; slip actionability ends when a constituent match starts. Verify reschedules, cancellations, and postponements.
8. **Regression:** Matches UI and predictions, Automatic Slips UI, Builder filters/reuse behavior, permissions, settlement, historical records, and existing APIs continue to work unchanged.
9. **Evidence:** Where reliable historical fixtures/odds/predictions exist, compare pre-change and post-change whole-slip win rate, kickoff-span distribution, actionable slips by hour, odds-band results, duplicates, processing load, and sample sizes; state uncertainty and do not invent improvements.

Run the project's existing lint/typecheck/tests/build and narrowly scoped regression checks. Do **not** deploy to production without normal approval; offer a safe rollback of only the changed automatic generation logic without deleting or rewriting previously published slips.

## Final engineer report

Provide a concise report covering (a) what already complied and stayed untouched, (b) minimal files/logic changed, (c) demonstration of **midnight generation + 3 AM–3 AM fixture ownership**, (d) adaptive chronological grouping and probability-first conservative odds selection, (e) removal of the 10-per-band limit without match reuse, (f) executed tests and measured results or limitations, and (g) any open risks/rollback steps.

**Success means: the original implementation remains intact except for these Automatic Slips logic refinements; generation starts at midnight, early-morning matches are covered by the previous cycle, new slips are built chronologically from nearby eligible kickoffs, winning probability outranks extra odds, there is no fixed daily count cap, and published history and other screens are preserved.**
