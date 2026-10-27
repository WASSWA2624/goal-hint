# Checklist follow-up: probability, reporting and notifications

25 October 2026, Africa/Kampala. This continues the
[application checklist audit](app-checklist-2026-10-25.md). It records four code
changes and their limits; it does not mark the remaining checklist complete or
establish live forecast quality, commercial rights or deployed acceptance.

## Custom whole-slip probability: S04–S06

Custom and daily slips now share the same joint-model estimator and probability
bounds. A trusted custom-slip binding must independently verify the model's
calibration/correlation evidence and current validity. With that binding, whole-slip
probability ranks before selection count; optional inclusive combined-probability
bounds are applied to each combination. The native criteria form retains those
bounds and distinguishes a missing model from an empty feasible result.

Without a binding, ordinary custom generation retains its disclosed count/mean
ranking and does not display an invented joint estimate. With odds access enabled,
a request for restrictive combined probability bounds returns `model-unavailable` before stored reads or search-budget
consumption. Approval and validity are checked again after collection and estimator
callbacks. Marginal probability bounds reject impossible estimates but do not
qualify a forecasting model. The public binding still supplies no qualified model.

Candidate, enumeration, retention and compatible-batch limits remain explicit;
results rank the explored feasible combinations without claiming global
optimality. Existing saved snapshots and publication criteria remain compatible.
See the [slip-builder contract](../slip-builder.md) and
[daily-publication runbook](../daily-slip-publications.md).

## Provider benchmark and AI shadow: A01, A06, A07

New fallback services default to the provider baseline, and the live runner pins
that policy explicitly. A complete AI candidate no longer bypasses the existing
budgeted provider collection. Only validated provider groups are selected for
live publication; unsupported provider markets remain unavailable. Provider
failure, exhausted quota, interrupted collection or revoked permission cannot
promote AI. Live publication independently rejects AI markets, and AI goal-market
extensions are omitted when AI stays in shadow.

The existing immutable intent and completed AI/provider stages retain original
probabilities, identities, source clocks, denials and missingness under the same
frozen refresh context. Historical publications are not rewritten. This supplies
prospective capture capability, not measured improvement: provider collection
still follows the AI phase, and a shared context/cutoff does not prove equal
source recency, especially when generation/update times are unknown. A frozen
matched protocol, adequate real cohorts, conflict review, comparative UI and
reviewed promotion evidence remain outstanding. Public comparisons stay
unavailable. See the [benchmark and shadow runbook](../provider-baseline.md).

## Individual-pick returns: A04, T02

Market/source/horizon and league cells now expose separate descriptive pick-return
samples and losing streaks using the same exact integer arithmetic as slip
reporting. One unit is illustrated only for coherently settled won/lost locked
selections with eligible stored quotes. Void and pending results imply no refund
and enter no price aggregates; missing quotes retain an explicit excluded count.
Pick and slip denominators remain separate. Streaks follow forecast publication
order within the selected kickoff-date cohort, with void/pending interruptions.

The historical reader checks sealed snapshot/import bodies, the original cycle,
pre-publication/cutoff observation times, approved quote age, bookmaker and EAT
date scope. An intervening receipt conservatively withholds an older snapshot,
including ambiguous withdrawals and unchanged-price reconfirmations. A same-clock
chain successor excludes its predecessor. Display permission is rechecked after
stored reads and cached or uncached responses.

The public service intentionally supplies no historical-quote binding until
rights and frozen mapping/catalog semantics are reviewed. This change therefore
does not authorize public historical odds or establish actual customer returns,
bookmaker acceptance, calibrated forecasts or future profit. Calibration keeps
its independent protocol/sample gates. See
[public performance reporting](../public-performance-dashboard.md).

## Atomic payment notification outbox: B04, M03

Payment decisions, recorded manual-payment notifications, credit decisions and
renewals now commit a minimal notification intent in the same transaction as
their account change. A unique target/decision key prevents duplicate intents.
The private worker claims a committed intent before gateway I/O; concurrent
workers cannot automatically dispatch it twice. Queued work survives process
interruption. An interrupted claim becomes `uncertain` after one minute and is
not automatically resent. Gateway acceptance still does not prove handset receipt.

The outbox stores account/target references and status, without recipient numbers,
message bodies, credentials, amounts, plan names or review text. The worker resolves the current
registered number under the account lock and skips erased/blocked accounts.
Minimal account-update wording is retained. Notification failure does not reverse
a payment or access decision; an already dispatched SMS cannot be revoked by
subsequent erasure.

Deployment requires the additive
[`20261025230000_payment_notification_outbox` migration](../../prisma/migrations/20261025230000_payment_notification_outbox/migration.sql),
reviewed [application grants](../deployment/manual-account-grants.sql), worker
supervision and actual gateway acceptance. The status command is read-only;
running the dispatch command with credentials and queued intents can send real
SMS. See [Yoola notification operations](../yoola-messaging.md#payment-decision-notifications)
and [subscriptions](../subscriptions.md).

## Verification record

These focused checks use synthetic forecasts, source approvals and messaging
transports. They verify behavior and arithmetic, not commercial permission,
forecast accuracy or handset delivery. The table also records the final
repository-wide and acceptance results from the coordinating run.

| Check | Recorded result |
| --- | --- |
| Custom/best-slip, publication, forecast and saved-slip focused run | 115 passed, zero failures/skips. A subsequent inclusive-boundary regression passed separately; this is not reported as one clean 116-test run. |
| Custom-slip scoped ESLint | Passed before the final small TypeScript fixes; final repository checks remain below. |
| Fallback, benchmark, live binding/AI and refresh focused run | 102 passed. After final scoped refinements, the five benchmark regressions and 17 live-AI checks passed separately. |
| Benchmark scoped ESLint | Passed. |
| Notification focused units | 30 passed; scoped ESLint passed. |
| Notification agent's isolated MySQL outbox/payment-admin/wallet run | 31 checks passed, zero failures/skips; synthetic gateway only. |
| Full serial unit suite, pinned Node 24.18.1 | 1,898 passed, zero failures; one POSIX-permission check is inapplicable on Windows. |
| Python suite | All 49 passed after synchronizing the Prisma schema snapshot. |
| Repository lint and TypeScript | Repository ESLint passed with zero warnings; final changed-source lint also passed. Incremental TypeScript and the production build's TypeScript phase passed after the optional-prop and timestamp-brand corrections. |
| Production build | Passed compilation, TypeScript, page-data collection and all 17 static pages; public performance/slip routes and the production account-session route compiled. |
| Production rendering | All 10 performance states and all 12 slip fixture states plus native GET/cutoff/manual-alternative checks passed. The slip harness's initial assertion expected the wrong label; its corrected check verifies the shared table's existing Win probability and Average match probability labels against the same saved production build. |
| Browser acceptance | Performance and slip controls inspected at 390px and 1440px, with no page-wide horizontal overflow. The 390px probability dialog has matching 364px client/scroll widths. The new pick-return section shows its own sample and quote exclusions while calibration stays unapproved. |
| Final serialized benchmark/performance/historical-quote MySQL acceptance | All 11 passed, zero failures/skips: nine existing performance checks, one historical-quote check and one matched-shadow stage check. Earlier migration setup attempts under load timed out; the first quote test also crossed its synthetic publication cutoff before its timing correction. These are separate from the clean final serial runs. |

No configured application migration, provider request, publication schedule,
real payment, real gateway message or deployment was activated by these changes.

Browser screenshots are retained in `output/playwright/checklist-followup-*.png`.
The isolated browser fixtures report the existing `/api/account/session` 404;
the production route exists and compiled successfully. This fixture limitation
does not establish deployed session or payment acceptance. Temporary acceptance
servers and the owned browser session were stopped after inspection.

## Remaining checklist work

The next release decisions still need a genuinely qualified joint model and
permitted odds feed; authenticated prospective provider/AI cohorts and real
calibration; provider redistribution/account-coverage evidence; and the actual
privacy, processor-retention and product-specific legal/licensing review.

Reviewed archive/live-detail/outbox migrations, restricted grants, supervised
workers and deployed payment/settlement/refresh acceptance remain operational
work. The configured database still needs its first successful storage baseline,
comparable growth measurements and approved thresholds. Transient-history
compaction must preserve forecast, settlement, correction and replay references;
browser server-push delivery and measured load remain separate from central
provider polling.

The merchant fee/tax/operating-expense ledger and consent-aware pricing pilot
remain unfinished. Standard prices should remain unchanged pending conversion,
renewal and measured net-profit evidence. Existing source/forecast coverage gaps
cannot be filled by filters or by synthetic acceptance.
