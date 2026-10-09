# Schedule lifecycle

Prompt 024 provides one private ingestion service for normalized API-Football
schedule, status, actual-start and result observations. Polling and settlement
remain with 026–027. No provider request, public route or hosted binding is added.

## Binding and evidence

Construct `createScheduleLifecycleService({ database, cutoff, policy, authority })`
with the existing cutoff service and queue on the same database. Call
`observe({ fixtureId, fixture, actualStartedAt, actor, evidenceRef })` with a
normalized fixture, separately attributable actual-start proof or null, and
the original source clocks. Do not derive actual start from scheduled kickoff,
elapsed minutes, scores or disappearance from a response. A live/final status
proves play by its retrieval time when an exact start is unknown.

Bind `lifecycle.coordinateFixtureMutation` to `createFootballCatalogStore` so
daily imports use the same operation. The coordinator sees original normalized
observations, including unchanged and stale rows; it explicitly applies or retains
the canonical row. An import without a coordinator refuses kickoff/status changes
on an active prediction cycle. Initial catalog identity creation stays with 009.
Empty or incomplete provider responses never synthesize terminal observations.

Supply an explicit `LifecyclePolicy`: approved raw-provider-status to normalized
status mappings, retrieval-and-provider-update ordering, the unknown-update choice
(`use-retrieval` or `hold`) and `newer-verified-observation` conflict resolution.
There are no production mappings or evidence approvals silently enabled here.
Authority must synchronously authorize the workload, verify the policy and verify
the complete observation, including any regulation-score/start claims and retention
permission. False, throwing, truthy nonboolean or asynchronous approvals fail closed.
Verification performs no network I/O under a transaction; authority is rechecked
before commit. Production must enforce the existing runtime and rights/budget gates.

Canonical external fixture, home/away team, competition and season mappings must
all match. Unresolved identity refuses the operation instead of creating identities
or guessing team assignments. The retained projection contains normalized schedule,
status and score evidence, source endpoint/clocks, actor and evidence reference;
it excludes raw payloads, media, credentials and unrelated provider fields.

## Transitions

All decisions acquire the existing provider → fixture locks shared with
publication and cutoff locking. SQL `UTC_TIMESTAMP(3)` determines processing time.

| Observation | Effect |
| --- | --- |
| Ordinary scheduled kickoff adjustment | Append a schedule version on the same cycle and schedule its stable versioned cutoff job. No prediction refresh job or manifest entry is created. |
| Revised cutoff already passed, or old cutoff reached before a delay | Close in the same transaction using accepted publication/schedule history. Later delays cannot erase an elapsed deadline. |
| Verified early play | Persist an irreversible publication barrier and actual-start evidence; close immediately using the earlier safety boundary. |
| Formal postponement before play | Void the old open/closed cycle with `formal-postponement`, retaining its last forecast, any locked reference and original close/lock times. |
| Scheduled observation after formal postponement | Prepare/update the unconsumed selection handoff. The next eligible daily run alone creates and activates another ordinal under the same fixture. |
| Correction proves locked publication was at/after corrected cutoff or actual start | Void with `locked-cutoff-invalidated`; retain exactly the same locked revision, payload and original timestamps. Never select another forecast. |
| Canceled, abandoned or administratively awarded | Void with the explicit status reason; retain normalized result evidence for later settlement. |
| Outside the rolling EAT forward window | Stop prediction-refresh eligibility and retain canonical/result tracking and observation history. |

Closed/void cycles never reopen. A later schedule can be appended for audit without
changing original immutable closure receipts. A void before any lock preserves the
current forecast for historical reads and does not manufacture a locked forecast.
Old cutoff deliveries acknowledge an established void without trying to reopen it.

The rescheduling handoff is a mutable eligibility projection over immutable
observations. Its previous-cycle version and kickoff must match, and its
`eligibleAfter` must precede the next run's original midnight boundary. Repeated
unchanged polls do not move this boundary. Corrections update an unconsumed handoff;
consumed inputs never create another cycle. Existing committed manifests remain
sealed. Repeated postponements can produce later ordinals only through successive
eligible daily selections; canonical fixture/team IDs and headline identity remain
unchanged. Public history uses the existing coherent cycle/revision readers.

## Ordering and unresolved evidence

Exact input replay returns its sealed original receipt even after commit-response
loss or a later transition. New retrievals of unchanged content update the cursor
without duplicating schedule versions, events or cutoff jobs. Older retrievals,
or older known provider updates, remain stored as stale evidence and cannot replace
newer canonical fields. Independently verified earlier actual-start proof still
narrows safety and can void an existing lock even in a stale observation.

Equal-time contradictory content, unknown/unapproved mappings, missing scheduled
kickoffs, held unknown updates, play-to-scheduled/postponed regressions and terminal
status contradictions are explicit conflicts. Keep the accepted canonical fields,
record the conflicting observation and issue, and block selection/publication and
refresh eligibility. Do not infer an alternative kickoff. A newer verified and
unambiguous observation can resolve the issue under the configured policy. Play
evidence and existing locks remain irreversible after resolution. Same-time
conflicts remain held rather than choosing a winner by completion order.

`refreshEligibility(fixtureId)` reports stored status/cycle/conflict/window/cutoff
eligibility with `trackResult: true`; 025 must use this before spending prediction
resources. Publication independently rechecks the same stored conflict projection
under its transaction. Lifecycle handling never calls research/AI/fallback.

## Persistence and grants

Migration `20261009150750_schedule_lifecycle` adds InnoDB/binary-identity tables:

- `FixtureLifecycleObservation`: sealed append-only receipts, normalized evidence,
  original source clocks, processing time, policy hash and outcome. Application
  access is SELECT/INSERT only; no UPDATE/DELETE.
- `FixtureLifecycleState`: cursor, earliest actual-start proof and unresolved issue.
  The lifecycle writer needs SELECT/INSERT/UPDATE. Selection/publication readers
  need SELECT only. Rebuild/repair from retained observations, never erase evidence.
- `SelectionCycleEligibility.eligibleAfter`: next-daily-run barrier. Selection
  keeps UPDATE only on `consumedRunId`. The private lifecycle writer additionally
  needs column-scoped UPDATE on `previousVersion`, `kickoffAt`, `state`, `actor`,
  `evidenceRef`, `recordedAt`, `eligibleAfter` for unconsumed reschedule projections.

Native checks validate evidence shape/clocks and change-event ownership. The
shared `PredictionChangeEvent` stream now binds exactly one refresh result,
cycle operation or lifecycle receipt through composite fixture/version FKs.
Material schedule/status/start/result/issue changes increment the fixture version
and append `schedule-lifecycle` or `lifecycle-conflict`; close/void operations retain
their own durable events. No global UUID/time ordering is assumed. Existing
`changesForFixture` supplies the per-fixture cursor for 031 cache consumers.

Canonical changes, schedule/audit history, void/close, cutoff enqueue, handoff,
cursor, receipt and events commit atomically. An enqueue/authority failure rolls
everything back. Queue `enqueueInTransaction` is a storage primitive used only
inside the caller's rollback-capable domain transaction.

## Verification and handoff

Run `npm run test:lifecycle` with `MYSQL_TEST_SERVER_BINARY` pointing to genuine
MySQL, plus affected catalog/history/selection/publication/cutoff/job regressions
and repository checks. Tests use owned throwaway targets, competing clients,
session clocks and synthetic approvals/normalized responses; no provider calls.
Actual results appear in [development progress](development-progress.md).

Live mapping/conflict/retention approval, provider rights, budgets, model quality,
workload and hosting remain gates. 025 owns refresh orchestration, 026 polling,
027 settlement, 031 cache consumption and 043 watchdog discovery. Rollback disables
bindings and preserves additive schema and immutable forecasts/evidence/events;
inspect failed DDL state and repair forward. No visitor interface changes.
