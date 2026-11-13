CREATE TABLE `FootballHistoryImportStatus` (
    `phase` VARCHAR(32) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `coverage` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`phase`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
