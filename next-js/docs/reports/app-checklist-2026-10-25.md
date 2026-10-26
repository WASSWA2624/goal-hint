# Application checklist audit

Audited **25 October 2026, Africa/Kampala**, against [the requested checklist](../../../prompts/app_checklist.md), source, tests and rendered acceptance fixtures. This is an implementation audit, not a certification of deployment, forecast accuracy or commercial rights. **Implemented** means the described application behavior exists; **Partial** means some requirements or operational evidence remain; **Missing** means no implementation or measurement was found. **P1** is a correctness, privacy or release dependency, **P2** is product/measurement completion, and **P3** is a later experiment.

The 51 original checkboxes are tracked below: **22 Implemented, 28 Partial, 1 Missing** after the corrections. Detailed investigations are in the [slip audit](checklist-slips-2026-10-25.md), [history/performance audit](checklist-performance-2026-10-25.md), [payment/privacy audit](checklist-payments-2026-10-25.md) and [live-data follow-up](checklist-live-data-2026-10-25.md). Configuration switches, synthetic test data and approval-reference strings do not establish live coverage, licenses or calibration.

## Pages and visibility

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| P01 | Daily Best Slips with odds, combined probability and selection count | Partial | `src/app/_components/best-slips-route.tsx`, `src/server/slips/best-slips.ts`, `src/domain/best-slips.ts`; immutable daily EAT publication and explicit unavailable states | Bind a qualified joint-probability model and permitted odds source, apply the reviewed migration, and supervise the private publisher. The public binding currently supplies no qualified model. | P1 |
| P02 | Browse/filter all matches, markets, odds and probabilities, including low-probability picks | Partial | `/[locale]/matches`, `src/domain/feed-query.ts`, `src/server/matches/feed-service.ts`; 0–100 probability range and market/date/league/status/price filters | The feed shows the best pick in the chosen families, while detail exposes other outcomes. Complete upstream forecast/odds coverage for fixtures outside the finite refresh capacity; filters cannot create missing forecasts. | P2 |
| P03 | Live scores and detailed statistics, retaining the pre-match forecast | Implemented | Central score poller plus fenced live-match statistics/events collector; separate current/final detail panel with source clocks, coverage states and existing browser refresh | Apply the reviewed live-detail/budget migrations, configure collection and verify deployed coverage. No active forecast is replaced by a match observation. | P1 |
| P04 | Historical matches/slips, losses, original odds and outcomes | Implemented | Dated predictions/revision history plus immutable DailySlipPublication/PublishedSlip archive, original-cycle saved history and /en/performance pagination | Apply the reviewed archive migration and complete deployed acceptance (Q02). Genuine MySQL archive/history checks pass; legacy unbound personal snapshots are not fabricated. | P1 |
| P05 | Premium availability visible without active picks, odds or probabilities | Implemented | `bestSlipViews`, `gateBestSlips`, locked cards, `tests/best-slips.test.mjs`, `verify-paywall-rendering.py` | Corrected in this audit: remove joint probability from anonymous/expired DTOs and entitlement rechecks. General match probabilities remain deliberate public previews. | P1 |
| P06 | Full completed-slip details, including losing slips | Implemented | Published completed slips expose original picks, quotes, probabilities and loss/void/pending-correction outcomes on /en/performance | Configure the qualified publisher when its model/odds evidence is ready; active original-cycle legs remain private. | P1 |

## Slip generation and probability

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| S01 | Rank Best Slips by combined probability | Implemented | `bestSlipBuilder` probability comparator; `tests/best-slips.test.mjs` includes a pair outranking a single | Algorithm is implemented; production availability remains P01/S03. | P1 |
| S02 | Show average probability separately from combined probability and odds | Implemented | `src/components/slips/slip-table.tsx` | Corrected: show both when a joint estimate exists; keep mean explicitly labeled on custom slips without one. | P2 |
| S03 | Multiply only with justified independence; account for correlation | Partial | `JointSlipModel` demands correlation/calibration evidence and current validity; marginal-bound checks and one fixture per slip | Qualify an actual joint model on retained outcomes. Metadata and mathematical bounds alone do not establish a valid model; no multiplication fallback is enabled. | P1 |
| S04 | Optimize whole-slip probability within user-defined odds targets | Partial | Shared `joint-slip-model.ts` and custom/daily exact-odds bounded search support a verified joint estimator; search limits are documented | Bind a genuinely qualified estimator to production custom generation. Bounded candidate/combination/batch limits do not establish global optimality. | P1 |
| S05 | Do not assume fewer selections always means safer | Partial | Both custom and Best Slips rank qualified whole-slip probability before count; longer-more-probable regression and expiry/revocation checks | Production model qualification remains S03. Unqualified custom generation continues to label its count/mean ordering explicitly. | P1 |
| S06 | Min/max odds, probability, selections and requested count | Partial | Per-selection/combined odds and probability controls, 1–8 legs, 1–10 slips; optional `totalProbMin`/`totalProbMax` reject unavailable joint estimates | Controls and filtering are implemented; meaningful joint-filter availability still requires S03 qualification. No independence fallback is enabled. | P2 |
| S07 | Optional custom overlap; Best Slips diversified by default | Implemented | Custom `reuse` control; `bestSlipCriteria.reuse=false`; disjoint-fixture regression | Corrected Best Slips default; overlap remains opt-in for custom slips. | P1 |
| S08 | Fewer feasible slips with a clear explanation | Implemented | Feasible-batch search; partial/no-qualifying/no-combinations/limited-search UI states | None; sparse-cohort regression verifies fewer slips without an error. | P2 |
| S09 | Preserve published slips and original predictions | Implemented | Append-only daily publication tables, normalized original-cycle/revision membership, first-writer transaction and private worker:slips; visitor reads use stored publications | Apply migration and configure supervised binding after S03/D01 qualification. No production publication was invented or activated. | P1 |

## API-Football and data pipeline

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| D01 | Verify current prices, rate limits, endpoints and redistribution rights | Partial | Official sources rechecked below; `live-account.ts`, adapter contracts and quota limiter | Prices/limits/contracts reviewed; specific commercial/public-display permissions and actual account coverage still need evidence. Do not treat a subscription as a publication license. | P1 |
| D02 | Midnight EAT upcoming-fixture import, stable-ID upsert | Implemented | `calendar.ts` 00:00 EAT/21:00 UTC; `latestSelectionOccurrence`, durable job keys; catalog unique `(provider, externalId)` | Runtime supports eight EAT dates, with a shorter Free-plan import horizon and explicit missing coverage. Verify deployed runner supervision separately. | P1 |
| D03 | Save available odds, statistics, market predictions and source clocks for all matches | Partial | Catalog retains all returned fixtures/markets; current/final statistics/events cover configured stored fixtures, including unselected matches; source clocks and unsupported-market missingness remain distinct | Forecast and provider coverage remain capacity-limited. Measure actual endpoint coverage and extend within verified quotas; no claim that every provider match has complete statistics or a forecast. | P1 |
| D04 | Distinguish provider forecasts from bookmaker-implied probability | Implemented | Separate `fallback`/`odds` adapter namespaces, odds provenance/de-margin method, forecast source labels | None. Bookmaker prices do not become an independent API prediction. | P1 |
| D05 | Central live polling and stored/cache updates to users | Partial | One leased poller per account; visitor routes read stored projections; client refresh is visibility-aware and bounded | Provider polling is centralized. Delivery to browsers uses HTTP polling rather than server push; add SSE/WebSocket delivery if required and measure load. | P2 |
| D06 | Verify batching/refresh rates and budget all endpoint requests | Partial | Reviewed contracts, shared quota reservations and workload; each statistics/events endpoint has one bounded dispatch per fixture; atomic stable account/day detail allowance precedes optional enrichment | Count actual endpoint coverage/response sizes with the extended private event trial; indicative refresh rates and coverage flags are not guaranteed. No dedicated-endpoint batching is assumed. | P1 |
| D07 | Live goals/cards/corners/possession/available detail statistics | Implemented | Normalized goal/card/substitution/VAR timeline and 16 available statistic types feed the separately refreshed public detail panel; missing/zero/unknown/partial/final states and independent clocks | Apply migrations and enable the opt-in collector under existing verified football rights; actual competition/season coverage requires deployment acceptance. | P1 |
| D08 | Overwrite current live snapshots; retain final details/key events | Partial | One bounded mutable statistics/events body per occurrence retains final details/corrections; fixture cache generations avoid per-minute journals; successful empty result polls omit empty durable batches | Nonempty result/lifecycle histories still append. Design reference-aware archive/compaction before changing these chains; no age-only purge may remove forecast, settlement, correction or replay evidence. | P1 |
| D09 | Automatically settle forecasts/slips, including void/postponed/abandoned | Partial | Existing result/settlement worker plus original-cycle saved/archive leg resolution; old void cycles survive replacement matches and latest pending corrections do not revive stale wins | Genuine MySQL original-cycle history acceptance passes. Verify deployed lifecycle/settlement operation; legacy personal snapshots cannot acquire invented cycle references, and bookmaker payouts remain separate. | P1 |
| D10 | Measure actual record size and monitor storage growth | Partial | npm run db:storage measures current table/index allocation and numeric JSON-size samples; private history computes growth; monitor accepts verified capacity/growth evidence | Actual configured-database measurement failed with a redacted unavailable diagnostic. Establish the first real baseline, then comparable measurements and approved operational thresholds. | P1 |

## Accuracy and refinement

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| A01 | Provider-first baseline; no invented unsupported-market probabilities | Partial | New fallback services/live publication use the provider baseline; independent authority rejects AI publication; immutable refresh stages retain AI shadow and provider candidates | Gather prospective authenticated benchmark cohorts and measure improvement before any AI promotion. Same cutoff/context does not prove equal source recency. Existing publications remain immutable. | P1 |
| A02 | Realized win rates by market, league, probability band, with counts | Partial | Public period/source/market UI, sample counts, evidence links, qualified calibration tables and paginated league cohorts with independent sample/quality gates and explicit unknown attribution | Bind a reviewed prospective real-data protocol. Small/unreviewed league groups do not inherit a validated rate from a larger overall sample. | P1 |
| A03 | Assess calibration over adequate comparable samples | Partial | Fixed bins, observed/mean probabilities, Wilson intervals, Brier/log loss and sample gates | Gather prospective authenticated forecasts/results and evaluate frozen real cohorts. Tests verify arithmetic, not forecast quality. | P1 |
| A04 | Separate pick/slip performance; returns and losing streaks | Partial | Separate pick/slip one-unit illustrations, quote exclusions and period-bounded losing streaks; pick and league cells use sealed pre-publication original-cycle odds when explicitly permitted | Bind reviewed historical-odds permissions/mapping and gather verified real cohorts. Production quote binding remains absent. Void/pending quotes do not imply refunds or enter return denominators. | P1 |
| A05 | Validate Over 0.5/1.5, Double Chance, Under 4.5 on own data | Partial | Goal-line model definitions, double-chance settlement and extended-market cohort metrics | Capture/evaluate these exact source/line cohorts prospectively. Supported math does not establish accuracy or provider probability coverage. | P2 |
| A06 | Later AI review of injuries/news/form/lineups/external forecasts; conflicts first | Partial | Timestamped evidence/conflict controls and predictor prompt exist; optional AI now stays private shadow and cannot publish its goal extensions | Evaluate matched shadow cohorts against the frozen provider baseline and measure conflict handling before promotion. External research remains separately gated. | P2 |
| A07 | Original/refined side by side; published changes only after improvement | Partial | Immutable refresh intent/AI/provider stages retain the same fixture/cycle/cutoff context and independent source clocks; public comparisons remain unavailable | Add a matched comparison reader/UI and evaluate frozen real cohorts with source-recency review and promotion evidence. Retained stage capability alone is not a validated baseline. | P1 |
| A08 | Avoid guaranteed-win/fixed-accuracy promises | Implemented | Public help/terms/detail/footer/Best Slips copy; `publicClaimAuthorized=false` | Keep future reporting tied to measured samples and estimates. | P1 |

## Performance and transparency

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| T01 | Public dashboard of winning/losing slips, odds, dates and outcomes | Implemented | /[locale]/performance supplies public outcome counts, original evidence links and paginated immutable daily-slip history | Verify deployment after archive migration; do not substitute member saves for editorial publication history. | P1 |
| T02 | Win rate, calibration, prediction/sample counts and returns by period | Partial | Period/source/market/horizon/league counts, protocol-gated calibration and separate full-period pick/slip return/streak illustrations | Bind reviewed real calibration and historical-odds evidence. Empty/unreviewed rates and unpriced returns remain unavailable. | P1 |
| T03 | Preserve publication timestamps; audit edits/corrections | Implemented | Append-only `PredictionSet`/`PredictionAudit`, sealed results, settlement correction chains and revision-history UI | Verify deployed database privileges/triggers/backups continue protecting the chains. | P1 |
| T04 | Never delete failed forecasts or replace pre-match with post-match information | Implemented | Locked forecasts/results remain separate; editorial publication tables have no account relation and reject UPDATE/DELETE; historical criteria and expired-model forecasts remain readable | Maintain restricted grants, backups and genuine-database acceptance. Personal member saves retain their separate disclosed erasure lifecycle. | P1 |

## Pricing, access and payments

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| B01 | Same premium features: UGX 1,000/24h, 5,000/7d, 20,000/30d | Partial | Standard package seeds, `subscription-plans.ts`, entitlement checks and package tests; migration preserves existing owner-edited offers | Verify persisted offers before a pilot. Source defaults establish intended prices/durations, not current production pricing. | P1 |
| B02 | Approval-time start, visible expiry, early-renewal extension | Implemented | Payment approval under account lock, subscription-period helpers and account summary | None in code; confirm actual approval/expiry through deployed acceptance. | P1 |
| B03 | Free previews and history after expiry | Implemented | Viewer-access gates, public probabilities and completed history; expired-viewer paywall coverage | Maintain expiry rechecks and verify the deployed daily archive with the publication migration. | P1 |
| B04 | Manual MTN/Airtel: transaction, optional screenshot, admin verification/decision/customer notice | Partial | Optional screenshot, admin queue/review, atomic minimal notification outbox and bounded private worker; genuine MySQL concurrency/rollback/erasure acceptance | Apply the outbox migration/grants before deploying updated payment producers and supervise the worker. Interrupted dispatches require reconciliation; gateway acceptance is not handset receipt. Verify the deployed manual receipt/delivery process. | P1 |
| B05 | Duplicate approvals prevented; audit trail and clear payment states | Implemented | Transaction normalization/uniqueness, locked decisions, payment audits and pending/approved/rejected states | Preserve deployed constraints and verify with genuine MySQL integration. | P1 |
| B06 | Evaluate later automation; measure fees/hosting/API/tax/net profit | Partial | Manual workflow and technical cost accounting exist | Add merchant fee/tax/operating-expense ledger and measured net profit before choosing an automated payment provider. | P2 |
| B07 | Pricing pilot and conversion/renewal comparison before changing prices | Missing | No frozen pricing experiment or conversion/renewal cohort report found | Run a consent-aware pilot with denominators, windows, approved spend and renewal cohorts; retain these standard prices until evidence supports a change. | P2 |

## SMS and privacy

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| M01 | Review Yoola terms, retention, security/privacy | Partial | Official sources and inconsistent retention statements recorded in payment/privacy audit | Resolve provider retention/security commitments for the actual service/account and document the agreed processing terms. | P1 |
| M02 | Treat numbers/content/delivery metadata as visible to gateway | Implemented | Yoola gateway boundary, privacy disclosures and `docs/yoola-messaging.md` | Maintain disclosed processing scope and restricted gateway/staff access. | P1 |
| M03 | Minimal SMS; no sensitive betting/financial detail/passwords | Implemented | `payment-notifications.ts` and notification regression tests | Corrected payment notices to a generic account-update/sign-in message without amount, balance, plan, expiry, transaction reference or rejection reason. Authentication OTPs remain purpose-limited; passwords are never sent. | P1 |
| M04 | Secure keys/staff access; review Uganda privacy/betting regulation | Partial | Server-only secret wrappers, admin controls, safe errors, privacy/terms notices; official legal sources in detailed audit | Complete actual processor/retention/access review and obtain product-specific legal/licensing conclusions; code/tests do not establish compliance. | P1 |

## Competitive positioning and quality

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| Q01 | Study BetMines/competitors: filters, scanner, results, previews | Implemented | Official public BetMines and Forebet pages reviewed below | Use the findings as product evidence; do not imply access to competitors' private data or validate their claimed accuracy. | P2 |
| Q02 | Test mobile, access, live refresh, payment approval, settlement, historical accuracy | Partial | Focused probability/paywall/payment/saved-history tests; repository rendering and live/settlement tests | Genuine archive/history/storage database checks now pass; see the implementation report. Deployed workers/gateway and real historical calibration remain separate acceptance work. | P1 |
| Q03 | Prioritize verifiable forecasts/results over guaranteed winnings | Partial | Immutable publications, source labels, explicit unavailable states and no accuracy promises | Deploy the reviewed archive and close coverage and measured-performance gaps before making stronger claims. | P1 |

## Official provider checks and competitive findings

Reviewed 25 October 2026. [Direct pricing](https://www.api-football.com/pricing) lists Free $0/100 daily requests, Pro $19/7,500, Ultra $29/75,000 and Mega $39/150,000. Plans include all endpoints; Free has season restrictions. The [official rate-limit guide](https://www.api-football.com/news/post/how-ratelimit-works) lists 10/300/450/900 requests per minute respectively, with paid per-second rates 5/7/15. Runtime limits must still use the actual account and response headers, including reductions.

The [official endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) describes shared fixture/live feeds, fixture-specific forecast/statistics/event requests, hourly predictions and per-minute match statistics. The [v3 contract](https://www.api-football.com/documentation-v3) documents 10-result pre-match odds pages and roughly three-hour refresh. The [batch tutorial](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league) permits at most 20 fixture IDs and warns that coverage varies. This does not prove batching for every endpoint or actual account coverage.

[Provider terms](https://www.api-football.com/terms) prohibit direct data resale without permission and place publication/third-party licensing responsibility on the customer. Public sports/betting use may need additional rights. These findings do not authorize new production calls or public redistribution.

[BetMines](https://betmines.com/) presents market/date/league browsing and pre-match/live scanner tools. Its [public scanner-history shell](https://betmines.com/vip/pre-match-scanner-for-football/191444/history) distinguishes picks, success rate, mean odds, ROI and winning/losing streaks while gating picks/rules. [Forebet's yesterday view](https://www.forebet.com/en/football-predictions-from-yesterday) places probability, original prediction, quoted odds and observed score together. Useful application priorities are discoverable filters, separate pick/slip denominators, visible sample sizes and complete forecast-versus-result history. No private competitor account was accessed.

## Changes and next sequence

This audit corrects premium-slip probability redaction, default daily diversity, separate mean/joint probability presentation, floating-point tolerance at valid probability bounds, optional payment screenshots, minimal payment SMS and coherent saved-slip result grading. Existing reusable components and square styling are retained.

1. Qualify the joint model and permitted odds feed; bind the implemented custom whole-slip ranking/probability controls without inventing probabilities.
2. Apply the reviewed archive migration and supervise the publisher; verify the new original-cycle history and public dashboard in deployment.
3. Freeze and evaluate the retained provider/AI shadow cohorts; qualify the historical-odds binding for the implemented individual-pick return/streak dashboard.
4. Enable and verify the budgeted live-detail pipeline, design reference-aware transient-history compaction and establish an actual database growth baseline.
5. Deploy the reviewed atomic payment-notice outbox migration/grants with its worker, complete payment/worker acceptance, resolve provider/privacy rights, and run the pricing pilot. Genuine-database acceptance is tracked separately from live rollout.

## Original audit verification

The subsequent [probability, benchmark, reporting and notification follow-up](checklist-follow-up-2026-10-25.md)
records the next code changes and their separate verification. The table below
remains the original audit's historical evidence.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed with zero warnings. |
| `npm run typecheck` | Passed; the final production build also checked TypeScript under the pinned runtime. |
| `npm run build` with Node 24.18.1 / npm 11.16.0 | Passed, including compilation, TypeScript, page-data collection and static generation. |
| Offline database client generation and schema validation | Passed with test configuration; no target migration or database write was performed. |
| Python unit suite | 43 passed. |
| Best Slips/builder tests | 71 passed, including redaction, final entitlement recheck, diversity, scarcity, joint ranking and floating-point boundaries. |
| Payment/access/privacy tests | 68 distinct focused checks passed; includes optional-image persistence/rate limits, SMS omission, renewal, consent and access gating. |
| Saved history/settlement/performance tests | Broader focused run: 45 passed, one genuine-MySQL integration skipped; final saved-history unit run: all 6 passed. |
| Production paywall fixture | Built under Node 24.18.1; all nine viewer scans passed 661 raw HTML/RSC/API/access assertions. Three private-route/header checks then passed separately after correcting the harness's stale expectation: unauthenticated `/admin` must redirect 307 to account login, not return 200. |
| Production payment fixture | Passed all 19 rendered states and five user-agent variants, including optional screenshots, required transaction/payer fields, credit flows and private headers. |
| Browser inspection | At 390px, free Best Slips hides premium values, full access shows separate mean/joint summaries, and the payment form has no horizontal overflow. Entering a valid transaction ID and accepting terms enables submission with both file inputs empty. Best Slips also inspected at 1440px. Screenshots retained in `output/playwright/checklist-*.png`. |
| `git diff --check` | Passed. |

The initial broad unit run used the system Node 26 runtime under concurrent generation/build load: 1,769 passed, 11 failed and one skipped. A generated-client file was temporarily absent during generation, several short deadline tests exceeded their limits, and one stalled evidence-service worker was terminated. After stabilizing the generated client and selecting the repository's pinned Node 24.18.1, **all six affected files passed sequentially: 112 tests, zero failures**. The initial `npm run check` invocation stopped at generation; it is not represented as a clean single-run pass. Subsequent generation, validation, lint, type checks, Python tests, focused/retry tests and production build are reported individually above.

Genuine MySQL integration suites remain skipped because no genuine `mysqld` test binary is available. Existing MariaDB/services were not reused as disposable test targets. Fixture-only `/api/account/session` 404s were observed in browser consoles; the production route exists and compiled successfully. No live accuracy, handset delivery, worker supervision or commercial-rights claim follows from synthetic acceptance.

No production data, deployment, real payment, external notification or provider subscription was changed by this audit. Temporary browser and fixture servers were stopped; acceptance files and screenshots are retained for review.

## Implementation follow-up

The highest-priority archive, original-cycle, public-dashboard and storage-tooling
changes are recorded in [the implementation report](checklist-implementation-2026-10-25.md).
Statuses above reflect that code follow-up. The original audit verification remains
a historical record; qualification and genuine-database/deployment evidence are
not inferred from synthetic tests.

| Follow-up check | Result |
| --- | --- |
| Full unit suite, pinned Node 24.18.1, serial files | 1,822 passed, zero failures; one POSIX-permission check is inapplicable on Windows. |
| Python suite | 49 passed. |
| Final focused archive/forecast/returns/storage tests | 30 passed. |
| Genuine MySQL 8.4.13 archive acceptance | Passed actual migration, concurrent publication, seals, foreign keys and append-only triggers. |
| Genuine MySQL saved-slip acceptance | All nine passed, including original-cycle rescheduling and pending corrections. |
| Storage unit/integration acceptance | All eight passed, no skip; SELECT-only metadata and JSON-size inspection exercised. |
| Payment suite, including genuine MySQL | All 66 passed, including owner review, package migration and credit ledger. |
| Final repository ESLint | Passed with zero warnings; the subsequent native-filter fix also passed targeted ESLint and all 25 dashboard tests. |
| TypeScript and final production build | Passed; the public performance route compiled. |
| Dashboard rendering and browser inspection | All seven fixture states passed, including the native-filter regression; 390px and 1440px inspection found no horizontal overflow. |
| Configured application database measurement | Unavailable; no real storage/growth baseline is claimed. |

The official portable MySQL dependency was checksum/signature-verified and used
only in owned isolated loopback instances. No configured application migration,
publication binding, provider request, real payment or external notification was
activated by this follow-up.

## Live-data and league follow-up

The next priority implementation is recorded in
[the live-data report](checklist-live-data-2026-10-25.md). It adds centrally budgeted
statistics/events, bounded current/final occurrence snapshots, the refreshed
match-data panel, paginated league cohorts and omission of successful empty
result-poll receipts. P03 and D07 now have implementations; their deployment and
actual coverage remain Q02 acceptance work. Nonempty audit-history compaction,
real prospective calibration and the remaining commercial/operational evidence
are still partial.

Final verification passed: 495 affected unit tests across 34 files (one
Windows-inapplicable permission skip), 49 Python tests, seven genuine MySQL
snapshot checks, 31 genuine quota checks and nine genuine performance checks.
The production application build, TypeScript, repository/scoped lint, seven
match-data rendering states and nine performance rendering states passed.
The subsequent detail-view refinement also passed all 40 focused checks and a
fresh TypeScript check. Browser inspection at 390px and 1440px found no page-wide
horizontal overflow; league tables stay within their own scroll region.

The two additive migrations are ready for review, but no configured application
migration or live collector was activated. `GOAL_HINT_LIVE_DETAILS_ENABLED`
defaults to false. See the [match-data runbook](../live-match-details.md) for
migrations, grants, limits and the existing source-rights boundary.

## Probability, reporting and notification follow-up

The [next implementation report](checklist-follow-up-2026-10-25.md) records shared
custom/daily joint estimation and optional combined-probability bounds,
provider-first publication with immutable AI shadow stages, separate individual
pick returns/streaks, and an atomic minimal payment SMS outbox. The relevant
Partial rows above now describe their remaining qualification and rollout work.

Final verification passed: 1,898 unit tests (one Windows-inapplicable permission
skip), 49 Python tests, 42 genuine MySQL checks across the focused outbox,
payment, performance, historical-quote and shadow-stage suites, repository/final
scoped lint, TypeScript, production build, 10 performance rendering states and
12 slip states plus native-form checks. Browser inspection at 390px and 1440px
found no page-wide horizontal overflow. The report preserves initial test/setup
corrections and distinguishes synthetic acceptance from real evidence.

Apply `20261025230000_payment_notification_outbox` and its restricted grants
before deploying the updated payment producers, then supervise its private
worker. No application migration or gateway dispatch was activated here. A real
qualified joint model, historical-odds binding, prospective calibration,
licensing/privacy conclusions, storage baseline, pricing pilot and deployed
worker/payment acceptance remain open.

## Local integration and migration rollout: 26 October 2026

All five checklist branches and the reviewed working changes are now integrated
into `main`. The seven pending migrations were applied to the configured local
MySQL database with a verified encrypted backup and isolated restore check.
Migration status, exact schema verification, database health and application
grants passed. The [integration record](checklist-integration-2026-10-26.md)
details branch reconciliation, migration names and final acceptance. Earlier
verification sections remain historical; hosted deployment and real forecasting,
commercial and gateway qualification remain separate.
