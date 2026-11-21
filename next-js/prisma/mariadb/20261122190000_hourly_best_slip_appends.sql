-- MariaDB overlay for immutable hourly slips. Apply only after a verified backup.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261122180000_daily_best_slip_combinations'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261122190000_hourly_best_slip_appends') <> 0
    OR EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'DailyBestSlipAppendBatch')
    OR EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'PublishedSlip' AND COLUMN_NAME = 'appendBatchId') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hourly slip migration prerequisites missing or partially applied.';
  END IF;
END //
DELIMITER ;

-- Existing publications and ranks remain immutable. A zero-count version-four parent
-- is an anchor whose first nonempty hourly batch commits in the same transaction.
ALTER TABLE DailySlipPublication
  MODIFY COLUMN modelId CHAR(64) NULL,
  DROP CONSTRAINT DailySlipPublication_body_shape_v5,
  ADD CONSTRAINT DailySlipPublication_body_shape_v6 CHECK (COALESCE(
    (modelId IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand AND (
          (JSON_EXTRACT(bodyJson, '$.version') = 2 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
          OR (JSON_EXTRACT(bodyJson, '$.version') = 3 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 10)
        ))
    )) OR (modelId IS NULL AND oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
      AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand
      AND JSON_EXTRACT(bodyJson, '$.version') = 4 AND JSON_EXTRACT(bodyJson, '$.count') = 0
      AND JSON_TYPE(JSON_EXTRACT(bodyJson, '$.model')) = 'NULL'), FALSE) = TRUE);

CREATE TABLE `DailyBestSlipAppendBatch` (
    `id` CHAR(64) NOT NULL,
    `publicationId` CHAR(64) NOT NULL,
    `hourAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `firstRank` TINYINT UNSIGNED NOT NULL,
    `count` TINYINT UNSIGNED NOT NULL,
    `bodyJson` JSON NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `DailyBestSlipAppendBatch_id_publicationId_key` (`id`, `publicationId`),
    UNIQUE KEY `DailyBestSlipAppendBatch_publicationId_hourAt_key` (`publicationId`, `hourAt`),
    UNIQUE KEY `DailyBestSlipAppendBatch_publicationId_firstRank_key` (`publicationId`, `firstRank`),
    CONSTRAINT `DailyBestSlipAppendBatch_publicationId_fkey` FOREIGN KEY (`publicationId`)
      REFERENCES `DailySlipPublication` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `DailyBestSlipAppendBatch_rank_shape` CHECK (`firstRank` BETWEEN 1 AND 10 AND `count` BETWEEN 1 AND 10
      AND `firstRank` + `count` <= 11),
    CONSTRAINT `DailyBestSlipAppendBatch_body_shape` CHECK (COALESCE(
      JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.firstRank') = `firstRank`
      AND JSON_EXTRACT(bodyJson, '$.count') = `count`, FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE PublishedSlip
  ADD COLUMN appendBatchId CHAR(64) NULL,
  ADD INDEX PublishedSlip_appendBatchId_publicationId_idx (appendBatchId, publicationId),
  ADD CONSTRAINT PublishedSlip_appendBatchId_publicationId_fkey FOREIGN KEY (appendBatchId, publicationId)
    REFERENCES DailyBestSlipAppendBatch (id, publicationId) ON DELETE RESTRICT ON UPDATE RESTRICT,
  DROP CONSTRAINT PublishedSlip_snapshot_shape,
  ADD CONSTRAINT PublishedSlip_snapshot_shape_v2 CHECK (COALESCE(
    JSON_LENGTH(JSON_EXTRACT(snapshotJson, '$.slip.selections')) BETWEEN 1 AND 8 AND
    ((appendBatchId IS NULL AND JSON_EXTRACT(snapshotJson, '$.estimatedProbability') BETWEEN 0 AND 1)
      OR (appendBatchId IS NOT NULL AND JSON_EXTRACT(snapshotJson, '$.estimatedProbability') IS NULL)), FALSE) = TRUE);

DELIMITER //
CREATE TRIGGER DailyBestSlipAppendBatch_no_update BEFORE UPDATE ON DailyBestSlipAppendBatch FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hourly Best Slips batches are immutable';
END //

CREATE TRIGGER DailyBestSlipAppendBatch_no_delete BEFORE DELETE ON DailyBestSlipAppendBatch FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hourly Best Slips batches are immutable';
END //

CREATE TRIGGER DailyBestSlipAppendBatch_check_parent BEFORE INSERT ON DailyBestSlipAppendBatch FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM DailySlipPublication p WHERE p.id = NEW.publicationId
      AND JSON_EXTRACT(p.bodyJson, '$.version') IN (3, 4)
      AND NEW.firstRank > JSON_EXTRACT(p.bodyJson, '$.count')
      AND NEW.publishedAt >= p.publishedAt
      AND DATE(DATE_ADD(NEW.hourAt, INTERVAL 3 HOUR)) = p.eatDate
      AND MINUTE(NEW.hourAt) = 0 AND SECOND(NEW.hourAt) = 0 AND MICROSECOND(NEW.hourAt) = 0
      AND NEW.publishedAt >= NEW.hourAt AND NEW.publishedAt < DATE_ADD(NEW.hourAt, INTERVAL 1 HOUR)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid hourly Best Slips publication';
  END IF;
END //

CREATE TRIGGER PublishedSlip_check_append_membership BEFORE INSERT ON PublishedSlip FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM DailySlipPublication p LEFT JOIN DailyBestSlipAppendBatch b
      ON b.id = NEW.appendBatchId AND b.publicationId = p.id
    WHERE p.id = NEW.publicationId AND (
      (NEW.appendBatchId IS NULL AND JSON_EXTRACT(p.bodyJson, '$.version') IN (1, 2, 3)
        AND NEW.`rank` <= JSON_EXTRACT(p.bodyJson, '$.count'))
      OR (b.id IS NOT NULL AND NEW.`rank` >= b.firstRank AND NEW.`rank` < b.firstRank + b.count)
    )
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip rank is outside its immutable batch';
  END IF;
END //

DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'918dd50acdb2a557ed2c16bd6d4e6a34bf8d71fcaf5ab9b6210b17a9ec2af5ef',NOW(3),'20261122190000_hourly_best_slip_appends',NOW(3),1);
