-- AlterTable
ALTER TABLE `DailyRun` ADD COLUMN `committedAt` DATETIME(3) NULL,
    ADD COLUMN `completedJobs` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `fence` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `leaseExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `ownerId` CHAR(64) NULL,
    ADD COLUMN `partial` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `selectionHash` CHAR(64) NULL,
    ADD COLUMN `selectionJson` JSON NULL,
    ADD COLUMN `terminalJobs` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `totalJobs` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `windowEnd` DATETIME(3) NULL,
    ADD COLUMN `windowStart` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `DailyRunManifest` (
    `runId` CHAR(36) NOT NULL,
    `manifestHash` CHAR(64) NOT NULL,
    `manifestJson` JSON NOT NULL,

    PRIMARY KEY (`runId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `DailyRunImport` (
    `id` CHAR(36) NOT NULL,
    `runId` CHAR(36) NOT NULL,
    `eatDate` DATE NOT NULL,
    `attempt` INTEGER UNSIGNED NOT NULL,
    `requestJson` JSON NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `failure` VARCHAR(32) NULL,

    UNIQUE INDEX `DailyRunImport_runId_eatDate_attempt_key`(`runId`, `eatDate`, `attempt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RunFixture` (
    `runId` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `rank` INTEGER UNSIGNED NOT NULL,
    `kickoffAt` DATETIME(3) NOT NULL,
    `envelopeJson` JSON NOT NULL,
    `jobId` CHAR(64) NULL,
    `jobState` VARCHAR(16) NOT NULL DEFAULT 'undispatched',
    `terminalReason` VARCHAR(32) NULL,

    UNIQUE INDEX `RunFixture_jobId_key`(`jobId`),
    UNIQUE INDEX `RunFixture_runId_rank_key`(`runId`, `rank`),
    PRIMARY KEY (`runId`, `fixtureId`, `cycleId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SelectionCycleEligibility` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `previousCycleId` CHAR(36) NOT NULL,
    `previousVersion` INTEGER UNSIGNED NOT NULL,
    `kickoffAt` DATETIME(3) NOT NULL,
    `state` VARCHAR(16) NOT NULL,
    `actor` VARCHAR(128) NOT NULL,
    `evidenceRef` VARCHAR(512) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `consumedRunId` CHAR(36) NULL,

    UNIQUE INDEX `SelectionCycleEligibility_previousCycleId_key`(`previousCycleId`),
    UNIQUE INDEX `SelectionCycleEligibility_previousCycleId_fixtureId_key`(`previousCycleId`, `fixtureId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `DailyRunManifest` ADD CONSTRAINT `DailyRunManifest_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `DailyRun`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `DailyRunImport` ADD CONSTRAINT `DailyRunImport_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `DailyRun`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RunFixture` ADD CONSTRAINT `RunFixture_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `DailyRun`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RunFixture` ADD CONSTRAINT `RunFixture_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
CREATE UNIQUE INDEX `DurableJob_selection_key` ON `DurableJob` (`id`, `refreshRunId`, `refreshFixtureId`, `refreshCycleId`);
ALTER TABLE `RunFixture` ADD CONSTRAINT `RunFixture_jobId_runId_fixtureId_cycleId_fkey` FOREIGN KEY (`jobId`, `runId`, `fixtureId`, `cycleId`) REFERENCES `DurableJob`(`id`, `refreshRunId`, `refreshFixtureId`, `refreshCycleId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SelectionCycleEligibility` ADD CONSTRAINT `SelectionCycleEligibility_previousCycleId_fixtureId_fkey` FOREIGN KEY (`previousCycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SelectionCycleEligibility` ADD CONSTRAINT `SelectionCycleEligibility_consumedRunId_fkey` FOREIGN KEY (`consumedRunId`) REFERENCES `DailyRun`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE DailyRun ADD CONSTRAINT DailyRun_selection_state CHECK (COALESCE(
  ((selectionHash IS NULL AND selectionJson IS NULL AND windowStart IS NULL AND windowEnd IS NULL AND committedAt IS NULL)
    OR (selectionHash REGEXP '^[a-f0-9]{64}$' AND selectionJson IS NOT NULL AND windowStart IS NOT NULL AND windowEnd > windowStart))
  AND ((ownerId IS NULL AND leaseExpiresAt IS NULL) OR (ownerId REGEXP '^[a-f0-9]{64}$' AND leaseExpiresAt IS NOT NULL AND fence > 0))
  AND completedJobs <= terminalJobs AND terminalJobs <= totalJobs
  AND (committedAt IS NOT NULL OR (totalJobs = 0 AND completedJobs = 0 AND terminalJobs = 0 AND partial = FALSE)), FALSE) = TRUE);
ALTER TABLE DailyRunManifest ADD CONSTRAINT DailyRunManifest_shape CHECK (COALESCE(
  manifestHash REGEXP '^[a-f0-9]{64}$' AND JSON_EXTRACT(manifestJson, '$.version') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(manifestJson, '$.runId')) = runId
  AND JSON_TYPE(JSON_EXTRACT(manifestJson, '$.entries')) = 'ARRAY'
  AND JSON_LENGTH(JSON_EXTRACT(manifestJson, '$.coverage')) = 7, FALSE) = TRUE);
ALTER TABLE DailyRunImport ADD CONSTRAINT DailyRunImport_shape CHECK (COALESCE(
  attempt > 0 AND JSON_UNQUOTE(JSON_EXTRACT(requestJson, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(requestJson, '$.selection.kind')) = 'fixtures'
  AND JSON_UNQUOTE(JSON_EXTRACT(requestJson, '$.selection.query.date')) = DATE_FORMAT(eatDate, '%Y-%m-%d')
  AND (failure IS NULL OR (finishedAt IS NOT NULL AND failure IN ('attempt-expired', 'import-unavailable'))), FALSE) = TRUE);
ALTER TABLE RunFixture ADD CONSTRAINT RunFixture_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.runId')) = runId
  AND JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.cycleId')) = cycleId
  AND JSON_EXTRACT(envelopeJson, '$.payload.rank') = `rank`
  AND jobState IN ('undispatched','pending','running','succeeded','failed','expired')
  AND ((jobId IS NULL AND jobState = 'undispatched') OR (jobId REGEXP '^[a-f0-9]{64}$' AND jobState <> 'undispatched'))
  AND ((jobState IN ('succeeded','failed','expired') AND terminalReason IS NOT NULL)
    OR (jobState IN ('undispatched','pending','running') AND terminalReason IS NULL)), FALSE) = TRUE);
ALTER TABLE SelectionCycleEligibility ADD CONSTRAINT SelectionCycleEligibility_shape CHECK (
  id REGEXP '^[a-f0-9]{64}$' AND previousVersion > 0 AND state IN ('postponed','void') AND LENGTH(actor) > 0 AND LENGTH(evidenceRef) > 0);
