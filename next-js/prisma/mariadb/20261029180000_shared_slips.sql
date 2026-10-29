-- MariaDB 11.4 overlay for 20261029180000_shared_slips.
-- Apply with the migration account after a verified backup. No existing rows are changed.
-- MariaDB DDL is not transactional; stop on an error rather than importing a partial overlay again.

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME IN ('MemberAccount','MemberSession','RateLimitBucket') AND ENGINE='InnoDB') <> 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Member storage must be installed before shared slips.';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SharedSlip') <> 0
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='20261029180000_shared_slips') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shared slips are already applied or partly applied; nothing was imported.';
  END IF;
END //
DELIMITER ;

CREATE TABLE `SharedSlip` (
  `id` CHAR(32) NOT NULL,
  `ownerKey` CHAR(64) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `snapshotJson` JSON NOT NULL,
  `integrity` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SharedSlip_ownerKey_fingerprint_key` (`ownerKey`, `fingerprint`),
  CONSTRAINT `SharedSlip_identity_shape` CHECK (`id` REGEXP '^[a-f0-9]{32}$' AND `ownerKey` REGEXP '^[a-f0-9]{64}$' AND `fingerprint` REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT `SharedSlip_snapshot_shape` CHECK (COALESCE(JSON_LENGTH(`snapshotJson`, '$.selections') BETWEEN 1 AND 800
    AND OCTET_LENGTH(CAST(`snapshotJson` AS CHAR)) <= 8388608, FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TRIGGER SharedSlip_no_update BEFORE UPDATE ON SharedSlip FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shared slips are immutable.';

CREATE TRIGGER SharedSlip_no_delete BEFORE DELETE ON SharedSlip FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shared slip links are permanent.';

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SharedSlip') <> 6
    OR (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
      AND TRIGGER_NAME IN ('SharedSlip_no_update','SharedSlip_no_delete')) <> 2
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND TABLE_NAME='SharedSlip' AND CONSTRAINT_NAME IN ('SharedSlip_identity_shape','SharedSlip_snapshot_shape')) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Shared slip storage does not match; the migration was not recorded.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
VALUES (UUID(),'e0381e46523e3390b44e0a263b0611e15f541b8467fcd817d84239bf191b8b67',NOW(3),
  '20261029180000_shared_slips',NULL,NULL,NOW(3),1);

SELECT migration_name,finished_at FROM _prisma_migrations WHERE migration_name='20261029180000_shared_slips';
