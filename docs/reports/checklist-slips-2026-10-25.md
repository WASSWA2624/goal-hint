# Application checklist: slip generation and probability

Audit date: 25 October 2026 (Africa/Kampala). Status reflects the code after the
corrections below. Production availability is distinct from an implemented
algorithm exercised with synthetic fixtures. Priorities: P1 correctness or launch
dependency; P2 product completion; P3 optional improvement.

| Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- |
| Best Slips: daily generation with odds, joint probability and selection count | Partial | `src/domain/best-slips.ts`, `src/server/slips/best-slips.ts`, `src/components/slips/best-slips.tsx`; daily EAT range and explicit missing-model/odds states | Qualify and bind a calibrated joint model and approved public odds source. Current production binding intentionally has no model; automatic publication is also missing. | P1 |
| Rank Best Slips primarily by combined probability | Implemented | `bestSlipBuilder` ranks accepted joint estimates first; regression test has a two-leg slip outrank shorter slips | No ranking correction remains. Production estimates still require model qualification. | P1 |
| Display average probability separately from combined probability and odds | Implemented | `src/components/slips/slip-table.tsx` now always shows the mean and adds whole-slip probability separately when supplied | None. Custom slips without a qualified joint estimate continue to show only their mean. | P2 |
| Multiply probabilities only when independence is reasonable; account for correlations | Partial | `JointSlipModel` requires calibration/correlation evidence and current validity; `jointSlipProbability` rejects estimates outside marginal bounds; one fixture per slip | Build and validate the actual joint model using retained outcomes; metadata and mathematical bounds alone do not establish calibration. No independence fallback is used. | P1 |
| Optimize whole-slip probability within user-defined combined odds targets | Partial | Algorithm implemented: `customSlipBuilder` in `src/domain/joint-slips.ts` ranks custom builds by a qualified joint estimate through the shared Best Slips `jointSlipRanking`, searches every selection count and batches only the final retained set. `docs/slip-builder.md` states exact optimality when `searchLimited` is false and the budgets that void the claim otherwise; synthetic oracles in `tests/joint-slips.test.mjs`. | Production stays average-ranked until S03/P01 qualifies and binds a model (`boundJointSlipModel` returns null). Expose Best Slips targets only if they must be user editable. | P1 |
| Do not assume fewer selections always means safer | Partial | Algorithm implemented: with a qualified model, selection count only breaks equal estimates; a regression test has a three-leg slip outrank a two-leg slip. Without a model the average order remains and its note now says it is not a whole-slip chance of winning. | Bind a qualified whole-slip estimator (S03/P01). | P1 |
| Support minimum/maximum odds, probability, selections and requested count | Partial | Whole-slip `jointMin`/`jointMax` bounds are implemented and apply only to a current qualified estimate; without one the service returns `estimate-unavailable` before reads, and the fields stay hidden. Default bounds are omitted from canonical criteria. | Production stays Partial until S03/P01 binds a model. | P2 |
| Optional overlap in custom builder; diversified Best Slips by default | Implemented | Custom `reuse` defaults false and may be enabled; `bestSlipCriteria` now also uses false. Tests assert all daily fixture IDs are disjoint and overlap remains opt-in. | None. | P1 |
| Return fewer slips with clear explanation when filters cannot be satisfied | Implemented | Compatible-batch search returns feasible slips; `BestSlips` displays `bestSlips.partial`; builder distinguishes no qualifying/no combinations/limited search. Scarcity regression test returns three slips from six fixtures. | None. | P2 |
| Preserve published slips and original predictions for audit | Partial | `src/server/slips/saved-slips.ts` persists server-created custom snapshots and immutable upserts; prediction revisions are retained. Best Slips service explicitly recomputes current cohort. | Add automatic dated Best Slips publication snapshots, including original joint probability/model evidence and all later outcomes; expose complete paginated history. | P1 |
| Non-subscribers can see premium availability without active picks, odds or probabilities | Implemented | `bestSlipViews`, `gateBestSlips` and locked `BestSlips` cards now reveal rank/count only. Final entitlement recheck strips probability on expiry. Raw HTML/flight/API regression checks cover this boundary. | None in Best Slips; other public prediction projections are audited separately. | P1 |

Changes in this audit: diversified daily slips; removed active whole-slip
probability from public DTOs and locked previews; displayed mean and joint
probability independently for entitled viewers; accepted floating-point rounding
noise at mathematical joint-probability bounds without accepting material
violations. No synthetic forecasts or prices were enabled in production.

Validation: `node --conditions=react-server --test tests/best-slips.test.mjs
tests/slip-builder.test.mjs` passed all 71 tests. The isolated paywall fixture
compiled successfully on Node 24.18.1. All nine viewer states passed 661 raw
HTML/React-flight/API/access checks, including the new probability boundary and
separate entitled summaries. The script then stopped at an outdated `/admin`
HTTP-200 assertion. The production guard correctly returned 307 to account
login; the harness now asserts that redirect and retains no-store/noindex
checks. All three private-route checks passed separately against the same
built fixture. Desktop (1440px) and mobile (390px) browser inspection confirmed
the two summaries, locked previews and no horizontal overflow. Project-wide
validation is recorded in the combined checklist audit. The fixture server was
stopped after verification.
