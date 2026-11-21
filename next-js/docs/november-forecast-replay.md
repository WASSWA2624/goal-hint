# November 2026 forecast replay

The default manifest uses November 1 through December 1 exclusive in `Africa/Kampala`,
or October 31 at 21:00 UTC through November 30 at 21:00 UTC. This matches a
November query in the Kampala Matches browsing zone. A device's different
browsing zone can include different fixtures near either boundary.
For another cohort, set `--from YYYY-MM-DD --to YYYY-MM-DD` when creating
the audit. Both dates are inclusive in Kampala and the workspace records
the resulting UTC window.

From `next-js`, run against the owned development snapshot while its database
is available. Reuse the same private workspace to resume an interrupted run.

```sh
npm run november:replay -- audit --workspace .tmp/november-replay-development
npm run november:replay -- dry-run --workspace .tmp/november-replay-development --pages 10
npm run november:replay -- dry-run --workspace .tmp/november-replay-development
npm run november:replay -- stage --workspace .tmp/november-replay-development
```

`audit` records the ordinary Matches cohort by occurrence, date, league,
team and status, with original publication coverage and schedule and lock
clocks. `dry-run` checks canonical and displaced occurrences in checkpointed
pages. It prefers the sealed, independently estimated Local Engine
distributions from an eligible original publication. A rebuild uses only
training observations recorded before the original forecast evidence cutoff.
A fixture without an original publication needs its own verified pre-match
schedule and history available before effective lock.

The quote decision is as of one millisecond before effective pre-match
lock, independently of the model evidence cutoff. The decision accepts
only exact, permitted offers captured and recorded before the declared
clock. A standard pick requires strictly positive expected net return and
odds of at least 1.10. If the standard ladder is empty, the priced fallback
considers verified offers from 1.01 and prefers positive returns. Both use
the probability ladder down through 60%. The signed expected return,
unrounded quote, bookmaker, observation clocks and receipt are sealed with
either priced decision. Without a qualifying price, a supported Local Engine
forecast at or above 60% can be displayed as forecast-only. The checkpoint
records the estimate origin, mode, selected rung or absence reason, and
evidence identity. Verified result references are
joined to frozen checkpointed decisions for evaluation. Original published
performance continues to read the canonical publication and settlement ledger.

Fixtures still before lock remain in the ordinary forecast schedule. The
development launcher runs private prospective capture on stored evidence.
Hosted prospective publication continues through the authorized live worker.
Provider fixture coverage and stored observations determine what can be
processed within the ordinary worker's budgets. Replay reports pending
prospective processing separately.

`stage` stores qualifying retrospective revisions with their actual generation
time, declared earlier decision clock, evidence and decision identities.
It writes `activation-diff.json` with nullable featured selections, exact
priced outcomes, prior projection identities and rejection reasons.
Review the diff before activation, including projected suppressions. If a
previously active legacy projection retains valid occurrence identity but
its forecast can no longer be verified for this audit, the new revision
suppresses its featured pick and retains its market forecasts. Activation
revalidates occurrence, forecast, quote eligibility and expected prior
pointer in the write transaction. Use the same stable ID to roll back an
activation. Rollback restores the previous pointer when the activation
replaced one.

```sh
npm run november:replay -- activate --workspace .tmp/november-replay-development --operation-id november-reviewed-01
npm run november:replay -- rollback --workspace .tmp/november-replay-development --operation-id november-reviewed-01
```

The public pointer applies to the exact occurrence and original source
revision, when present.
Matches, supported exact-outcome filters and the ordinary Match Details view
read that projection. Explicit revision history and original prices,
settlements and performance remain tied to their original publication IDs.
Public odds access controls display of the precise sealed quote. A forecast-only
pick keeps its selection and probability with no odds. The featured slot
stays empty for abstentions, and All Markets retains supported forecasts.
Previously activated records remain readable and rollback can restore them.
The audit workspace contains private source and replay data and belongs outside
the web root. Use distinct workspaces for each new audit or environment.
Run the hosted workflow with the verified database profile and Matches
competition scope for that target. The deployment guide documents the
staging rehearsal, restricted grants and rollback procedure.
[Hosted November replay](deployment/how-to-deploy.md#hosted-november-replay)

## Earlier bounded change to the probability ladder

Run a separate full audit for the standard, priced fallback and forecast-only
policy. The commands below remain available for the earlier v1-to-v2
threshold-only review and for rolling it back.

Use the original private v1 workspace and the v2 release to compare the
additional 70%, 65% and 60% rungs. The comparison reuses frozen v1 forecast
distributions, receipt identity and decision clocks. It rereads retained
pre-decision quotes only for v1 decisions with comparable offers and no
qualifying outcome. It reproduces those sealed v1 decisions before calculating
v2. The audit retains already priced picks and forecast or quote gaps. It
records unverifiable candidates separately.

```sh
npm run november:replay -- delta-audit --workspace "$workspace" --delta-baseline reviewed
npm run november:replay -- delta-stage --workspace "$workspace"
npm run november:replay -- delta-activate --workspace "$workspace" --operation-id november-ladder-02
npm run november:replay -- delta-rollback --workspace "$workspace" --operation-id november-ladder-02
```

Use the `reviewed` baseline in staging when v1 has been reviewed and its
rehearsal has been rolled back. For a completed v1 activation, use the default
`active` baseline and pass its original `--v1-operation-id` to `delta-audit`.
Pass the same environment flag used for the original workspace on each command.

`policy-delta.json` contains both frozen decisions for every comparable estimate,
including unchanged picks. A separate `policy-delta-calibration.json` joins
verified results after the comparison is sealed. It reports matched v1/v2 and
newly priced outcomes by probability band. Outright wins count as successes
for calibration, and pushes and half settlements count as zero. Bands with
fewer than 30 verified observations are marked as insufficient for conclusions.

Review `policy-delta-activation-diff.json` before activation. Only reviewed v1
fixtures with an attributable change and the expected active or prior
projection are eligible. The writer revalidates the occurrence, evidence,
quotes and prior pointer under the activation lock. Zero eligible changes
produce an empty operation receipt. The separate delta rollback restores
the exact prior pointer and keeps both decision versions in the archive.

## Previous owned development audit

At 20:03 Kampala time on November 20, the stored Matches cohort contained
13,589 fixtures across 571 competitions. It held 953 API-Football forecasts,
each with match result and derived double chance, and 12,636 fixtures without
a publication. The audit found 5,497 sealed regulation result labels for
November 1–13 and 5,234 scheduled fixtures still before lock. The later
chronological block had no verified final labels in this snapshot. The private
manifest for this run is identified by
`c8224f1a8e4c89e9004fc7957dd3197efb2d5cbaaee24390175961bdac65dd68`.
The owned MySQL snapshot completed all 85 canonical migrations with matching
checksums and zero schema drift.

The replay handled 13,617 occurrences, including 28 displaced schedules.
It estimated 27 forecasts and deferred the 5,234 future occurrences to
ordinary processing. It abstained on 8,356 occurrences, led by 5,307
without a verified pre-lock schedule and 2,854 without verified play.
Another 138 lacked sufficient pre-lock training. Of 76 started or played
fixtures with a locked API-Football forecast in the audit, 18 qualified for
activation review, 55 lacked training, and three had changed schedules.

The first chronological block supplied all 27 locally scored forecasts
(0.49% of 5,497 labels). Seventeen local estimates had comparable original
match result and double-chance forecasts. Scores below use the same 17
fixtures. Calibration uses five fixed probability bands per outcome.

| Forecast | Correct local / prior | Brier local / prior | Log loss local / prior | Calibration error local / prior |
| --- | ---: | ---: | ---: | ---: |
| Match result | 7 / 5 | 0.708 / 0.693 | 1.162 / 1.176 | 0.160 / 0.155 |
| Double chance | 13 / 12 | 0.236 / 0.231 | 0.676 / 0.668 | 0.160 / 0.155 |

The replay had higher pick accuracy in this small sample. Prior forecasts
had better Brier and calibration scores in both groups, and log loss was
mixed. Totals and BTTS had no comparable prior forecasts. The paired sample
is too small to qualify additional models or calibrators.

The activation review approved 17 of the 27 staged v5 estimates. Nine lacked
an original locked source, and one lacked qualified API provenance for
replacement. The owned snapshot activated all 17. Twelve display Away Under
5.5 and five display Home Under 5.5. The other 936 original API forecasts
remain displayed. The earlier v4 drafts are retained as private audit records.
A normal Matches result and its Match Details agreed on the replayed pick,
while explicit revision history displayed the original API forecast.

## Hosted outcome

Production independently audited 13,705 fixtures and activated 857 reviewed
display projections at 01:29 Kampala time on 21 November. It preserved the
locked forecasts, saved prices, results and settlement history. Staging
rehearsed 13 independent projections and restored their original display
through the same rollback workflow. Later fixtures continue through the
ordinary prospective worker as provider coverage and evidence arrive.
[Hosted rollout evidence](reports/football-improvement-rollout-2026-11-20.md#hosted-november-replay)
