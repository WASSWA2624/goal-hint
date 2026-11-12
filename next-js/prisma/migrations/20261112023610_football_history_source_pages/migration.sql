-- CreateTable
CREATE TABLE `FootballHistorySourcePage` (
    `id` CHAR(64) NOT NULL,
    `endpoint` VARCHAR(40) NOT NULL,
    `selectorHash` CHAR(64) NOT NULL,
    `parameters` JSON NOT NULL,
    `contract` VARCHAR(96) NOT NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `rowCount` INTEGER UNSIGNED NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `compressedRows` LONGBLOB NOT NULL,

    INDEX `FootballHistorySourcePage_endpoint_selectorHash_retrievedAt_idx`(`endpoint`, `selectorHash`, `retrievedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

