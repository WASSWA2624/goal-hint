# 296 All pending local migrations

The owner requested all migrations after the brief Contact-page update.

## Configured local MySQL

- Verified the existing MySQL 8.4.11 instance at `127.0.0.1:3307`, database `goal_hint_db`, against its recorded UUID, native administrator file handle, datadir and normal recovery mode.
- Created an access-restricted AES-256-GCM checkpoint with its key kept separately. Authenticated decryption and an isolated MySQL restore matched all 124 prior base-table counts and 61 completed migration records. Two legacy SharedSlip trigger delimiters were normalized only in restore input; the original checkpoint was preserved.
- Paused ordinary application writes during the operation. The separate migration role temporarily bypassed that fence for the reviewed DDL; the temporary privilege was revoked and the original write mode restored afterward.
- Applied six migrations: `20261103180000_shared_slip_trigger_blocks`, `20261104090000_six_best_slip_odds_bands`, `20261104140000_manual_providers_and_opt_in_trials`, `20261105100000_intelligence_shadow`, `20261105110000_public_community_channels`, and `20261105120000_contact_page_settings`.
- Final inventory: **67 completed migration records**, including the recorded adopted Match Facts migration; **zero pending or unfinished**, and **127 base tables**. Existing table row counts stayed unchanged. Required checksums match the repository's raw/LF/CRLF-compatible history policy; no applied migration record was rewritten.
- Added narrow application permissions for the three new shadow tables: State permits SELECT/INSERT/UPDATE; Revision and Check permit SELECT/INSERT. No DELETE or DDL was added. The real private grants record was updated; shadow tables remain empty and no shadow worker was enabled.
- `db:status`, `db:verify`, `db:health` and a repeated no-op `db:deploy` passed. Application-role zero-row checks verified the new settings/trial columns and UPDATE permissions, narrow table grants, absence of DDL, restored write mode and the public Contact projection.

## Active owned development demo

- Verified its ownership marker, launcher/process ancestry, MySQL UUID, recovery mode and repository-owned datadir at port `53124`, database `goal_hint_demo`.
- Applied its sole pending Contact-page migration through the launcher's existing standalone deployment step. All **66 source migrations** are complete, with none pending or unfinished. Existing settings were retained; no restart, reseed, subscription cleanup or reset ran.
- Migration status and repeated deployment pass. Prisma schema comparison still reports earlier sharing differences: the extra `DevelopmentDemoSourcePair` table and a legacy SharedSlip shape. The Contact fields match. No unrelated sharing table or column was dropped or rewritten to force a clean comparison.
- The actual running `/en/contact` passed all four URL/query-safety variants and Privacy/Terms/Help backlinks after migration.

## Preservation and scope

Private checkpoints, keys, credentials and operator receipts remain outside Git. The one-time native helper task was removed; the normal MySQL startup task, active demo, existing files and stashes were preserved. Hosted production and XAMPP's separate MariaDB instance were not changed.
