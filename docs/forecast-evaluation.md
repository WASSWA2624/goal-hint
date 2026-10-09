# Chronological forecast evaluation

Prompt [014](../dev-plan/014-forecast-evaluation.md) provides an internal,
reproducible evaluation contract for AI, API-Football, combined forecasts and
reconstructable league-frequency/team-strength baselines. It scores the shared
regulation-time markets and produces an immutable report. It does not collect
live forecasts, change the approved model, publish performance claims or replace
the later prospective shadow operation.

The selected actual AI provider/model and calibration remain unresolved under
OP-15. OP-16 and OP-17 in the
[decision register](implementation-decisions.md) still require approved periods,
cohorts, baseline parameters, minimum samples, quality/coverage thresholds and
public-claim requirements. The [008 report](reports/provider-trial-008.md) has
zero real observations or dispatched requests; it establishes no historical
prediction dataset, supported provider binary markets, rights or freshness
policy. Local synthetic results verify arithmetic and contract behavior only.

## Frozen protocol and dataset

The server-only [evaluation contract](../src/server/evaluation/evaluation-contract.ts)
separates an immutable protocol, dataset, forecast receipts, as-of evidence
proofs and verified regulation results. `createEvaluationProtocol` and
`createEvaluationDataset` validate and hash the complete configuration. A change
to selection, model, data, baseline parameters, bands or thresholds changes its
identity; a rerun cannot silently replace any of them.

Before the untouched final test, independently approve and freeze:

| Configuration | Meaning |
| --- | --- |
| Chronological windows | Ordered, nonoverlapping half-open training, validation, calibration and final-test periods. |
| Selection | Competition IDs, selection version, fixture/cycle membership and forecast horizons. |
| Model/artifacts | Exact candidate model, prompt/schema, calibration and provider contract versions; previous independently approved model when one exists. |
| Baselines | Versioned historical lookback, minimum history and explicit league-frequency/team-strength parameters. |
| Reliability analysis | Fixed probability-band edges and the explicit normal critical value used for Wilson intervals. |
| Gates | Per system, market and horizon minimum settled sample, coverage and approved loss/calibration/baseline-comparison limits. |
| Public claims | Separate minimum evidence and sample requirements, with independently verified qualification. |

`frozenAt`, approval, chronological windows and gates can remain unresolved for
readiness reporting. Missing values do not become an approved default, zero
threshold or successful final test. Freeze boundaries, binning and thresholds
before inspecting final-test outcomes. Select models using training/validation;
fit an approved calibrator on its separate calibration period. Final-test data
must remain independent of those choices.

Protocol windows describe the planned evaluation cohorts. Model-registry
windows describe the actual completed fitting/evaluation history of that exact
artifact. They are separate records: do not copy a planned final-test window
into an already fitted model or extend its provenance into future dates.
Known model windows must end by each forecast's evidence cutoff. Unknown
training/calibration provenance stays explicitly provisional; a current model
with undisclosed training history cannot prove a leakage-free historical trial.

Kickoff assigns each fixture/cycle to one chronological split. Multiple forecast
horizons remain in that split; an earlier refresh of a final-test fixture cannot
become a training observation. Do not split repeated revisions or horizons of
the same fixture across training, calibration and final test. Approved window
dates and sample sizes are operating choices, not values supplied by the
harness.

## Availability and leakage checks

Authenticate the original forecast and source records. A content hash, URL,
`historical-snapshot` label or evidence-reference string alone does not prove
that the record existed at the prediction time.

- Football/news evidence must be available and retrieved by the fixture
  context's evidence cutoff. Authenticated provider-forecast receipts may be
  available and retrieved through `forecastAt`; they are forecasts, rather than
  later input evidence for the AI. Preserve original retrieval, publication and
  source-update times. A later retrieval cannot establish earlier knowledge
  without verified original capture.
- Forecast generation/capture may follow the evidence cutoff. It must establish
  a forecast available by the stated `forecastAt`, with the exact fixture/cycle,
  teams, model/calibration and immutable probabilities. A current provider
  response cannot replace an earlier forecast.
- Regulation result labels may arrive after kickoff for scoring. Historical
  results used as baseline features must already be available by that feature
  cutoff. Later corrections need a separate versioned observation; do not
  overwrite a frozen evaluation dataset.
- Training/calibration artifacts must be bound to the selected model/version
  and their permitted periods. Supplying old news to a current model does not
  prove that it has not memorized later outcomes.
- Use the existing [market validation](markets.md) and settlement rules. Extra
  time, penalties, live scores and unverified regulation scores cannot become
  final outcome labels. Void, pending and unavailable records remain visible.

Without authenticated pre-cutoff AI/news/provider snapshots, historical
AI/provider comparisons remain unavailable. Verified reconstructable baselines
can still be measured from information available at each original cutoff.
Regenerated predictions made after outcomes are known are not historical
forecasts.

## Matched cohorts and denominators

Compare like markets on the intersection of the same fixture, cycle, fixture
version, forecast time, evidence cutoff and horizon. Preserve a hash of the
matched keys and the matched sample count. Report each system's full cohort and
missingness beside that intersection so selective coverage cannot masquerade
as superior forecasting.

The AI, provider and combined views are distinct systems. Combined uses the
already selected source for each fixture/family, rather than choosing whichever
source later proved correct. AI/fallback attribution, exact model/provider
versions and forecast horizons stay separate in every report.

One applicable fixture/cycle contributes at most one selected headline pick per
family and horizon. Only `correct + incorrect` enters the hit-rate denominator.
Pending, void and unavailable counts are reported separately. Alternative
selections, superseded revisions and repeated job attempts do not create extra
headline predictions. Cross-horizon views can contain the same fixture, so they
are separate cohorts rather than independent extra fixtures.

Exact score is outside this market contract. Any later approved exact-score
evaluation needs its own labeled results and cannot enlarge these headline
denominators.

## Metric definitions

Definitions were checked against current primary documentation on
**9 October 2026 EAT**. This repository freezes its own metric version and
scaling; it does not depend on a library's changing default options.

For an observed categorical result, `y[k]` is one for the actual outcome and
zero otherwise; `p[k]` is the original unrounded probability.

| Family | Per-fixture Brier loss | Per-fixture log loss |
| --- | --- | --- |
| Match result | `sum_k (p[k] - y[k])²`, three outcomes, scale 0–2. | `-ln(p[actual outcome])`. |
| Total goals / BTTS | `0.5 * sum_k (p[k] - y[k])²`, both supplied outcomes, scale 0–1. | `-ln(p[actual outcome])`. |
| Double chance | Average of the three overlapping events' binary losses `(q[j] - z[j])²`, scale 0–1. | Average of `-z[j]*ln(q[j]) - (1-z[j])*ln(1-q[j])` over the three events. |

Report the arithmetic mean of those per-fixture losses over settled eligible
forecasts, with its count. Brier's categorical sum and customary binary
half-scaling are documented by
[scikit-learn's Brier reference](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.brier_score_loss.html).
The binary formula and natural logarithm are documented in the
[log-loss reference](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.log_loss.html).
The harness uses original valid probabilities without clipping, rounding or
renormalization; the shared market contract requires values strictly between
zero and one. Both stored binary probabilities are scored, including permitted
source precision differences.

Double-chance event truths come from the shared regulation settlement rules:
home-or-draw, away-or-draw and home-or-away can overlap. Their probabilities are
derived from the same accepted match-result distribution. This documented
aggregation applies binary scoring to each event and averages within the
fixture before averaging fixtures. It is not a three-class distribution, and
its probabilities must not be normalized to sum to one. The three alternatives
remain distribution observations; only the selected alternative contributes to
headline hit rate.

## Reconstructable baselines

The [baseline implementation](../src/server/evaluation/evaluation-baselines.ts)
uses only independently verified regulation results from the same competition,
within the approved lookback and already available by the original evidence
cutoff. It excludes the target fixture/cycle and rejects duplicate fixture/cycle
results. Distinct matches may share the hash of one authenticated source batch.
History is ordered by kickoff, availability and stable identity before applying
rating updates; the returned history hashes make the feature set inspectable.
An earlier final-test match can become history for a later forecast once its
result is actually available. This frozen walk-forward rule permits no changes
to parameters based on final-test performance.

League frequency counts home wins/draws/away wins, over/under 2.5 goals and BTTS
yes/no. For outcome count `c`, history size `N`, approved positive smoothing
`alpha` and `K` alternatives, its probability is `(c + alpha)/(N + K*alpha)`.
Double chance comes from the resulting match-result distribution through the
shared validator. The common minimum-history requirement is explicit; a short
history produces unavailable forecasts.

Team strength replays that same eligible history from the approved initial
rating. With current ratings `Rhome`, `Raway`, home advantage `H`, scale `S` and
positive draw weight `D`, define `q = 10^((Rhome - Raway + H)/(2*S))` and normalize
weights `[q, D, 1/q]` into home/draw/away probabilities. For each historical
match, expected home score is `p(home) + 0.5*p(draw)`; actual score is 1, 0.5 or 0.
Add `kFactor*(actual - expected)` to the home rating and subtract it from the
away rating. This versioned rating baseline supports match result and derived
double chance. Totals and BTTS remain explicitly unsupported. A team without
eligible history uses the approved initial rating and records that limitation.

The draw component follows the paired-comparison tie model described in
[Firth, Kosmidis and Turner's research paper](https://arxiv.org/html/1909.07123#S1.SS1):
win strengths and a draw weight proportional to their geometric mean.
The `[q, D, 1/q]` formula above is our stated reparameterization; the rating
updates and numeric parameters are separately frozen implementation choices,
not football-quality evidence.

All probabilities pass the shared domain rules, including strict probability
bounds and cross-market consistency. Invalid or unsupported families stay
unavailable. These formulas and every parameter are frozen protocol choices;
they carry no assertion that either baseline is already accurate. Internal
market objects reuse an existing source label, but the report's outer system
identity always labels these forecasts as `league-frequency` or `team-strength`.
Numerically saturated probabilities remain unavailable; the implementation
does not add an unapproved epsilon or clamp them into an acceptable range.

## Reliability bands and uncertainty

For each selection, report fixed-band count, mean forecast probability and
observed event frequency. Categorical selections use one-versus-rest event
truths; double chance retains its overlapping binary events. Empty bands have
zero count and null means/frequency/interval rather than invented zero error.
The [official calibration-curve reference](https://scikit-learn.org/stable/modules/generated/sklearn.calibration.calibration_curve.html)
defines the comparison between mean probability and observed frequency within
a band. The protocol freezes its edges rather than choosing favorable bins
after the final test.

Bands include their lower edge and exclude their upper edge; the last band
includes one. Accepted probabilities remain strictly below one. The arithmetic
helper validates market metadata and settlement semantics; provenance and
historical availability remain checks for the harness and trusted authority.

`calibrationError` is a count-weighted absolute reliability gap. For each
selection, sum `bandCount/N * abs(observedFrequency - meanProbability)` across
nonempty bands, then average across that family's selections. Here `N` is its
settled fixture count. An empty cohort has null error. This repository's
explicit aggregation is sensitive to the frozen bin edges and sample size;
it is not a replacement for the full band table or its uncertainty.

Use the protocol's explicit critical value `z` for a two-sided Wilson interval
around each band's observed proportion. With `n` observations and `r` observed
frequency, its center and half-width are:

```text
denominator = 1 + z²/n
center = (r + z²/(2n)) / denominator
halfWidth = z * sqrt(r*(1-r)/n + z²/(4n²)) / denominator
```

The method and its bounded proportion limits are described in the
[NIST confidence-interval reference](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).
These pointwise intervals assume independent fixture observations within that
selection/horizon. They are not simultaneous guarantees across all bands and
do not account for team/competition/time dependence. Do not pool three
double-chance alternatives as three independent fixtures. Repeated horizons
also require separate interpretation or a later approved grouped uncertainty
method.

Lower Brier or log loss alone does not establish calibration: those scores
also reflect discrimination and outcome uncertainty, as explained in the
[official calibration guide](https://scikit-learn.org/stable/modules/calibration.html).
Inspect reliability, sample counts and limitations separately. A successful
request, populated band or synthetic test is not a quality qualification.

## Prospective capture plan when history is unavailable

Prepare a concrete, independently approved prospective protocol before the
first scored forecast:

1. Select competitions, fixture/cycle cohorts and fixed horizons; approve the
   candidate model, calibration version, baselines and source permissions.
2. Freeze windows, all gate values, probability-band edges and minimum samples,
   and record independent ownership of the untouched final-test cohort.
3. At each forecast time, preserve the original selection manifest, canonical
   identity, evidence/source capture clocks, model pin and full source-specific
   AI/provider/combined receipts. Record unavailable sources rather than
   filling them later.
4. Apply existing private request/token/cost/time controls to any separately
   approved collection. Visitor reads cannot create trial forecasts. The
   evaluation harness itself performs no external requests.
5. Append independently verified regulation results after play, preserving
   corrections and void-cycle history without modifying earlier forecasts.
6. Evaluate frozen datasets on identical matched keys, retain coverage and
   source breakdowns, and report passed, failed and pending gates with sample
   limitations. Continue actual prospective shadow operation under its later
   prompt before launch qualification.

Failed candidate gates retain the previous independently approved model. If
there is none, the candidate remains provisional/unapproved and the launch
blocker remains explicit. Harness execution never promotes a model, rewrites
registry approvals or automatically permits a public calibration/performance
claim.

## Internal API and immutable reports

Create the protocol and dataset with the validation factories, then evaluate
them through the [server-only harness](../src/server/evaluation/evaluation-service.ts):

```ts
const protocol = createEvaluationProtocol(protocolConfiguration);
const dataset = createEvaluationDataset(datasetConfiguration);
const harness = createEvaluationHarness({ authority, maxRows, maxBytes });
const report = harness.evaluate({ protocol, dataset, split: "finalTest" });
```

`authority` is independently trusted, synchronous local verifier code. It
authorizes the operation and verifies protocol/dataset identity, original
forecast receipts, evidence availability, regulation results, baseline history,
model provenance and untouched final-test handling. Returning a promise, a
truthy object or an unverified reference does not approve these checks.
Selection verification must bind the original eligible receipt chosen for each
fixture/cycle/horizon; the harness rejects duplicate rows within that horizon.
Source permission and provenance are rechecked before returning the result.

The report preserves protocol/dataset/report hashes, model/calibration/provider
versions, split and EAT fixture-date period. Its `cells` expose each
system/family/horizon's coverage, settled metrics, reliability bands and source
breakdown. Coverage is `available / (total - void)`; available includes pending
forecasts, while scoring uses settled records only. `comparisons` include source
pairs and baselines on their exact matched intersection, retaining count, keys
hash and candidate-minus-reference Brier difference.

Each gate retains its original `criteria`, diagnostic arithmetic outcome,
passed/failed/pending status and reasons. Insufficient samples, unapproved
protocols, unknown model provenance, synthetic data or unverified independent
final-test handling remain visible blockers. Candidate eligibility also requires
gate coverage of every configured AI launch family/horizon. Passed diagnostics
alone grant no approval: the report always records `promotionPerformed: false`
and `publicClaimAuthorized: false`.

The [archive](../src/server/evaluation/evaluation-archive.ts) saves canonical
`protocol.json`, `dataset.json`, `report.json` and readable `report.md` together
under `<directory>/<report hash>/`. It checks their hashes and bindings, writes
new files exclusively and accepts an identical rerun without changing them.
It rejects changed existing files, traversal, linked paths and hard-linked
inputs. The first final-test dataset/report is pinned for that protocol and
selection in the archive directory; a changed rerun cannot replace it. Preserve
that directory and independently approve/version any subsequent evaluation.
Archive integrity checks do not replace the trusted provenance verifier.
Writing an evaluation bundle requires the original immutable report issued by
the trusted harness in that process, with its verified protocol/dataset binding
and current authority recheck. A parsed JSON copy or newly rehashed metrics
cannot be pinned as an independently verified result. For a later process,
rerun the same frozen inputs through the trusted harness and keep the original
report object. Reading or formatting archived JSON verifies integrity without
granting model or public-claim approval.

Private JSON datasets encode `fixtures[].context.fixtureVersion` using the
canonical `{"$evidenceInteger":"1"}` representation. The reader also accepts a
bounded positive decimal string at that field. It decodes no arbitrary bigint
wrappers elsewhere. Technical limits cap rows/bytes; they are not sample or
quality thresholds. Protocol and dataset files must contain the complete
factory-produced identities and hashes.

## Local command

With no data arguments, generate factual readiness artifacts only:

```sh
npm run evaluation:report
```

The default directory is `.tmp/forecast-evaluation`. Its
`forecast-evaluation-readiness.json` and `.md` record zero actual observations
and live requests in that report, pending operating inputs, unavailable
historical AI/provider comparisons and the concrete prospective plan. They
contain no synthetic accuracy presented as measured evidence. The committed
handoff uses separately named readiness artifacts under `docs/reports`.

For a separately approved frozen local evaluation:

```sh
npm run evaluation:report -- --protocol private-protocol.json --dataset private-dataset.json --authority trusted.mjs --split finalTest --directory private-evaluation-archive
```

The explicit `.mjs` module exports `authority` implementing the verifiers above.
Loading it executes privileged local code; the operator must supply the trusted
module. The command performs no data acquisition, runtime-policy initialization,
credential lookup, database access or provider calls of its own. Errors withhold
private input and verifier diagnostics. `--split` also accepts `validation` or
`calibration`; when data arguments are supplied it defaults to `finalTest`.
An argument/input/storage failure exits with code 1. Successful artifact
generation exits normally even when gates remain pending or fail; inspect the
report status before any independent approval.
