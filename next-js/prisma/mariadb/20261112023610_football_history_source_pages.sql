-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261112023331_football_history_detail_state'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261112023610_football_history_source_pages') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistorySourcePage') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Football history source prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

CREATE TABLE `FootballHistorySourcePage` (
    `id` CHAR(64) NOT NULL,
    `endpoint` VARCHAR(40) NOT NULL,
    `selectorHash` CHAR(64) NOT NULL,
    `parameters` JSON NOT NULL,
    `contract` VARCHAR(96) NOT NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `rowCount` INTEGER UNSIGNED NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `compressedRows` LONGBLOB NOT NULL,

    INDEX `FootballHistorySourcePage_endpoint_selectorHash_retrievedAt_idx`(`endpoint`, `selectorHash`, `retrievedAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistorySourcePage' AND ENGINE = 'InnoDB') <> 1
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistorySourcePage') <> 9
    OR (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'FootballHistorySourcePage'
      AND ((INDEX_NAME = 'PRIMARY' AND SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'id')
        OR (INDEX_NAME = 'FootballHistorySourcePage_endpoint_selectorHash_retrievedAt_idx'
          AND ((SEQ_IN_INDEX = 1 AND COLUMN_NAME = 'endpoint') OR (SEQ_IN_INDEX = 2 AND COLUMN_NAME = 'selectorHash')
            OR (SEQ_IN_INDEX = 3 AND COLUMN_NAME = 'retrievedAt'))))) <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Football history source table verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'1412bd6f894e45fd20387bdd5540196088b72d893b347648653bcc03c8831dd5',NOW(3),'20261112023610_football_history_source_pages',NOW(3),1);
