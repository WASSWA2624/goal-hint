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
