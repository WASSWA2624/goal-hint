-- MariaDB overlay. Extend the publication shape without rewriting sealed history.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261122170000_frozen_local_featured'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261122180000_daily_best_slip_combinations') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

CREATE TABLE `DailyBestSlipCombination` (
    `eatDate` DATE NOT NULL,
    `combination` CHAR(64) NOT NULL,
    `slipId` CHAR(64) NOT NULL,
    PRIMARY KEY (`eatDate`, `combination`),
    UNIQUE KEY `DailyBestSlipCombination_slipId_key` (`slipId`),
    CONSTRAINT `DailyBestSlipCombination_slipId_fkey` FOREIGN KEY (`slipId`) REFERENCES `PublishedSlip` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER `DailyBestSlipCombination_no_update` BEFORE UPDATE ON `DailyBestSlipCombination` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Daily Best Slips combination membership is immutable';

CREATE TRIGGER `DailyBestSlipCombination_no_delete` BEFORE DELETE ON `DailyBestSlipCombination` FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Daily Best Slips combination membership is immutable';

ALTER TABLE DailySlipPublication
  DROP CONSTRAINT DailySlipPublication_body_shape_v4,
  ADD CONSTRAINT DailySlipPublication_body_shape_v5 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand AND (
          (JSON_EXTRACT(bodyJson, '$.version') = 2 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
          OR (JSON_EXTRACT(bodyJson, '$.version') = 3 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 10)
        ))
    ), FALSE) = TRUE);

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'005e46677e1a02f44086d8a2eeb342016046c6fa3f6a425dab69d54e0ba4c881',NOW(3),'20261122180000_daily_best_slip_combinations',NOW(3),1);
