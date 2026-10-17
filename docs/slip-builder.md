# Slip builder

`/en/slips` implements the Essentials first mobile layout with the Four folds
Markets & results section and the existing classic table slips. All criteria
expand on desktop. Each slip has its total odds, average forecast
probability and selection count in its title, with one semantic table row per match.
The shared navigation includes Slip builder; its More menu holds the items that exceed the compact primary
navigation. Controls and results use the existing square, themed components.

## Responsive criteria layout

Mobile keeps the slip count, total odds range and picks-per-slip range visible
in one compact row. Three native `<details>` sections follow: Each pick,
Kickoff and Markets & results. All three start closed. Their summaries show
the current draft ranges, selected markets and Automatic/manual outcome mode,
so collapsed sections still explain their settings. With JavaScript,
these summaries update as fields change, without submitting a build. Desktop
keeps all three groups expanded and the fields visible.

Markets & results opens to one row per market, pairing its checkbox with the
existing multi-result picker. Match reuse follows Markets in both the
visual layout and keyboard order, followed by Reset and Build slips.
Collapsing a group hides its controls visually while retaining
the enabled, named inputs in the same native GET form; date, time and numeric
ranges continue to submit without JavaScript. Native summaries can open the
sections without JavaScript as well. Mobile sections opened before hydration
keep that native open state when the enhanced controls attach.

A validation error opens the group containing its invalid controls on every
failed submission, even if the group was subsequently closed. Target validation
keeps the already-visible essential inputs marked invalid. The entered
draft remains editable, the offending fields retain their accessible error
association, and the error explanation stays visible. The responsive layout
changes neither the criteria contract nor the stored-data generation rules.
When resizing to desktop hides a focused accordion summary, focus moves to its
first input so keyboard navigation retains a visible target.

## Criteria and submission

The native GET form supports these criteria, also validated by the pure,
browser-safe `src/domain/slip-builder.ts` contract:

| Criteria | Supported values | Default |
| --- | --- | --- |
| Kickoff date range | Inclusive reporting dates, up to 31 days | Any within today through 30 days later |
| Kickoff time range | Inclusive daily minutes in Africa/Kampala (EAT) | Both blank, meaning all day |
| Markets | One or more match result, double chance, total goals or both teams to score | All four |
| Market outcomes | Automatic or one or more supported results within each selected family | Any (Automatic) |
| Total odds | Inclusive minimum and maximum, 1.01–100,000.00 | Any supported odds |
| Individual selection odds | Inclusive minimum and maximum, 1.01–1,000.00 | Any supported odds |
| Selection probability | Inclusive unrounded percentage bounds, 0–100 | Any supported probability |
| Selection count | Minimum and maximum of 1–8 matches per slip | Any supported count |
| Number of slips | 1–10 | 3 |
| Reuse matches | Allow a fixture in multiple separate slips | Off |

Reset restores the blank Any criteria, all markets with Automatic outcomes,
three requested slips and disabled match reuse. The underlying default date
range remains bounded to 31 days. Blank date-from means today; blank date-to
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
values: at most 30 form entries, 2 KiB of form-encoded data and 256 characters per
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

Average probability is the arithmetic mean of the selected, unrounded forecast
probabilities. Forecasts of 80% and 90% therefore display an average of 85%.
This describes the selections' forecast strength, not the chance that the entire
slip wins. If those events were independent their joint probability would be
72%; independence is not established by this feature, and no combined winning
probability is calculated or claimed.

## Ranking and separate slips

Qualifying combinations rank by fewer selections first, then higher arithmetic
average probability, then higher exact total odds. Canonical fixture, market and
selection identifiers break ties deterministically. Rows within a slip follow
kickoff and canonical identifier order. Identical combinations never appear as
separate slips.

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

The pure engine retains at most 60 qualifying selection candidates, ordered by
probability, odds and canonical identifiers. Combination enumeration has a
100,000-node budget; a bounded heap retains at most 2,000 combinations; compatible
batch selection has a 100,000-node budget per selection-count stage. The maximum
slip length and count also bound the returned output. Reaching a database,
candidate, enumeration, retention or batch bound sets `searchLimited`. Limited
results are ranked among the explored candidates and do not claim global
optimality or that all possible qualifying slips were found.

The page distinguishes generated slips, no qualifying selections, no valid
combinations, odds unavailable, data unavailable and rate limiting. It reports
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
provider requests, changes no forecasts, places no bets, requires no account and
persists no saved slips. Existing match detail links remain available in each
table row.

## Verification

`npm run test:slips` runs the pure engine and stored-read service tests, including
exact decimal boundaries, an exhaustive ranking oracle, deterministic ordering,
the greedy no-reuse counterexample, source freshness guards, EAT boundaries,
native checkbox submission, policy gating, read drift and bounded searches.
It also covers blank Any bounds, Automatic choosing a qualifying non-top
outcome, manual choices using their own probabilities and quotes, multi-result
combinations, missing outcome prices and invalid outcome-family mappings.

`npm run test:slips:rendering` builds the isolated Next.js fixture and verifies
real server-rendered controls, the three native accordion groups and their
default states, retained inputs in collapsed sections, draft summaries and
validation-driven expansion. It also checks result states, native GET builds, invalid criteria,
navigation overflow, summaries inside slip titles and one row per selection.
Its `--serve` option keeps the fixture available for browser inspection.
