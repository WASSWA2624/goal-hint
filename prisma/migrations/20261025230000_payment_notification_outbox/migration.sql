CREATE TABLE `PaymentNotificationOutbox` (
  `id` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `targetType` VARCHAR(16) NOT NULL,
  `targetId` CHAR(36) NOT NULL,
  `decision` VARCHAR(8) NOT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'queued',
  `createdAt` DATETIME(3) NOT NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `attemptId` CHAR(36) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PaymentNotificationOutbox_targetType_targetId_decision_key` (`targetType`, `targetId`, `decision`),
  INDEX `PaymentNotificationOutbox_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `PaymentNotificationOutbox_status_finishedAt_idx` (`status`, `finishedAt`),
  INDEX `PaymentNotificationOutbox_accountId_idx` (`accountId`),
  CONSTRAINT `PaymentNotificationOutbox_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `PaymentNotificationOutbox_decision_check` CHECK (
    (`targetType` = 'payment' AND `decision` IN ('approved', 'credited', 'rejected')) OR
    (`targetType` = 'access-code' AND `decision` = 'renewed')
  ),
  CONSTRAINT `PaymentNotificationOutbox_state_check` CHECK (
    (`status` = 'queued' AND `startedAt` IS NULL AND `finishedAt` IS NULL AND `attemptId` IS NULL) OR
    (`status` = 'dispatching' AND `startedAt` IS NOT NULL AND `finishedAt` IS NULL AND `attemptId` IS NOT NULL) OR
    (`status` IN ('sent', 'failed', 'uncertain') AND `startedAt` IS NOT NULL AND `finishedAt` IS NOT NULL AND `attemptId` IS NOT NULL) OR
    (`status` IN ('unsupported', 'unavailable', 'cancelled') AND `startedAt` IS NULL AND `finishedAt` IS NOT NULL AND `attemptId` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
