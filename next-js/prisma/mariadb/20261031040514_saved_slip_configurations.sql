-- MariaDB 11.4 overlay for saved Slip Builder configurations.
-- Stop on errors; DDL is not transactional. Apply only once after a verified backup.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='MemberAccount' AND ENGINE='InnoDB') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Install member storage before saved configurations.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SlipConfiguration')
    OR EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='20261031040514_saved_slip_configurations') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Saved configurations are already or partly installed; stop.';
  END IF;
END //
DELIMITER ;

-- CreateTable
CREATE TABLE `SlipConfiguration` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `nameKey` VARCHAR(120) NOT NULL,
    `parameters` VARCHAR(2048) NOT NULL,
    `isDefault` BOOLEAN NULL,
    `revision` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SlipConfiguration_accountId_nameKey_key`(`accountId`, `nameKey`),
    UNIQUE INDEX `SlipConfiguration_accountId_isDefault_key`(`accountId`, `isDefault`),
    PRIMARY KEY (`id`),
    CONSTRAINT `SlipConfiguration_default_check` CHECK (`isDefault` IS NULL OR `isDefault` = TRUE),
    CONSTRAINT `SlipConfiguration_revision_check` CHECK (`revision` >= 1)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `SlipConfiguration` ADD CONSTRAINT `SlipConfiguration_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SlipConfiguration') <> 9
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SlipConfiguration' AND CONSTRAINT_TYPE='FOREIGN KEY') <> 1
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SlipConfiguration'
      AND CONSTRAINT_NAME IN ('SlipConfiguration_accountId_nameKey_key','SlipConfiguration_accountId_isDefault_key',
        'SlipConfiguration_default_check','SlipConfiguration_revision_check')) <> 4
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SlipConfiguration'
      AND ENGINE='InnoDB' AND TABLE_COLLATION='utf8mb4_bin') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Saved configuration schema differs; migration was not recorded.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
VALUES (UUID(),'f5d990de0df614c56bc639d996dcf67195f7eba54b2666a6a8dffdb2890f17b3',NOW(3),'20261031040514_saved_slip_configurations',NULL,NULL,NOW(3),1);
