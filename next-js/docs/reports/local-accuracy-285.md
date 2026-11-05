# Local accuracy pilot — real data, shadow only

Executed 5 November 2026 (Africa/Kampala). Source baseline
`66211d772438ebe184cb0f7344239a2cf7cdb5da`. Protocol and model settings were fixed
before structured target-result acquisition/scoring. No model tuning, production
activation, paid call, application migration or public forecast write occurred.

## Result

The default local model produced forecasts for all **41 distinct LaLiga matches**,
17 April–4 May 2023. All 41 had independently corroborated teams, UTC kickoff and
completed regulation results. All outputs remain private, uncalibrated shadow
diagnostics; **zero forecasts were published**.

The local model improved probability-loss scores in three market families, but
its top-pick hit rate was lower for match result and double chance. Its measured
calibration error was worse than the simple baseline in every market. These
mixed results, small sample and source limitations do **not** support activation.

| Market | Local correct | League-frequency correct | Local Brier | Baseline Brier | Local log loss | Baseline log loss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Match result | 24/41 (58.5%) | 27/41 (65.9%) | 0.524864 | 0.577386 | 0.902150 | 0.970899 |
| Double chance | 32/41 (78.0%) | 37/41 (90.2%) | 0.174955 | 0.192462 | 0.527961 | 0.570739 |
| Over/under 2.5 | 22/41 (53.7%) | 19/41 (46.3%) | 0.243869 | 0.255807 | 0.680311 | 0.704804 |
| Both teams to score | 24/41 (58.5%) | 19/41 (46.3%) | 0.252316 | 0.251231 | 0.697563 | 0.695611 |

Lower Brier/log loss is better. Compare systems within a row: the shared metric
implementation uses different normalizations for multiclass and binary markets.
Hit rate evaluates the highest-probability selection, not all outcome labels.
Every comparison uses the same 41 settled fixtures; both systems have 100% model
coverage. The validator returned 41 `eligible-shadow`, zero withheld and zero
published. Eligibility is permission to study a forecast, not to publish it.

| Market | Local calibration error | Baseline calibration error |
| --- | ---: | ---: |
| Match result | 0.183881 | 0.145898 |
| Double chance | 0.183881 | 0.145898 |
| Over/under 2.5 | 0.103777 | 0.083723 |
| Both teams to score | 0.097133 | 0.049438 |

Calibration uses the existing fixed probability bands. Bin counts and intervals
are retained in the local JSON summary. The descriptive 95% Wilson hit-rate
interval for match result is approximately 43.4–72.2%; repeated teams and related
markets limit independence assumptions. There are **41 fixtures, not 164
independent experiments**. No statistical-significance or long-run accuracy
claim is made.

## Dataset and verifier

Training source: Pol Vallès i Closa and Guillem de la Calle Vicente,
[Dataset with the results and matches of La Liga, version 1](https://zenodo.org/records/7831873),
DOI `10.5281/zenodo.7831873`, CC BY-SA 4.0. The original 326,064-byte CSV has 3,800
rows. We retain 3,699 completed results; one completed row with unknown original
kickoff is excluded explicitly. The 730-day model lookback determines which
retained results each fit actually uses; 3,699 is the archive size, not each fit's
training sample.

Availability is conservatively fixed at the repository modification time rounded
up to **2023-04-16T02:26:44.682Z**. Historical results are not backdated to guessed
match-end times. Of the 100 unfinished archive rows, 50 lack original kickoff
times and nine have 24-hour forecast cutoffs before archive availability. The
remaining 41 form the fixed eligible cohort; 100% coverage refers to those 41.
All were already scheduled with blank outcomes in that same archive, with their
24-hour forecast cutoffs after availability. Each local fit uses 700–740 history
rows after the unchanged lookback and availability filters; no target label
enters training.

Later labels come from cached, free ESPN LaLiga daily scoreboards, for example
[the first target date](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20230417&limit=1000).
An exact team-ID/name mapping, exact UTC kickoff, completed full-time status and
period 2 are required. Missing, ambiguous or rescheduled targets remain in the
original denominator as unavailable. None of these 41 required exclusion.
Their label availability is the actual November 2026 capture time, so they never
enter any April/May 2023 training fit. This is a **fixed-vintage historical
reconstruction**, not rolling live collection or a prospective test.

The archive's original collector and timezone are undocumented. Mainland-Spain
wall time is inferred; every accepted target matches an independent UTC record.
The historical training rows still rely on the contributed archive's quality.
Source research incidentally exposed snippets mentioning individual historical
outcomes; this was not a fully blinded experiment. Deterministic membership,
unchanged defaults and exclusion rules were frozen before structured acquisition
and scoring, and no outcomes drove changes to them.

The generated verifier pins an external manifest hash, checks exact raw source
bytes and repository metadata, rebuilds the dataset, and accepts only exact
history/result/fixture membership. It rejects changed scores, clocks, identities,
configuration and injected provider/context/slip data. Hashes prove integrity;
historical availability comes from the published versioned archive, not from
filesystem dates or an unconditional approval callback.

| Retained identity | Value |
| --- | --- |
| Model | `regularized-poisson-v1:8a30b9b01d3cacd8` |
| CSV SHA-256 | `f87bda8bf9db6644a44411d6933053f275d94ddedc01352f6c2440813260bb30` |
| Protocol | `95b0b38a6322a3d2c3335330b42f4487c8042ee1133414163fe684f31a17b37f` |
| Acquisition manifest | `fd19b942d66e2b4bc8d6cf18b5cabfcbef2590e552c033cedb9639b19433780e` |
| Dataset | `556d68dcd02094b6415d3ff6fcba395cdce9495eee9934bfd597e4a5e6ba490a` |
| Original result bundle | `5c884ba4172c1233c6155b07f0e67779baceec89e4353a41ff8e794d8597c326` |

## Existing local records and missing comparisons

A read-only transaction against the verified local application database preserved
football-only receipts in ignored storage: 2,074 fixtures, 332 result revisions,
943 result observations, 41 snapshots and 31 provider forecasts. Twenty-seven
forecasts have matched verified final results and all 31 precede the forecast
lock. However, every snapshot has empty historical facts/sources, and no usable
home/away history exists at those forecasts' cutoffs. These records therefore
cannot establish the new local model's accuracy. Their adapter provenance is
retained without claiming independent provider attestation; one unmatched result
has inconsistent timing. No account/payment records or credentials were exported.

The public pilot has no contemporaneous API-Football, AI/context, odds or original
slip captures. Provider/ensemble/AI incremental-value comparisons, priced ROI,
whole-slip success rates and dependence qualification are **unavailable**. The
separate local provider cohort is not substituted into this matched comparison.
One men's league and 41 fixtures cannot establish performance in other leagues,
women's competitions, lead times or seasons.

## Reproduction and verification

Raw sources, protocol, dataset, verifier and generated reports are local only at:

`D:/coding/apps/nextjs/goal-hint-intelligence/next-js/.tmp/local-accuracy-285/`

The `zenodo-7831873/` directory contains the pinned dataset/verifier;
`results/` retains the original report bundle; `accuracy-summary.json` contains
matched metrics/calibration bins; `local-sources/` contains the separate read-only
inventory. None is committed. The isolated worktree is retained for reproducibility.

From `next-js` in that worktree:

```powershell
npm run intelligence:prepare -- --directory .tmp/local-accuracy-285/zenodo-7831873
npm run intelligence:report -- --dataset .tmp/local-accuracy-285/zenodo-7831873/dataset.json --authority .tmp/local-accuracy-285/zenodo-7831873/verifier.mjs --directory .tmp/local-accuracy-285/results
npm run intelligence:accuracy -- --bundle .tmp/local-accuracy-285/results/5c884ba4172c1233c6155b07f0e67779baceec89e4353a41ff8e794d8597c326.json --hash 5c884ba4172c1233c6155b07f0e67779baceec89e4353a41ff8e794d8597c326
```

Initial acquisition made 16 free public archive requests; paid provider/AI calls
were zero. Cached reconstruction uses zero network requests and retains original
capture clocks. No application configuration, schema or public prediction changed.

Focused tests cover source/protocol authentication, malformed CSV/DST, exact team
and kickoff matching, reschedules, regulation-only labels, tampered manifests and
files, safe cache paths, matched denominators, arithmetic and deterministic replay.
Verification: all **101 intelligence tests passed**, with no failures or skips;
scoped ESLint and `npm run typecheck` passed. Independent review reproduced the
reported counts, scores and intervals and confirmed that no target labels entered
training. Both retained-cache formats reconstructed all 41 fixtures with zero
network requests and the identical manifest hash. No production build, database
migration or live-service activation was needed for these offline commands.

## Changes and rollback

Reusable additions are preparation, pinned verifier loading, exact source parsing
and matched metric summaries. Existing league-frequency logic is exported unchanged;
existing evaluation-archive safety helpers are reused through additive wrappers.
The Poisson model and its defaults were not modified.

Changed files: `APP_OVERVIEW.md`; `next-js/package.json`;
`next-js/dev-plan/285-local-accuracy-dataset.md`;
`next-js/docs/prediction-intelligence.md`; this report;
`next-js/scripts/acquire-intelligence-pilot.mjs`;
`next-js/scripts/intelligence-accuracy-summary.mjs`;
`next-js/scripts/lib/intelligence-pilot-archive.mjs`;
`next-js/scripts/lib/intelligence-pilot-data.mjs`;
`next-js/src/server/intelligence/walk-forward-evaluation.ts`;
`next-js/src/server/evaluation/evaluation-archive.ts`;
`next-js/tests/intelligence-accuracy-summary.test.mjs`;
`next-js/tests/intelligence-pilot-archive.test.mjs`;
`next-js/tests/intelligence-pilot-data.test.mjs`.

Rollback is source reversion with the engine still off. Preserve the frozen
protocol, receipts and first report instead of deleting inconvenient results.
Larger independently defined cohorts and prospective shadow evidence remain
necessary before any activation decision.
