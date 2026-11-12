-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261025200000_refresh_stage_phases'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261112090000_refresh_status_retry') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'PredictionRefreshStage' AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape_v2') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'PredictionRefreshStage' AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape_v3') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refresh stage prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

ALTER TABLE PredictionRefreshStage
  DROP CONSTRAINT PredictionRefreshStage_shape_v2,
  ADD CONSTRAINT PredictionRefreshStage_shape_v3 CHECK (COALESCE(
    phase IN ('preparation','evidence','evidence-empty','ai','fallback','observation','status-retry') AND kind IN ('started','completed')
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.jobId')) = jobId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.phase')) = phase
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) = kind
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.attemptId')) REGEXP '^[a-f0-9]{64}$', FALSE) = TRUE);

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'PredictionRefreshStage' AND CONSTRAINT_TYPE = 'CHECK'
      AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape_v2') <> 0
    OR (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'PredictionRefreshStage_shape_v3' AND CHECK_CLAUSE LIKE '%status-retry%'
      AND CHECK_CLAUSE LIKE '%attemptId%') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Refresh status retry verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'bb37a89478a19980c5dda89504513c4899e7bb3359571fbeca822d44609a5863',NOW(3),'20261112090000_refresh_status_retry',NOW(3),1);
