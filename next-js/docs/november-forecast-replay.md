# November 2026 forecast replay

The manifest uses November 1 through December 1 exclusive in `Africa/Kampala`,
or October 31 at 21:00 UTC through November 30 at 21:00 UTC. This matches a
November query in the Kampala Matches browsing zone. A device's different
browsing zone can include different fixtures near either boundary.

From `next-js`, run against the owned development snapshot while its database
is available. Reuse the same private workspace to resume an interrupted run.

```sh
npm run november:replay -- audit --workspace .tmp/november-replay-development
npm run november:replay -- dry-run --workspace .tmp/november-replay-development --pages 10
npm run november:replay -- dry-run --workspace .tmp/november-replay-development
npm run november:replay -- stage --workspace .tmp/november-replay-development
```

`audit` reads the ordinary Matches cohort by occurrence, date, league and
team, with original sources, publication coverage, schedule and lock clocks,
and verified result references. `dry-run` checks the canonical and displaced
occurrences using checkpointed pages. It records the cutoff, evidence hash,
exact history receipt identities where a forecast qualifies, and an explicit
reason for abstention. The chronological evaluation uses each fixture's
sealed result as a label after its forecast is computed. It reports coverage,
accuracy, Brier score, log loss and calibration for identical local/prior
markets where both sources qualify. Original published performance reads
the canonical publication and settlement ledger.

Fixtures still before lock remain in the ordinary forecast schedule. The
development launcher runs private prospective capture on stored evidence.
Hosted prospective publication continues through the authorized live worker.
Provider fixture coverage and stored observations determine what can be
processed as November progresses. The replay uses stored evidence, with a
cutoff independent of bookmaker-price retention.

`stage` stores qualifying replays as retrospective records with their actual
generation time, archived point-in-time evidence, and current approved engine
and registry identities. It writes `activation-diff.json`. Review that diff
for a locked API-sourced original and the proposed Local Engine replacement.
Activation repeats the source, occurrence, evidence and market checks under
the write transaction. Use the same stable ID to roll back its projection.

```sh
npm run november:replay -- activate --workspace .tmp/november-replay-development --operation-id november-reviewed-01
npm run november:replay -- rollback --workspace .tmp/november-replay-development --operation-id november-reviewed-01
```

The public pointer applies to the exact source revision and occurrence.
Matches, supported exact-outcome filters and the ordinary Match Details view
read that projection. Explicit revision history and original prices,
settlements and performance remain tied to their original publication IDs.
The audit workspace contains private source and replay data and belongs outside
the web root. Use distinct workspaces for each new audit or environment.
Run the hosted workflow with the verified database profile and Matches
competition scope for that target. The deployment guide documents the
staging rehearsal, restricted grants and rollback procedure.
[Hosted November replay](deployment/how-to-deploy.md#hosted-november-replay)

## Owned development audit

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
