-- Production (MariaDB 11.4) apply script for migration 20261013093000_daily_run_manifest_eight_dates.
-- MariaDB spells MySQL's `DROP CHECK` as `DROP CONSTRAINT`; the replacement check is unchanged.

-- Live runs now select an eight-date window (LIVE_FORECAST_WINDOW_DAYS = 8, the visitor-local edge day),
-- so a manifest's coverage holds seven or eight EAT dates (docs/daily-selection.md).
ALTER TABLE DailyRunManifest DROP CONSTRAINT DailyRunManifest_shape;
ALTER TABLE DailyRunManifest ADD CONSTRAINT DailyRunManifest_shape CHECK (COALESCE(
  manifestHash REGEXP '^[a-f0-9]{64}$' AND JSON_EXTRACT(manifestJson, '$.version') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(manifestJson, '$.runId')) = runId
  AND JSON_TYPE(JSON_EXTRACT(manifestJson, '$.entries')) = 'ARRAY'
  AND JSON_LENGTH(JSON_EXTRACT(manifestJson, '$.coverage')) IN (7, 8), FALSE) = TRUE);

-- Record the migration (checksum = SHA-256 of the committed migration.sql), once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''2dd2b43ce8c43b7edf4e787cf952f0e85778e4a6ce734a85fde185ad69203de5'', NOW(3), ''20261013093000_daily_run_manifest_eight_dates'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261013093000_daily_run_manifest_eight_dates'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;
