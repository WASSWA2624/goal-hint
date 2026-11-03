-- MariaDB overlay. Pause writers and back up before applying; never retry a partial DDL migration.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103160000_readable_slip_and_referral_codes' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103170000_community_payment_alerts') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

-- AlterTable
ALTER TABLE `SubscriptionSettings` ADD COLUMN `communityLinks` JSON NULL,
    ADD COLUMN `paymentAlertRepeats` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    ADD COLUMN `paymentAlertsEnabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `PaymentReviewEvent` (
    `id` CHAR(36) NOT NULL,
    `eventKey` VARCHAR(100) NOT NULL,
    `paymentId` CHAR(36) NULL,
    `revision` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `testEndpointId` CHAR(36) NULL,
    `fannedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `resolvedAt` DATETIME(3) NULL,

    UNIQUE INDEX `PaymentReviewEvent_eventKey_key`(`eventKey`),
    INDEX `PaymentReviewEvent_resolvedAt_createdAt_idx`(`resolvedAt`, `createdAt`),
    INDEX `PaymentReviewEvent_fannedAt_createdAt_idx`(`fannedAt`, `createdAt`),
    INDEX `PaymentReviewEvent_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PaymentAlertEndpoint` (
    `id` CHAR(36) NOT NULL,
    `sessionHash` CHAR(64) NOT NULL,
    `transport` VARCHAR(12) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `subscription` JSON NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentAlertEndpoint_fingerprint_key`(`fingerprint`),
    INDEX `PaymentAlertEndpoint_enabled_createdAt_idx`(`enabled`, `createdAt`),
    UNIQUE INDEX `PaymentAlertEndpoint_sessionHash_transport_key`(`sessionHash`, `transport`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PaymentAlertDelivery` (
    `id` CHAR(36) NOT NULL,
    `eventId` CHAR(36) NOT NULL,
    `endpointId` CHAR(36) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL,
    `leaseUntil` DATETIME(3) NULL,
    `attemptId` CHAR(36) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `displayedAt` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NULL,
    `clearAttempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `clearNextAttemptAt` DATETIME(3) NULL,
    `clearedAt` DATETIME(3) NULL,
    `lastError` VARCHAR(32) NULL,

    INDEX `PaymentAlertDelivery_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    UNIQUE INDEX `PaymentAlertDelivery_eventId_endpointId_key`(`eventId`, `endpointId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `PaymentReviewEvent` ADD CONSTRAINT `PaymentReviewEvent_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `PaymentSubmission`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PaymentAlertEndpoint` ADD CONSTRAINT `PaymentAlertEndpoint_sessionHash_fkey` FOREIGN KEY (`sessionHash`) REFERENCES `MemberSession`(`tokenHash`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PaymentAlertDelivery` ADD CONSTRAINT `PaymentAlertDelivery_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `PaymentReviewEvent`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PaymentAlertDelivery` ADD CONSTRAINT `PaymentAlertDelivery_endpointId_fkey` FOREIGN KEY (`endpointId`) REFERENCES `PaymentAlertEndpoint`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;


-- Bounded operational settings and transport states, independent of receipt accounting.
ALTER TABLE SubscriptionSettings ADD CONSTRAINT SubscriptionSettings_payment_alert_repeats_check CHECK (paymentAlertRepeats BETWEEN 1 AND 3);
ALTER TABLE PaymentAlertEndpoint ADD CONSTRAINT PaymentAlertEndpoint_transport_check CHECK (transport IN ('web','fcm','windows-local'));
ALTER TABLE PaymentAlertDelivery ADD CONSTRAINT PaymentAlertDelivery_status_check CHECK (status IN ('queued','sending','accepted','cancelled','failed','clearing','cleared','clear-failed'));
ALTER TABLE PaymentReviewEvent ADD CONSTRAINT PaymentReviewEvent_source_check CHECK ((paymentId IS NOT NULL AND testEndpointId IS NULL) OR (paymentId IS NULL AND testEndpointId IS NOT NULL));

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('PaymentReviewEvent','PaymentAlertEndpoint','PaymentAlertDelivery')) <> 3
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME IN ('communityLinks','paymentAlertsEnabled','paymentAlertRepeats')) <> 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Community/payment alert schema verification failed.';
  END IF;
END //
DELIMITER ;
INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'e9cc48f46a9070b50119af6bc4e3a4b96afb821e8af410c9b0a166a4a829b390',NOW(3),'20261103170000_community_payment_alerts',NOW(3),1);
