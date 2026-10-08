# Validated provider fallback

Prompt [013](../dev-plan/013-provider-fallback.md) resolves one eligible refresh
from the [primary AI predictor](ai-predictor.md) and the existing
[API-Football adapter](api-football-adapter.md). It produces a complete candidate
for later publication. It does not save revisions, lock forecasts, select an old
published prediction or perform provider work from public reads.

The local contracts are separate from live provider qualification. The committed
[008 report](reports/provider-trial-008.md) records zero real observations and
zero dispatched requests; every fallback coverage, pre-match, freshness and
rights requirement is untested. OP-07, OP-08 and OP-11 in the
[decision register](implementation-decisions.md) still require source-specific
freshness, unknown-time handling, permitted retention/reuse and job allowances.
The actual AI provider/model and calibration selection remain pending under
OP-15. Synthetic scenarios cannot resolve these operating choices or qualify an
account, source mapping or permission.

## Market support and source evidence

Official API-Sports material was reviewed on **9 October 2026 EAT**:

- The [official endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
  describes `/predictions?fixture=ID`, home/draw/away percentages and separate
  winner, advice, win-or-draw, under/over and predicted-goal fields. It describes
  hourly updates; that cadence supplies no timestamp for a particular forecast.
- The [predictions article](https://www.api-football.com/news/post/predictions-endpoint)
  describes a statistical forecast using team data rather than bookmaker odds.
  Its historical performance figures do not establish current calibration or
  support a Goal Hint accuracy claim.
- The [direct v3 reference](https://www.api-football.com/documentation-v3#tag/Predictions)
  remains the endpoint reference. Its interactive schema was not readable in
  this review; no additional probability field is inferred from it.

| Family | Accepted basis | Current limitation |
| --- | --- | --- |
| Match result | Complete `predictions.percent.home`, `.draw`, `.away`, converted explicitly from reported 0–100 percentages and checked by the shared market validator. | Requires independently verified regulation-period mapping, exact fixture/home-away correlation, pre-match availability and an approved freshness policy. The trial has not qualified these. |
| Double chance | Derived by the shared validator from the same accepted match-result distribution. | Cannot be supplied independently or assembled from different sources. |
| Total goals | Explicit complementary over/under 2.5 probabilities with the exact line. | The current normalized prediction contract supplies a pick/threshold, not that distribution; unavailable. |
| Both teams to score | Explicit complete probabilities or a documented, independently validated derivation. | Neither is recorded in the trial or normalized contract; unavailable. |
| Exact score | Optional scope approval and a separately validated score distribution. | Disabled; no exact-score candidate is produced. |

Winner names, `win_or_draw`, advice, goal-threshold strings, comparison metrics
and odds cannot manufacture missing probabilities. Values are not averaged,
renormalized or chosen because a provider percentage is larger. A documented
endpoint or coverage flag does not establish usable probability coverage for an
individual fixture.

## Private caller and authority boundaries

The server-only [fallback contract](../src/server/fallback/fallback-contract.ts)
binds the canonical fixture/version, cycle, run, home/away teams, kickoff,
evidence cutoff, model pin when available, owning job and evidence hash. Every source
must belong to that same refresh. API-Football prediction rows do not themselves
supply a fixture ID; the request/page provenance and exact ordered team IDs must
establish the association.

The caller must independently verify the current canonical fixture/cycle,
eligible refresh and applicable permissions. A hash, reference string, matching
IDs or a constant approval callback is not proof of source authenticity. Trusted
authorities must validate the actual records, source mapping, scope and times:

| Proof | Responsibility |
| --- | --- |
| Refresh/context | Current canonical identity, kickoff, cycle/run and owning job/invocation. |
| AI result | Original accepted calibrated output, pinned model, evidence provenance and current permitted reuse. |
| Provider result | Actual request/response provenance, regulation mapping, supported family, approved freshness and permitted use. |
| Policy | Independently approved numeric age bounds, treatment of unknown generation/update times, attribution and retention rules. |
| Quota/account | Existing shared gateway/limiter evidence, authorized account and applicable operation allowance. |

Authority callbacks are synchronous. Exceptions, asynchronous returns and revoked
or absent proof must deny the affected operation. Check permissions and
eligibility before I/O, before cached reuse and before returning a candidate.
Secrets remain inside the existing private adapter; this feature adds no public
provider endpoint or live-credential command.

`createProviderFallbackAdapter` in
[`fallback-adapter.ts`](../src/server/fallback/fallback-adapter.ts) accepts the
existing football adapter, canonical catalogue reader, approved
`ProviderFallbackPolicy`, trusted authority, clock and explicit `maxJobs` bound.
Its `collect` method accepts the context, job ID, requested source groups and
remaining football bounds. The policy separately names fixture/prediction age
bounds and unknown-update treatment, `unknownGenerationTime` (`reject` or
`allow-flagged`), regulation mapping and permitted real attribution URL.

`createFallbackService` in
[`fallback-service.ts`](../src/server/fallback/fallback-service.ts) accepts that
collector, refresh authority, owning-request verifier, clock and explicit
`maxInflight` bound. Its `resolve` method accepts a request ID, expected context,
original AI result, remaining football bounds or `null`, and `maxElapsedMs`.
`null` bounds leave fallback unconfigured. A denied AI attempt can have a null
model pin; it still requires independently verified ownership of its original
attempt/job and context. A valid AI candidate requires the exact model pin.
Keep the approved owning-job bounds stable across accesses. The service narrows
each call through its workflow deadline; a shorter per-call limit must not
replace the original job deadline or renew the job's request allowance.

## Time, cache and dispatch

Use the current canonical kickoff to require `now < kickoff - 5 minutes` for an
eligible refresh. Independently verified observed play can close eligibility
earlier. This service's preflight does not replace the publication transaction's
later cutoff, cycle/status and run-order checks.

Pass an explicit remaining request/time allowance to the existing football
adapter and shared limiter. Quota waits, retries and provider work must fit the
remaining deadline. An AI timeout or exhausted AI budget authorizes no extra
football capacity. A missing allowance or freshness choice is unresolved.

Provider prediction reuse belongs to the same job-scoped structured-response
cache used by prompt 007. Repeated access preserves the original request and
source provenance; a cache hit does not renew retrieval, generation or update
times. Recheck freshness and permitted retention on every reuse. Separate jobs,
different fixture/cycle context and changed policies cannot silently share a
fallback result. Uncertain network attempts retain the existing limiter's
conservative accounting.

Store `generatedAt`, `retrievedAt` and `providerUpdatedAt` separately. The current
direct normalized contract has no verified per-record generation/update time,
so those source times remain `null`. Hourly update guidance, kickoff, retrieval,
HTTP success and a cache hit cannot fill them. The current contract requires
`unknownGenerationTime: "allow-flagged"` to permit an attempt; `reject` denies
before paid dispatch. A bounded retrieval-only observation additionally requires
explicit `unknownUpdateTime: "retrieval-only"`; `reject` rejects an absent update.
Both unknowns stay flagged in the candidate. Reject
future times, clock regressions, expired source/retrieval ages and expired
reuse rights. No default age or unknown-time acceptance is supplied.

## Candidate resolution

Retain every valid AI source group. Attempt fallback for missing or invalid
families, or AI failure, timeout, insufficient evidence or exhausted budget,
while current eligibility, permissions, time and quota permit it. Missing news
alone does not force fallback when the evidence threshold is satisfied.

Recheck AI age using its original pinned `outputTiming` policy. A previously
validated AI forecast that has expired cannot survive because its probabilities
are still structurally valid; fallback receives its missing groups and the audit
records `invalid-timing`. Verification callbacks cannot extend source age or
renew generation time. Final checks cover both selected AI and provider times
after those callbacks.
If one source expires during final verification, one bounded recomposition drops
its groups and preserves still-valid groups from the other source. It performs
no additional provider request and keeps original timestamps. A further expiry
or exhausted complete refresh deadline prevents a late candidate from returning.

Match result and derived double chance form one source group: valid AI result
probabilities retain both families together; otherwise a complete validated
provider result supplies both. Home, draw and away values never mix between
sources. The [shared market rules](markets.md) validate the combined snapshot,
preserve valid AI ahead of conflicting fallback and omit contradictory fallback
groups with auditable reasons. Same-source contradictory distributions remain
subject to the same validator.

The result contains all four launch families as available or explicitly
unavailable. Available families retain the selected pick, full unrounded
distribution, source, fallback reason when applicable, source timestamps,
unknown-time flags and provenance. A partial result does not inherit absent
families from an older revision.

When no family survives, return `retain-previous-or-unavailable`. Later
publication logic must decide whether an eligible previous revision can be
retained with its original age or the fixture becomes unavailable. This signal
does not mutate history, select a previous prediction or publish an empty
replacement.

Fallback explanations describe API-Football's actual statistical basis and
supported probabilities concisely. Retain unknown source-age limitations.
When AI groups are used, preserve their accepted evidence-grounded reasons and
key uncertainty, with links drawn from the actual cited source references. Mixed
output may add a provider-basis reason within the four-reason bound.
Expose a real official source link only when the approved policy permits that
attribution. No fixture-specific public URL is invented, and credentialed API
URLs, raw provider advice, prompts, internal reasoning and worker logs are not
public explanation content.

## Verification and live qualification

Local scenario tests must exercise AI priority, every fallback trigger,
partial/absent groups, incorrect fixture context, incomplete distributions,
mixed-source conflicts, quota/time bounds, stale/future/unknown source times,
revoked permissions and repeated same-job reuse with original timestamps.
Record actual commands and counts in [development progress](development-progress.md).

For the service chain's local scenarios, use the pinned Node.js 24.18.1 runtime:

```sh
node --conditions=react-server --test tests/fallback-service.test.mjs
```

The helper composes actual AI validation/calibration, fallback resolution,
provider normalization and the quota gateway with synthetic HTTP and account
proofs. It checks request counts and original timestamps as well as the returned
markets. A thrown dependency or invalid fallback receipt preserves already valid
AI groups while recording the affected provider failure and uncertain request
accounting. Exhausting the complete refresh deadline still prevents a late
candidate from being returned.

These tests use synthetic responses and make no live provider requests. Before
live use, complete the bounded [008 trial](football-provider-trial.md), supply
the unresolved freshness/retention/rights and operating decisions, and verify
the actual account and regulation mapping. Local implementation and passing
scenarios do not mark those checks confirmed or establish launch readiness.
