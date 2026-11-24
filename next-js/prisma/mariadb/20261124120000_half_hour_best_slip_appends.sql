-- MariaDB overlay for half-hour Best Slips slots. Pause publishers while applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261122190000_hourly_best_slip_appends'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261124120000_half_hour_best_slip_appends') <> 0
    OR NOT EXISTS (SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
      AND TRIGGER_NAME = 'DailyBestSlipAppendBatch_check_parent')
    OR EXISTS (SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
      AND TRIGGER_NAME = 'DailyBestSlipAppendBatch_check_slot') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Half-hour slip migration prerequisites missing or partially applied.';
  END IF;
END //

CREATE TRIGGER DailyBestSlipAppendBatch_check_slot BEFORE INSERT ON DailyBestSlipAppendBatch FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM DailySlipPublication p WHERE p.id = NEW.publicationId
      AND JSON_EXTRACT(p.bodyJson, '$.version') IN (3, 4)
      AND NEW.firstRank > JSON_EXTRACT(p.bodyJson, '$.count')
      AND NEW.publishedAt >= p.publishedAt
      AND DATE(DATE_ADD(NEW.hourAt, INTERVAL 3 HOUR)) = p.eatDate
      AND MINUTE(NEW.hourAt) IN (0, 30) AND SECOND(NEW.hourAt) = 0 AND MICROSECOND(NEW.hourAt) = 0
      AND NEW.publishedAt >= NEW.hourAt
      AND NEW.publishedAt < DATE_ADD(NEW.hourAt, INTERVAL IF(MINUTE(NEW.hourAt) = 0, 60, 30) MINUTE)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid Best Slips publication slot';
  END IF;
END //

DROP TRIGGER DailyBestSlipAppendBatch_check_parent //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'e5fc2add3acb031003ebeeaec3b83c8e76ecfdfb6081641703383da6f132c819',NOW(3),'20261124120000_half_hour_best_slip_appends',NOW(3),1);
