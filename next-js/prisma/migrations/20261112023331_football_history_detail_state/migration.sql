-- CreateTable
CREATE TABLE `FootballHistoryDetailState` (
    `fixtureId` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `state` JSON NOT NULL,
    `nextCheckAt` DATETIME(3) NULL,
    `checkedAt` DATETIME(3) NOT NULL,

    INDEX `FootballHistoryDetailState_nextCheckAt_idx`(`nextCheckAt`),
    PRIMARY KEY (`fixtureId`),
    CONSTRAINT `FootballHistoryDetailState_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

