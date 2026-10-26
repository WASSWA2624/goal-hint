-- CreateTable
CREATE TABLE `EvidenceSourceVersion` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `homeTeamId` CHAR(36) NOT NULL,
    `awayTeamId` CHAR(36) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `sourceKey` CHAR(64) NOT NULL,
    `syndicationKey` CHAR(64) NULL,
    `kind` VARCHAR(16) NOT NULL,
    `version` VARCHAR(128) NOT NULL,
    `publisher` VARCHAR(512) NOT NULL,
    `title` VARCHAR(2048) NOT NULL,
    `sourceUrl` VARCHAR(2048) NULL,
    `publishedAt` DATETIME(3) NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `retainUntil` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `metadataJson` JSON NOT NULL,

    INDEX `EvidenceSourceVersion_sourceKey_retrievedAt_idx`(`sourceKey`, `retrievedAt`),
    INDEX `EvidenceSourceVersion_fixtureId_retrievedAt_idx`(`fixtureId`, `retrievedAt`),
    INDEX `EvidenceSourceVersion_retainUntil_idx`(`retainUntil`),
    UNIQUE INDEX `EvidenceSourceVersion_binding_key`(`id`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureEvidenceSnapshot` (
    `requestId` CHAR(64) NOT NULL,
    `requestFingerprint` CHAR(64) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `homeTeamId` CHAR(36) NOT NULL,
    `awayTeamId` CHAR(36) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `analysisAt` DATETIME(3) NOT NULL,
    `cutoffAt` DATETIME(3) NOT NULL,
    `kickoffAt` DATETIME(3) NOT NULL,
    `cycleId` CHAR(36) NULL,
    `runId` CHAR(36) NULL,
    `policyVersion` VARCHAR(128) NOT NULL,
    `sufficient` BOOLEAN NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `snapshotJson` JSON NOT NULL,

    INDEX `FixtureEvidenceSnapshot_contentHash_idx`(`contentHash`),
    INDEX `FixtureEvidenceSnapshot_fixtureId_analysisAt_idx`(`fixtureId`, `analysisAt`),
    INDEX `FixtureEvidenceSnapshot_cycleId_runId_idx`(`cycleId`, `runId`),
    UNIQUE INDEX `FixtureEvidenceSnapshot_binding_key`(`requestId`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`),
    PRIMARY KEY (`requestId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureEvidenceSnapshotSource` (
    `requestId` CHAR(64) NOT NULL,
    `sourceVersionId` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `homeTeamId` CHAR(36) NOT NULL,
    `awayTeamId` CHAR(36) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,

    INDEX `FixtureEvidenceSnapshotSource_source_idx`(`sourceVersionId`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`),
    INDEX `FixtureEvidenceSnapshotSource_snapshot_idx`(`requestId`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`),
    PRIMARY KEY (`requestId`, `sourceVersionId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `EvidenceSourceVersion` ADD CONSTRAINT `EvidenceSourceVersion_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `EvidenceSourceVersion` ADD CONSTRAINT `EvidenceSourceVersion_homeTeamId_fkey` FOREIGN KEY (`homeTeamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `EvidenceSourceVersion` ADD CONSTRAINT `EvidenceSourceVersion_awayTeamId_fkey` FOREIGN KEY (`awayTeamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureEvidenceSnapshot` ADD CONSTRAINT `FixtureEvidenceSnapshot_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureEvidenceSnapshot` ADD CONSTRAINT `FixtureEvidenceSnapshot_homeTeamId_fkey` FOREIGN KEY (`homeTeamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureEvidenceSnapshot` ADD CONSTRAINT `FixtureEvidenceSnapshot_awayTeamId_fkey` FOREIGN KEY (`awayTeamId`) REFERENCES `FootballTeam`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureEvidenceSnapshotSource` ADD CONSTRAINT `FixtureEvidenceSnapshotSource_snapshot_fkey` FOREIGN KEY (`requestId`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`) REFERENCES `FixtureEvidenceSnapshot`(`requestId`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureEvidenceSnapshotSource` ADD CONSTRAINT `FixtureEvidenceSnapshotSource_source_fkey` FOREIGN KEY (`sourceVersionId`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`) REFERENCES `EvidenceSourceVersion`(`id`, `fixtureId`, `homeTeamId`, `awayTeamId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma does not represent CHECK constraints. These reviewed native bindings
-- supplement the strict, immutable source/snapshot parsers in the store.
ALTER TABLE `EvidenceSourceVersion`
    ADD CONSTRAINT `EvidenceSourceVersion_scope_check` CHECK (
        `fixtureVersion` > 0 AND `homeTeamId` <> `awayTeamId`
        AND `kind` IN ('football', 'news') AND (`kind` <> 'news' OR `sourceUrl` IS NOT NULL)
    ),
    ADD CONSTRAINT `EvidenceSourceVersion_chronology_check` CHECK (
        (`publishedAt` IS NULL OR `publishedAt` <= `retrievedAt`)
        AND (`providerUpdatedAt` IS NULL OR `providerUpdatedAt` <= `retrievedAt`)
        AND `retainUntil` >= `retrievedAt`
    ),
    ADD CONSTRAINT `EvidenceSourceVersion_metadata_check` CHECK (COALESCE(
        JSON_TYPE(JSON_EXTRACT(`metadataJson`, '$.id')) = 'STRING'
        AND `id` = JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.id'))
        AND `fixtureId` = JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.binding.fixtureId'))
        AND `homeTeamId` = JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.binding.homeTeamId'))
        AND `awayTeamId` = JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.binding.awayTeamId'))
        AND JSON_TYPE(JSON_EXTRACT(`metadataJson`, '$.binding.fixtureVersion')) = 'OBJECT'
        AND JSON_LENGTH(JSON_EXTRACT(`metadataJson`, '$.binding.fixtureVersion')) = 1
        AND JSON_TYPE(JSON_EXTRACT(`metadataJson`, '$.binding.fixtureVersion."$evidenceInteger"')) = 'STRING'
        AND JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.binding.fixtureVersion."$evidenceInteger"')) REGEXP '^[1-9][0-9]{0,19}$'
        AND `fixtureVersion` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.binding.fixtureVersion."$evidenceInteger"')) AS DECIMAL(20, 0))
        AND `sourceKey` = JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.sourceKey'))
        AND `kind` = JSON_UNQUOTE(JSON_EXTRACT(`metadataJson`, '$.kind')),
        FALSE
    ) = TRUE);

ALTER TABLE `FixtureEvidenceSnapshot`
    ADD CONSTRAINT `FixtureEvidenceSnapshot_scope_check` CHECK (
        `fixtureVersion` > 0 AND `homeTeamId` <> `awayTeamId`
    ),
    ADD CONSTRAINT `FixtureEvidenceSnapshot_chronology_check` CHECK (
        `cutoffAt` <= `analysisAt` AND `analysisAt` < `kickoffAt`
    ),
    ADD CONSTRAINT `FixtureEvidenceSnapshot_metadata_check` CHECK (COALESCE(
        JSON_TYPE(JSON_EXTRACT(`snapshotJson`, '$.id')) = 'STRING'
        AND `contentHash` = JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.id'))
        AND `contentHash` = JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.hash'))
        AND `fixtureId` = JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.context.fixtureId'))
        AND `homeTeamId` = JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.context.home.teamId'))
        AND `awayTeamId` = JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.context.away.teamId'))
        AND JSON_TYPE(JSON_EXTRACT(`snapshotJson`, '$.context.fixtureVersion')) = 'OBJECT'
        AND JSON_LENGTH(JSON_EXTRACT(`snapshotJson`, '$.context.fixtureVersion')) = 1
        AND JSON_TYPE(JSON_EXTRACT(`snapshotJson`, '$.context.fixtureVersion."$evidenceInteger"')) = 'STRING'
        AND JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.context.fixtureVersion."$evidenceInteger"')) REGEXP '^[1-9][0-9]{0,19}$'
        AND `fixtureVersion` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`snapshotJson`, '$.context.fixtureVersion."$evidenceInteger"')) AS DECIMAL(20, 0)),
        FALSE
    ) = TRUE);

ALTER TABLE `FixtureEvidenceSnapshotSource`
    ADD CONSTRAINT `FixtureEvidenceSnapshotSource_scope_check` CHECK (
        `fixtureVersion` > 0 AND `homeTeamId` <> `awayTeamId`
    );
