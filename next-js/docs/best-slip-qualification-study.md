# Private Best Slips qualification study

The study evaluates the probability that every original selection in a same-book
slip wins. It uses one stored pre-match snapshot per Kampala day, retaining the
exact original featured selection, forecast reference, offered decimal price and
quote receipt for each leg. Capture and settlement files are private and sealed.
An evaluation records their hashes without returning raw bookmaker or fixture
records.

## Fixed samples and clocks

- Define the fit and untouched holdout windows in Kampala dates before
  reviewing results. Each starts inclusively and ends exclusively. Allow a
  gap for late settlements when setting the dates. Each phase uses only the
  latest complete receipt recorded strictly before its own end. A later score
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
