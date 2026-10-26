# Checklist implementation follow-up

25 October 2026, Africa/Kampala. This follows the [51-item audit](app-checklist-2026-10-25.md).

The highest-priority implementation now includes an immutable, account-independent
daily publication archive and private publisher; original cycle/revision binding
for saved slips; public `/en/performance`; period-wide descriptive slip returns
and losing streaks; and bounded database size/growth inspection with verified
optional monitoring integration.

| Items | Delivered | Remaining evidence or work |
| --- | --- | --- |
| P04/P06/S09/T04 | Permanent daily publication records, original quotes/probabilities/model references, immutable membership, completed public pagination, independent of member erasure | Apply the migration and configure the supervised publisher only after joint-model/odds qualification. Legacy personal saves retain explicit unbound handling. |
| D09 | Original-cycle outcome resolution, correct old-cycle void behavior through rescheduling, pending corrections without reviving an older win; genuine MySQL saved-history acceptance passes | Deployed lifecycle/settlement verification; bookmaker payout decisions remain separate. |
| T01/T02/A04 | Public period/source/market controls, outcome/sample counts, qualified calibration tables, original evidence links, daily archive, binary-only one-unit return illustration and losing streaks | Reviewed real calibration, league reporting, individual-pick returns and matched provider/AI baseline cohorts. |
| D10 | Read-only MySQL allocation/index metadata, bounded numeric JSON-size aggregates, 30-snapshot private history, growth comparison and caller-chosen limits; optional verified monitoring source | Actual configured database measurement did not succeed here; no growth baseline or live threshold is claimed. |

The combined-probability model still requires real qualification evidence. No
independence shortcut, unreviewed calibration policy, provider polling expansion,
payment decision, external message or publication schedule was enabled.

## Review and verification

The new schema was generated and validated without applying it to the application
database. Review caught and corrected MySQL's reserved `rank` identifier,
explicit InnoDB/collation requirements, per-publication count validation,
repeatable-read replay detection, historical-default compatibility and a final
authority/cutoff recheck before commit.

The full pinned-runtime unit suite passed 1,822 tests with no failures; one
POSIX-permission case is inapplicable on Windows. All 49 Python tests passed.
Final focused archive/forecast/return tests passed 30 cases after the last
integrity, batching and approval changes. The dashboard production fixture passed
all seven reviewed/unapproved/empty/outage/pagination/native-filter states; browser inspection at
390px and 1440px found no horizontal overflow. Repository TypeScript checking and
the final production build passed.

An official portable MySQL 8.4.13 ZIP was downloaded into ignored workspace test
tools, checked against its vendor checksum and verified detached release
signature, then version-checked. Genuine archive DDL/race/trigger acceptance
passed, all nine saved-slip database tests passed, and all eight storage
unit/integration tests passed with no skips. This caught and fixed SELECT-only
locking permissions, Windows metadata table-name casing, and UTC formatting in
the raw paid test fixture. No production timezone behavior was changed.

The larger archive reader now resolves at most 2,480 original selections with
100-identity batches and the existing seal/history validators; a 101-reference
mixed-cycle regression uses nine storage calls. This avoids a database round trip
per original leg while preserving pending corrections and legacy missingness.

All 66 payment checks also passed, including genuine MySQL payment, owner review,
standard-package migration and credit-ledger acceptance. Final repository ESLint
passed without warnings. A final native-form correction removes hidden advanced
model/version filters from Apply while preserving them in pagination; all 25
focused dashboard tests, targeted ESLint, a subsequent TypeScript check and the
seven-state production fixture passed. The portable dependency remains
available for future owned test instances; no application migration or publication
binding was activated.

The configured `db:storage --record` attempt failed with the redacted diagnostic
“Database storage measurement unavailable. Check private configuration, MySQL
version and approved access.” No usable measurement/history baseline was stored.
The exact cause is not inferred from that diagnostic.

Runbooks: [daily publications](../daily-slip-publications.md),
[public performance](../public-performance-dashboard.md), and
[database storage](../database-storage.md).
