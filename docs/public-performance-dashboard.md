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

Production calibration evidence, reviewed league cohorts,
matched provider/AI comparisons and actual bookmaker/customer returns remain
separate work. The reporting page never activates a forecasting model or calls
a football provider.

## Individual-pick returns

Individual market/source/horizon and league cells now carry their own descriptive
return sample and losing streaks. They reuse the exact integer-hundredths
arithmetic from slip reporting without pooling the two denominators. A selected
pick earns one illustrative unit of stake only when its locked original selection
is coherently settled won/lost and has a permitted stored pre-publication quote.
Void/pending outcomes never imply refunds or enter quote aggregates. Streaks use
forecast publication time/revision identity within the selected kickoff-date
period; pending/void forecasts interrupt a streak. No history page is substituted
for a full-period cohort. Missing quotes produce unavailable returns and an
explicit excluded count, rather than a zero-profit claim.

`PerformanceQuoteBinding` is a trusted server dependency for one documented
bookmaker, a bounded approved maximum quote age and independently verified public
historical-display permission. It must cover the frozen launch-market mapping and
its catalog semantics. `readPublicPerformance` intentionally supplies no such
binding pending that review. Reference strings and request parameters cannot
enable it. The grant is rechecked after reads and cache access, including uncached
responses. Quote policies separate cache entries from counts-only entries.

The reader uses sealed `PredictionQuote` sidecars captured in the same transaction
as each new forecast publication. It never reconstructs availability from
transient provider snapshots, receipts or current prices. The captured bookmaker,
original revision/cycle/fixture, publication clock and selected family/outcome
must agree; malformed seals or identities fail closed. The quote must be from
the approved bookmaker, observed after the original cycle opened, before its
forecast publication/cutoff and within the approved age. Missing or explicitly
unavailable captures remain excluded; older revisions receive no backfill.

## Capturing the original public quote

Migration `20261025180538_prediction_quotes` adds one append-only table. The
publisher's optional `quotes.verify` must prove both enabled public odds and the
owner's display/retention rights. After appending the prediction it copies the
fresh public price for that exact family and selection, or an explicit unavailable
reason, before moving the current revision pointer. The final rights and
publication eligibility checks roll back the whole transaction if revoked.
No source call is made. One non-locking SQL statement reads odds state and public
prices under READ COMMITTED; no odds lock order is added.

A capture retains original displayed hundredths, decimal quote, bookmaker,
source and state clocks, versioned mapping/line and snapshot provenance hash.
The source must have consistent exact decimal/display arithmetic and a supported
mapping. Rows are sealed and reject UPDATE/DELETE. Their provenance hash has no
foreign key to transient odds history, so a separately reviewed compaction can
retain these publication facts without retaining every provider payload.

Apply the migration and reviewed SELECT/INSERT grant before deploying enabled
capture. Historical public returns separately require `PerformanceQuoteBinding`;
capture does not activate that grant or a forecasting-quality policy. Missing
permissions or database failures must not be treated as fabricated quotes.

The illustration describes the quoted cohort only. It does not establish
bookmaker acceptance, financial advice, customer returns, forecast quality or
future profit. Calibration retains its independent policy/sample gates.
