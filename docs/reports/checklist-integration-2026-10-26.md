# Checklist integration and local migrations

26 October 2026, Africa/Kampala. All five local checklist branches were merged
into `main`, preserving their original commit ancestry and the reviewed changes
from this chat (`a6fcf83`).

| Branch | Integrated contribution |
| --- | --- |
| `checklist/custom-slip-ranking` | One verified joint-model contract, weak estimate caching, final compatible-batch ranking, exhaustive tests and capability-aware controls. |
| `checklist/history-compaction` | Bounded reference-aware read-only census; no history deletion operation. |
| `checklist/provider-baseline` | Sealed source receipts, private comparison, phase compatibility and strict provider-first live publication. |
| `checklist/admin-ops` | One canonical outbox, explicit owner reconciliation, retention and configuration checks. Uncommitted cost/profit foundations were preserved and tested in `5c3a376`; their reporting feature remains unfinished. |
| `checklist/pick-returns` | Atomic original prediction-quote capture and one pick-return summary/DTO/UI path. |

Overlapping implementations were consolidated. The confirmed-unapplied alternative
`PaymentNotice` migration was removed from the final tree; its original commit
remains in history. `PaymentNotificationOutbox` is the sole active outbox.
Captured quote sidecars replace transient-history reconstruction. Model and
historical-display qualification remain required.

Both detached worktrees were clean and already ancestors of `main`. Named branch
worktrees were left clean after their work was committed. Existing stashes remain
preserved.

## Database rollout

The configured target was verified as MySQL **8.4.11** at
`127.0.0.1:3307/goal_hint_db`, using the separate migration role and native server
UUID. This is the local target; the cPanel/MariaDB production target and website
deployment are separate.

Before DDL, a consistent AES-256-GCM encrypted snapshot was retained in the private
native installation, with its key stored separately. Full authentication and
plaintext-hash verification passed. A separate owned MySQL restore matched all
**98** original table counts; its instance was subsequently stopped and removed.
Plaintext SQL streamed through pipes.

All seven pending migrations were applied through `scripts/database.py deploy`:

1. `20261025113516_daily_slip_publications`
2. `20261025170000_live_match_details`
3. `20261025171000_provider_workload_budget`
4. `20261025180538_prediction_quotes`
5. `20261025183256_owner_profit`
6. `20261025200000_refresh_stage_phases`
7. `20261025230000_payment_notification_outbox`

Applied checksums were verified, allowing only LF/CRLF equivalence and the exact
registered adoption in `prisma/adopted-migrations.json`. Existing history was
preserved. The archive-trigger block rewrite affected a migration that was still
unapplied on this target.

Final `db:status`, `db:verify` and `db:health` passed: **47** completed records
(including the registered historical adoption), **zero** pending migrations and
no unfinished active migration. Reviewed DML grants followed creation of their
tables. The application read check covered all **108** application tables;
**32** zero-row INSERT/UPDATE/DELETE permission probes and empty archive locking
reads passed. Missing permissions on the existing adopted `FixtureFacts`,
`FootballVenue` and `SeasonStandings` projections were restored. Outbox UPDATE
is limited to dispatch-state columns; archive/quote grants remain SELECT/INSERT.

The private grant record and encrypted backup stay outside version control.
One-time administration tasks were removed, and the normal MySQL startup task
remains available. No database users were created or dropped, and no passwords
or existing worker schedules were changed. No real payment, notification
dispatch, publication worker or history purge was activated.

## Verification

The merged schema generated and validated, and the combined TypeScript check
passed. The combined Python run passed **68** checks. Genuine MySQL acceptance
found an unsigned bookmaker ID returned as `bigint`; normalization at the SQL
boundary fixed quote capture, after which all **nine** quote checks passed. The
initial denominator failure was caused by that earlier aborted subtest.

| Final check | Result |
| --- | --- |
| Full serial unit suite, Node 24.18.1 | 1,983 passed, zero failures; one POSIX-permission check is inapplicable on Windows. |
| Python suite | All 68 passed. |
| Genuine MySQL focused acceptance | 25 checks passed across the final compaction, outbox, quote and phase runs. The quote suite was rerun after the bigint correction; this is not represented as one initially clean combined run. |
| Repository/scoped lint | Passed without warnings. |
| Schema/client generation, validation and TypeScript | Passed. |
| Production build | Passed compilation, TypeScript, page-data collection and all 18 static pages, including the new owner-route compilation. |
| Performance rendering | All 10 states passed. |
| Slip rendering | All 12 states and native GET/qualified-joint/cutoff/manual-alternative checks passed. |
| Owner payment rendering | Final acceptance pending. |
| Git whitespace and ancestry | Clean diff checks; every local/fetched branch is a `main` ancestor. |
