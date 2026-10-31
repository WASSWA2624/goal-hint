-- MariaDB 11.4 overlay; apply once after backup, stopping on errors.
DELIMITER //
BEGIN NOT ATOMIC
  IF EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='MemberNotification')
    OR EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='20261031104143_account_notifications') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Notification storage is already or partly installed; stop.';
  END IF;
END //
DELIMITER ;
-- CreateTable
CREATE TABLE `MemberNotification` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `eventKey` VARCHAR(96) NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `readAt` DATETIME(3) NULL,
    `dismissedAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,

    INDEX `MemberNotification_feed_idx`(`accountId`, `dismissedAt`, `withdrawnAt`, `occurredAt`, `id`),
    INDEX `MemberNotification_unread_idx`(`accountId`, `readAt`, `dismissedAt`, `withdrawnAt`),
    INDEX `MemberNotification_occurredAt_idx`(`occurredAt`),
    UNIQUE INDEX `MemberNotification_accountId_eventKey_key`(`accountId`, `eventKey`),
    PRIMARY KEY (`id`),
    CONSTRAINT `MemberNotification_shape_check` CHECK (
      `kind` IN ('payment-approved','payment-rejected','access-activated','access-expiring','access-expired','referral-earned')
      AND CHAR_LENGTH(`eventKey`) BETWEEN 1 AND 96
      AND `createdAt` >= `occurredAt`
      AND (`readAt` IS NULL OR `readAt` >= `occurredAt`)
      AND (`dismissedAt` IS NULL OR `dismissedAt` >= `occurredAt`)
      AND (`withdrawnAt` IS NULL OR `withdrawnAt` >= `occurredAt`)
      AND ((`kind` IN ('access-expiring','access-expired')) = (`expiresAt` IS NOT NULL))
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `MemberNotification` ADD CONSTRAINT `MemberNotification_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;


DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='MemberNotification') <> 10
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='MemberNotification' AND CONSTRAINT_TYPE='FOREIGN KEY') <> 1
    OR NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='MemberNotification_shape_check') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Notification storage differs; migration was not recorded.';
  END IF;
END //
DELIMITER ;
INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
VALUES (UUID(),'f5a653a451e0572917dc6eb76f9faaa6ef49b75148b29529bc9fdc6458e14709',NOW(3),'20261031104143_account_notifications',NULL,NULL,NOW(3),1);
