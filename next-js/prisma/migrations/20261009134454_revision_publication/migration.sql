-- CreateTable
CREATE TABLE `PredictionRefreshResult` (
    `id` CHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `attemptKey` CHAR(64) NOT NULL,
    `runId` CHAR(36) NOT NULL,
    `runSequence` BIGINT UNSIGNED NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `jobId` CHAR(64) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `outcome` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(32) NOT NULL,
    `revisionId` CHAR(36) NULL,
    `at` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `resultJson` JSON NOT NULL,

    INDEX `PredictionRefreshResult_latest_idx`(`fixtureId`, `cycleId`, `runSequence`, `fixtureVersion`),
    UNIQUE INDEX `PredictionRefreshResult_attempt_key`(`runId`, `fixtureId`, `cycleId`, `attemptKey`),
    UNIQUE INDEX `PredictionRefreshResult_change_key`(`id`, `fixtureId`, `fixtureVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionPublicationBarrier` (
    `cycleId` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `closedAt` DATETIME(3) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `observationJson` JSON NOT NULL,

    UNIQUE INDEX `PredictionPublicationBarrier_cycleId_fixtureId_key`(`cycleId`, `fixtureId`),
    PRIMARY KEY (`cycleId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionChangeEvent` (
    `fixtureId` CHAR(36) NOT NULL,
    `version` BIGINT UNSIGNED NOT NULL,
    `resultId` CHAR(64) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PredictionChangeEvent_resultId_key`(`resultId`),
    UNIQUE INDEX `PredictionChangeEvent_result_key`(`resultId`, `fixtureId`, `version`),
    PRIMARY KEY (`fixtureId`, `version`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `PredictionRefreshResult` ADD CONSTRAINT `PredictionRefreshResult_runId_fixtureId_cycleId_fkey` FOREIGN KEY (`runId`, `fixtureId`, `cycleId`) REFERENCES `RunFixture`(`runId`, `fixtureId`, `cycleId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionRefreshResult` ADD CONSTRAINT `PredictionRefreshResult_job_fkey` FOREIGN KEY (`jobId`, `runId`, `fixtureId`, `cycleId`) REFERENCES `DurableJob`(`id`, `refreshRunId`, `refreshFixtureId`, `refreshCycleId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionRefreshResult` ADD CONSTRAINT `PredictionRefreshResult_revisionId_cycleId_fixtureId_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionPublicationBarrier` ADD CONSTRAINT `PredictionPublicationBarrier_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionChangeEvent` ADD CONSTRAINT `PredictionChangeEvent_resultId_fixtureId_version_fkey` FOREIGN KEY (`resultId`, `fixtureId`, `version`) REFERENCES `PredictionRefreshResult`(`id`, `fixtureId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE PredictionRefreshResult ADD CONSTRAINT PredictionRefreshResult_shape CHECK (COALESCE(
  id REGEXP '^[a-f0-9]{64}$' AND requestHash REGEXP '^[a-f0-9]{64}$' AND attemptKey REGEXP '^[a-f0-9]{64}$'
  AND fixtureVersion > 0 AND runSequence > 0
  AND JSON_UNQUOTE(JSON_EXTRACT(resultJson, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(resultJson, '$.outcome')) = outcome
  AND JSON_UNQUOTE(JSON_EXTRACT(resultJson, '$.reason')) = reason
  AND ((outcome = 'published' AND reason = 'accepted' AND revisionId IS NOT NULL)
    OR (outcome = 'retained-previous' AND reason = 'no-valid-family' AND revisionId IS NOT NULL)
    OR (outcome = 'unavailable' AND reason = 'no-valid-family' AND revisionId IS NULL)
    OR (outcome = 'skipped' AND revisionId IS NULL AND reason IN ('not-selected','outside-window','wrong-cycle',
      'schedule-changed','closed-cycle','early-play','status-ineligible','cutoff-passed','stale-observation',
      'future-observation','stale-source','older-run'))), FALSE) = TRUE);
ALTER TABLE PredictionPublicationBarrier ADD CONSTRAINT PredictionPublicationBarrier_shape CHECK (COALESCE(
  closedAt <= recordedAt AND JSON_UNQUOTE(JSON_EXTRACT(observationJson, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(observationJson, '$.cycleId')) = cycleId
  AND (JSON_EXTRACT(observationJson, '$.actualStartedAt') <> CAST('null' AS JSON)
    OR JSON_UNQUOTE(JSON_EXTRACT(observationJson, '$.status')) IN ('live','finished-regulation','finished-extra-time','finished-penalties')),
  FALSE) = TRUE);
ALTER TABLE PredictionChangeEvent ADD CONSTRAINT PredictionChangeEvent_shape CHECK (
  version > 0 AND kind IN ('revision-published','refresh-result','eligibility-closed'));
