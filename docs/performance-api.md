# Performance API

`GET /api/performance` is an anonymous, stored-data report. It does not require
registration, tokens or cookies, call providers, enqueue jobs or launch a
chronological evaluation/training run. Responses and errors use the shared public no-store headers.

## Query

| Parameter | Contract |
| --- | --- |
| `market` | `all` (default), `match-result`, `double-chance`, `total-goals`, `both-teams-to-score` |
| `from`, `to` | Inclusive EAT fixture dates, supplied together as valid `YYYY-MM-DD`. Default: today and the preceding 29 days. Maximum: 31 days; earliest start: 1000-01-02. |
| `source` | `combined` (default), `ai`, `api-football` |
| `model` | Exact immutable AI model ID, 64 lowercase hexadecimal characters; incompatible with `source=api-football` |
| `version` | Exact known provider model version for AI, or API-Football prediction contract version for fallback; maximum 128 ASCII word/punctuation characters (`_.:/-`) |

Unknown/duplicate parameters, invalid values and queries over 2 KiB receive the
shared `400 invalid-query` response before database/runtime capability resolution.
Disabled database/competition capability, integrity failures, oversized cohorts
and exhausted query budgets return a safe `503 unavailable`, with a five-second
retry hint. Reports never silently truncate the fixture cohort. POST is unsupported.

## Cohort and coverage

The headline cohort contains canonical API-Football fixtures whose **current
scheduled kickoff** is in `[from 00:00 EAT, day-after-to 00:00 EAT)`. It uses the
feed's enabled competition scope, retaining already published closed/void
history from disabled competitions. `cohort.fixtureCount` counts fixtures once.
Every requested market family has explicitly labeled combined AI/fallback, AI
and API-Football fallback cells. Families are never pooled into one hit rate.

Only the applicable closed cycle's immutable `lockedSetId` supplies a forecast.
An open preview, closed cycle without a lock, missing cycle or unsupported
locked family is unavailable. Current pointers, superseded revisions and
alternative selections never add a scored pick. Void cycles and coherent
audited void outcomes are counted separately from available forecasts.

Each cell satisfies:

```
total = available + unavailable + void + filteredOut
available = settled + pending = sources.ai + sources.api-football
denominator = correct + incorrect = settled
```

Source/model/version filters apply to available locked forecasts. Nonmatching
forecasts are `filteredOut`, rather than mislabeled as unavailable. Void and
unattributed unavailable fixtures remain visible in coverage. The combined cell
respects the requested source filter; the source cells retain explicit labels.
The query and cohort basis accompany all results, including hit-rate denominators.

`historicalCycles` counts nonapplicable void cycles by their **original cycle
kickoff** in the requested period. Formal postponements are a subset. This
measure remains visible when a fixture moves outside the headline date range.
It never adds to current fixture/family denominators.

`operations` counts refresh jobs for current cohort fixtures whose daily-run
EAT dates fall in the requested period, across those runs and cycles. Failed
includes actual durable-job `failed`/`expired` states; pending includes
`pending`/`running`. Delayed refresh receipts are `retained-previous` decisions.
Distinct affected-fixture counts accompany the job/receipt counts. These are
operational observations, separate from forecast availability and accuracy.

## Metrics, policies and comparisons

The reporting service reuses `evaluateMarketMetrics`; quality diagnostics are
shared with the chronological evaluation harness through `evaluateQualityGate`.
There is no second public scoring formula. Match-result Brier/log loss use the
complete categorical distribution. Binary families use their complete binary
distribution. Double chance averages the three **overlapping binary events**
for Brier and Bernoulli log loss, preserving their original probabilities.
It contributes one selected-pick sample per fixture, while calibration bands
contain per-selection event counts. Alternatives never enter hit-rate counts.

An optional trusted **server-only** `PerformancePolicyBinding` must contain a
valid frozen evaluation protocol and a synchronous verifier. A checksum alone
does not approve it. Verification occurs before and after the stored read, so
revocation withholds metrics. Protocol IDs, rather than private approval proofs,
are exposed. The production route currently binds no policy: **OP-16/OP-17
remain unapproved**. Counts are available, but hit rate, Brier, log loss and
calibration values remain null with `unapproved-policy`; no numeric defaults or
synthetic approvals ship in the route.

With a verified policy, statistics require a public sample/quality gate for the
exact family, source and horizon, and matching competition/model/provider scope.
Gate minimum samples and coverage/loss/calibration limits all apply.
Coverage gates use `available / (total - void)` over the full known fixture
cohort, including filtered-out origins/versions; filtering cannot improve the
availability rate by discarding other forecasts. Missing
samples/policy/scope/gates or matched baseline evidence are unavailable;
below-minimum samples are `insufficient-sample`; failed numeric criteria are
`quality-gate-failed`. Withheld values are null and calibration arrays empty.
The denominator and correct/incorrect counts remain factual counts. Zero
denominators never produce zero rates. Passing diagnostics provides descriptive
statistics; it does not establish independent qualification or authorize claims.
`publicClaimAuthorized=false` and `provisional=true` remain explicit.

Verified policies also produce horizon cells. A horizon is scheduled cycle
kickoff minus the locked forecast's **publication time**, consistent with the
evaluation harness's forecast decision horizon. Links expose publication time
and the independent evidence cutoff. Bounds are lower-inclusive/upper-exclusive.
Horizon coverage includes only locks with known horizons; overall cells retain
unknown/unavailable coverage. Overall numeric statistics are withheld when
forecasts span different horizon bands; inspect the separate horizon cells.

Calibration uses only approved fixed band edges and confidence Z. Each selection
band includes count, mean probability, observed frequency and a Wilson interval;
empty bands have null values/intervals. Overlapping double-chance events and
repeated horizon cells are not independent extra fixture samples. Results retain
binary64 precision without presentation rounding.

The stored lock has exactly one source per fixture/family. It cannot supply both
AI and fallback forecasts for identical fixtures, evidence cutoffs and horizons.
Source comparisons therefore report `unavailable`, `no-matched-locked-forecasts`,
count zero and null differences. Unlike fixtures/markets, previews and superseded
revisions are never substituted. Baseline-required gates similarly withhold
metrics because no matched locked baseline archive is stored here. Chronological
evaluation datasets remain the separate comparison/qualification authority.

## Evidence, corrections and bounds

Known model/provider/calibration versions are whitelisted. Each available locked
forecast contributes an evidence reference through the existing detail contract:
`/api/matches/{fixtureId}?revision={lockedRevisionId}`. Each cell lists at most
20 references with total/truncated metadata; headline counts are complete.
Raw payloads, evidence bodies, prompts, model pins and private proof references
are never serialized.

A selected pick is settled only when its sealed latest settlement still matches
the current result, canonical fixture and locked selection through the shared
settlement input hash. A newly ingested correction makes the old score pending
until the private settlement worker records the new audited revision. A subsequent
read reflects that correction while retaining the original lock. `asOf` is the
actual read time, with separate actual last-settled/corrected timestamps.

Repeatable-read transactions are capped at 30 seconds. Indexed batch queries
load at most 1,000 current fixtures/locks and 1,000 historical cycles. Sealed JSON
has a shared 16 MiB preflight budget; operational queries have a 31,000-row cap;
public responses are capped at 1 MiB. Bounds fail safely rather than publishing
partial metrics. Existing kickoff, cycle state/cutoff, primary/foreign-key and
daily-run sequence indexes support these reads. No migration or write grant is
required. The batch path reuses the same sealed row parsers and settlement
projection as detail/feed/private settlement reads.

`freshness.snapshotKey` fingerprints the bounded query, policy, canonical fixture
versions, applicable cycles/locks, current results/audits and operational summary.
It remains stable across unchanged reads and changes on relevant corrections or
scope changes. Explicit invalidation categories support 031. No process cache,
cache invalidation worker, scheduler, UI or later feature is installed by 030.
