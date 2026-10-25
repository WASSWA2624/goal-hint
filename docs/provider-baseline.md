# Provider benchmark and AI shadow evidence

The live runner now configures the shared fallback service with
`selectionPolicy: "provider-baseline"`. It collects the provider's supported
forecast groups within the existing football allowance and publishes validated
provider distributions. Match result and its derived double chance stay together.
Unsupported total-goals and BTTS probabilities remain unavailable. Provider
failure, missing configuration, lost permission or exhausted capacity cannot
promote an AI candidate. Retention of an eligible previous publication continues
through the existing publication rules with its original clocks.

New `createFallbackService` instances also default to this policy. The pure
resolver retains its legacy default for existing historical contracts; legacy
service fixtures opt into `legacy-ai-primary` explicitly. The production live
binding has no AI promotion path.

AI remains an optional private shadow attempt under the existing runtime,
transmission, evidence and cost gates. No extra attempt, token allowance, request
allowance or provider subscription is introduced. The existing reserve already
budgets one prediction collection plus the final status observation; benchmark
collection now uses that reserved path even when AI supplied complete markets.
This may increase actual requests relative to the old complete-AI shortcut,
within the same per-job and day ceilings. No runtime setting or worker is enabled
by this code change.

`createLiveAuthorities` rejects all AI market publication independently of
transport ownership. A genuine model response, valid model pin or provisional
calibration reference supplies no demonstrated-improvement authority. The refresh
service also omits AI goal-market extensions when no AI market was selected.
There is no automatic promotion switch in the live binding.

## Original matching evidence

The existing append-only `PredictionRefreshIntent` and `PredictionRefreshStage`
records retain the two contemporaneous candidates without a new table:

- The intent freezes canonical fixture/version, cycle/run, original analysis and
  evidence cutoff, model pin and exact resource limits.
- The completed `ai` stage retains the accepted AI output or original denial,
  evidence hash, model identity, probability distributions and original source
  timestamps.
- The completed `fallback` stage retains the benchmark candidate or original
  missingness, provider source/contract, observation reference, original clocks
  and `provider-baseline` reason. It never copies probabilities from shadow AI.

The fixture/cycle/run, family, evidence cutoff and forecast horizon must match
before later comparative analysis. Original source generation/update times stay
unknown when the provider did not supply them; assigning the same cutoff does
not establish equal source recency. Only families valid in both retained
candidates can enter a matched cohort. Unsupported or failed observations remain
part of the coverage accounting rather than being manufactured or silently
removed. Restart/replay reads do not renew clocks or generate a second attempt.

The retained stages establish prospective capture capability, not an evaluated
cohort. A frozen protocol, authenticated real outcomes, adequate comparable
samples, conflict review, held-out evaluation, comparative UI and independently
reviewed promotion evidence remain required work. The public performance API
continues to report matched comparisons unavailable. Existing publications and
historic AI-primary candidates remain readable without rewriting history.

## Verification

`tests/provider-baseline.test.mjs` covers provider selection despite complete AI,
unsupported groups, missing/revoked/unowned provider candidates, interruption,
quota exhaustion and same-job reuse with original clocks. The live-authority
regression proves that even a successful primary ownership callback cannot
authorize AI publication. The genuine MySQL refresh acceptance retains matched
AI and provider stages, checks their original identities/cutoffs and independently
preserved probabilities, rejects stage mutation, and verifies that provider
failure publishes no shadow AI. All transports and source approvals in these
tests are synthetic; no live provider or accuracy claim follows.

## Integrated source diagnostics

AI refresh plans now freeze `sourceOrder: "provider-first"` and retain normalized
`value.sources` receipts in the sealed fallback stage. Both receipts preserve
their own distributions, clocks, versions and explicit unavailable reasons. The
owner-only `/admin/forecasts` page reads those receipts for matched descriptive
Brier/log-loss/calibration diagnostics and recent original prediction outcomes.
It publishes no public claim, approves no model and makes no provider request.
Missing legacy receipts stay `not-captured`. Equal context does not establish
equal source recency or qualify a prospective cohort.

The reusable legacy resolver understands prior `provider-first` and `ai-first`
contracts, and the evaluation command can print a model/report-bound reference
from a genuinely frozen prospective final test. The independent live selection
policy still publishes provider groups only. AI-first live startup is rejected
until actual independently verified promotion evidence is bound; configuring a
matching reference or approval string cannot bypass it.

Apply `20261025200000_refresh_stage_phases` (or its reviewed MariaDB overlay)
before AI preparation runs. It adds preparation/evidence-empty to the existing
stage CHECK while preserving identity and attempt constraints. No source-receipt
table, new provider allowance or public comparison endpoint is introduced.
