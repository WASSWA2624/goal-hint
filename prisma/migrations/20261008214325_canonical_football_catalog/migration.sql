-- CreateTable
CREATE TABLE `FootballCatalogLock` (
    `provider` VARCHAR(32) NOT NULL,

    PRIMARY KEY (`provider`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballTeam` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(512) NULL,
    `nameSearch` VARCHAR(512) NULL,
    `code` VARCHAR(64) NULL,
    `country` VARCHAR(256) NULL,
    `countrySearch` VARCHAR(256) NULL,
    `national` BOOLEAN NULL,
    `logoUrl` VARCHAR(2048) NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FootballTeam_nameSearch_idx`(`nameSearch`),
    INDEX `FootballTeam_countrySearch_nameSearch_idx`(`countrySearch`, `nameSearch`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballTeamProvider` (
    `provider` VARCHAR(32) NOT NULL,
    `externalId` BIGINT UNSIGNED NOT NULL,
    `teamId` CHAR(36) NOT NULL,
    `evidenceRef` VARCHAR(512) NULL,
    `sourceRef` VARCHAR(512) NULL,
    `mappedAt` DATETIME(3) NOT NULL,

    INDEX `FootballTeamProvider_teamId_idx`(`teamId`),
    PRIMARY KEY (`provider`, `externalId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballTeamAlias` (
    `teamId` CHAR(36) NOT NULL,
    `normalizedSearch` VARCHAR(512) NOT NULL,
    `name` VARCHAR(512) NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `sourceRef` VARCHAR(512) NOT NULL,

    INDEX `FootballTeamAlias_normalizedSearch_idx`(`normalizedSearch`),
    PRIMARY KEY (`teamId`, `normalizedSearch`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballCompetition` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(512) NULL,
    `nameSearch` VARCHAR(512) NULL,
    `country` VARCHAR(256) NULL,
    `countrySearch` VARCHAR(256) NULL,
    `type` VARCHAR(32) NULL,
    `logoUrl` VARCHAR(2048) NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FootballCompetition_nameSearch_idx`(`nameSearch`),
    INDEX `FootballCompetition_countrySearch_nameSearch_idx`(`countrySearch`, `nameSearch`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballCompetitionProvider` (
    `provider` VARCHAR(32) NOT NULL,
    `externalId` BIGINT UNSIGNED NOT NULL,
    `competitionId` CHAR(36) NOT NULL,
    `evidenceRef` VARCHAR(512) NULL,
    `sourceRef` VARCHAR(512) NULL,
    `mappedAt` DATETIME(3) NOT NULL,

    INDEX `FootballCompetitionProvider_competitionId_idx`(`competitionId`),
    PRIMARY KEY (`provider`, `externalId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballCompetitionAlias` (
    `competitionId` CHAR(36) NOT NULL,
    `normalizedSearch` VARCHAR(512) NOT NULL,
    `name` VARCHAR(512) NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `sourceRef` VARCHAR(512) NOT NULL,

    INDEX `FootballCompetitionAlias_normalizedSearch_idx`(`normalizedSearch`),
    PRIMARY KEY (`competitionId`, `normalizedSearch`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballSeason` (
    `id` CHAR(36) NOT NULL,
    `competitionId` CHAR(36) NOT NULL,
    `year` INTEGER NOT NULL,
    `current` BOOLEAN NULL,
    `coverage` JSON NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,

    UNIQUE INDEX `FootballSeason_competitionId_year_key`(`competitionId`, `year`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballFixture` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `externalId` BIGINT UNSIGNED NOT NULL,
    `homeTeamId` CHAR(36) NOT NULL,
    `awayTeamId` CHAR(36) NOT NULL,
    `seasonId` CHAR(36) NOT NULL,
    `round` VARCHAR(512) NULL,
    `kickoff` DATETIME(3) NULL,
    `eatDate` DATE NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'unknown',
    `providerStatus` VARCHAR(32) NULL,
    `elapsedMinutes` INTEGER NULL,
    `regulationHome` INTEGER NULL,
    `regulationAway` INTEGER NULL,
    `regulationEvidenceRef` VARCHAR(512) NULL,
    `regulationVerifiedAt` DATETIME(3) NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `dataVersion` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FootballFixture_eatDate_kickoff_idx`(`eatDate`, `kickoff`),
    INDEX `FootballFixture_kickoff_idx`(`kickoff`),
    INDEX `FootballFixture_status_kickoff_idx`(`status`, `kickoff`),
    INDEX `FootballFixture_seasonId_kickoff_idx`(`seasonId`, `kickoff`),
    INDEX `FootballFixture_seasonId_round_kickoff_idx`(`seasonId`, `round`, `kickoff`),
    INDEX `FootballFixture_homeTeamId_kickoff_idx`(`homeTeamId`, `kickoff`),
    INDEX `FootballFixture_awayTeamId_kickoff_idx`(`awayTeamId`, `kickoff`),
    UNIQUE INDEX `FootballFixture_provider_externalId_key`(`provider`, `externalId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballFixtureAudit` (
    `id` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `importId` CHAR(36) NOT NULL,
    `dataVersion` BIGINT UNSIGNED NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `changes` JSON NOT NULL,

    INDEX `FootballFixtureAudit_importId_idx`(`importId`),
    UNIQUE INDEX `FootballFixtureAudit_fixtureId_dataVersion_key`(`fixtureId`, `dataVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballImport` (
    `id` CHAR(36) NOT NULL,
    `sequence` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `fingerprint` CHAR(64) NOT NULL,
    `requestFingerprint` CHAR(64) NOT NULL,
    `selection` JSON NOT NULL,
    `scopeKey` CHAR(64) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `receivedCount` INTEGER NOT NULL,
    `importedCount` INTEGER NOT NULL,
    `rejectedCount` INTEGER NOT NULL,
    `requestsDispatched` INTEGER NOT NULL,
    `reasons` JSON NOT NULL,
    `missingIds` JSON NOT NULL,
    `missingCoverage` JSON NOT NULL,
    `provenance` JSON NOT NULL,
    `retentionEvidenceRef` VARCHAR(512) NOT NULL,
    `subsetEvidenceRef` VARCHAR(512) NULL,
    `fixtureIds` JSON NOT NULL,
    `changedFixtureIds` JSON NOT NULL,

    INDEX `FootballImport_fingerprint_idx`(`fingerprint`),
    INDEX `FootballImport_scopeKey_observedAt_sequence_idx`(`scopeKey`, `observedAt`, `sequence`),
    UNIQUE INDEX `FootballImport_sequence_key`(`sequence`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FootballIdentityReview` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `externalId` BIGINT UNSIGNED NOT NULL,
    `candidateExternalId` BIGINT UNSIGNED NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `reason` VARCHAR(32) NOT NULL,
    `sourceRef` VARCHAR(512) NOT NULL,
    `evidenceRef` VARCHAR(512) NULL,
    `observedAt` DATETIME(3) NOT NULL,

    INDEX `FootballIdentityReview_status_observedAt_idx`(`status`, `observedAt`),
    UNIQUE INDEX `FootballIdentityReview_provider_externalId_candidateExternal_key`(`provider`, `externalId`, `candidateExternalId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `FootballTeamProvider` ADD CONSTRAINT `FootballTeamProvider_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballTeamAlias` ADD CONSTRAINT `FootballTeamAlias_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballCompetitionProvider` ADD CONSTRAINT `FootballCompetitionProvider_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `FootballCompetition`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballCompetitionAlias` ADD CONSTRAINT `FootballCompetitionAlias_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `FootballCompetition`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballSeason` ADD CONSTRAINT `FootballSeason_competitionId_fkey` FOREIGN KEY (`competitionId`) REFERENCES `FootballCompetition`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballFixture` ADD CONSTRAINT `FootballFixture_homeTeamId_fkey` FOREIGN KEY (`homeTeamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballFixture` ADD CONSTRAINT `FootballFixture_awayTeamId_fkey` FOREIGN KEY (`awayTeamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballFixture` ADD CONSTRAINT `FootballFixture_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `FootballSeason`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballFixtureAudit` ADD CONSTRAINT `FootballFixtureAudit_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FootballFixtureAudit` ADD CONSTRAINT `FootballFixtureAudit_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `FootballImport`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma does not represent CHECK constraints. Keep these reviewed invariants
-- in this incremental migration; application validation remains necessary.
ALTER TABLE `FootballSeason`
    ADD CONSTRAINT `FootballSeason_year_check` CHECK (`year` BETWEEN 1 AND 9999);

ALTER TABLE `FootballFixture`
    ADD CONSTRAINT `FootballFixture_teams_check` CHECK (`homeTeamId` <> `awayTeamId`),
    ADD CONSTRAINT `FootballFixture_externalId_check` CHECK (`externalId` > 0),
    ADD CONSTRAINT `FootballFixture_version_check` CHECK (`dataVersion` > 0),
    ADD CONSTRAINT `FootballFixture_elapsed_check` CHECK (`elapsedMinutes` IS NULL OR `elapsedMinutes` >= 0),
    ADD CONSTRAINT `FootballFixture_eatDate_check` CHECK (
        (`kickoff` IS NULL AND `eatDate` IS NULL)
        OR (`kickoff` IS NOT NULL AND `eatDate` IS NOT NULL)
    ),
    ADD CONSTRAINT `FootballFixture_regulation_check` CHECK (
        (`regulationHome` IS NULL AND `regulationAway` IS NULL
            AND `regulationEvidenceRef` IS NULL AND `regulationVerifiedAt` IS NULL)
        OR (`regulationHome` IS NOT NULL AND `regulationAway` IS NOT NULL
            AND `regulationHome` >= 0 AND `regulationAway` >= 0
            AND `regulationEvidenceRef` IS NOT NULL AND CHAR_LENGTH(`regulationEvidenceRef`) > 0
            AND `regulationVerifiedAt` IS NOT NULL)
    );

-- The application derives eatDate through the 004 Africa/Kampala calendar.
-- A fixed SQL offset would misrepresent historical time-zone transitions.

ALTER TABLE `FootballFixtureAudit`
    ADD CONSTRAINT `FootballFixtureAudit_version_check` CHECK (`dataVersion` > 0);

ALTER TABLE `FootballImport`
    ADD CONSTRAINT `FootballImport_counts_check` CHECK (
        `receivedCount` >= 0 AND `importedCount` >= 0
        AND `rejectedCount` >= 0 AND `requestsDispatched` >= 0
    );
