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
navigation. Controls use shared themed components.

## Responsive criteria layout

The settings panel shows the criteria for the next build. On desktop, the
summary tiles use four columns, and **Filters** and **Build slips** stack to the
right of a divider. On compact screens, a blue header with a subtitle introduces
a row of three tiles and a row of two tiles. Match reuse, the date and time
window, and Markets use full-width rows. The actions sit side by side at the
bottom. Combined probability appears when enabled or when the applied criteria
include its bounds.

The Markets value stays on one line. When the full text exceeds the available
width, the panel shortens it with an ellipsis and shows a trailing `+`.
Assistive technology receives the full value.

Filters uses one editable form across screen sizes. It groups
slip targets, individual odds and probability limits, the kickoff window,
match reuse and Markets. Related fields share a row where there is space.
Controls use the shared height and theme. Numeric bounds use floating labels,
and desktop mouse steppers fit inside the shared field.

Signed-in visitors see **Custom Filters** and **Manage Custom Filters** at the
top of this dialog. Selecting a preset fills the editable form. Apply updates
the next build settings. Saving or updating a preset is a separate action in
Manage. See [saved filters](saved-slip-configurations.md).

Markets opens a searchable child dialog. Enabled families use Automatic until
the user picks specific outcomes. Match goal lines pair Over and Under in
ascending order. Team goal lines are opt-in and group the same pairs by team.
Restore automatic defaults selects the original four families and clears
outcome restrictions. Markets Apply stages its changes in Filters.

Apply validates and retains the current dialog's changes. Reset restores its
defaults. Cancel and Escape
discard changes made since that dialog opened. Backdrop clicks leave it open. Native dialog
behavior contains keyboard focus while open and returns it to the trigger after
closing. Deselecting a market or setting that family to Automatic clears
its specific results.
The match-reuse checkbox defaults to off and can be enabled explicitly or by
applying a saved filter.

All fields remain uniquely named and associated with the same native GET form.
Before JavaScript attaches, Filters renders inline with separate
native date and time inputs. Hydration enables the modal and combined controls.

Numeric fields preserve what the user types, deletes or pastes, including
temporary values such as `0.01` while editing `10.01`. Values outside the
allowed bounds and reversed ranges show warnings during editing. On blur,
Apply or Build, the fields also check number format. Invalid values stay
visible with an accessible message outside normal layout flow. The numeric
keyboard and explicit step controls remain available. Total slips accepts
1–100, odds accept two decimal places and step by 0.01, and probabilities range
from 0 to 100 and step by 0.001. Match counts accept correctly grouped pasted
numbers and step by one. Apply, Build and saving filters validate canonical
values. The same named fields serve native GET submission without JavaScript.

Empty numeric ranges stay editable as Any, with blank minima using their
configured defaults.
Native dates retain calendar selection with valid supported years, an ordered
date window of at most 31 days and valid ordered minute-resolution times.
Incomplete date segments remain editable. Field warnings and the shared parser
prevent invalid windows being applied. Grouped-count parsing, blank Any bounds
and criteria defaults are shared.

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
| Markets | Match result, double chance, match total goals, both teams to score and team total goals | First four |
| Market outcomes | Automatic or one or more supported results within each selected family | Any (Automatic) |
| Total odds | Inclusive minimum from 1.01; optional maximum | 5.00–10.00 |
| Individual selection odds | Inclusive minimum from 1.01; optional maximum | 1.01–Any |
| Selection probability | Inclusive unrounded percentage bounds, 0–100; the stored Builder requires at least 75% per pick | 75–100% |
| Combined probability | Optional `totalProbMin` / `totalProbMax`, inclusive percentage bounds, 0–100; requires a verified joint model | Blank (no joint filter) |
| Selection count | Whole match counts, minimum 1; optional maximum | 1–Any |
| Number of slips | 1–100 | 5 |
| Reuse matches | Allow a fixture in multiple separate slips | Off |

Total odds default to 5.00–10.00 and submit with two decimal places.
Individual minimum odds display 1.01, minimum matches displays 1, and probability
displays 75–100. Individual odds and match-count maxima start blank with Any
placeholders. Custom criteria retain their supplied values, including a 0% minimum.
Reset restores these defaults, today's from/to dates, 00:00–23:59, the default markets
with Automatic outcomes, five requested slips, and disabled match reuse,
including after loading a criteria query.
Each dialog's Reset restores only that dialog's fields. Apply retains those
defaults; Cancel restores the values from before the dialog opened.

Blank numeric minima use their defaults: 5.00 total odds, 1.01 individual odds,
1 match, or 75% selection probability. An omitted total-odds maximum uses 10.00;
an explicitly blank maximum means Any. Saved presets with older odds bounds
below 1.01 load those bounds at 1.01.
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
value and markets in Builder catalog order. Invalid input receives a specific
criteria error and keeps the draft editable.

When subscriber access is required, the primary action shows Sign in to build
slips for a signed-out viewer and opens the login form with the Slip Builder
return path. Signed-in viewers without the required subscription see Subscribe
to build slips; eligible viewers see Build slips. Sign up remains reachable
from the account screen. Both layouts use the shared control height and show
the action in the toolbar. The notice explains
that guests must sign in and need an active subscription; signed-in viewers
without access are directed to the subscription action above. Eligible viewers
see ready-to-build guidance or their generated results. Mobile uses a concise
version of the same account-aware guidance without a duplicate lower action.

The optional `outcomes` mapping stores explicit arrays per market family. Missing
families mean Automatic. Native fields `picks.<family>` accept `auto` alone or a
CSV/repeated list of explicit selections; Automatic cannot mix with manual
selections. Explicit arrays must be nonempty and belong to that family. Valid
submitted choices for an unchecked market are inactive drafts and are omitted
from the resulting criteria, so native forms can deselect a market without
JavaScript updating its outcome controls. Invalid choices still fail validation.
Canonical serialization omits Automatic and inactive fields and orders manual
selections by the Builder catalog. Regulation match totals and home or away
team totals support Over and Under at 1.5, 2.5, 3.5, 4.5 and 5.5. The original
match totals retain their outcome keys. Team totals use side-qualified keys,
such as `picks.team-goals=home-under-2.5`.

Submission parsing bounds the number and size of entries before joining
repeated values. It accepts the full set of native checkboxes under the 2 KiB
form-encoded limit and bounds each family's outcome count.

## Qualifying selections and calculations

The engine considers every requested family independently. Automatic considers
all of its published outcomes with approved prices and keeps those meeting the
criteria; it can choose a result below the highest-probability forecast when
that result's own probability and odds qualify. Manual choices restrict the
candidate set to the chosen results. Both modes require the outcome's own
forecast and matching bookmaker quote. The additional goals options bind the
stored independent forecast and reviewed pre-match quote by regulation period,
goals metric, team where applicable, direction and line. Settlement uses the
corresponding verified regulation score.
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
closed cycles, unavailable or delayed predictions, and future publication
timestamps. The existing qualified Local Engine fallback policy governs
provisional records. The stored projection supplies the source-owned
fresh-price decision. Future observation timestamps, unavailable prices and
median estimates are excluded; this builder uses actual approved bookmaker
prices only.

Total odds multiply the published decimal prices: `1.80 × 1.70 = 3.06`.
The shared `parseDecimalOdds` utility parses prices into exact scaled integers;
combination products and range comparisons use `BigInt`. Total constraints are
checked before rounding. For example, `1.01 × 1.99 = 2.0099` exceeds a 2.00
maximum and is below a 2.01 minimum, even though its displayed total is 2.01.
When a combination has an upper total limit, the bounded search can consider
lower verified quotes for the same outcome alongside the highest individual
quote. It keeps one ranked result for each set of picks.
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

Without a joint-model binding, the search ranks qualifying combinations by the
Fréchet lower bound, the minimum chance of all picks winning given their forecast
probabilities under arbitrary dependence. Higher exact total odds and fewer
selections break ties, followed by canonical identifiers. This bound is internal
to ranking. Rows within a slip follow kickoff and canonical identifier order.
Identical combinations never appear as separate slips.

`src/domain/joint-slip-model.ts` shares the same joint-model contract, validity
check, marginal probability bounds and estimator ranking between custom and
daily Best Slips. A server-owned `SlipJointModelBinding` supplies the model and
an independent `verifyModel` callback; reference strings alone cannot approve
calibration or correlation evidence. `createStoredSlipBuild` accepts that
optional binding. The production reader supplies none; the displayed independence
estimate does not qualify a model or enable model-dependent ranking and filters.

The builder displays generated slips by descending average match probability
before pagination. Equal averages keep their generation order.

`boundJointSlipModel` resolves the request-time binding for the stored reader and
the page's capability check. The page offers combined bounds only with verified
current support, or when a supplied bound needs to remain editable or be cleared.
The service independently verifies that binding; a display capability cannot
authorize an estimator. Explicit editorial/publisher builds retain their own
model and do not resolve the custom reader's binding.

With a verified current binding, the bounded search considers all allowed
selection counts and ranks whole-slip probability first. Higher exact total odds
and fewer selections break equal-probability ties. A longer slip can outrank a shorter
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

`src/server/slips/slip-service.ts` reads the public stored cohort with one
pinned request clock, selected market families, scheduled status and highest
probability order. The repeatable-read transaction selects at most 500 fixtures
and hydrates their forecasts and prices. The selection query excludes fixtures
at or past the kickoff cutoff, closed prediction cycles, and current occurrences
with a publication barrier, observed start or unresolved lifecycle issue before
applying the limit. Per-selection probability and odds bounds remain in the
engine, which evaluates every requested family and outcome. Matches entering
the cutoff during the read are excluded before generation. After the search,
one fresh read checks the selected fixtures. Slips whose fixture status,
schedule or forecast changed during the build are withheld. Other qualifying
slips can still be returned. The service checks the cutoff again before return.

The pure engine retains at most 800 qualifying selection candidates, keeping a
quote per outcome before spending the remaining budget on quote alternatives.
Candidate order uses probability, odds and canonical identifiers. Any leaves the requested filter
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
the custom builder's configured defaults do not change that publication policy.

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
real server-rendered controls, the Advanced Filters groups and their inline
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

The earlier Compact toolbar's implementation checks and the four independently
confirmed full-suite baseline failures are recorded in
[`122-compact-slip-builder-toolbar.md`](../dev-plan/122-compact-slip-builder-toolbar.md).
