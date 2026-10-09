# Revision publication

Prompt [022](../dev-plan/022-revision-publication.md) implements the private
acceptance service for every AI/provider composition. It reuses immutable
[history](prediction-history.md), committed [selection](daily-selection.md),
stored evidence/model contracts and the [queue](durable-jobs.md). No worker,
provider call, route, schedule, final lock or cache is activated here.

## Entry and authority

Use `createRevisionPublicationService({ database, queue, policy, authority })`
from `src/server/predictions/publication-service.ts`, then
`publish(input, lease)`. `input` contains the complete resolved candidate,
evidence snapshot ID, accepted schedule version, generation-completion time,
original provider observation and a stable per-attempt key. Publication time is
chosen by MySQL, never supplied by a worker. Preserve the attempt key/input on
an uncertain response. A later unpublished retry may use a new attempt key;
an accepted refresh remains final across all attempts and composition changes.

`PublicationPolicy` requires an evidence reference, positive maximum
status/kickoff observation age, and explicit source freshness rules for AI and
API-Football. Each source rule declares age, clock basis and unknown generation/
update handling. The pinned model's own output timing also applies. When an
unknown clock is expressly allowed and selected as the basis, the original
retrieval time is used, with its existing unknown-time flag preserved. A missing
policy fails closed. There are no production time allowances or permissive
authority defaults.

Synchronous authority methods inspect trusted records prepared before entry:

- `authorize` enforces workload identity, owning refresh and applicable runtime
  operation approval. A production binding must use the existing runtime
  `publication` gate and trusted evidence verifier. Private shadow records must
  stay in their approved isolated target and cannot authorize public forecasts.
- `verifyPolicy` proves the actual approved source/status timing decisions.
- `verifyObservation` proves the provider response, fixture/cycle binding and
  original retrieval/update/start timestamps, including cache age.
- `verifyCandidate` proves original model pin/job ownership, evidence/source
  receipts, source rights, grounding and applicable model/evaluation approval.
  Restore the job's independently verified pin; candidate text cannot attest
  to its own provenance. 025 supplies this orchestration binding.

Exceptions, false results and mistakenly asynchronous verifiers deny new
acceptance. Revocation is checked again before committing an accepted/retained
decision. External calls must finish before database locks are held.

## Transaction and eligibility

The service uses the existing Read Committed canonical provider → fixture lock
boundary, then the owning queue job lock. Catalog imports, cycle closing and
schedule updates must use that same boundary/order. Do not acquire a queue job
lock first and then call publication. No arbitrary callback is retried.

Inside that transaction it verifies the sealed manifest/policy and immutable
membership/envelope/job link, original kickoff membership, canonical fixture/
teams, current active open cycle and accepted schedule version. Analysis must
follow manifest commit and cycle opening. Current kickoff must remain in both
the original window and today's seven-day EAT window. A newer canonical
observation cannot be overridden by older eligibility evidence. Both canonical
and observed status must be scheduled; unknown eligibility is refused.

`UTC_TIMESTAMP(3)` is sampled after locks and again after provisional writes.
Publication requires `publishedAt < cutoffAt`, independently of the future lock
job. A cutoff/freshness/ownership failure while writing rolls back the set,
four market rows, current reference, audit, fixture version, refresh result and
change event together. History storage now also uses database UTC by default;
its explicit clock option remains available to isolated history tests.

The service revalidates the full market/source contract, exact stored evidence
context/hash, model configuration, AI coverage/source attributions and provider
support receipts. Evidence/model readers expose their existing validated reads
inside this transaction. Source generation, retrieval and update timestamps,
unknown flags, evidence cutoff and workflow generation completion stay distinct.

Run `sequence` and cycle identity determine order. Once a newer accepted run
exists, an unpublished older run is skipped. The native prediction-set refresh
unique key still guarantees at most one set per run/fixture/cycle. A newer valid
fallback replaces older AI without comparing their percentages. Exactly four
market rows describe each replacement, including unavailable families.

Verified observed play, or play already in the canonical catalog, inserts an
append-only `PredictionPublicationBarrier` for the current cycle. Subsequent
scheduled responses cannot reopen eligibility. `storedPublicationBarrier` and
`revisionEligibleForSchedule` expose shared safety evidence/rules to 023/024.
The barrier records the first observed start, or original live retrieval time
when actual start is unknown. [023 cutoff locking](cutoff-locking.md) implements
final closure/locked revision selection and the immediate observed-play close
path; later actual-start/schedule corrections belong to 024. A refused
publication persists its safety barrier for the close path to consume.

## Refresh decisions and retries

`PredictionRefreshResult` records the attempt, request/candidate/policy hashes,
original observation, evidence reference, decision time, run sequence, fixture
version, outcome, reason and optional revision reference. It is append-only
and separate from forecast payloads. Published, retained-previous, unavailable
and eligibility-skipped decisions are supported. Pre-entry validation/authority
failures throw sanitized errors; 025 records its execution failures and costs.

If no family is valid, no set is created. Retain the same cycle's eligible
previous revision with its original timestamps and `updateDelayed: true`, or
return unavailable. Partial new revisions never inherit older families.
Operational decisions advance the fixture version without editing a forecast.

An accepted-key retry returns the original receipt and revision before checking
new eligibility or lease expiry, including after acknowledgement, closure or a
lost commit response. It does not move the reference back or increment a
version. Exact unpublished-attempt replay also returns its original result;
changed input for that attempt fails. Use `displayForFixture` to read the actual
current/locked/void projection, fixture version and latest ordered refresh
status in one Repeatable Read transaction. An old retry's returned revision is
an immutable receipt, not an instruction to restore the current pointer.

## Durable change events and permissions

`PredictionChangeEvent` is committed with each refresh decision. Its kind is
`revision-published`, `eligibility-closed` or `refresh-result`. A composite FK
binds the event's fixture/version to its exact result. Events are ordered by
monotonic fixture data version, which may have gaps from other fixture changes.
`changesForFixture(fixtureId, { afterVersion, limit })` provides bounded ascending
replay (maximum 100). `resultForAttempt(id)` resolves an immutable receipt.

[Cutoff locking](cutoff-locking.md) extends this same stream with cycle closure
and void events. Each event binds exactly one refresh result or cycle operation;
both use the existing per-fixture version cursor.

These are durable invalidation intents for 031; they require no cache/broker or
post-commit send for correctness. Consumers should maintain per-fixture cursors
and acknowledge only delivered invalidations. There is no global UUID/arrival-
time commit cursor. Uncached readers remain correct if a consumer is absent.

Additive migration `20261009134454_revision_publication` creates the three
InnoDB tables, binary identities, restrictive composite FKs, unique attempt/
event bindings and native shape checks. Application credentials need SELECT
and INSERT only on these new tables, plus the existing history/catalog/job
privileges and evidence/model reads. No UPDATE, DELETE or DDL is needed on the
new tables. Keep the existing separate migration credential.

Rollback disables the publication binding and retains all additive schema,
forecasts, barriers, results and events. Inspect actual schema/migration state
after failed DDL and repair forward; do not erase history or reset a target.

## Verification and live gates

Run `npm run test:publication`, affected history/selection/job/evidence/model
integration checks, and `npm run check`. The isolated MySQL harness verifies
real transactions, competing clients, native schema/grants, cutoff boundaries,
source validation, partial replacement, retention, crash/ambiguous response
recovery and races in both publication/closure orders. Provider responses,
policies, authorities and deterministic MySQL session clocks are synthetic.

OP-21 still needs trial-backed status age/conflict decisions. OP-07/14 need
approved source/evidence timing and unknown-clock rules. Existing provider,
rights, budgets, model/quality, hosting and identity gates also remain pending.
024–025 must complete schedule coordination and the refresh worker before
scheduled predictions can be enabled. Local results do not grant
live publication approval; actual checks are recorded in
[development progress](development-progress.md).
