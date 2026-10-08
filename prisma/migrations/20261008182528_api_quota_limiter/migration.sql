-- CreateTable
CREATE TABLE `ApiQuotaAccount` (
    `id` CHAR(64) NOT NULL,
    `stateJson` JSON NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiQuotaPeriod` (
    `accountId` CHAR(64) NOT NULL,
    `id` CHAR(64) NOT NULL,
    `stateJson` JSON NOT NULL,

    PRIMARY KEY (`accountId`, `id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiQuotaAttempt` (
    `accountId` CHAR(64) NOT NULL,
    `id` CHAR(64) NOT NULL,
    `workKey` CHAR(64) NULL,
    `state` VARCHAR(16) NOT NULL,
    `priority` INTEGER NOT NULL,
    `queuedAt` DATETIME(3) NOT NULL,
    `deadlineAt` DATETIME(3) NOT NULL,
    `dispatchedAt` DATETIME(3) NULL,
    `periodId` CHAR(64) NULL,
    `sequence` INTEGER NULL,
    `payloadJson` JSON NOT NULL,

    INDEX `ApiQuotaAttempt_accountId_dispatchedAt_idx`(`accountId`, `dispatchedAt`),
    INDEX `ApiQuotaAttempt_accountId_state_priority_queuedAt_idx`(`accountId`, `state`, `priority`, `queuedAt`),
    INDEX `ApiQuotaAttempt_accountId_periodId_sequence_idx`(`accountId`, `periodId`, `sequence`),
    UNIQUE INDEX `ApiQuotaAttempt_accountId_workKey_key`(`accountId`, `workKey`),
    PRIMARY KEY (`accountId`, `id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ApiQuotaPeriod` ADD CONSTRAINT `ApiQuotaPeriod_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `ApiQuotaAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiQuotaAttempt` ADD CONSTRAINT `ApiQuotaAttempt_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `ApiQuotaAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
