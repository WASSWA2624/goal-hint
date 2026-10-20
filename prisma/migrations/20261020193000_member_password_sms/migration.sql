-- Existing number-only sessions deliberately remain unauthenticated. Members establish a password by SMS reset.
ALTER TABLE `MemberAccount` ADD COLUMN `passwordHash` VARCHAR(255) NULL;
ALTER TABLE `MemberSession` ADD COLUMN `authenticatedAt` DATETIME(3) NULL;

CREATE TABLE `MemberVerification` (
    `id` CHAR(36) NOT NULL,
    `accountId` CHAR(36) NULL,
    `phone` VARCHAR(15) NOT NULL,
    `purpose` VARCHAR(12) NOT NULL,
    `bindingHash` CHAR(64) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `proofHash` CHAR(64) NULL,
    `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `consumedAt` DATETIME(3) NULL,
    PRIMARY KEY (`id`),
    INDEX `MemberVerification_phone_createdAt_idx` (`phone`, `createdAt`),
    INDEX `MemberVerification_accountId_idx` (`accountId`),
    INDEX `MemberVerification_bindingHash_purpose_idx` (`bindingHash`, `purpose`),
    INDEX `MemberVerification_expiresAt_idx` (`expiresAt`),
    CONSTRAINT `MemberVerification_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
