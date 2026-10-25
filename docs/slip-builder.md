# Slip builder

`/en/slips` uses the Balanced slip builder with the existing classic table
slips. Each slip has its total odds, average forecast
probability and selection count in its title, with one semantic table row per match.
The shared navigation includes Slip builder; its More menu holds the items that exceed the compact primary
navigation. Controls use the shared themed components with a subtle 2px corner radius;
connected result-table edges remain square.

## Responsive criteria layout

Number of slips sits beside the title. Total odds per slip and Matches per slip stay
visible, followed by one row of Match limits, Match Date & Time and Markets buttons on both
desktop and mobile. Detailed criteria open in native modal dialogs instead of
expanding the form. Inputs and dialogs use the shared `theme.border.radius` token.

The buttons show counts for their current settings. Match limits counts custom
odds and probability ranges, up to two, or up to three when slip win probability
is offered. Match Date & Time counts a custom date
range and a custom daily time window, also up to two. Markets shows the number
of selected market families, starting at four. A range counts once even when
both its minimum and maximum are changed. Limits and date/time hide their count
when zero; Markets always shows its selected-family count.

Apply validates and retains the current dialog's changes. Cancel, Escape and
backdrop dismissal discard changes made since that dialog opened. Native dialog
behavior contains keyboard focus while open and returns it to the trigger after
closing. Markets retains multi-result choices and the match-reuse checkbox.

All fields remain uniquely named and associated with the same native GET form.
Before JavaScript attaches, dialogs render as visible inline sections so the
complete form remains usable without JavaScript. Hydration enables the modal
presentation and the three compact triggers.

A validation error exposes its invalid optional group; essential target errors
stay beside the visible controls. Draft values remain editable and retain their
accessible error association. The layout does not change the domain criteria,
stored-data generation rules, navigation, or generated and completed slip UI.

## Criteria and submission

The native GET form supports these criteria, also validated by the pure,
browser-safe `src/domain/slip-builder.ts` contract:

| Criteria | Supported values | Default |
| --- | --- | --- |
| Kickoff date range | Inclusive reporting dates, up to 31 days | Today through 30 days later |
| Kickoff time range | Inclusive daily minutes in Africa/Kampala (EAT) | 00:00–23:59, all day |
| Markets | One or more match result, double chance, total goals or both teams to score | All four |
| Market outcomes | Automatic or one or more supported results within each selected family | Any (Automatic) |
| Total odds | Inclusive minimum and maximum, 1.01–100,000.00 | Blank (Any supported odds) |
| Individual selection odds | Inclusive minimum and maximum, 1.01–1,000.00 | Blank (Any supported odds) |
| Selection probability | Inclusive unrounded percentage bounds, 0–100 | Blank (Any supported probability) |
| Slip win probability | Inclusive 0–100% whole-slip bounds; only with a current qualified joint estimate; shown only when one is bound or a request supplies a bound | Blank (Any) |
| Selection count | Minimum and maximum of 1–8 matches per slip | Blank (Any supported count) |
| Number of slips | 1–10 | 3 |
| Reuse matches | Allow a fixture in multiple separate slips | Off |

The numeric range fields start blank and display Any as their placeholder.
Explicit supported lower or upper bounds in a criteria URL also display Any;
custom limits retain their numeric values.
Reset restores those blank Any bounds, today's 31-day date range,
00:00–23:59, all markets with Automatic outcomes, three requested slips and
disabled match reuse, including after loading a criteria query. Blank date-from
still means today; blank date-to
means 30 days after the chosen date-from. An explicit single date bound is
accepted when the resulting range is valid and no longer than 31 days.

Blank minimum or maximum odds, probability and selection-count fields independently
mean the corresponding supported lower or upper limit. A partially supplied, reversed or malformed time
range is invalid; equal endpoints select one minute. The time range applies on
every day in the date range, including all seconds of the final minute. It does
not represent an overnight range. Date and time calculations use the reporting
timezone rather than the visitor's or server's local timezone.

The selection count is the number of match picks, not the number of participating
clubs. Every slip contains at most one pick from any fixture, even when several
selected markets qualify for that fixture.

An initial visit shows the criteria. `build=1` requests generation with the full
validated criteria. The route owns the locale; locale is not a criteria query
parameter. Market checkboxes can repeat the `markets` query key; a build with no
selected market is invalid. The native hidden `reuse=0` followed by the checked
`reuse=1` pair means reuse is enabled. Canonical serialization uses one `reuse`
value and markets in public-policy order. Invalid input receives a specific
criteria error rather than generating with silently corrected ranges.

The optional `outcomes` mapping stores explicit arrays per market family. Missing
families mean Automatic. Native fields `picks.<family>` accept `auto` alone or a
CSV/repeated list of explicit selections; Automatic cannot mix with manual
selections. Explicit arrays must be nonempty and belong to that family. Valid
submitted choices for an unchecked market are inactive drafts and are omitted
from the resulting criteria, so native forms can deselect a market without
JavaScript updating its outcome controls. Invalid choices still fail validation.
Canonical serialization omits Automatic and inactive fields and orders
manual selections by the source-owned market list. Total goals currently supports
Over 2.5 and Under 2.5, matching the published source distribution; additional
lines are not inferred.

Submission parsing streams entries and bounds work before joining repeated
values: at most 32 form entries, 2 KiB of form-encoded data and 256 characters per
value. This accommodates all ten manual outcome checkboxes, all four market
checkboxes, the hidden reuse pair and the two slip win probability fields while
bounding each family's outcome count. Canonical serialization omits default
(Any) slip win probability bounds, like Automatic outcomes, so existing criteria
URLs, save requests and sealed Best Slips publication criteria are unchanged; a
non-default bound serializes both `jointMin` and `jointMax`.

## Qualifying selections and calculations

The engine considers every requested family independently. Automatic considers
all of its published outcomes with approved prices and keeps those meeting the
criteria; it can choose a result below the highest-probability forecast when
that result's own probability and odds qualify. Manual choices restrict the
candidate set to the chosen results. Both modes use the exact outcome's
`market.probabilities[selection]` value and its own price, matched by family and
selection. They do not borrow the published top pick's probability or price.
A higher-probability unpriced family cannot hide a priced qualifying pick from
another requested family. Missing probabilities or prices are never inferred.

The ordinary feed keeps its selected-pick price contract. A dedicated
`slip-price-page.ts` wrapper validates supplemental outcome quotes separately
against the public distribution and observation clock. The server attaches that
approved pool as `SlipMatchRecord.selectionPrices` only for slip generation and
rechecks it together with the stored feed pages. An explicitly empty pool cannot
fall back to a different selection's feed price. Legacy selected-only records
remain usable by the pure engine's isolated tests.

Only future scheduled fixtures with an open current prediction cycle qualify.
Generation excludes fixtures within the existing five-minute publication cutoff,
closed cycles, unavailable or delayed predictions, provisional forecasts and
future publication timestamps. The stored projection supplies the source-owned
fresh-price decision. Future observation timestamps, unavailable prices and
median estimates are excluded; this builder uses actual approved bookmaker
prices only.

Total odds multiply the published decimal prices: `1.80 × 1.70 = 3.06`.
The shared `parseDecimalOdds` utility parses prices into exact scaled integers;
combination products and range comparisons use `BigInt`. Total constraints are
checked before rounding. For example, `1.01 × 1.99 = 2.0099` exceeds a 2.00
maximum and is below a 2.01 minimum, even though its displayed total is 2.01.
Only the displayed total is rounded half-up to two decimal places.

Average probability is the arithmetic mean of the selected, unrounded forecast
probabilities. Forecasts of 80% and 90% therefore display an average of 85%.
This describes the selections' forecast strength, not the chance that the entire
slip wins. If those events were independent their joint probability would be
72%; independence is not established by this feature, and no combined winning
probability is ever derived from the marginals, neither as a mean nor as a
product. When a current qualified joint model is bound, its estimate is shown
separately as Win probability beside the average.

## Ranking and separate slips

Custom generation has two modes.

Without a current qualified joint model (production today), qualifying
combinations rank by fewer selections first, then higher arithmetic average
probability, then higher exact total odds. Selection counts are searched from the
minimum upwards and the search stops at the first count that fills the request.
The results note says this order is not a whole-slip chance of winning.

With a current qualified joint model, custom generation reuses the Best Slips
contract through `jointSlipRanking` in `src/domain/joint-slips.ts`: the same
qualification, marginal-bound check and comparator. Slips rank by higher
estimated whole-slip probability; fewer selections only break equal estimates,
then the higher displayed (rounded) total odds and the slip identifier.
Every selection count from the minimum to the maximum is searched. Combinations
the model cannot estimate are excluded and counted in a visible note; they are
never ranked by a mean or product. Slip win probability bounds apply only to that
estimate. Without a current model, a request with a non-default bound returns
`estimate-unavailable` before any database, cache or limiter access.

Canonical fixture, market and selection identifiers break ties deterministically.
Rows within a slip follow kickoff and canonical identifier order. Identical
combinations never appear as separate slips.

With reuse enabled, the engine returns the highest-ranked available combinations
up to the requested count. With reuse disabled, fixtures must also be distinct
across all returned slips. A bounded compatible-batch search first tries to
fulfil the requested number and then compares the ordered slip ranks. It can
skip the individually highest-ranked slip if that slip would prevent a larger
valid separate batch; a greedy pick-and-remove algorithm does not ensure that
behavior. If fewer slips can be produced, only qualifying slips are returned.

## Whole-slip ranking and bounded-search optimality

When `searchLimited` is false, a joint-ranked result is exactly optimal under the
declared ranking over every qualifying combination: with reuse, the top requested
number of combinations; without reuse, the maximum-size fixture-disjoint batch
whose ordered ranks are lexicographically best. The depth-first batch search
returns the first such tuple in rank order. Optimal means optimal relative to the
model's estimates, not to true outcome frequencies. The batch objective is
lexicographic rank, never a sum or product of slip probabilities.

When `searchLimited` is true, no global claim is made, because:

- the 60-candidate truncation orders by individual probability, while a joint
  estimate is bounded above only by the smallest marginal;
- one shared 100,000-node enumeration budget runs in ascending selection count,
  so wide criteria can under-explore longer slips and partly reintroduce a
  fewer-selections bias;
- the heap retains at most 2,000 combinations;
- the compatible-batch search has a 100,000-node budget;
- the stored read covers at most 500 fixtures.

The estimator is called once per enumerated combination; estimates are memoized
by combination object. Equal estimates and counts are ordered by the displayed
rounded total, not the exact product used by the average ranking, to keep the
Best Slips ordering unchanged.

## Stored reads, bounded work and result states

`src/server/slips/slip-service.ts` reads the existing public stored feed with one
pinned request clock, selected market families, scheduled status and highest
probability order. Per-selection probability and odds bounds are applied in the
engine, so feed selection of its best displayed family cannot exclude another
qualifying requested family. The database scan reads at most 500 fixtures in
pages of 100 and rechecks every loaded page for cohort or record drift. These
sequential reads are not claimed to be one atomic global database snapshot.
Changing, malformed or unavailable data produces an explicit unavailable state
instead of a partially mixed result. Matches entering the cutoff while the read
finishes are excluded before generation.

The pure engine retains at most 60 qualifying selection candidates, ordered by
probability, odds and canonical identifiers. Combination enumeration has a
100,000-node budget; a bounded heap retains at most 2,000 combinations; compatible
batch selection has a 100,000-node budget per selection-count stage. Joint-ranked
builds run one batch stage, over the final retained set, so a discarded
intermediate stage cannot set `searchLimited`. The maximum
slip length and count also bound the returned output. Reaching a database,
candidate, enumeration, retention or batch bound sets `searchLimited`. Limited
results are ranked among the explored candidates and do not claim global
optimality or that all possible qualifying slips were found.

The page distinguishes generated slips, no qualifying selections, no valid
combinations, odds unavailable, whole-slip estimate unavailable, data unavailable
and rate limiting. It reports
limited searches and partial coverage. Missing-price or missing-forecast counts
refer to fixtures excluded entirely for that reason; a fixture that qualifies
through another requested family does not inflate those excluded counts.

The effective `publicPolicy.features.providerOdds` flag remains false. Until
public odds are approved and enabled through the existing owner-controlled
policy, generation returns `odds-unavailable` before database, cache or limiter
access. Adding the page does not enable private odds, change provider policy or
fabricate demonstration slips in production. Isolated tests can supply approved
synthetic stored projections to exercise generation.

The web process binds no joint model: `boundJointSlipModel` in
`src/server/slips/joint-model.ts` returns null until a model is qualified on
retained outcomes (S03/P01). Custom ranking therefore stays average-based in
production, the slip win probability fields stay hidden, and URL-supplied bounds
return `estimate-unavailable`. A reviewed binding must reuse the publication
worker's model and verifier; a reference string or an always-true verifier is not
evidence. Best Slips and the worker pass their own build, so the service never
consults the request-time model for them. A model that expires during the
bounded read makes the build unavailable, matching the Best Slips rollover rule.

Generation is a read-only server operation. It consumes the existing aggregate
public search limiter once per build when odds are enabled. It performs no
provider requests, changes no forecasts, places no bets, requires subscriber entitlement when paid mode is on and
persists no saved slips. Existing match detail links remain available in each
table row.

## Original forecast binding and saved history

Each generated selection retains the original cycle, prediction-set ID and
publication timestamp from the stored feed. Slip identities also include this
source stamp, the exact selected probability and quoted odds. An unchanged
source produces the same identity; replacing a forecast or quote produces a
different identity, so the save endpoint returns `409 changed` for an obsolete
rendered slip instead of quietly saving a new forecast under its old ID.

Saving rechecks the sealed prediction set under ordered `FOR SHARE` fixture locks,
alongside the existing account/session/entitlement checks. These shared locks block
canonical fixture/source-pointer changes until commit while requiring only
`SELECT` on fixtures; the saved-slip writer does not need fixture `UPDATE`,
`DELETE` or `LOCK TABLES` privileges. The member account's mutation lock remains
`FOR UPDATE`. This follows the [MySQL 8.4 locking-read contract](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).
The immutable snapshot retains
the exact original choice, probability and quote. The cutoff can lock a later
revision; an earlier saved revision is still assessed as originally published
when it remains eligible under the reconstructed schedule and cutoff history.

Completed history follows the saved cycle. A formally voided original cycle
stays void while its replacement match is scheduled or live. A replacement
cycle's live or final score never grades the original cycle. Existing final
settlement evidence may resolve that original cycle, and a pending correction
keeps already-public history visible as pending without reusing an older winning
score. Current result reads retain their seal, canonical-score and lifecycle
coherence checks. Every leg must be complete before the full slip is public.

Old saved snapshots without source IDs remain explicitly unbound and use the
legacy current-fixture completion rule; no historical cycle IDs are guessed or
backfilled. Saves persist the model-independent snapshot (`modelIndependentSlip`);
a whole-slip estimate is not stored, because no model identity is stored with a
member save. Saving rebuilds with the request-time model, so a model change
between rendering and saving returns `409 changed` when the rebuilt slips no
longer include the rendered one.
Member saves remain member-owned and are erased with the account;
the separate daily publication archive is independent of those saves. Original
quoted odds are not claimed as settled bookmaker payout odds.

## Verification

`npm run test:slips` runs the pure engine and stored-read service tests, including
exact decimal boundaries, an exhaustive ranking oracle, deterministic ordering,
the greedy no-reuse counterexample, source freshness guards, EAT boundaries,
native checkbox submission, policy gating, read drift and bounded searches.
It also covers blank Any bounds, Automatic choosing a qualifying non-top
outcome, manual choices using their own probabilities and quotes, multi-result
combinations, missing outcome prices and invalid outcome-family mappings.
`tests/joint-slips.test.mjs` uses synthetic joint models only: it covers the
unchanged no-model path, a longer slip outranking a shorter one, inclusive
whole-slip bounds, excluded and counted unestimable combinations, exhaustive
reuse and separate-batch oracles, budget disclosure, memoized estimates and the
single final batch stage. `tests/best-slips.test.mjs`, also in `test:slips`,
checks that Best Slips keeps the shared comparator.
`tests/slip-forecast.test.mjs` covers source binding, superseded eligible
revisions, rescheduling, pending corrections, reference validation and mixed
cycle/outcome batches. The genuine-MySQL saved-slip integration also exercises
the pre-LIMIT completion query and restricted-grant persistence when its test
server is available.

`npm run test:slips:rendering` builds the isolated Next.js fixture and verifies
real server-rendered controls, the three dialog groups and their inline
no-JavaScript fallback, blank Any defaults, retained custom numeric bounds, and
unique form-associated inputs. It also checks result states, native GET builds, invalid criteria,
navigation overflow, summaries inside slip titles and one row per selection.
Whole-slip fields are checked separately: absent without a bound model, present
and blank with one, and kept with their value when a request supplies a bound.
The `/cutoff` route checks that the real service returns `estimate-unavailable`
without a model; `/joint` runs the real route and service with a synthetic model
and checks the bound and its validation error.
Its `--serve` option keeps the fixture available for browser inspection.
