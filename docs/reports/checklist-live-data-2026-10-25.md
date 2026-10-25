# Live match data and league reporting follow-up

25 October 2026, Africa/Kampala. This continues the
[checklist audit](app-checklist-2026-10-25.md) after the immutable archive and public
performance work.

The live runner now centrally collects normalized statistics and events into one
bounded current/final body per fixture occurrence. The detail page reads that
stored body through its existing refresh flow, separately from the original
pre-match forecast. Goals/cards/substitutions/VAR events and available corners,
possession, shots and passing statistics retain source clocks and explicit
missingness. Provider text is bounded and escaped; no score or settlement is
inferred from an event timeline.

| Checklist items | Implementation | Remaining work |
| --- | --- | --- |
| P03/D07 | Central statistics/events collector, public detail panel, zero/missing/unsupported/delayed/final states, original forecast preserved | Apply the reviewed migrations, enable the configured collector and verify actual account/competition coverage in deployment. |
| D03/D06 | Configured stored-fixture scope includes unselected matches; one dispatch per fixture endpoint, shared quota admission, explicit byte/row/time bounds and counted event-trial support | Measure real endpoint coverage, response sizes and workload before expanding scope; provider-first prospective forecast coverage remains separate. |
| D08 | Mutable bounded detail bodies retain final observations and corrections; cache generations avoid a per-minute invalidation log; successful empty result polls omit empty durable batches | Existing nonempty result/lifecycle audit histories remain append-only. Broad compaction requires reference-aware archive/retention design. |
| A02/T02 | Ten paginated league cohorts per page, canonical competition identity, explicit unknown attribution, existing filters and independent per-league sample/quality gates | Reviewed prospective real-data cohorts, individual-pick returns and matched provider/AI comparisons. |

The detail budget is opt-in and atomic with durable quota dispatch accounting.
Its stable hashed account/day counter survives process restarts and plan changes;
unknown provider spend cannot masquerade as completed ordinary work. Free/slow
plans remain ineligible. Original prediction probabilities, publication snapshots,
result correction chains and payment behavior are preserved.

| Verification | Result |
| --- | --- |
| Schema/client generation and validation | Passed without applying a configured application migration. |
| Consolidated affected unit tests (34 files, pinned Node 24.18.1, serial files) | 495 passed, zero failures; one POSIX-permission test is inapplicable on Windows. |
| Python tests | All 49 passed. |
| Genuine MySQL snapshot acceptance | All seven reported checks passed: fenced ownership, restricted canonical access, fair scheduling, bounded replacement, cache generations, final corrections, rescheduling and ambiguous team mappings. |
| Genuine MySQL quota acceptance | All 31 passed, including stable cap across replicas/restarts/plan changes, uncertain requests and persisted denied legacy bootstrap. |
| Genuine MySQL performance acceptance | All nine passed, including actual canonical league metadata, independent sample accounting and existing original-cycle history. |
| TypeScript and production application build | Passed. The final type check also covered the quota aggregation and coverage-bound refinements. |
| Repository ESLint | Passed with zero warnings; subsequent final collector/store/quota refinements also passed scoped lint. |
| Final detail-view refinement | All 40 focused checks, scoped lint and another TypeScript check passed. Future scheduled matches skip optional reads; terminal matches with older in-play snapshots say recorded, preserving the original source clock. |
| Production UI fixtures | All seven match-data states and all nine performance states passed. |
| Playwright browser inspection | Live events opened correctly at 390px and 1440px; league tables remained inside their scroll region. No page-wide horizontal overflow at either width. Screenshots retained in `output/playwright/live-match-*.png` and `performance-league-*.png`. |

The synthetic browser shells omit `/api/account/session`, producing the expected
fixture-only 404; the real account-session route exists and the application build
passed. Provider timestamps, forecasts, quality policies and match outcomes in
these fixtures are synthetic. Legacy quota bootstrap now uses validated grouped
counts rather than loading full request payload histories, and participant joins
use indexed ambiguity checks instead of repeated whole-table grouping.

Both temporary fixture servers and the owned Playwright browser were stopped
after inspection. No isolated MySQL instance remains running.

No configured application migration, provider request, external notification,
publication schedule or payment decision was performed. Collection remains off
until explicitly configured. No real coverage, calibration or deployment claim
follows from synthetic fixtures and isolated database tests.

Runbooks: [match data](../live-match-details.md),
[live operations](../live-operations.md),
[public performance](../public-performance-dashboard.md), and
[result synchronization](../fixture-result-sync.md).
