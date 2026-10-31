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

