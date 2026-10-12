# Score-distribution market expansion (053)

The approved expansion in `app-write-up.md` §4 covers the provider's goal-based
markets. This implementation is additive: existing four-family keys, stored
candidate JSON, archived revisions and locks retain their original semantics.
It does not make a market available merely because its name appears in an odds
catalogue.

## Distribution and event rules

`domain/score-distribution.ts` validates a versioned joint distribution whose
states contain regulation full-time and half-time home/away goals and probability.
Both half-time values may be unknown. Half-time counts cannot exceed the same
path's full-time counts. Duplicate paths, invalid probabilities, unsupported
fields and incorrect mass fail validation. At most 512 paths with scores up to
30 are accepted; actual settlement scores retain the provider's 1000-goal bound.
Observed lines and exact-score definitions use that result bound rather than
the predictor's support cap. Representational overflow within the validated
mass tolerance is bounded at probability one without redistributing any mass.

An explicit `unrepresentedProbability` retains missing tail mass. The engine
never drops that mass or renormalizes it. A distribution with unrepresented mass
does not produce a complete derived group. Missing joint half-time information
prevents HT/FT, first-half and second-half derivation; independent marginal
distributions are not substituted.

`score-distribution-markets.ts` evaluates source-owned rules against those paths.
`goal-market-definitions.ts` supplies reusable definitions for result, double
chance, any supported goal line, team totals, all three periods, BTTS, odd/even,
clean sheet, win to nil, European and Asian handicaps, HT/FT, exact scores and
explicit combinations. Canonical keys include period, team and line. Each
selection retains its own event rule and outcome probabilities. Partition groups
are checked per path, so aggregate overlaps cannot conceal missing outcomes.

Asian integer and quarter lines preserve full win, half win, push, half loss and
full loss. Their selection probability describes a positive payout (full or
half win); push/partial masses remain separate. These outcomes require separate
performance treatment and must not be collapsed into legacy binary hit rates.

Provider mapping uses exact observed bet id, current catalogue name and selection
labels. No fuzzy name match, invented provider identity or other line's price
supplies a mapping. Templates are not an assertion that every possible line is
offered by a particular bookmaker or fixture.

## Predictor and publication

The existing v1 prompt/output remain valid. New pinned model versions can use
`regulation-ai-score-prompt-v2` with `regulation-ai-score-output-v2`. One existing
budgeted AI request returns the joint distribution and grounded explanations;
server code derives the four legacy probability groups from it. Identity,
evidence, source rights, citations, timestamps and input/output byte limits use
the existing checks. No request/token/cost allowance increases.

The v2 path currently accepts the explicit no-calibration configuration. Existing
family-level transforms cannot independently change its marginals while retaining
the original joint distribution. A future score-level calibration needs a
separately versioned and evaluated contract.

An optional reviewed `RefreshPlan.goalDefinitions` travels with the existing
durable refresh plan. A valid v2 result supplies `PublishRevisionInput.goalExtension`
as a sibling of the legacy candidate. `PublicationAuthority.verifyGoalExtension`
must authenticate the complete original model output and definitions; matching
four-family marginals alone does not prove the joint data's provenance.
The extension is written in the same transaction as its canonical revision,
before advancing the current pointer. It cannot retrofit an accepted old revision.

Default v1 plans omit extensions and do not access their new tables. The additive
migration and any extended settlement mode must be enabled together after
verification; this work does not apply production migrations or change live models.

## Remaining end-to-end acceptance

053 remains incomplete until the following integration is qualified:

- A complete stored provider catalogue and reviewed bet/line/period/selection
  mappings populate real definitions; unrecognized provider names remain unsupported.
- A registered v2 model, same approved spending allocations, source permissions
  and appropriate evaluation evidence permit actual score output. Synthetic tests
  establish contract behaviour only.
- Additive persistence, atomic publication, cutoff locks, correction chains and
  shared invalidation pass isolated database checks; production migration and
  worker capability settings agree.
- Separately verified half-time evidence reaches result persistence for half-based
  settlement. Missing evidence remains Pending.
- Public feed/detail/history contracts, dynamic filters, source labels and separate
  per-market performance reporting consume these sealed snapshots before new
  markets become visible.

Phase 054 adds non-goal market-implied distributions separately. Their source,
odds observation and statistic/event settlement evidence cannot be represented
as AI score forecasts.

## Result evidence and public read seam

An optional `verifyHalfTimeScore` adapter verifier binds the separate
`score.halftime` field to the same final fixture and first-half period. The value
must not exceed verified regulation goals. The lifecycle projection carries it
only when configured; the result synchronizer appends it to the sealed
`FixtureResult` body and content hash. Previously stored bodies keep the absent
field and their original hashes. A changed half-time score with identical
full-time goals creates a new result revision and invalidation event.

`extended-market-read.ts` supplies a disabled-by-default read seam for the
canonical visible revision. Available definitions retain their source label,
selected key, raw probability and matching settlement. Asian event probabilities
retain separate partial/push masses; normalized bookmaker probabilities have
their own basis. Publication quote history is not projected as a current price.
The existing four-family feed contract is unchanged until the wider public
catalogue/filter contract and active capability are qualified.

`extended-market-performance.ts` reads current extended settlement pointers only
when enabled, groups by source, canonical market key and rule version, and
reports all eight statuses separately. Only full correct/incorrect outcomes enter
its explicitly named binary denominator. Partial payouts, pushes, pending, void
and unavailable counts remain visible; model calibration is not asserted and
these rows never merge into the legacy headline rate.
