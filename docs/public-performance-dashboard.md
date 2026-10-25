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

Production calibration evidence, league-level reports, individual-pick returns,
matched provider/AI comparisons and actual bookmaker/customer returns remain
separate work. The reporting page never activates a forecasting model or calls
a football provider.
