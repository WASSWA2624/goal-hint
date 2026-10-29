# Slip builder

The builder generates slips for immediate use from the selected limits. It shows
the criteria and generated slips on every screen size, without Save actions,
saved-slip history or win/loss performance summaries. Opening or submitting the
builder does not read saved history or persist generated slips, including for
signed-in members. Each generated slip retains its odds, probability and match
count summary. On desktop, the selected Aligned ledger design keeps these facts
on one slim header row, initially collapsed. Its selections share one horizontal
line with aligned score/VS and crest columns, fixed country/league/status widths,
ellipsis/full-text tooltips and tiny logos/flags. Adjacent desktop slips have a
3px gap. Supplied match progress and selection outcomes occupy the score and
status cells. Desktop match details refresh automatically every 20 seconds from
stored original-cycle evidence, without regenerating the slip or changing form
drafts, original picks, prices or probabilities. Updates pause while hidden,
offline or navigating and resume immediately when available. Phone screens
retain their independently selected compact layout and spacing.

`/en/slips` uses the Balanced slip builder. Each slip keeps its total odds,
average forecast probability and selection count in its title. Its selections
use the shared compact slip selection rows, including visible full team names,
competition/country, kickoff in EAT, market/pick, odds and individual probability.
Best slips, completed saved slips and published performance slips reuse that
presentation too. A browser-safe adapter
preserves each original selection's kickoff, teams, pick, probability and price;
it never substitutes the current top pick or constructs missing forecast groups.
Saved leg outcomes and regulation scores are displayed only when supplied.
The shared navigation includes Slip builder; its More menu holds the items that exceed the compact primary
navigation. Controls use shared themed components. The builder settings use the
selected square Compact toolbar treatment, consistent with Matches filters.

## Responsive criteria layout

The selected Compact toolbar keeps Number of slips, Total odds per slip, and
Matches per slip visible in the settings section. Odds & probability, Match Date
& Time, and Markets buttons open the hidden forms in native popup dialogs on
desktop and mobile. Reset and the primary action remain in the compact toolbar.
The settings reuse the Matches search/filter chrome: flat surfaces, quiet borders,
compact labels, and square controls, with usable touch targets on phones.

From the 1024px desktop breakpoint, the five numeric inputs, three popup
buttons, Reset and the fixed-width primary action use one wrapping toolbar.
Wide desktops keep them on the same row; narrower desktops wrap whole groups.
Each category has an aligned title and subtle vertical divider. Popup groups
use Edit ranges, Edit window and Automatic/Manual buttons beneath their titles.
The slip-count field is sized for four digits; the four
range fields use equal widths accommodating five-digit values and decimal odds.
These are display widths; validation and generation limits remain shared across
devices. The next row labels the current Date, Time, Markets and Selection.
Custom summaries wrap within their row rather than overflowing the page.
The desktop page heading remains available to assistive technology but takes
no visible space. Mobile retains its heading and original control layout.

The buttons show counts for their current settings. Odds & probability counts custom
individual odds, individual probability and combined probability ranges, up to three. Match Date & Time counts a custom date
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
accessible error association. The defaults and blank numeric bounds below apply
equally to native GET submission and enhanced navigation. Generated slips retain
their existing presentation.

## Criteria and submission

The native GET form supports these criteria, also validated by the pure,
browser-safe `src/domain/slip-builder.ts` contract:

| Criteria | Supported values | Default |
| --- | --- | --- |
| Kickoff date range | Inclusive reporting dates, up to 31 days | Today through today |
| Kickoff time range | Inclusive daily minutes in Africa/Kampala (EAT) | 00:00–23:59, all day |
| Markets | One or more match result, double chance, total goals or both teams to score | All four |
| Market outcomes | Automatic or one or more supported results within each selected family | Any (Automatic) |
| Total odds | Inclusive minimum from 0.01; optional maximum | 0.01–Any |
| Individual selection odds | Inclusive minimum from 0.01; optional maximum | 0.01–Any |
| Selection probability | Inclusive unrounded percentage bounds, 0–100 | Blank minimum; maximum 100% |
| Combined probability | Optional `totalProbMin` / `totalProbMax`, inclusive percentage bounds, 0–100; requires a verified joint model | Blank (no joint filter) |
| Selection count | Whole match counts, minimum 1; optional maximum | 1–Any |
| Number of slips | 1–100 | 5 |
| Reuse matches | Allow a fixture in multiple separate slips | Off |

Total and individual minimum odds display 0.01, minimum matches displays 1, and
maximum probability displays 100. The other numeric bounds start blank; maximum
placeholders display Any. Custom criteria retain their supplied values.
Reset restores these defaults, today's from/to dates, 00:00–23:59, all markets
with Automatic outcomes, five requested slips, and disabled match reuse,
including after loading a criteria query.

Blank numeric minima use the valid floor: 0.01 odds, 1 match, or 0% probability.
Blank maxima mean Any rather than a requested numeric ceiling. A 0.01 odds
criterion does not change the approved bookmaker-price validation contract.
The pure criteria contract omits unrestricted total-odds, individual-odds, and
match-count maxima; canonical GET serialization preserves them as blank fields.
Explicit odds bounds use exact two-decimal hundredths within the safe-integer
range, and explicit match counts use positive safe integers. Match counts above
eight are accepted. Blank from-date uses today; blank to-date uses the chosen
from-date, retaining the 31-day limit for explicit ranges.
A partially supplied, reversed or malformed time
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

When subscriber access is required, the primary action shows Sign in for a
signed-out viewer and opens the login form with the Slip Builder return path.
Signed-in viewers without the required subscription see Subscribe; eligible
viewers see Build slips. Sign up remains reachable from the account screen.
On desktop the locked toolbar and subscriber notice use the more explicit
Sign in to build slips / Subscribe to build slips labels. Their actions share
the same fixed 208px by 32px size (44px high for coarse pointers), including
Build slips and its pending label, so changing access status does not resize
the button. Desktop shows the action only in the toolbar. The notice explains
that guests must sign in and need an active subscription; signed-in viewers
without access are directed to the subscription action above. Eligible viewers
see ready-to-build guidance or their generated results. Mobile retains its
existing layout, short action labels, secondary action, description and sizing.

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
checkboxes and the hidden reuse pair while bounding each family's outcome count.

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
Very large displayed totals use ellipsis within the compact header; the full
original value remains available in the header title and accessible text.

The shared slip summary multiplies the selected, unrounded forecast probabilities
to show an independence-based combined estimate. Forecasts of 80% and 90% give
`0.80 × 0.90 = 0.72`, displayed as 72.0%. The independence assumption is stated
beside the slip; only the final displayed percentage is rounded. Invalid or empty
inputs produce no estimate. This calculation also applies to saved slips using
their original selections, without changing their stored snapshot.

Average probability remains a separate arithmetic mean (85% in that example),
describing the selections' forecast strength. When a verified joint-model estimate
is supplied, it occupies the summary's whole-slip probability field instead of
the independence estimate. Model qualification, search ranking and combined
probability filters continue to use the verified binding described below.

## Ranking and separate slips

Without a joint-model binding, qualifying combinations rank by fewer selections first, then higher arithmetic
average probability, then higher exact total odds. Canonical fixture, market and
selection identifiers break ties deterministically. Rows within a slip follow
kickoff and canonical identifier order. Identical combinations never appear as
separate slips.

`src/domain/joint-slip-model.ts` shares the same joint-model contract, validity
check, marginal probability bounds and estimator ranking between custom and
daily Best Slips. A server-owned `SlipJointModelBinding` supplies the model and
an independent `verifyModel` callback; reference strings alone cannot approve
calibration or correlation evidence. `createStoredSlipBuild` accepts that
optional binding. The production reader supplies none; the displayed independence
estimate does not qualify a model or enable model-dependent ranking and filters.

`boundJointSlipModel` resolves the request-time binding for the stored reader and
the page's capability check. The page offers combined bounds only with verified
current support, or when a supplied bound needs to remain editable or be cleared.
The service independently verifies that binding; a display capability cannot
authorize an estimator. Explicit editorial/publisher builds retain their own
model and do not resolve the custom reader's binding.

With a verified current binding, the bounded search considers all allowed
selection counts and ranks whole-slip probability first. Fewer selections and
higher odds break equal-probability ties. A longer slip can outrank a shorter
one. `totalProbMin` and `totalProbMax` filter the unrounded joint estimate;
individual `probMin` / `probMax` still filter each original pick separately.
Missing or mathematically impossible estimates exclude that combination. The
result carries estimates only for returned slips, separately from its unchanged
mean probability and original saved-snapshot contract. The shared slip table
displays both quantities with their existing distinct labels.
The result also counts examined combinations lacking a valid estimate. A weak
object cache estimates each combination once without retaining discarded slip
identifiers. Compatible batching runs only after the final qualified candidate
set is retained; discarded shorter stages cannot impose a spurious batch limit.

Constrained combined bounds without a model produce `model-unavailable` before
stored reads or limiter consumption. Configured bindings are checked before
reading, after the cohort scan and after estimation; expiry or revoked approval
withholds all output. The page explains how to clear unsupported combined
bounds. The legacy default criteria and saved/publication criteria strings keep
their shape: optional joint bounds are omitted unless explicitly supplied.

With reuse enabled, the engine returns the highest-ranked available combinations
up to the requested count. With reuse disabled, fixtures must also be distinct
across all returned slips. A bounded compatible-batch search first tries to
fulfil the requested number and then compares the ordered slip ranks. It can
skip the individually highest-ranked slip if that slip would prevent a larger
valid separate batch; a greedy pick-and-remove algorithm does not ensure that
behavior. If fewer slips can be produced, only qualifying slips are returned.

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

The pure engine retains at most 800 qualifying selection candidates, ordered by
probability, odds and canonical identifiers. Any leaves the requested filter
unrestricted; the retained candidates and distinct fixtures still bound the
physical slip length. Combination enumeration has a 100,000-node budget, with at
most one quarter used to seed disjoint slips. Persistent suffix price multisets
provide exact cheapest/dearest completion products, skipping lengths that cannot
meet the total-odds range without constructing a large price-bound matrix.
Ignoring fixture conflicts widens these pruning bounds conservatively.
A bounded heap retains at most 2,000 combinations and 16,000 aggregate selection
references. A disjoint reserve contributes at most 800 further selections, so
retained/output candidates remain within 16,800 selections. A separate
100,000-unit work budget charges each examined node by at least one unit, or
the target match count divided by eight and rounded up for longer slips. Seeding
uses at most one quarter of the node and work budgets. Compatible batch selection
has a 100,000-node budget per selection-count stage. The requested slip count
remains at most 100. Reaching a database,
candidate, enumeration, retention or batch bound sets `searchLimited`. Limited
results are ranked among the explored candidates and do not claim global
optimality or that all possible qualifying slips were found.

The daily Best Slips criteria retain their previous eight-match and odds bounds;
the custom builder's Any defaults do not change that publication policy.

The page distinguishes generated slips, no qualifying selections, no valid
combinations, odds unavailable, combined model unavailable, data unavailable and rate limiting. It reports
limited searches and partial coverage. Missing-price or missing-forecast counts
refer to fixtures excluded entirely for that reason; a fixture that qualifies
through another requested family does not inflate those excluded counts.

The effective `publicPolicy.features.providerOdds` flag remains false. Until
public odds are approved and enabled through the existing owner-controlled
policy, generation returns `odds-unavailable` before database, cache or limiter
access. Adding the page does not enable private odds, change provider policy or
fabricate demonstration slips in production. Isolated tests can supply approved
synthetic stored projections to exercise generation.

Generation is a read-only server operation. It consumes the existing aggregate
public search limiter once per build when odds are enabled. It performs no
provider requests, changes no forecasts, places no bets, requires subscriber entitlement when paid mode is on and
persists no saved slips. Existing match detail links remain available in each
table row.

## Original forecast binding and separate saved-slip services

The builder does not offer saving or completed history. The existing saved-slip
services retain their source validation and immutable snapshot semantics for
other consumers and any future save workflow.

Saved snapshot size checks accommodate longer custom slips and their exact total
odds while retaining independent finite identity, selection, and request-size
bounds. Observation refresh remains limited to 800 unique selection watches, and
forecast-result hydration retains its separate 24,800-selection work budget.
Saved quotes retain their original two-place, four-whole-digit format; snapshot
totals allow up to 3,200 whole digits. Saved-history hydration uses 31-row keyset
batches so even maximum-length snapshots remain within the independent read
budget. Exact decimal comparisons preserve ranking when total odds exceed
floating-point precision or range.

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
backfilled. Member saves remain member-owned and are erased with the account;
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
`tests/slip-forecast.test.mjs` covers source binding, superseded eligible
revisions, rescheduling, pending corrections, reference validation and mixed
cycle/outcome batches. The genuine-MySQL saved-slip integration also exercises
the pre-LIMIT completion query and restricted-grant persistence when its test
server is available.

`npm run test:slips:rendering` builds the isolated Next.js fixture and verifies
real server-rendered controls, the three dialog groups and their inline
no-JavaScript fallback, the explicit minimum/default values and blank Any maxima,
retained custom numeric bounds, and
unique form-associated inputs. It also checks result states, native GET builds, invalid criteria,
navigation overflow, summaries inside slip titles and one row per selection.
Builder cases also verify that history, performance summaries and Save actions
are absent, including when a signed-in member generates slips.
Selection rows render the shared match-card board, preserve a manually selected
alternative's probability and price, and keep an unobserved fixture status
unknown. `tests/slip-card.test.mjs` also verifies immutable original values,
saved regulation scores, supplied outcomes and probability boundary labels.
Its `--serve` option keeps the fixture available for browser inspection.

The selected Compact toolbar's implementation checks and the four independently
confirmed full-suite baseline failures are recorded in
[`122-compact-slip-builder-toolbar.md`](../dev-plan/122-compact-slip-builder-toolbar.md).
