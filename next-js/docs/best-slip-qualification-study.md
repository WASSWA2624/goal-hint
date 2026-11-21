# Private Best Slips qualification study

The study evaluates the probability that every original selection in a same-book
slip wins. It uses one stored pre-match snapshot per Kampala day, retaining the
exact original featured selection, forecast reference, offered decimal price and
quote receipt for each leg. Capture and settlement files are private and sealed.
An evaluation records their hashes without returning raw bookmaker or fixture
records. The current construction scope accepts the day’s eligible priced
featured picks without an extra 75% floor. It uses the combined price to
assign each slip to one band. Earlier captures remain in their original
study scope.

## Fixed samples and clocks

- Define the fit and untouched holdout windows in Kampala dates before
  reviewing results. Each starts inclusively and ends exclusively. Allow a
  gap for late settlements when setting the dates. Each phase uses only the
  latest sealed receipt covering the slate, recorded strictly before its own end. A later score
  correction cannot change the evidence available to an earlier phase.
- Choose the earliest sealed capture for each calendar day, using the seal as
  a stable tie-break for simultaneous captures. Retain the selected day's slate
  before reading grades. Whole days stay in the same phase. In stable band and
  slip-identity order, retain a fixture only once across both phases. Repeated
  fixtures, additional captures, incomplete days and search limits remain
  visible in the coverage counts.
- Score decisive outcomes after all original legs have terminal evidence. Keep
  void, pending, unavailable and missing receipts in separate counts. A known
  early loss does not make a still-unresolved slate part of the scored sample.
  Counts include the retained slate's unresolved and void outcomes in its
  decisive-coverage denominator.

## Candidate and report

Fit independently within each odds band and leg count. The candidate uses the
product of the original marginal win probabilities only as a shadow comparison
and an input feature. It maps that feature into the feasible interval
`[max(0, sum(p) - legs + 1), min(p)]`, fits one logit offset by penalized
Brier loss, and maps back to that interval. Its offset is limited to ±2,
searched in 0.05 increments, with a fixed squared penalty of 0.0025. An
offset is determined from the fit data alone, and the report hashes the fit
inputs and offsets separately from holdout evidence.

The exploratory support floors for each phase are 40 decisive slips on at
least 14 calendar days, at least eight wins and eight losses, and 90%
decisive coverage in that band and leg count. The report includes both
candidate and product-only Brier and log loss, observed hit rates, calibration
bins, and paired 95% normal-approximation intervals clustered by Kampala day.
Review remaining time dependence, repeated teams or competitions, and
coverage drift before drawing any conclusion from these intervals.

An `evaluated` report means that the fixed minimums allowed the comparisons.
Every report is marked `approvedForPublication: false`. Freeze any candidate
artifact and evaluate the actual intended top-ranked slips on a new prospective
block before considering publication. Independent review must check the
original database receipts, calibration and dependence evidence, exact
estimator implementation, supported cohorts, and the existing operating and
public-odds approvals.

## Running the collector

Run from the tracked Next.js release with its generated Prisma client and the
target's approved database settings and bookmaker rights. The CLI requires a
configured primary bookmaker and checks that its MariaDB session is read-only.
Use a directory owned by the service account and restricted to that account.
The only writes are immutable capture and settlement files in this directory.

```sh
node --conditions=react-server scripts/best-slip-study.mjs probe --directory "$STUDY_DIR"
node --conditions=react-server scripts/best-slip-study.mjs collect --directory "$STUDY_DIR"
node --conditions=react-server scripts/best-slip-study.mjs results --directory "$STUDY_DIR" --date "$DAY"
node --conditions=react-server scripts/best-slip-study.mjs evaluate --directory "$STUDY_DIR" \
  --scope "$SCOPE_HASH" --fit-from "$FIT_FROM" --fit-until "$FIT_UNTIL" \
  --holdout-from "$HOLDOUT_FROM" --holdout-until "$HOLDOUT_UNTIL"
```

Schedule one capture after the expected same-day odds refresh and before the
fixtures it can observe reach cutoff. A repeated run preserves the same day's
capture and observes results for the prior seven days. For a later settlement
or correction, use the original date with `results`. Keep empty captures to
account for coverage. A scope includes the configured bookmaker, competition
IDs and deployment environment. Keep each scope separate in evaluation.

## November 21 production audit

The read-only production ledger contained 608 original-cycle frozen decisions
across one Kampala day. Exact original forecast and quote receipts verified 63
priced selections. Of the 55 selections at or above 75%, one matched the
configured bookmaker and had no verified original-market settlement. Replay
contained 185 exact-price observations with supported outcomes across two days,
assembled after kickoff. This audit supports a coverage diagnosis. The replay
observations supply no prospective fit or holdout examples.

The 18:12 Kampala production smoke capture examined 264 fixtures with complete
feed coverage and found zero eligible picks or slates. The retry returned the
same sealed capture and created no second file. Staging verified the read-only
database session and refused real capture because its profile lacks a configured
primary bookmaker and verified odds rights. Both publication archives had zero
rows. The public web and football worker stayed on their existing releases.

The production study uses source release `77bb18b6` and its private
`goalhint-joint-study.timer`. It runs at 06:30 Kampala time from November 22.
The service allows a five-minute start window and skips late or missed starts.
In the November 21 receipts, 669 pre-cutoff fixtures had both a fresh odds
receipt and a sealed qualified Local Engine forecast by 06:30. There were 676
by 09:30, by which time another 37 fixtures had crossed cutoff. These counts
measure input overlap and include forecasts that cannot form eligible slates.

The initial fit window is November 22 to December 20, 2026. Its untouched
holdout is December 23, 2026 to January 20, 2027. The end dates are exclusive,
and the November 21 smoke capture falls outside both windows. The windows
produce an insufficient report if the evidence floors are unmet. Public
automatic publishing remains disabled and requires independently reviewed
whole-slip evidence and a verified publisher binding.

## Revised eligibility rollout

On November 21, the same clean web package from `97b85700` passed on staging
before production promotion. Both hosts verified all 88 required migrations.
Best Slips, filtered archive and counts, Builder, and Matches passed over HTTPS.
The production collector was updated from `27a88345` and its next capture
remained November 22 at 06:30 Kampala time. The revised scope uses separate
files and retains the earlier smoke capture unchanged. The initial fit and
holdout dates above apply to the revised scope.

A revised read-only production probe at 18:36 Kampala time examined 233
fixtures and found zero eligible picks. At 18:38, nineteen featured picks
preserved valid bookmaker prices and four also had a supported settlement
market and qualified sealed forecast. None of those four had a price from
the configured bookmaker. The one priced featured pick from that bookmaker
used a market outside the supported settlement scope. The public archive
remained empty. Automatic publication still requires whole-slip qualification.
