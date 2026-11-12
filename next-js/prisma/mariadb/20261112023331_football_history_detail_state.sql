-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261111171000_paid_access_settings'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261112023331_football_history_detail_state') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballFixture' AND ENGINE = 'InnoDB') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryDetailState') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Football history detail prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

CREATE TABLE `FootballHistoryDetailState` (
    `fixtureId` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `state` JSON NOT NULL,
    `nextCheckAt` DATETIME(3) NULL,
    `checkedAt` DATETIME(3) NOT NULL,

    INDEX `FootballHistoryDetailState_nextCheckAt_idx`(`nextCheckAt`),
    PRIMARY KEY (`fixtureId`),
    CONSTRAINT `FootballHistoryDetailState_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryDetailState' AND ENGINE = 'InnoDB') <> 1
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryDetailState') <> 4
    OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryDetailState' AND SEQ_IN_INDEX = 1
      AND ((INDEX_NAME = 'PRIMARY' AND COLUMN_NAME = 'fixtureId')
        OR (INDEX_NAME = 'FootballHistoryDetailState_nextCheckAt_idx' AND COLUMN_NAME = 'nextCheckAt'))) <> 2
    OR (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryDetailState' AND CONSTRAINT_NAME = 'FootballHistoryDetailState_fixtureId_fkey'
      AND COLUMN_NAME = 'fixtureId' AND REFERENCED_TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'FootballFixture' AND REFERENCED_COLUMN_NAME = 'id') <> 1
    OR (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistoryDetailState' AND CONSTRAINT_NAME = 'FootballHistoryDetailState_fixtureId_fkey'
      AND DELETE_RULE = 'RESTRICT' AND UPDATE_RULE = 'RESTRICT') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Football history detail table verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'c17cf4dbd084734eddb253b7179e397fb4ce6673c1b46e9993b783f1c5f5cfa4',NOW(3),'20261112023331_football_history_detail_state',NOW(3),1);
