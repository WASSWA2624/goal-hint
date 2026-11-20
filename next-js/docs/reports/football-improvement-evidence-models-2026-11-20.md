# Football evidence and numerical models — 20 November 2026

## Evidence and fitted models

- The fixture evidence builder binds observations to one fixture and a pre-kickoff cutoff. It deduplicates each historical match, records the source IDs separately, and identifies direct, common-opponent and wider connected evidence without counting the same score multiple times. The material hash tracks changes that can affect analysis. The provenance hash also identifies the underlying receipts. Prepared and archived context uses explicit scopes, observation clocks and bounded sections. Missing optional context stays visible in diagnostics.
- `regularized-dixon-coles-v1` estimates time-weighted attack and defense across a single competition, with the connected opponent graph, regularization, measured home advantage and explicitly identified neutral venues. A sealed fit can be scored repeatedly and restored without retraining. The correction is fitted conditionally on the regularized Poisson rates. Sparse-team priors and the fitted evidence thresholds remain diagnostic pending stronger held-out evidence. [Dixon and Coles](https://research.lancaster-university.uk/en/publications/modelling-association-football-scores-and-inefficiencies-in-the-f/)
- All full-time goal and result estimates share one score distribution. It retains a residual below `0.000001`. The extended estimator returns known mass and residual separately and preserves win, half-win, push, half-loss and loss classifications. Confidence and the reasons to abstain travel separately from the predicted probabilities.
- The period model uses verified paired half-time and full-time scores to estimate their joint outcomes, with unsupported mass reported explicitly. Its conditional holdout evaluates the half-time allocation given the realized regulation score. It still requires an end-to-end forecast holdout. Player participation checks distinguish starters, substitutes, missing lineups and conflicting evidence. Cards, corners, scorer and other event markets retain individual capability reasons pending their own qualified fitted models. Verified context features are available as evidence. A numerical adjustment requires measured effects.

## Chronological diagnostic

The private intelligence command accepts an optional `goalHoldouts` object in the authorized dataset. The four UTC boundaries `validationFrom`, `calibrationFrom`, `finalTestFrom` and `finalTestUntil` are epoch milliseconds. It fits once per competition at each frozen boundary, then scores that block using the same artifact. The same rates power the independent-Poisson and low-score-corrected candidates. The calibrator chooses a coherent score-distribution pooling weight using at least 50 previously resolved calibration fixtures within a competition. Final-test outcomes never choose the weight. The stored report contains coverage, abstention and per-selection reliability bins with Wilson intervals, Brier and log loss. [Probability calibration](https://scikit-learn.org/stable/modules/calibration.html) and [time-aware validation](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)

A read-only replay of the owned API-Football snapshot examined 23,025 sealed result rows in 58 competitions. The 160 target fixtures had a stored matching schedule at least 30 minutes before kickoff. The replay used the later of the stored fixture creation clock and result observation clock for training eligibility. The validation, calibration and final-test blocks contained 70, 8 and 82 targets respectively, spanning 11 November 13:30 UTC through 13 November 02:00 UTC. The backfill meant qualifying history was first available too late in the first two blocks. The final block returned 31 estimates (37.8%) and abstained on 51 fixtures. No competition reached the calibration threshold. No provider quota was used.

| Final block, 31 matched estimates | Independent Brier | Corrected Brier | Independent log loss | Corrected log loss |
| --- | ---: | ---: | ---: | ---: |
| Match result | 0.7236 | 0.7244 | 1.1837 | 1.1844 |
| Double chance | 0.2412 | 0.2415 | 0.6850 | 0.6851 |
| Total goals 2.5 | 0.2637 | 0.2637 | 0.7321 | 0.7321 |
| Both teams to score | 0.2430 | 0.2460 | 0.6805 | 0.6864 |

The replay supplies a small matched diagnostic and identifies data gaps. The fitted path remains ineligible for publication. Prospective data, sufficient cohorts and a frozen independent final test are needed to qualify evidence thresholds, calibration, period forecasts and context adjustments. The existing publication path stays in place for this step.

## Local Engine full-match totals audit

The rollout audit re-used the frozen November windows and scored the published baseline model version `regularized-poisson-v1:8a30b9b01d3cacd8` on the owned development snapshot. The read-only cohort required the matching stored schedule to have been observed at least 30 minutes before kickoff and the label to have independently sealed, canonical regulation evidence. Training used only earlier matches whose sealed result and canonical evidence clocks were at or before the forecast cutoff. These gates yielded 22,419 readable sealed result rows, 156 labeled targets and 56 competitions. The cohort and eligible evidence identities hash to `1872a7c8c5a09135c2b2d1fde29f212c980124971e0b16492e33c254273b98ab`. No provider requests or publication writes ran.

The model estimated 0 of 69 validation fixtures, 1 of 5 calibration fixtures and 31 of 82 final-test fixtures. The other 51 final-test fixtures had insufficient point-in-time history. No calibration was fitted. Each comparison uses the same 31 fixtures and the same pre-cutoff history. The comparison estimates the league's observed over frequency with Laplace smoothing. Calibration error averages the weighted absolute difference between forecast and observed rate across fixed 0.2-wide bands, computed separately for Over and Under. Lower values are better in the three score columns.

| Full-match line | Observed Over | Top-pick hits of 31, local / league | Brier, local / league | Log loss, local / league | Calibration error, local / league |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1.5 | 18/31 | 17 / 18 | 0.2628 / 0.2278 | 0.7161 / 0.6406 | 0.1913 / 0.1392 |
| 2.5 | 11/31 | 19 / 23 | 0.2629 / 0.2094 | 0.7302 / 0.6101 | 0.2075 / 0.0967 |
| 3.5 | 8/31 | 21 / 23 | 0.2331 / 0.1885 | 0.6839 / 0.5623 | 0.1848 / 0.0385 |
| 4.5 | 3/31 | 27 / 28 | 0.0965 / 0.0816 | 0.3305 / 0.2924 | 0.0318 / 0.0331 |
| 5.5 | 1/31 | 30 / 30 | 0.0331 / 0.0267 | 0.1308 / 0.1083 | 0.0267 / 0.0176 |

The league comparison had lower Brier and log loss on every line. The five thresholds share the same fixtures and outcomes. Only two of the 31 matches ended on exactly five goals, which leaves little evidence for the calibration of payout grades near that threshold. The inclusive 1.5–5.5 publishing range uses the existing regulation-count model authorization. This cohort does not establish accuracy gains, support new calibration, or qualify the fitted, period, player, cards or corners models. The aggregate reliability bins are retained in the private development audit `.tmp/prompt-03-baseline-holdout.json`.

## Validation and handoff

The 135-check focused suite covers the numerical, period, evidence and existing intelligence paths. The chronological tests use a synthetic cohort with sufficient training and calibration coverage, verify that a late result stays unavailable at the next boundary and confirm that editing the final outcome cannot change the earlier fit or calibration. The archive evidence replay also checked selection identity, cutoff, staleness, conflicting or tampered pages, and exclusion of raw source text. TypeScript, ESLint and all 15 isolated MySQL runtime checks passed. The historical diagnostic is stored privately in `next-js/.tmp/prompt-06-local-chronological-goal-report.json`. Step 07 can consume fitted artifacts, score distributions, the fixture evidence bundle and typed market capability decisions through the existing prediction infrastructure.
