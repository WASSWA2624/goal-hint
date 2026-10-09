-- AlterTable
ALTER TABLE `SelectionCycleEligibility` ADD COLUMN `eligibleAfter` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `PredictionChangeEvent` ADD COLUMN `lifecycleId` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `FixtureLifecycleState` (
    `fixtureId` CHAR(36) NOT NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `contentHash` CHAR(64) NULL,
    `actualStartedAt` DATETIME(3) NULL,
    `issue` VARCHAR(128) NULL,

    PRIMARY KEY (`fixtureId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureLifecycleObservation` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `outcome` VARCHAR(16) NOT NULL,
    `reason` VARCHAR(128) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `receiptJson` JSON NOT NULL,

    INDEX `FixtureLifecycleObservation_fixtureId_at_id_idx`(`fixtureId`, `at`, `id`),
    UNIQUE INDEX `FixtureLifecycleObservation_change_key`(`id`, `fixtureId`, `fixtureVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_lifecycleId_key` ON `PredictionChangeEvent`(`lifecycleId`);

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_lifecycle_key` ON `PredictionChangeEvent`(`lifecycleId`, `fixtureId`, `version`);

-- AddForeignKey
ALTER TABLE `PredictionChangeEvent` ADD CONSTRAINT `PredictionChangeEvent_lifecycleId_fixtureId_version_fkey` FOREIGN KEY (`lifecycleId`, `fixtureId`, `version`) REFERENCES `FixtureLifecycleObservation`(`id`, `fixtureId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureLifecycleState` ADD CONSTRAINT `FixtureLifecycleState_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureLifecycleObservation` ADD CONSTRAINT `FixtureLifecycleObservation_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureLifecycleObservation` ADD CONSTRAINT `FixtureLifecycleObservation_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE FixtureLifecycleState ADD CONSTRAINT FixtureLifecycleState_shape CHECK (
  (providerUpdatedAt IS NULL OR providerUpdatedAt <= retrievedAt)
  AND (contentHash IS NULL OR contentHash REGEXP '^[a-f0-9]{64}$')
  AND (issue IS NULL OR CHAR_LENGTH(issue) > 0));

ALTER TABLE FixtureLifecycleObservation ADD CONSTRAINT FixtureLifecycleObservation_shape CHECK (COALESCE(
  id REGEXP '^[a-f0-9]{64}$' AND fixtureVersion > 0 AND at >= retrievedAt
  AND outcome IN ('accepted','unchanged','stale','conflict') AND CHAR_LENGTH(reason) > 0
  AND JSON_UNQUOTE(JSON_EXTRACT(receiptJson, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(receiptJson, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(receiptJson, '$.observation.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(receiptJson, '$.outcome')) = outcome, FALSE) = TRUE);

ALTER TABLE PredictionChangeEvent DROP CHECK PredictionChangeEvent_shape;
ALTER TABLE PredictionChangeEvent ADD CONSTRAINT PredictionChangeEvent_shape CHECK (
  version > 0 AND ((resultId IS NOT NULL AND operationId IS NULL AND lifecycleId IS NULL
    AND kind IN ('revision-published','refresh-result','eligibility-closed'))
    OR (resultId IS NULL AND operationId IS NOT NULL AND lifecycleId IS NULL AND kind IN ('cycle-closed','cycle-voided'))
    OR (resultId IS NULL AND operationId IS NULL AND lifecycleId IS NOT NULL AND kind IN ('schedule-lifecycle','lifecycle-conflict'))));
