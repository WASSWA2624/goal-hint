-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261112110000_football_history_subjects'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261113130000_football_history_import_status') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryImportStatus') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Football history status prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

CREATE TABLE `FootballHistoryImportStatus` (
    `phase` VARCHAR(32) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `coverage` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`phase`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryImportStatus' AND ENGINE = 'InnoDB') <> 1
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryImportStatus') <> 4
    OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryImportStatus' AND INDEX_NAME = 'PRIMARY' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'phase') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Football history status table verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'bb7cab7355f4ebab08b1f60f61d5c90836daa03327383a70c053735e1c6275bd',NOW(3),
  '20261113130000_football_history_import_status',NOW(3),1);
