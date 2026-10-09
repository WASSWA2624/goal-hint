-- AlterTable
ALTER TABLE `PredictionChangeEvent` ADD COLUMN `fixtureResultId` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `ResultPollerLease` (
    `accountId` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `ownerId` CHAR(64) NULL,
    `fence` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NOT NULL,
    `nextLiveAt` DATETIME(3) NOT NULL,
    `nextDateAt` DATETIME(3) NOT NULL,
    `liveFailures` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `dateFailures` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `liveError` VARCHAR(128) NULL,
    `dateError` VARCHAR(128) NULL,

    PRIMARY KEY (`accountId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ResultSyncBatch` (
    `id` CHAR(64) NOT NULL,
    `accountId` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    INDEX `ResultSyncBatch_accountId_completedAt_receivedAt_idx`(`accountId`, `completedAt`, `receivedAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureResultState` (
    `fixtureId` CHAR(36) NOT NULL,
    `resultId` CHAR(64) NULL,
    `firstTrackedAt` DATETIME(3) NOT NULL,
    `firstFinalAt` DATETIME(3) NULL,
    `lastSyncAt` DATETIME(3) NULL,
    `lastAttemptAt` DATETIME(3) NULL,
    `nextCheckAt` DATETIME(3) NULL,
    `failures` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `delayReason` VARCHAR(128) NULL,

    INDEX `FixtureResultState_nextCheckAt_fixtureId_idx`(`nextCheckAt`, `fixtureId`),
    PRIMARY KEY (`fixtureId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureResult` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `observedAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `regulationVerified` BOOLEAN NOT NULL,
    `regulationHome` INTEGER UNSIGNED NULL,
    `regulationAway` INTEGER UNSIGNED NULL,
    `contentHash` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    INDEX `FixtureResult_fixtureId_observedAt_id_idx`(`fixtureId`, `observedAt`, `id`),
    UNIQUE INDEX `FixtureResult_id_fixtureId_key`(`id`, `fixtureId`),
    UNIQUE INDEX `FixtureResult_change_key`(`id`, `fixtureId`, `fixtureVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ResultProviderObservation` (
    `id` CHAR(64) NOT NULL,
    `batchId` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `lifecycleId` CHAR(64) NOT NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    INDEX `ResultProviderObservation_fixtureId_retrievedAt_id_idx`(`fixtureId`, `retrievedAt`, `id`),
    UNIQUE INDEX `ResultProviderObservation_batchId_fixtureId_key`(`batchId`, `fixtureId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_fixtureResultId_key` ON `PredictionChangeEvent`(`fixtureResultId`);

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_fixture_result_key` ON `PredictionChangeEvent`(`fixtureResultId`, `fixtureId`, `version`);

-- AddForeignKey
ALTER TABLE `PredictionChangeEvent` ADD CONSTRAINT `PredictionChangeEvent_fixtureResultId_fixtureId_version_fkey` FOREIGN KEY (`fixtureResultId`, `fixtureId`, `version`) REFERENCES `FixtureResult`(`id`, `fixtureId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ResultPollerLease` ADD CONSTRAINT `ResultPollerLease_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `ApiQuotaAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ResultSyncBatch` ADD CONSTRAINT `ResultSyncBatch_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `ApiQuotaAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureResultState` ADD CONSTRAINT `FixtureResultState_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureResultState` ADD CONSTRAINT `FixtureResultState_resultId_fixtureId_fkey` FOREIGN KEY (`resultId`, `fixtureId`) REFERENCES `FixtureResult`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureResult` ADD CONSTRAINT `FixtureResult_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ResultProviderObservation` ADD CONSTRAINT `ResultProviderObservation_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ResultProviderObservation` ADD CONSTRAINT `ResultProviderObservation_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `ResultSyncBatch`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX `FixtureLifecycleObservation_result_key` ON `FixtureLifecycleObservation` (`id`, `fixtureId`);
ALTER TABLE `ResultProviderObservation` ADD CONSTRAINT `ResultProviderObservation_lifecycleId_fixtureId_fkey`
  FOREIGN KEY (`lifecycleId`, `fixtureId`) REFERENCES `FixtureLifecycleObservation` (`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE PredictionChangeEvent DROP CHECK PredictionChangeEvent_shape;
ALTER TABLE PredictionChangeEvent ADD CONSTRAINT PredictionChangeEvent_shape CHECK (
  version > 0 AND (resultId IS NOT NULL) + (operationId IS NOT NULL) + (lifecycleId IS NOT NULL) + (fixtureResultId IS NOT NULL) = 1
  AND ((resultId IS NOT NULL AND kind IN ('revision-published','refresh-result','eligibility-closed'))
    OR (operationId IS NOT NULL AND kind IN ('cycle-closed','cycle-voided'))
    OR (lifecycleId IS NOT NULL AND kind IN ('schedule-lifecycle','lifecycle-conflict'))
    OR (fixtureResultId IS NOT NULL AND kind = 'fixture-result')));

ALTER TABLE FixtureResult ADD CONSTRAINT FixtureResult_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureVersion.$evidenceInteger')) AS UNSIGNED) = fixtureVersion
  AND fixtureVersion > 0 AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = status
  AND ((regulationVerified = TRUE AND regulationHome IS NOT NULL AND regulationAway IS NOT NULL)
    OR (regulationVerified = FALSE AND regulationHome IS NULL AND regulationAway IS NULL)), FALSE) = TRUE);

ALTER TABLE ResultProviderObservation ADD CONSTRAINT ResultProviderObservation_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.observation.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.lifecycleId')) = lifecycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.outcome')) IN ('accepted','unchanged','stale','conflict'), FALSE) = TRUE);

ALTER TABLE ResultSyncBatch ADD CONSTRAINT ResultSyncBatch_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.accountId')) = accountId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.policyHash')) REGEXP '^[a-f0-9]{64}$'
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.channel')) IN ('live','date','ids'), FALSE) = TRUE);
