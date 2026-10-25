# Application checklist audit

Audited **25 October 2026, Africa/Kampala**, against [the requested checklist](../../prompts/app_checklist.md), source, tests and rendered acceptance fixtures. This is an implementation audit, not a certification of deployment, forecast accuracy or commercial rights. **Implemented** means the described application behavior exists; **Partial** means some requirements or operational evidence remain; **Missing** means no implementation or measurement was found. **P1** is a correctness, privacy or release dependency, **P2** is product/measurement completion, and **P3** is a later experiment.

The 51 original checkboxes are tracked below: **15 Implemented, 34 Partial, 2 Missing** after the corrections. Detailed investigations are in the [slip audit](checklist-slips-2026-10-25.md), [history/performance audit](checklist-performance-2026-10-25.md) and [payment/privacy audit](checklist-payments-2026-10-25.md). Configuration switches, synthetic test data and approval-reference strings do not establish live coverage, licenses or calibration.

## Pages and visibility

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| P01 | Daily Best Slips with odds, combined probability and selection count | Partial | `src/app/_components/best-slips-route.tsx`, `src/server/slips/best-slips.ts`, `src/domain/best-slips.ts`; daily EAT cohort and explicit unavailable states | Bind a qualified joint-probability model and permitted odds source, and persist each daily publication. The public binding currently supplies no qualified model. | P1 |
| P02 | Browse/filter all matches, markets, odds and probabilities, including low-probability picks | Partial | `/[locale]/matches`, `src/domain/feed-query.ts`, `src/server/matches/feed-service.ts`; 0–100 probability range and market/date/league/status/price filters | The feed shows the best pick in the chosen families, while detail exposes other outcomes. Complete upstream forecast/odds coverage for fixtures outside the finite refresh capacity; filters cannot create missing forecasts. | P2 |
| P03 | Live scores and detailed statistics, retaining the pre-match forecast | Partial | Central `result-sync-service.ts`, locked prediction sets, `use-live-refresh.ts`, `insights-read.ts` | Scores/clock refresh; detail statistics come from prediction evidence. Add centrally budgeted live statistics/events ingestion, timestamped current projections and coverage-aware UI. | P1 |
| P04 | Historical matches/slips, losses, original odds and outcomes | Partial | Dated prediction feeds, revision history, `saved-slips.ts`, `slip-history.tsx` | Public history is limited to 20 member saves and a fixture returning to scheduled/live can hide an already-visible slip. Add a paginated, account-independent daily archive bound to the original forecast cycle. | P1 |
| P05 | Premium availability visible without active picks, odds or probabilities | Implemented | `bestSlipViews`, `gateBestSlips`, locked cards, `tests/best-slips.test.mjs`, `verify-paywall-rendering.py` | Corrected in this audit: remove joint probability from anonymous/expired DTOs and entitlement rechecks. General match probabilities remain deliberate public previews. | P1 |
| P06 | Full completed-slip details, including losing slips | Partial | Public `SlipHistory` includes completed member-saved selections, original quotes and outcomes | Archive every daily published slip, including unsaved slips and losses; paginate and preserve through account erasure. | P1 |

## Slip generation and probability

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| S01 | Rank Best Slips by combined probability | Implemented | `bestSlipBuilder` probability comparator; `tests/best-slips.test.mjs` includes a pair outranking a single | Algorithm is implemented; production availability remains P01/S03. | P1 |
| S02 | Show average probability separately from combined probability and odds | Implemented | `src/components/slips/slip-table.tsx` | Corrected: show both when a joint estimate exists; keep mean explicitly labeled on custom slips without one. | P2 |
| S03 | Multiply only with justified independence; account for correlation | Partial | `JointSlipModel` demands correlation/calibration evidence and current validity; marginal-bound checks and one fixture per slip | Qualify an actual joint model on retained outcomes. Metadata and mathematical bounds alone do not establish a valid model; no multiplication fallback is enabled. | P1 |
| S04 | Optimize whole-slip probability within user-defined odds targets | Partial | Exact-odds bounded search supports targets and a joint estimator; custom builder supports odds ranges | Bind a qualified estimator to custom generation, which currently orders by count/mean, and document bounded-search optimality limits. | P1 |
| S05 | Do not assume fewer selections always means safer | Partial | Best Slips compares joint probability before count; regression covers longer, more probable slip | Custom `compareCombinations` still prefers fewer selections. Change its ranking when a qualified whole-slip estimator is available. | P1 |
| S06 | Min/max odds, probability, selections and requested count | Partial | `SlipCriteria`, `slip-builder.tsx`, `tests/slip-builder.test.mjs`; individual/combined odds, per-pick probability, 1–8 legs, 1–10 slips | Per-selection bounds exist. Add min/max combined-probability filtering once S03 supplies a qualified estimate. | P2 |
| S07 | Optional custom overlap; Best Slips diversified by default | Implemented | Custom `reuse` control; `bestSlipCriteria.reuse=false`; disjoint-fixture regression | Corrected Best Slips default; overlap remains opt-in for custom slips. | P1 |
| S08 | Fewer feasible slips with a clear explanation | Implemented | Feasible-batch search; partial/no-qualifying/no-combinations/limited-search UI states | None; sparse-cohort regression verifies fewer slips without an error. | P2 |
| S09 | Preserve published slips and original predictions | Partial | Immutable prediction revisions and server-created saved-slip snapshots | Automatically snapshot daily Best Slips, their joint model evidence and original prediction cycle/revision IDs. Recomputed daily cohorts are not publication history. | P1 |

## API-Football and data pipeline

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| D01 | Verify current prices, rate limits, endpoints and redistribution rights | Partial | Official sources rechecked below; `live-account.ts`, adapter contracts and quota limiter | Prices/limits/contracts reviewed; specific commercial/public-display permissions and actual account coverage still need evidence. Do not treat a subscription as a publication license. | P1 |
| D02 | Midnight EAT upcoming-fixture import, stable-ID upsert | Implemented | `calendar.ts` 00:00 EAT/21:00 UTC; `latestSelectionOccurrence`, durable job keys; catalog unique `(provider, externalId)` | Runtime supports eight EAT dates, with a shorter Free-plan import horizon and explicit missing coverage. Verify deployed runner supervision separately. | P1 |
| D03 | Save available odds, statistics, market predictions and source clocks for all matches | Partial | Catalog retains all returned fixtures; odds snapshots retain returned markets; source/retrieval clocks are distinct; evidence/forecast stores exist | Predictions are capacity-limited and detailed evidence is not collected for every fixture. Extend coverage within measured quotas; add current/final match statistics and events. Preserve unsupported-market missingness. | P1 |
| D04 | Distinguish provider forecasts from bookmaker-implied probability | Implemented | Separate `fallback`/`odds` adapter namespaces, odds provenance/de-margin method, forecast source labels | None. Bookmaker prices do not become an independent API prediction. | P1 |
| D05 | Central live polling and stored/cache updates to users | Partial | One leased poller per account; visitor routes read stored projections; client refresh is visibility-aware and bounded | Provider polling is centralized. Delivery to browsers uses HTTP polling rather than server push; add SSE/WebSocket delivery if required and measure load. | P2 |
| D06 | Verify batching/refresh rates and budget all endpoint requests | Partial | Reviewed endpoint contracts below; quota reservations, `liveWorkload`, odds three-hour slots, maximum 20 verified fixture IDs | Existing workload accounts for score, odds and forecast calls. Add explicit live statistics/events budgets and count real coverage/response sizes; do not assume dedicated endpoints batch fixture IDs. | P1 |
| D07 | Live goals/cards/corners/possession/available detail statistics | Partial | Score/clock projections and coverage/missingness handling exist; normalizer supports possession/corners/cards | No central live stats/event collector feeds detail. Add it with current source timestamps, missing-coverage states and final retention. | P1 |
| D08 | Overwrite current live snapshots; retain final details/key events | Partial | Mutable canonical fixture/result-state pointers exist, but `ResultSyncBatch`, `ResultProviderObservation`, lifecycle observations and material `FixtureResult` revisions append | Define bounded retention/compaction for transient live observations, retaining final/correction evidence and key events. No indefinite-history purge should remove original forecasts or settlement audit chains. | P1 |
| D09 | Automatically settle forecasts/slips, including void/postponed/abandoned | Partial | Result worker reconciles `market-settlement.ts` and immutable settlement revisions; saved-slip result-coherence hardening | Persist original cycle per slip leg and publish forecast void rules. Postponed/rescheduled saved slips cannot yet be reliably bound to their original cycle; bookmaker payout rules require separate evidence. | P1 |
| D10 | Measure actual record size and monitor storage growth | Missing | Database health checks connectivity/schema; operations monitoring has no record/table-size/growth series | Measure permitted per-table allocation and representative serialized records in the actual database, retain dated totals and alert on growth. Include append-only live observations and indexes. | P1 |

## Accuracy and refinement

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| A01 | Provider-first baseline; no invented unsupported-market probabilities | Partial | Validated provider groups and double-chance derivation; unsupported groups remain unavailable | Current resolution prefers AI then provider fallback. Preserve a contemporaneous provider-first benchmark and require demonstrated improvement before promotion. Existing publications must remain immutable. | P1 |
| A02 | Realized win rates by market, league, probability band, with counts | Partial | Performance/evaluation services provide settled counts, family/source/horizon cohorts and calibration bins | Add league breakdowns, approved real-data evaluation protocol and public UI. Public metric values currently remain unavailable without that protocol. | P1 |
| A03 | Assess calibration over adequate comparable samples | Partial | Fixed bins, observed/mean probabilities, Wilson intervals, Brier/log loss and sample gates | Gather prospective authenticated forecasts/results and evaluate frozen real cohorts. Tests verify arithmetic, not forecast quality. | P1 |
| A04 | Separate pick/slip performance; returns and losing streaks | Partial | Individual correct/incorrect counts and saved-slip outcome cards | Add immutable slip cohorts, flat-stake returns/ROI and losing streaks, with explicit quote, void and date-window conventions. | P1 |
| A05 | Validate Over 0.5/1.5, Double Chance, Under 4.5 on own data | Partial | Goal-line model definitions, double-chance settlement and extended-market cohort metrics | Capture/evaluate these exact source/line cohorts prospectively. Supported math does not establish accuracy or provider probability coverage. | P2 |
| A06 | Later AI review of injuries/news/form/lineups/external forecasts; conflicts first | Partial | Timestamped evidence, uncertainty/conflict controls and predictor prompt exist; AI already preferred when enabled | Run matched shadow review against a frozen provider baseline and measure conflict handling before promotion. External research remains separately gated. | P2 |
| A07 | Original/refined side by side; published changes only after improvement | Partial | Immutable forecast history retains publication/provenance/model clocks; comparisons reject unmatched cohorts | Save both contemporaneous provider and AI candidates for the same fixture/family/cutoff; add matched comparison UI and promotion evidence. Later revisions alone are not a baseline. | P1 |
| A08 | Avoid guaranteed-win/fixed-accuracy promises | Implemented | Public help/terms/detail/footer/Best Slips copy; `publicClaimAuthorized=false` | Keep future reporting tied to measured samples and estimates. | P1 |

## Performance and transparency

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| T01 | Public dashboard of winning/losing slips, odds, dates and outcomes | Partial | Recent completed saved-slip history; `/api/performance` selected-pick counts | Add a dedicated dashboard over the permanent daily-slip publication archive, including unsaved and losing slips. | P1 |
| T02 | Win rate, calibration, prediction/sample counts and returns by period | Partial | Performance API date windows and protocol-gated metrics | Bind a frozen real-data protocol; add public UI, returns and separate slip/league cohorts. Unavailable metrics must stay distinct from zero. | P1 |
| T03 | Preserve publication timestamps; audit edits/corrections | Implemented | Append-only `PredictionSet`/`PredictionAudit`, sealed results, settlement correction chains and revision-history UI | Verify deployed database privileges/triggers/backups continue protecting the chains. | P1 |
| T04 | Never delete failed forecasts or replace pre-match with post-match information | Partial | Locked forecasts, append-only revisions and results are separate; saved-slip history depends on member-owned records | Make daily publication history independent of member erasure, preserving privacy without deleting public forecast outcomes. | P1 |

## Pricing, access and payments

| ID | Checklist item | Status | Evidence | Required change | Priority |
| --- | --- | --- | --- | --- | --- |
| B01 | Same premium features: UGX 1,000/24h, 5,000/7d, 20,000/30d | Partial | Standard package seeds, `subscription-plans.ts`, entitlement checks and package tests; migration preserves existing owner-edited offers | Verify persisted offers before a pilot. Source defaults establish intended prices/durations, not current production pricing. | P1 |
| B02 | Approval-time start, visible expiry, early-renewal extension | Implemented | Payment approval under account lock, subscription-period helpers and account summary | None in code; confirm actual approval/expiry through deployed acceptance. | P1 |
| B03 | Free previews and history after expiry | Implemented | Viewer-access gates, public probabilities and completed history; expired-viewer paywall coverage | Maintain expiry rechecks and close the daily archive gap tracked separately. | P1 |
| B04 | Manual MTN/Airtel: transaction, optional screenshot, admin verification/decision/customer notice | Partial | Payment submission/admin queue/badge, receipt-review workflow and post-commit customer SMS | Screenshot is now optional. Admin alerts are in-app; customer SMS has no durable outbox, so a crash can miss it and gateway acceptance is not handset receipt. Verify the manual receipt process and delivery requirements. | P1 |
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
| Q02 | Test mobile, access, live refresh, payment approval, settlement, historical accuracy | Partial | Focused probability/paywall/payment/saved-history tests; repository rendering and live/settlement tests | Final check results are recorded below. Genuine MySQL integration, deployed workers/gateway and real historical calibration remain separate acceptance work. | P1 |
| Q03 | Prioritize verifiable forecasts/results over guaranteed winnings | Partial | Immutable publications, source labels, explicit unavailable states and no accuracy promises | Close daily publication history, coverage and measured-performance gaps before making stronger claims. | P1 |

## Official provider checks and competitive findings

Reviewed 25 October 2026. [Direct pricing](https://www.api-football.com/pricing) lists Free $0/100 daily requests, Pro $19/7,500, Ultra $29/75,000 and Mega $39/150,000. Plans include all endpoints; Free has season restrictions. The [official rate-limit guide](https://www.api-football.com/news/post/how-ratelimit-works) lists 10/300/450/900 requests per minute respectively, with paid per-second rates 5/7/15. Runtime limits must still use the actual account and response headers, including reductions.

The [official endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) describes shared fixture/live feeds, fixture-specific forecast/statistics/event requests, hourly predictions and per-minute match statistics. The [v3 contract](https://www.api-football.com/documentation-v3) documents 10-result pre-match odds pages and roughly three-hour refresh. The [batch tutorial](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league) permits at most 20 fixture IDs and warns that coverage varies. This does not prove batching for every endpoint or actual account coverage.

[Provider terms](https://www.api-football.com/terms) prohibit direct data resale without permission and place publication/third-party licensing responsibility on the customer. Public sports/betting use may need additional rights. These findings do not authorize new production calls or public redistribution.

[BetMines](https://betmines.com/) presents market/date/league browsing and pre-match/live scanner tools. Its [public scanner-history shell](https://betmines.com/vip/pre-match-scanner-for-football/191444/history) distinguishes picks, success rate, mean odds, ROI and winning/losing streaks while gating picks/rules. [Forebet's yesterday view](https://www.forebet.com/en/football-predictions-from-yesterday) places probability, original prediction, quoted odds and observed score together. Useful application priorities are discoverable filters, separate pick/slip denominators, visible sample sizes and complete forecast-versus-result history. No private competitor account was accessed.

## Changes and next sequence

This audit corrects premium-slip probability redaction, default daily diversity, separate mean/joint probability presentation, floating-point tolerance at valid probability bounds, optional payment screenshots, minimal payment SMS and coherent saved-slip result grading. Existing reusable components and square styling are retained.

1. Qualify the joint model and permitted odds feed; complete custom whole-slip ranking without inventing probabilities.
2. Persist immutable daily publications and original cycle/revision references; expose every outcome with pagination.
3. Freeze and evaluate prospective provider/AI cohorts; add the public performance dashboard and returns/streak methodology.
4. Budget central live statistics/events; bound transient retention and measure actual database growth.
5. Finish genuine-database/deployed payment and worker checks; resolve provider/privacy rights and run the pricing pilot.

## Verification

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
