# Local prediction intelligence

This is a disabled-by-default, private shadow implementation. It never writes
public predictions or slips, changes the user interface, activates a paid service,
or grants model/public-claim approval. Existing live source precedence and
five-minute forecast locking remain in place. See [plan 280](../dev-plan/280-local-prediction-intelligence.md)
and the [execution report](reports/local-intelligence-280.md).

## Local model and evidence

`server/intelligence/local-goals-model.ts` fits independent Poisson goal rates
with team attack/defence, league home advantage, exponential recency and ridge
regularization. It uses verified regulation scores observed before each forecast
cutoff, exact competition identity and canonical teams. Provider predictions,
odds and AI numbers are not fitting features. Match result, double chance,
over/under 2.5 and BTTS come from the same goal distribution. Sparse data,
unseen teams, failed convergence and locked fixtures withhold output.

Defaults are methodological starting points: 730-day lookback, 180-day half-life,
ridge 3, at least 30 weighted league observations and six per team. They are not
optimized performance claims. The local model reports effective sample size,
convergence and uncertainty, with retained input/configuration hashes. It does
not estimate missing injury, transfer, red-card, player or tactical coefficients.
No Dixon–Coles dependence coefficient has been fitted. The baseline follows the
Poisson modeling approach described by [Dixon and Coles](https://rss.onlinelibrary.wiley.com/doi/10.1111/1467-9876.00065);
that paper's historical findings are not evidence for this implementation.

`evidence-adapter.ts` reuses authorized, prepared evidence snapshots. Existing
history claims do not contain a competition identity: a separately verified
point-in-time scope receipt is mandatory. Missing scope is excluded rather than
assigning the upcoming fixture's league to its past opponents. Duplicate results
count once and conflicting scores/scope are excluded. Original availability and
retrieval times are retained. Men's and women's local fits stay within their
competition; explicit cohort labels also segregate ensemble learning. Unknown
cohort identity remains unspecified.

## Independent components and validation

Provider probabilities retain their source/model, original observation clock
and reference. Unsupported markets stay absent. AI context contains cited facts
classified verified, credible report, rumour or unknown; it supplies no numerical
probability. Significant verified/reported context requires review or withholding.
This change adds no live AI/research transport or automatic service activation.

`contextual-review.ts` prepares a fact-only prompt from authorized original
snapshots, excluding other models' conclusions and odds. Deterministic facts
mode is explicitly identified as extraction. Optional assisted mode accepts
only existing fact IDs with exact original citations and unchanged or weakened
certainty; invented text, facts or numerical probabilities are rejected. Source
freshness/reuse/transmission rights, fixture/evidence binding, declared day/month
exposure and actual gateway reservation are checked before and after dispatch.
Concurrent identical reviews share a bounded cache; the existing cost gateway
retains durable attempt authority. All modes default off.

The validator preserves all component outputs, checks identity, freshness,
provenance, cross-market coherence and material disagreement, and separates
evidence reliability, model uncertainty and exact-price value. Ensemble fitting
uses jointly evaluated local/provider forecasts on chronological out-of-sample
records, with regularization toward global weights and league shrinkage. Separate
chronological training/calibration/holdout partitions prevent fitting on the
reported holdout. A provisional temperature fit is not independent qualification.

Every validator output has `mode: shadow`, `publish: false` and
`calibratedProbability: null`. A diagnostic `eligible-shadow` result is permission
to study a forecast, not to publish it. No live activation path is installed.

## Monitoring and persistence

The existing seven-day EAT pipeline remains intact. New monitoring helpers plan
hourly near-term/published-slip checks and less frequent distant checks only
after capability verification. The five-percentage-point movement trigger and
10% relative odds trigger are provisional configurable review policies.
Classification distinguishes critical, significant, minor, unchanged and missing
observations. Missing fields do not establish unchanged facts. Small movements
accumulate against the last meaningful forecast. Local computation precedes any
justified contextual request; day/month admission, outage, circuit and retry
helpers complement the existing atomic quota/cost gateways. They do not replace
those gateways' reservation authority.

The durable shadow job also checks present component freshness and authorization
on unchanged observations. Expiry/revocation removes eligibility; verified fresh
evidence can recover it. Local fits have a retained renewal deadline so ordinary
clock-only checks do not create versions, while an expired fit is recomputed.
Quote expiry clears stale value estimates. Validity is checked again immediately
before persistence; this metadata grants no publication authority.
Any future live archive adapter must retain stable input/source identities for
clock-only checks. New archive references or evidence identities deliberately
change provenance and trigger revalidation; observation clocks alone do not.

The [official provider documentation](https://www.api-football.com/documentation_v3)
and [quota guidance](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)
describe fixture batching (up to 20 IDs) and endpoint-specific refresh behavior.
No counted request was made to establish this account's access, allowance, market
coverage or caching rights. Those checks are required before binding live schedules.

The additive migration `20261105100000_intelligence_shadow` introduces:

- `IntelligenceShadowState`: one fixture row, compact check count/current observation,
  availability, latest revision and latest shadow-eligible pointer.
- `IntelligenceShadowRevision`: immutable meaningful evidence/model revisions with
  content integrity, sequence, separate components and original clocks.
- `IntelligenceShadowCheck`: compact unique check/replay receipts. A check is not
  a forecast revision. Retries return their original receipt.

State, receipt and revision writes share a fixture lock and transaction. Revoked
or unavailable eligibility does not overwrite historical forecasts. Original
published picks, prices, references and settlement tables remain untouched.
Canonical forecast and observation payloads are retained as serialized strings
inside versioned JSON envelopes. This avoids MySQL JSON number normalization
altering floating-point probabilities and invalidating their integrity hashes;
shadow-only metadata remains queryable and constrained by the database.
Retain forecast revisions and check identities required for replay/evaluation;
do not enable destructive pruning by default. Existing operational-log retention
continues separately. Source receipts needed to reproduce a result must outlive
any optional operational-log archival.

## Slips and evaluation

Private shadow selection uses the six existing exact odds bands and global
fixture-exposure limits. Calibrated marginals and independently verified evidence
covering the complete proposed combination are required before multiplying.
Pairwise independence alone is insufficient. Shared fixtures/teams and unknown
dependence are excluded; unqualified bands remain empty. Search has explicit
candidate/node/leg bounds and reports when truncated. Average selection
probability and joint probability are separate fields.

The established exact hundredth bounds are preserved: the first band ends at
4.99, the next starts at 5.00, and analogous bounds apply above it. Some multi-leg
products strictly between those values (for example 4.9952) are excluded even
though their display rounds to a boundary. This inherited rule is unchanged.
The final band includes exactly 200.00 and rejects an exact product above it even
if its display rounds down.

No joint model is bound to live publication. Existing average-probability display
sorting and labels remain unchanged under the UI freeze. A future activation that
needs revised labels/interactions must be reviewed separately.

Walk-forward evaluation fits local forecasts using only information available at
each cutoff, learns ensemble artifacts from earlier resolved out-of-sample
forecasts and reports market/competition/lead-time coverage, abstention,
Brier/log loss/calibration, outcome states and illustrative recorded-price returns.
Provider comparisons are unavailable without verified original receipts. AI's
incremental value, real whole-slip qualification and accuracy remain unproven.
Use the existing independently approved evaluation protocol/promotion workflow
before any release; this diagnostic report cannot approve itself.

`shadow-slip-evaluation.ts` reports whole-slip outcomes and six-band diagnostics
from sealed original captures and verified as-of result observations. Unit-stake
ROI follows the existing captured two-decimal total-quote convention; it is not
an inferred bookmaker payout or the unrounded product of leg quotes. Void,
cancelled, pending and unavailable slips are excluded from these illustrative
returns, with no invented refund. Private report datasets may include
`slips: {captures, results, asOf}`; the verifier must additionally provide
`verifySlipCapture` and `verifySlipResult`. Missing captures remain unavailable.

```powershell
npm run intelligence:report
npm run intelligence:report -- --demo
npm run intelligence:report -- --dataset private-dataset.json --authority trusted-verifier.mjs
npm run test:intelligence
npm run test:intelligence:mysql
```

For MySQL acceptance, set `MYSQL_TEST_SERVER_BINARY` to an available portable
MySQL `mysqld` executable with `mysql`/`mysqladmin` alongside it. The command
initializes and destroys only its own temporary instance, fails if genuine
MySQL is unavailable, and never attaches to the application's configured database.

The first command reports readiness with zero observations. `--demo` uses only
synthetic matches and writes a deterministic, non-overwriting JSON bundle under
`.tmp/prediction-intelligence/`. Private datasets use the evaluator's typed
fixture/history contract and `mode: historical|prospective|synthetic`. An explicit
local `.mjs` authority exports `authorizeDataset`, `verifyHistory`, and optional
`verifyProvider`/`verifyContext`. This module is privileged operator code; a dataset
label, source URL or hash alone cannot authenticate a historical forecast. No
credentials, application environment or live source are loaded by the command.

## Reproducible real-data pilot

The [5 November local accuracy report](reports/local-accuracy-285.md) records a
small fixed-vintage LaLiga experiment: 41 pre-published fixtures, 3,699 archived
historical results, unchanged model defaults and a 24-hour forecast horizon.
The contributed Zenodo archive establishes an April 2023 availability bound;
later ESPN observations are used only as labels. Raw downloads and the generated
verifier stay in ignored local storage. Model coverage and operational eligibility
are distinct from calibration or publication qualification.

From `next-js`, the preparation command explicitly downloads only free public
archive endpoints. Existing pinned artifacts are reused without network calls:

```powershell
npm run intelligence:prepare -- --directory .tmp/local-accuracy-285/zenodo-7831873
npm run intelligence:report -- --dataset .tmp/local-accuracy-285/zenodo-7831873/dataset.json --authority .tmp/local-accuracy-285/zenodo-7831873/verifier.mjs --directory .tmp/local-accuracy-285/results
npm run intelligence:accuracy -- --bundle <report-archive.json> --hash <report-command-hash>
```

The generated verifier pins the acquisition manifest, checks each raw source,
reconstructs exact fixture/team/timestamp mappings and rejects changed datasets.
The accuracy summary verifies the report seals, replays the unchanged local fits,
and compares the local model and league-frequency baseline on identical fixtures.
It does not approve data provenance independently of the original verifier.
The observed results were mixed and do not authorize activation; see the report
for source limitations, calibration, missing comparisons and local artifact paths.

## Migration, rollback and release

Apply the additive migration only to an explicitly owned local development or
disposable test target during this phase. The shadow application role needs
SELECT/INSERT/UPDATE on state and SELECT/INSERT on revisions/check receipts;
revision update/delete triggers enforce immutability. Production grants and
deployment were not performed.

Rollback means leaving the feature off/unbinding the shadow job, stopping its
owned local worker and reverting the source commit. Keep the additive tables and
their historical evidence. Do not roll back by deleting existing public history,
dropping tables or resetting a database. A later destructive schema rollback
needs owner approval and a verified backup.

Release remains gated on authorized historical data, prospective shadow results,
independent calibration/dependence review, provider rights/budgets, full staging
and device performance, backup/restore acceptance, native signing/push and legal/
responsible-gambling review. Synthetic tests and local builds do not establish
production readiness, wins or profits.
