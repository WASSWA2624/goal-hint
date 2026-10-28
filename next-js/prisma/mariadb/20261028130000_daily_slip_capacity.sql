-- MariaDB 11.4 overlay for 20261028130000_daily_slip_capacity.
-- Widen the two checks in place without changing published bodies, identities or append-only triggers.
-- Apply with the migration account while app and worker writes are stopped, after a verified private backup.
-- MariaDB DDL is not transactional. Stop on any error and restore the backup before retrying a partial import.

-- 1. Guard before changing either check.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261025113516_daily_slip_publications'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apply the daily slip publication migration first; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261028130000_daily_slip_capacity') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME IN ('PublishedSlip_rank_shape_v2','DailySlipPublication_body_shape_v2')) <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Daily slip capacity is already applied or partly applied; nothing was imported.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME IN ('PublishedSlip_rank_shape','DailySlipPublication_body_shape')) <> 2
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE = 'InnoDB'
      AND TABLE_NAME IN ('PublishedSlip','DailySlipPublication')) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Original slip checks or InnoDB tables are missing; nothing was imported.';
  END IF;
END //
DELIMITER ;

-- 2. The schema, identical to migration.sql.
ALTER TABLE PublishedSlip
  DROP CONSTRAINT PublishedSlip_rank_shape,
  ADD CONSTRAINT PublishedSlip_rank_shape_v2 CHECK (`rank` BETWEEN 1 AND 100);
ALTER TABLE DailySlipPublication
  DROP CONSTRAINT DailySlipPublication_body_shape,
  ADD CONSTRAINT DailySlipPublication_body_shape_v2 CHECK (COALESCE(
    JSON_EXTRACT(bodyJson, '$.version') = 1
    AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId
    AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100, FALSE) = TRUE);

-- 3. Verify the two new checks before recording the migration.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME IN ('PublishedSlip_rank_shape','DailySlipPublication_body_shape',
        'PublishedSlip_rank_shape_v2','DailySlipPublication_body_shape_v2')) <> 2
    OR (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME IN ('PublishedSlip_rank_shape_v2','DailySlipPublication_body_shape_v2')
      AND CHECK_CLAUSE LIKE '%100%') <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Daily slip capacity checks do not match; the migration was not recorded.';
  END IF;
END //
DELIMITER ;

-- 4. Record the SHA-256 of the committed migration.sql, once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''230a9afc0c9afd30f67a6a7f9fa15722c02f473def6acb144a8136078cb0df17'', NOW(3), ''20261028130000_daily_slip_capacity'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261028130000_daily_slip_capacity'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;

-- 5. Closing check.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261028130000_daily_slip_capacity';
SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME IN ('PublishedSlip_rank_shape_v2','DailySlipPublication_body_shape_v2');
