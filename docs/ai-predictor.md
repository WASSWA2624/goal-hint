# Primary AI predictor runbook

The primary predictor turns one immutable fixture evidence snapshot and one
pinned model configuration into validated probability candidates. These are
private candidates for later fallback and publication work; this layer creates
no prediction revisions, cycle locks, scheduler or public endpoint.

**No actual AI provider, model or calibration configuration has been selected.**
The provider bridge is a local integration contract, and no provider-specific
HTTP transport, verified current structured-output API or actual rate selection
is implemented. The required live integration is incomplete. Prompt 012 remains
unchecked in [the development tracker](../dev-tracker.md). Synthetic model names,
permissions, receipts and forecast outputs used in tests establish local
contract behavior only.

Read [the decision register](implementation-decisions.md) for OP-09–11 and
OP-13–15: provider/account/model selection, actual pricing, separate budgets,
request/token/time allocations, source and AI transmission rights, evidence
freshness/coverage, and evaluated predictor/calibration configuration. The
licensed news adapter and approved evidence rules from 011 also remain pending.

## Private modules

| Module | Main API | Responsibility |
| --- | --- | --- |
| `predictor-contract.ts` | `ModelVersion`, `ModelPin`, `ModelAuthority` | Immutable configuration, invocation/job binding and trusted artifact verification. |
| `predictor-input.ts` | `createModelVersion`, `parseModelVersion`, `createModelPin`, `parseModelPin` | Strict configuration parsing, deterministic hashes and bounded values. |
| `predictor-registry.ts` | `createModelRegistry(...).register/find/pin/resolve` | Authorized model lookup and fixed model identity for an invocation/job. |
| `predictor-mysql-store.ts` | `createMysqlModelVersionStore(...).save/find` | Append-only model configuration persistence and integrity checks. |
| `predictor-prompt.ts` | `buildPredictorPrompt`, `assertPreparedPredictorPrompt` | Fresh evidence/transmission approval, bounded inert input and a versioned output schema. |
| `predictor-adapter.ts` | `createPrimaryAiAdapter(...).execute` | Runtime and binding approval around one accounted provider attempt. |
| `predictor-output.ts` | `validatePredictorOutput` | Exact identity, original clocks, genuine citations, semantic grounding and shared market validation. |
| `predictor-calibration.ts` | `applyPredictorCalibration` | Explicit evaluated transformation hooks and provisional/evaluation labels. |
| `predictor-service.ts` | `createPredictorService(...).predict` | One bounded pinned invocation, current authority checks and fallback-ready candidate/denial results. |

All modules above live under `src/server/predictor/` and are server-only. They
reuse [fixture evidence](fixture-evidence.md), the shared regulation market
domain and [research/AI cost control](research-cost-control.md). Permission and
artifact verifiers are trusted synchronous server code; asynchronous approvals
do not authorize work. Source text and model output cannot supply those verifiers.

## Immutable model identity and pins

`createModelVersion(configuration)` validates the complete configuration and
creates equal SHA-256 `id` and `hash` values. Configuration includes:

- Provider, model, exact provider model version, reviewed contract version and
  its evidence reference.
- Prompt/schema versions, nullable training/validation/calibration/final-test
  windows, and explicit calibration/evaluation configuration.
- Output timestamp basis, maximum age and approved unknown-generation/update
  behavior.
- Maximum input/output bytes, source/fact counts, reason/uncertainty lengths,
  references per explanation item and serialized reference length.

Any changed setting produces a new identity. Applicable known windows must be
chronological and non-overlapping. A null provider training window remains
unknown. Before prompt preparation and output acceptance, every known window
must end at or before the fixture evidence cutoff; later model or evaluation
information cannot authorize a historical prediction.

`createModelRegistry({ store, authority, maxPins, verifyPriorPin? })` registers
authorized immutable versions and pins explicit lowercase SHA-256
`invocationId`, `jobId` and `modelVersionId` values. The invocation corresponds
to the cost attempt identity. A conflicting invocation/job model is rejected,
including competing pins that overlap while storage is awaited. Pin capacity
is an explicit bounded configuration.

Pins are local to the registry process. On restart, an existing owning job must
restore its original pin through trusted `verifyPriorPin` evidence. A valid hash
alone does not prove ownership. Durable job orchestration and retry lifecycles
belong to later features; callers must not invent a new job identity to reset
allowances or silently select a new model during retry.

Migration `20261008232332_ai_predictor_model_registry` adds the InnoDB
`ModelVersion` table. The application role needs `SELECT` and `INSERT` on that
table; model versions require no application `UPDATE` or `DELETE` privilege.
Native projections, chronological checks, binary identities, sealed JSON and
strict read validation detect inconsistent records. Identical concurrent saves
return the same immutable configuration. Old versions remain readable when a
new version is registered. Configuration persistence does not establish model
quality or approve an evaluation artifact.

## Evidence preparation and transmission

The currently supported versions are:

| Contract | Version |
| --- | --- |
| Primary instructions | `regulation-ai-prompt-v1` |
| Structured model output | `regulation-ai-output-v1` |
| Shared market rules | `regulation-markets-v1` |

Prepare the input with:

```ts
const prompt = buildPredictorPrompt({
  snapshot,
  model,
  authority: {
    evidence: evidenceAuthority,
    verifyModel,
    verifyTransmission,
  },
});
```

The evidence authority freshly approves the exact canonical fixture/version,
internal and provider home/away IDs, cutoff, source rights, source freshness,
reuse/retention and evidence policy. The builder reparses the content hashes and
rederives facts, missingness and coverage from original source claims. A
self-rehashed object cannot manufacture sufficient coverage, new facts or
source/claim bindings. An empty or insufficient snapshot cannot become primary
input. Missing news alone is permitted when the approved evidence minimum is
met, retaining `Limited news coverage`; absent injuries remain unknown.

`verifyTransmission(source, context, model)` separately verifies permission to
send each bounded source summary to the selected AI provider/model. Permission
to retain a summary is not permission to disclose it to a third-party model.
Trusted proof must cover the actual source/license, provider/model, purpose and
permitted extracted content. Current approvals are checked again after input
serialization and before every dispatchable use.

The returned object contains constant `instructions`, a separate serialized
`inputJson`, the strict provider-neutral `schema`, supplied source/fact IDs,
versions and serialized byte count. The input includes normalized facts, genuine
reference tuples, safe short publisher/title/link attribution, original source
clocks, missing/conflict/rumor/unknown flags and exact fixture/model/evidence
identity. It contains no API-Football prediction votes, candidate probability
groups, full articles, credentials or permission-verifier functions.

Untrusted article text, titles and claim strings remain JSON data. They cannot
change the constant instructions, invoke tools, fetch URLs, reveal credentials
or execute code. The instructions require unknown facts to stay unknown,
forbid invented numerical news adjustments, distinguish verbal confidence from
event probability, and request no internal reasoning. No tools are supplied by
this prompt contract. Do not publish or log the prompt/input body.

The builder rejects oversized sources, facts, references or serialized
`{ instructions, inputJson, schema }`; it does not truncate facts or citations.
The actual selected adapter must also enforce the complete provider request
envelope, tokenizer and output limits under its reviewed contract. Provider
format overhead is not implicitly free input.

`assertPreparedPredictorPrompt(prompt, snapshot, model, authority?)` requires the
original deeply frozen builder object, its exact evidence/model binding and
current approvals. A spread copy, reconstructed object or structured clone is
not prepared. When an authority is supplied, its identity must match the
original preparation authority. This prevents a caller-created prompt from
replacing worker instructions before a paid attempt.

## Structured response and candidate validation

The model-authored JSON repeats the exact fixture UUID/version, external fixture
ID, internal/provider home and away IDs, nullable actual cycle/run IDs, evidence
hash, cutoff, model version ID and schema version. Fixture version is a decimal
string; instants are UTC epoch milliseconds. No model-authored generation or
retrieval timestamp is accepted.

`groups` accepts the three primary families, each complete or explicit null:

| Family | Required outcomes | Additional metadata |
| --- | --- | --- |
| `match-result` | `home-win`, `draw`, `away-win` | Regulation including stoppage time. |
| `total-goals` | `over-2.5`, `under-2.5` | Regulation including stoppage time; exact line `2.5`. |
| `both-teams-to-score` | `yes`, `no` | Regulation including stoppage time. |

Server code assigns source `ai`. The shared 005 validator requires finite
probabilities strictly between zero and one, complete groups, the approved sum
tolerance `0.001` and cross-market consistency tolerance `0.002`. It derives
double chance only from valid match-result probabilities. Missing complements,
odds conversions, source mixing and arbitrary family preferences are not
invented. Invalid/missing families retain structured shared-domain reasons;
valid independent families remain usable. An identity, timing, evidence,
citation or explanation failure invalidates the candidate globally.

The response requires two to four distinct concise plain-text reasons and one
key uncertainty. Each reference is:

```ts
{ sourceId, factId, claimId, subjectTeamId }
```

Every tuple must resolve to the exact original source claim and fact variant
for the stated team. Reasons require at least one genuine reference. An
uncertainty may omit references only when actual missingness exists and its
semantic grounding is independently approved. Duplicate references, invented
IDs, wrong-team/cross-variant links, URLs/markup in explanation text and
configured length/count overruns are rejected. Public attribution is copied
from the immutable source record rather than trusting model-created links.

`verifyExplanation(item, snapshot, model, kind)` must independently establish
that the plain explanation is supported by the cited evidence or actual
missingness. Genuine IDs alone cannot prove semantic support: a model can cite
a real injury report while making an unrelated assertion. The trusted grounding
verifier is a required acceptance boundary, not a permissive production default.

`generatedAt`, `retrievedAt`, nullable `providerUpdatedAt` and their evidence
reference belong to a separate reviewed transport envelope. `verifyTransport`
binds those clocks to the actual selected contract and invocation. Output
retrieval must follow the analysis time, generation cannot follow retrieval,
future clocks are rejected, and the approved age/basis/unknown-time policy must
pass. Unknown clocks retain flags; neither reuse nor provider success restamps
the original evidence or establishes freshness. Fixture evidence clocks,
generation clocks and provider retrieval/update clocks remain distinct.

## Calibration and provisional estimates

`applyPredictorCalibration(validatedOutput, options)` accepts only the original
output of the validator. A copied object cannot bypass validation. Explicit
`kind: "none"` preserves accepted probabilities and requires the approved
no-calibration policy; it cannot silently run a supplied transform.

An evaluated transform must match the exact model identity, calibration
version/method, artifact evidence, evaluation reference and approved families.
`verifyTransform` approves a locally registered synchronous implementation.
The hook receives family probabilities and the pinned model configuration; it
has no implicit research or provider request. Each transformed group passes
shared probability/consistency checks again. Failed transforms leave affected
families unavailable instead of returning an unvalidated estimate. Previously
invalid families cannot be filled by calibration.

Calibration status records applied families and artifact references. Evaluation
status is separately verified and retained. An unevaluated estimate remains
`provisional: true`, including a successful provider call or persisted model
configuration. A calibration hook or synthetic passing test does not establish
out-of-time forecast quality. Actual artifact evaluation and quality gates
remain later work and must cover the exact configuration before making claims.

## Paid dispatch and fallback opportunity

`createPrimaryAiAdapter` requires the runtime policy, strict evidence verifier,
model authority, existing AI cost gateway, reviewed provider binding and
`verifyBinding`. A null binding returns `unconfigured` before provider I/O.
The actual provider, model, exact provider model version, contract, runtime
selection, pin, fixture scope and cost attempt/job identity must match. Test or
disabled operation scope cannot authorize actual paid calls.

One `execute` permits one reviewed provider attempt after a durable maximum
reservation and single-use dispatch claim. Retries require their own accounted
attempt and retain the same job/model identity. Input/output token allowances,
request count, billed dimensions, timeout, separate AI cap and per-job
allocation belong to the existing verified cost policy; no prices, free units
or provider tokenizer are inferred here.

The shared `dispatchCostProvider` final guard rechecks authorization inside the
provider callback. It counts synchronous approval and credential-read latency
against the launch window, transport allowance and any tighter workflow
deadline. It combines abort signals and rejects clock regression or expired
work before provider I/O. The provider receives only the remaining approved
transport time. A concrete adapter must honor the abort signal, byte/token
bounds, exact structured-output contract and at most one outbound attempt;
implicit tool calls, research, retries or model changes require separately
reviewed and accounted operations.

The provider request should send the prepared instructions/input/schema only.
The internal snapshot, pin and model are also available to trusted binding code
for scope and metadata checks; do not blindly transmit that internal envelope.
Usage receipts are verified and reconciled before returning output. Invalid
output remains charged. Unknown usage and late/failed transport retain
conservative liability, and late bookkeeping cannot make an expired result
usable or authorize another dispatch.

An explicit positive fallback time reserve belongs to the job. Primary work
must stop before consuming that reserve. Budget exhaustion, timeout, missing
evidence, invalid output and absent provider configuration retain distinct safe
fallback-ready reasons. The predictor does not call API-Football fallback or
publish a partial revision; later orchestration owns fallback under its shared
football quota and remaining deadline.

## One invocation through the service

`createPredictorService` receives the registry, actual adapter bridge, trusted
model/evidence authorities, invocation ownership and transmission verifiers,
transport/semantic grounding verification, optional evaluated transform,
explicit inflight capacity and an optional deterministic clock. Supply:

```ts
const result = await service.predict({
  pin,
  snapshot,
  job,
  request,
  maxElapsedMs,
});
```

`verifyInvocation` must bind the original owning job/pin to the exact fixture,
canonical version and approved cost request. The service resolves that fixed
model, prepares evidence, dispatches through the adapter, validates output and
applies only the approved calibration policy. Source retention is rechecked
against the current service clock as well as the snapshot analysis time.

The single workflow deadline covers registry lookup, prompt preparation,
provider work, response validation and calibration. It is bounded by the
explicit workflow allowance, the paid job deadline after fallback reserve and
the fixture kickoff. Authorization latency counts toward the same deadline;
absolute clock regression, aborts and late results deny the expired candidate.
The caller still owns publication cutoff/observed-play eligibility and verifies
it through the canonical authority; this feature implements no publication lock.

Identical concurrent requests for the same invocation share local work. A
different fingerprint for that invocation returns `conflicting-invocation`,
and exhausted configured inflight capacity returns `capacity-exhausted`.
There is no durable prediction-result cache or durable job runner here. The
cost ledger prevents reusing a completed paid attempt as a new free dispatch.

Success returns `status: "candidate"` with the original pin, calibrated output,
one known dispatch and model/evidence/source/time provenance. A denial preserves
its distinct safe reason, confirmed dispatch lower bound and whether the final
request count is unknown. A provider operation still pending when the overall
workflow expires cannot be declared free or unused. When every primary family
is unavailable, the service returns `invalid-output` with the shared market
issues. When independent families survive, their structured unavailable-family
reasons remain alongside the valid candidate for later fallback.

## Local acceptance and remaining live checks

Use pinned Node `24.18.1` and npm `11.16.0`. `npm run check` includes the
synthetic predictor tests with the repository generation, lint, type and build
checks. `npm run test:predictor` exercises append-only model registry invariants
against a genuine isolated MySQL 8.4 server. Set `MYSQL_TEST_SERVER_BINARY` to
the installed genuine server binary when required. The helper owns a fresh
loopback instance and verifies ownership before mutation or cleanup; application
and migration privileges remain separate.

Offline tests cover hostile evidence, wrong identities, future availability,
fabricated facts/citations, incomplete/nonfinite/inconsistent probabilities,
pin conflicts, bounds, deadline/cost denials and calibration authority. MySQL
tests exercise immutable replay, independent clients, native constraints and
least-privilege behavior. These tests make no AI or research provider call and
establish no subscription, rights, model quality or production readiness.

Before a live trial, select and implement the actual adapter using current
official structured-output and rate documentation; approve the exact model,
calibration/evaluation configuration, source transmission rights and all
account/budget/bounds/freshness records. Run a bounded accounted integration
smoke check only when those inputs and credentials exist. Record actual results
in [development progress](development-progress.md); leave live acceptance and
012's tracker checkbox pending until its required implementation and checks are
complete.
