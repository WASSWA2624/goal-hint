-- Production (MariaDB 11.4) apply script for migration 20261025200000_refresh_stage_phases.
-- Widens the PredictionRefreshStage shape check to the 'preparation' and 'evidence-empty' phases the refresh worker
-- writes. It makes the same single ALTER as the committed migration.sql: the old check is dropped and its superset added in
-- one statement, so no window exists without a constraint, and every original job, phase, kind and attempt binding stays.
-- The CHECK rebuild locks and copies PredictionRefreshStage, so stop the app and worker writes while this runs.
-- Take and verify a private backup first, then import this file with the migration account, with phpMyAdmin or:
--   mariadb <database> < this-file
-- Every step that fails stops the import before the migration is recorded. MariaDB DDL is not transactional: if a step
-- fails after the guard, restore the backup rather than importing again.

-- 1. Guard: the refresh worker migration is applied with its original stage check, this one is not, and the table is InnoDB.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261009153335_prediction_refresh_worker'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apply 20261009153335_prediction_refresh_worker first; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261025200000_refresh_stage_phases') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionRefreshStage'
      AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape_v2') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The refresh stage phases are already applied or partly applied; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionRefreshStage'
      AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'InnoDB'
      AND TABLE_NAME = 'PredictionRefreshStage') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The original refresh stage check or InnoDB table is missing; nothing was imported.';
  END IF;
END //
DELIMITER ;

-- 2. The schema, as in migration.sql.
ALTER TABLE PredictionRefreshStage
  DROP CONSTRAINT PredictionRefreshStage_shape,
  ADD CONSTRAINT PredictionRefreshStage_shape_v2 CHECK (COALESCE(
    phase IN ('preparation','evidence','evidence-empty','ai','fallback','observation') AND kind IN ('started','completed')
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.jobId')) = jobId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.phase')) = phase
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) = kind
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.attemptId')) REGEXP '^[a-f0-9]{64}$', FALSE) = TRUE);

-- 3. Verification: stop before recording unless only the widened check exists and it names both added phases.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionRefreshStage'
      AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME IN ('PredictionRefreshStage_shape', 'PredictionRefreshStage_shape_v2')) <> 1
    OR (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape_v2' AND CHECK_CLAUSE LIKE '%preparation%'
      AND CHECK_CLAUSE LIKE '%evidence-empty%' AND CHECK_CLAUSE LIKE '%attemptId%') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The refresh stage check does not match the reviewed migration; it was not recorded.';
  END IF;
END //
DELIMITER ;

-- 4. Record the migration (checksum = SHA-256 of the committed migration.sql), once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''7f5ea665d6d0cffecaf9183ec03fe04b011ac4a1f28f92f33aa2db89494cb621'', NOW(3), ''20261025200000_refresh_stage_phases'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261025200000_refresh_stage_phases'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;

-- 5. Closing check. Expect one migration row with finished_at set, and one check, PredictionRefreshStage_shape_v2.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261025200000_refresh_stage_phases';
SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionRefreshStage' AND CONSTRAINT_TYPE = 'CHECK';
