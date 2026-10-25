# Public results and performance

`/[locale]/performance` provides the public reporting screen. It uses the same
responsive navigation and controls as the rest of the app; the extra destination
moves into the existing More menu when the header has no room.

The date form accepts at most 31 EAT reporting days. Market, source, model and
version filters are parsed through the existing strict performance query. The
visible form offers date, market and source filters; applying it starts that
visible cohort without hidden model/version constraints, including when
JavaScript is disabled. Pagination keeps the selected period and any explicitly
pinned model/version in its links. Invalid or repeated parameters fail
closed instead of silently changing the sample.

## Different samples stay separate

Individual-prediction counts use fixture kickoff dates and one locked selection
per market. A fixture can appear in multiple market cards, so their counts are
not added together as unique matches. Available, correct, incorrect, pending,
void, unavailable and filtered-out counts remain visible. Original revision links
lead to the preserved forecast and result evidence.

Win rate, Brier score, log loss and calibration remain behind the existing frozen
evaluation-policy and sample gates. Without sufficient reviewed evidence, the
page shows counts and an explicit pending state; it does not derive a headline
accuracy claim from a small or unqualified cohort. Qualified calibration tables
include selection, probability band, sample count, mean forecast, observed
frequency and the protocol's confidence interval. Rendering a synthetic reviewed
fixture does not approve a production policy.

Daily-slip reporting uses original publication dates. Its summary covers the
whole selected publication period before public history is paginated, including
sanitized pending counts. Active selections, prices and probabilities are not
included in public history. Completed cards retain original rank, publication
time, probability, selections, quotes and outcomes from the account-independent
archive. Prediction market/source filters do not filter daily-slip statistics;
the page states this difference next to the form.

## League cohorts

League reporting groups the same individual-prediction cohort by canonical
competition identity. Public competition names and countries come from the
existing season/competition relation; absent or invalid identities remain in an
explicit Unknown league group rather than being dropped or guessed. Competitions
with an identity but no supplied name retain a name-unavailable label.

Each league reuses the existing market aggregation, source/model/version filters,
sample minimums, horizon rules and quality gates on that league's own records.
A passing overall sample does not supply a denominator or approved rate to a
smaller league. Correct/incorrect/pending/void/unavailable/filtered-out counts stay
visible; unreviewed, undersized or failing quality metrics remain unavailable.
League summary responses omit repeated calibration-bin and evidence arrays;
the full individual-prediction section retains those original details.

The response exposes ten league groups per page, sorted deterministically by
country/name/identity, with unknown attribution last. `leaguePage` is independent
from published-slip `page`; both links preserve the selected date/source/market
and any explicitly pinned model/version. Applying the visible form resets both
page numbers. League pagination does not filter or recompute the period-wide
individual-prediction or published-slip summaries. The existing 31-day cohort,
stored-payload and one-megabyte wire bounds still apply.

## Illustrative slip returns and streaks

`src/domain/slip-performance.ts` is a pure aggregation boundary shared with the
publication reader. It rejects duplicate publication IDs and invalid clocks,
orders publications by time, original rank and finally stable ID, and never
mutates its input. All decimal quoted totals are accumulated in integer
hundredths before display conversion.

The return illustration stakes one unit on each fully won or lost slip at the
original quoted combined odds. A win returns the quoted odds including that
unit; a loss returns zero. Profit is returns minus units staked, and ROI is
profit divided by the return sample's stake. Void and pending slips are excluded
because a forecast void does not establish bookmaker refund or adjusted-payout
rules. Invalid quotes remain counted as settled outcomes but are reported
separately and excluded from the return sample. Pending/void quotes never enter
mean odds, returns or other price aggregates.

Historical slip win rate is won / (won + lost), shown with the denominator and
an explicit statement that it describes only that sample. No fees, taxes,
bookmaker acceptance, customer wagers or actual customer profit are inferred.
An empty sample has unavailable rates, not a claimed zero-percent win rate.

Losing streaks count consecutive losses in publication order within the selected
period. A win, void or unresolved slip interrupts the streak. The longest and
period-end streaks therefore do not claim a run extending outside the selected
window or through unresolved outcomes.

## Illustrative individual-prediction returns and streaks

`src/domain/prediction-returns.ts` is the pure aggregation boundary for each
horizon-free market/source cell and each league cell. It does not share code with
the slip summary. It rejects duplicate revision IDs, unsafe clocks, unknown
outcomes and quotes outside 1.01–1000.00, sorts a copy of its input and never
mutates it.

Samples are exactly the outcomes the cell already counts: each settled won/lost
prediction (`returns.settled` equals the metric denominator and `returns.won`
equals the correct count), each pending prediction and each attributable void.
Filtered-out sources/versions and unavailable families never become samples.
A void interrupts a cell's streak only when it belongs to that cell: the void
cycle or audited void settlement must have a locked, available prediction for the
family that also passes the cell's source/model/version filters. A void cycle
without a lock stays in `coverage.void` only.

Losing streaks follow scheduled kickoff, then locked publication time, then
revision ID, within the selected period. A win, void or pending prediction
interrupts the sequence; streaks never extend outside the period. Horizon cells
carry `returns: null`; there is no cross-market "all predictions" return,
because one fixture appears in several market cards.

The return illustration stakes one unit on each won or lost prediction at the
original public odds shown when that locked prediction was published. A win
returns the quote including the unit; a loss returns zero. Void and pending
predictions are excluded, imply no refund and never enter mean odds or any other
price aggregate. Settled predictions without a captured quote are counted as
missing; those that had no current public price at publication are counted as
unavailable. Both are excluded from the return sample and reported separately.

### Capturing the original public quote

The quote is captured once, in the locked revision's own publication
transaction (`src/server/predictions/prediction-quote-store.ts`). It runs after
the revision, its goal/implied extensions and extended picks are written and
before the cycle's current pointer moves. The publication's final eligibility
re-check rolls the capture back together with the revision. Retained-previous,
unavailable and skipped outcomes capture nothing. There is no backfill and no
reconstruction from snapshot history: revisions published before the migration,
or while capture was off, count as missing quotes.

Each available family gets exactly one `PredictionQuote` row, read in one
non-locking statement from the fixture's odds state and the fresh public
`FixtureOddsPrice` row for exactly that family and locked selection, with no
fallback or borrowed family. A row is `quoted` only for a bookmaker-basis price
whose state is not withdrawn and was reconfirmed within the odds freshness
window before publication. Otherwise it is `unavailable` with reason
`no-public-price`, `price-state-expired`, `unsupported-price-basis` or
`invalid-public-price`. Missing means no row was captured; unavailable means the
capture found no usable public price. Later odds changes never rewrite a row.

Capture and display are both gated. The live publisher captures only while
`publicPolicy.features.providerOdds` is on **and** the owner-recorded
`football-odds-rights` approval verifies (the published-slip precedent). The
performance reader reads quotes only while the same code flag is on. With the
flag off, every cell reports `state: "unavailable"` with reason
`odds-display-disabled`, zero quote counts and null stake/return/profit/ROI/mean
odds, and no SQL reads `PredictionQuote`; outcome counts and losing streaks stay
real. An enabled cohort with no priced settled prediction reports
`no-quoted-settled-predictions` and null money fields, never zero. Returns are
an ungated illustration like slip ROI; the quality-gated hit rate and
`publicClaimAuthorized=false` are unchanged.

Captured hundredths outlive the private snapshot `retainUntil` window
(kickoff + 30 days), as the published-slip archive does; the owner must confirm
that retention. A very small cohort's mean odds can reveal one historical public
price.

## Verification

`tests/slip-performance.test.mjs` checks exact returns, quote exclusions,
pending-price privacy, empty/losing cohorts, duplicate rejection and chronological
streaks, including simultaneous daily publications ordered by rank.
`tests/performance-page.test.mjs` checks strict EAT query parsing and preserved
pagination filters. Navigation tests cover the shared new destination.

`python scripts/verify-performance-rendering.py` builds isolated production
components from synthetic inputs and checks unreviewed/reviewed quality states,
full-period summaries beside paginated outcomes, active-quote omission, empty,
outage and out-of-range pages. `--fixture <built-directory>` reuses a saved
acceptance build; `--serve` keeps it available for browser inspection. Run from
the repository's pinned Node 24.18.1 environment, and serialize TypeScript builds
with other checks on a memory-constrained host.

On 25 October 2026, all 25 focused arithmetic/query/navigation tests and targeted
ESLint passed. The isolated Node 24.18.1 production build and all seven rendering
states passed, including the native-form regression that removes hidden advanced
constraints from Apply without changing pagination. The subsequent repository
TypeScript check also passed. Genuine database publication/settlement acceptance is covered by
the archive's separate tests; synthetic UI evidence does not establish a real
forecasting track record.

The subsequent league implementation passed all 58 affected performance,
page-query, navigation and slip-statistics tests. Its nine-state production
fixture adds league pagination, unknown attribution and escaped untrusted
competition names; final rendering evidence is recorded in the implementation
report. No schema change or new approval binding was required.
The genuine MySQL performance acceptance also passed all nine checks against an
owned MySQL 8.4.13 instance, including canonical competition metadata, subgroup
counts/denominators and the original bounded read-only reporting workflow.

`tests/prediction-returns.test.mjs` checks exact hundredths, void/pending price
exclusion, missing/unavailable accounting, display-disabled and unpriced states,
kickoff/publication/ID ordering and streak interruption. `tests/performance.test.mjs`
reconciles returns with every horizon-free and league cell and checks void
attribution, filtered-out exclusion, quote integrity and that the flag-off service
never reads `PredictionQuote`. `tests/prediction-quote-store.test.mjs` covers
every capture reason and sealed-row parsing. `tests/prediction-quotes.integration.mjs`
deploys the migration on owned MySQL 8.4 and checks capture gating, rollback with
the final re-check, immutability against later odds, the triggers and CHECKs, and
hand-reconciled returns after cutoff, result and settlement. The rendering
verifier's `returns` state shows available returns with missing/unavailable notes.

Production calibration evidence, reviewed league cohorts, captured individual-prediction quotes,
matched provider/AI comparisons and actual bookmaker/customer returns remain
separate work. The reporting page never activates a forecasting model or calls
a football provider.
