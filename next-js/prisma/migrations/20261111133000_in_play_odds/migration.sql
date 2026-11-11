CREATE TABLE `FixtureInPlayOdds` (
    `fixtureId` CHAR(36) NOT NULL,
    `kickoffAt` DATETIME(3) NOT NULL,
    `homeTeamId` CHAR(36) NOT NULL,
    `awayTeamId` CHAR(36) NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL,
    `changedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `semanticHash` CHAR(64) NOT NULL,
    `bodyJson` JSON NOT NULL,

    INDEX `FixtureInPlayOdds_checkedAt_idx`(`checkedAt`),
    PRIMARY KEY (`fixtureId`),
    CONSTRAINT `FixtureInPlayOdds_fixtureId_fkey` FOREIGN KEY (`fixtureId`)
        REFERENCES `FootballFixture` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE `InPlayOddsPollState` (
    `provider` VARCHAR(32) NOT NULL,
    `nextPollAt` DATETIME(3) NOT NULL,
    `catalogDueAt` DATETIME(3) NOT NULL,
    `catalogJson` JSON NOT NULL,

    PRIMARY KEY (`provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
