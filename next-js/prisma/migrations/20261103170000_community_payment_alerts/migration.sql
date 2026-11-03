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
