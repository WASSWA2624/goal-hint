# 012 Primary AI predictor

**Feature:** Produce validated AI probability candidates from a pinned evidence/model configuration.

**Depends on:** [005 Regulation-time market domain](005-market-domain.md), [010 Research and AI cost control](010-research-cost-control.md), [011 Fixture evidence snapshots](011-fixture-evidence.md).

**Source:** [App specification](../app-write-up.md), sections 7–10 and 14–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, evidence contracts and implementation decisions. Implement the actual selected AI service adapter and a reusable primary predictor. Resolve the approved predictor/model and calibration configuration before enabling live calls; verify its current structured-output API and rates using official documentation. If credentials or selection are missing, finish local interfaces and honest contract tests, but leave live integration explicitly incomplete rather than substituting a fake provider.

Add a versioned model registry recording provider/model identifiers, prompt/schema versions, training/calibration windows where applicable and evaluation configuration. Pin a configuration for each invocation/job and retain its identity with results; retries must not silently switch models. Consume immutable fixture evidence with exact identities, cutoff and missing-data flags. Exclude provider ready-made predictions from the primary path.

Request structured regulation-time probability groups, two to four concise evidence-grounded reasons, one key uncertainty and references to supplied genuine sources. Do not request or publish internal reasoning. Missing facts remain unknown and no invented numerical news adjustments are permitted. Treat verbal model confidence as unrelated to event probability.

Validate fixture identity, evidence timing, finite bounds, complete groups, sums and cross-market consistency through shared domain rules; derive double chance there. Return valid AI groups and structured invalid/missing-family reasons without filling gaps or publishing. Trace reasons/source links to the evidence snapshot and reject fabricated references. Preserve original evidence, generation and provider retrieval/update times separately.

Enforce research/AI cost, token, request and timeout controls; leave the configured time/quota opportunity for later fallback. Expose calibration hooks governed by versioned, evaluated configuration; no unvalidated transformation or successful API call establishes calibration. Mark unvalidated estimates provisional through the result contract. Prediction revisions, locks, fallback selection and durable orchestration are later features.

## Acceptance checks

- Tests reject wrong identities, incomplete/nonfinite/inconsistent groups, future evidence and invented citations.
- Timeout, missing evidence, invalid output and exhausted budget produce distinct fallback-ready reasons.
- Valid groups retain their model/evidence provenance and original timestamps; primary inputs contain no provider forecast votes.
- Real integration smoke tests are bounded and accounted when credentials exist; synthetic fixtures never imply quality approval.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, model/prompt versions, contract and live checks in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with selected configuration and any remaining live or evaluation gate.
