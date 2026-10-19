-- Paid access (prompt 058). Every table states InnoDB, because the production host can default to MyISAM, and
-- utf8mb4_bin, so phones, hashes, codes and references compare exactly.

-- CreateTable
CREATE TABLE `MemberAccount` (
    `id` CHAR(36) NOT NULL,
    `phone` VARCHAR(15) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `lastSignInAt` DATETIME(3) NOT NULL,
    `blockedAt` DATETIME(3) NULL,
    `blockedReason` VARCHAR(200) NULL,
    `ownerNote` VARCHAR(500) NULL,
    `trialRequestedAt` DATETIME(3) NULL,
    `trialDismissedAt` DATETIME(3) NULL,
    `erasedAt` DATETIME(3) NULL,

    UNIQUE INDEX `MemberAccount_phone_key`(`phone`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MemberSession` (
    `tokenHash` CHAR(64) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `codeEnteredAt` DATETIME(3) NULL,
    `accessCodeId` CHAR(36) NULL,

    INDEX `MemberSession_accountId_idx`(`accountId`),
    INDEX `MemberSession_expiresAt_idx`(`expiresAt`),
    INDEX `MemberSession_accessCodeId_accountId_idx`(`accessCodeId`, `accountId`),
    PRIMARY KEY (`tokenHash`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SubscriptionPlan` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `durationDays` SMALLINT UNSIGNED NOT NULL,
    `priceUgx` INTEGER UNSIGNED NOT NULL,
    `active` BOOLEAN NOT NULL,
    `sortOrder` SMALLINT UNSIGNED NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PaymentSubmission` (
    `id` CHAR(36) NOT NULL,
    `reference` CHAR(4) NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `planName` VARCHAR(40) NOT NULL,
    `durationDays` SMALLINT UNSIGNED NOT NULL,
    `priceUgx` INTEGER UNSIGNED NOT NULL,
    `payerPhone` VARCHAR(15) NULL,
    `claimedNetwork` VARCHAR(8) NOT NULL,
    `claimedTxnRef` VARCHAR(40) NOT NULL,
    `claimedTxnKey` VARCHAR(40) NOT NULL,
    `claimedAmountUgx` INTEGER UNSIGNED NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL,
    `submittedSessionHash` CHAR(64) NULL,
    `termsVersion` VARCHAR(16) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decidedBy` VARCHAR(64) NULL,
    `rejectReason` VARCHAR(16) NULL,
    `rejectText` VARCHAR(200) NULL,
    `network` VARCHAR(8) NULL,
    `transactionRef` VARCHAR(40) NULL,
    `amountReceivedUgx` INTEGER UNSIGNED NULL,
    `approvedTxnKey` VARCHAR(48) NULL,
    `imageSha256` CHAR(64) NULL,
    `imageBytes` INTEGER UNSIGNED NULL,
    `imagePurgedAt` DATETIME(3) NULL,
    `reversedAt` DATETIME(3) NULL,
    `reverseReason` VARCHAR(16) NULL,

    UNIQUE INDEX `PaymentSubmission_reference_key`(`reference`),
    UNIQUE INDEX `PaymentSubmission_approvedTxnKey_key`(`approvedTxnKey`),
    INDEX `PaymentSubmission_claimedTxnKey_idx`(`claimedTxnKey`),
    INDEX `PaymentSubmission_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `PaymentSubmission_accountId_submittedAt_idx`(`accountId`, `submittedAt`),
    INDEX `PaymentSubmission_imageSha256_idx`(`imageSha256`),
    INDEX `PaymentSubmission_planId_idx`(`planId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PaymentScreenshot` (
    `submissionId` CHAR(36) NOT NULL,
    `width` SMALLINT UNSIGNED NOT NULL,
    `height` SMALLINT UNSIGNED NOT NULL,
    `bytes` INTEGER UNSIGNED NOT NULL,
    `data` MEDIUMBLOB NOT NULL,

    PRIMARY KEY (`submissionId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `AccessCode` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `codeSalt` BINARY(16) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `reference` CHAR(4) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `paymentSubmissionId` CHAR(36) NULL,
    `replacedById` CHAR(36) NULL,
    `planId` CHAR(36) NULL,
    `planName` VARCHAR(40) NOT NULL,
    `durationDays` SMALLINT UNSIGNED NOT NULL,
    `priceUgx` INTEGER UNSIGNED NOT NULL,
    `amountReceivedUgx` INTEGER UNSIGNED NULL,
    `extensionDays` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `activatedAt` DATETIME(3) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `termsVersion` VARCHAR(16) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(32) NULL,
    `note` VARCHAR(200) NULL,

    UNIQUE INDEX `AccessCode_reference_key`(`reference`),
    UNIQUE INDEX `AccessCode_paymentSubmissionId_key`(`paymentSubmissionId`),
    INDEX `AccessCode_accountId_endsAt_idx`(`accountId`, `endsAt`),
    INDEX `AccessCode_replacedById_idx`(`replacedById`),
    INDEX `AccessCode_planId_idx`(`planId`),
    UNIQUE INDEX `AccessCode_id_accountId_key`(`id`, `accountId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SubscriptionSettings` (
    `id` TINYINT UNSIGNED NOT NULL,
    `paywallMode` VARCHAR(8) NOT NULL DEFAULT 'off',
    `mtnNumber` VARCHAR(15) NULL,
    `mtnName` VARCHAR(64) NULL,
    `mtnMenuShortcut` VARCHAR(60) NULL,
    `airtelNumber` VARCHAR(15) NULL,
    `airtelName` VARCHAR(64) NULL,
    `airtelMenuShortcut` VARCHAR(60) NULL,
    `copyFormat` VARCHAR(16) NOT NULL DEFAULT 'international',
    `contactPhone` VARCHAR(15) NULL,
    `whatsappPhone` VARCHAR(15) NULL,
    `paymentNote` VARCHAR(300) NULL,
    `reviewTime` VARCHAR(60) NULL,
    `maxUnlockedDevices` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `trialDays` TINYINT UNSIGNED NOT NULL DEFAULT 2,
    `screenshotRetentionDays` SMALLINT UNSIGNED NOT NULL DEFAULT 90,
    `paymentNumbersChangedAt` DATETIME(3) NULL,
    `lastMembersPurgeAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RateLimitBucket` (
    `key` CHAR(64) NOT NULL,
    `count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `bytes` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `windowStartedAt` DATETIME(3) NOT NULL,
    `lockedUntil` DATETIME(3) NULL,

    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OwnerAuditEvent` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `at` DATETIME(3) NOT NULL,
    `actor` VARCHAR(64) NOT NULL,
    `action` VARCHAR(48) NOT NULL,
    `accountId` CHAR(36) NULL,
    `targetType` VARCHAR(32) NOT NULL,
    `targetId` VARCHAR(64) NOT NULL,
    `details` JSON NOT NULL,

    INDEX `OwnerAuditEvent_accountId_action_at_idx`(`accountId`, `action`, `at`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `MemberSession` ADD CONSTRAINT `MemberSession_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MemberSession` ADD CONSTRAINT `MemberSession_accessCode_fkey` FOREIGN KEY (`accessCodeId`, `accountId`) REFERENCES `AccessCode`(`id`, `accountId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PaymentSubmission` ADD CONSTRAINT `PaymentSubmission_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PaymentSubmission` ADD CONSTRAINT `PaymentSubmission_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PaymentScreenshot` ADD CONSTRAINT `PaymentScreenshot_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `PaymentSubmission`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccessCode` ADD CONSTRAINT `AccessCode_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccessCode` ADD CONSTRAINT `AccessCode_paymentSubmissionId_fkey` FOREIGN KEY (`paymentSubmissionId`) REFERENCES `PaymentSubmission`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccessCode` ADD CONSTRAINT `AccessCode_replacedById_fkey` FOREIGN KEY (`replacedById`) REFERENCES `AccessCode`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AccessCode` ADD CONSTRAINT `AccessCode_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma does not represent CHECK constraints. These reviewed shapes back the application validators: canonical phone
-- digits (src/domain/phone.ts), the documented states, sources, networks and reasons, and the owner's ranges.
ALTER TABLE `MemberAccount`
    ADD CONSTRAINT `MemberAccount_phone_check` CHECK (
        `phone` IS NULL OR (`phone` REGEXP '^[1-9][0-9]{9,14}$' AND (`phone` NOT LIKE '256%' OR `phone` REGEXP '^2567[0-9]{8}$'))
    );

-- A session is unlocked by exactly one entered code, or not at all.
ALTER TABLE `MemberSession`
    ADD CONSTRAINT `MemberSession_unlock_check` CHECK ((`codeEnteredAt` IS NULL) = (`accessCodeId` IS NULL));

ALTER TABLE `SubscriptionPlan`
    ADD CONSTRAINT `SubscriptionPlan_shape_check` CHECK (
        CHAR_LENGTH(`name`) > 0 AND `durationDays` BETWEEN 1 AND 366 AND `priceUgx` BETWEEN 100 AND 10000000
    );

ALTER TABLE `PaymentSubmission`
    ADD CONSTRAINT `PaymentSubmission_state_check` CHECK (
        `source` IN ('report', 'owner')
        AND `status` IN ('pending', 'superseded', 'approved', 'rejected', 'reversed')
        AND `claimedNetwork` IN ('mtn', 'airtel')
        AND (`network` IS NULL OR `network` IN ('mtn', 'airtel'))
        AND `durationDays` BETWEEN 1 AND 366
        AND (`rejectReason` IS NULL
            OR `rejectReason` IN ('unreadable', 'amount-mismatch', 'not-received', 'duplicate', 'wrong-number', 'other'))
        AND (`reverseReason` IS NULL OR `reverseReason` IN ('network-reversal', 'wrong-account'))
        AND (`source` = 'report' OR (`status` IN ('approved', 'reversed')
            AND `imageSha256` IS NULL AND `submittedSessionHash` IS NULL AND `termsVersion` IS NULL))
    ),
    ADD CONSTRAINT `PaymentSubmission_payerPhone_check` CHECK (
        `payerPhone` IS NULL
        OR (`payerPhone` REGEXP '^[1-9][0-9]{9,14}$' AND (`payerPhone` NOT LIKE '256%' OR `payerPhone` REGEXP '^2567[0-9]{8}$'))
    ),
    -- The unique approval key exists exactly for approved and reversed payments and names the approved network, so a
    -- payment cannot be approved without claiming its (network, txnKey) slot.
    ADD CONSTRAINT `PaymentSubmission_approval_check` CHECK (
        (`approvedTxnKey` IS NULL AND `status` IN ('pending', 'superseded', 'rejected'))
        OR (`approvedTxnKey` IS NOT NULL AND `status` IN ('approved', 'reversed') AND `network` IS NOT NULL
            AND `approvedTxnKey` LIKE CONCAT(`network`, ':_%'))
    );

ALTER TABLE `PaymentScreenshot`
    ADD CONSTRAINT `PaymentScreenshot_shape_check` CHECK (
        `width` BETWEEN 1 AND 4096 AND `height` BETWEEN 1 AND 4096 AND `bytes` = LENGTH(`data`)
    );

-- Only the code created at approval carries a submission; reissued, manual, number-change and trial codes never do.
ALTER TABLE `AccessCode`
    ADD CONSTRAINT `AccessCode_shape_check` CHECK (
        `source` IN ('payment', 'manual', 'reissue', 'number-change', 'trial')
        AND (`source` = 'payment') = (`paymentSubmissionId` IS NOT NULL)
        AND `durationDays` BETWEEN 1 AND 366
        AND `endsAt` > `startsAt`
    );

ALTER TABLE `SubscriptionSettings`
    ADD CONSTRAINT `SubscriptionSettings_shape_check` CHECK (
        `id` = 1
        AND `paywallMode` IN ('off', 'test', 'on')
        AND `copyFormat` IN ('international', 'local')
        AND `maxUnlockedDevices` BETWEEN 1 AND 5
        AND `trialDays` BETWEEN 0 AND 7
        AND `screenshotRetentionDays` BETWEEN 7 AND 365
    ),
    ADD CONSTRAINT `SubscriptionSettings_phones_check` CHECK (
        (`mtnNumber` IS NULL
            OR (`mtnNumber` REGEXP '^[1-9][0-9]{9,14}$' AND (`mtnNumber` NOT LIKE '256%' OR `mtnNumber` REGEXP '^2567[0-9]{8}$')))
        AND (`airtelNumber` IS NULL
            OR (`airtelNumber` REGEXP '^[1-9][0-9]{9,14}$' AND (`airtelNumber` NOT LIKE '256%' OR `airtelNumber` REGEXP '^2567[0-9]{8}$')))
        AND (`contactPhone` IS NULL
            OR (`contactPhone` REGEXP '^[1-9][0-9]{9,14}$' AND (`contactPhone` NOT LIKE '256%' OR `contactPhone` REGEXP '^2567[0-9]{8}$')))
        AND (`whatsappPhone` IS NULL
            OR (`whatsappPhone` REGEXP '^[1-9][0-9]{9,14}$' AND (`whatsappPhone` NOT LIKE '256%' OR `whatsappPhone` REGEXP '^2567[0-9]{8}$')))
    ),
    -- A menu shortcut is digits, * and # with an optional {amount}, and exists only beside its payment number.
    ADD CONSTRAINT `SubscriptionSettings_shortcuts_check` CHECK (
        (`mtnMenuShortcut` IS NULL OR (`mtnNumber` IS NOT NULL AND `mtnMenuShortcut` REGEXP '^([0-9*#]|[{]amount[}])+$'))
        AND (`airtelMenuShortcut` IS NULL
            OR (`airtelNumber` IS NOT NULL AND `airtelMenuShortcut` REGEXP '^([0-9*#]|[{]amount[}])+$'))
    );
