-- CreateTable
CREATE TABLE `PredictionRefreshIntent` (
    `jobId` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    PRIMARY KEY (`jobId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionRefreshStage` (
    `jobId` CHAR(64) NOT NULL,
    `phase` VARCHAR(16) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    PRIMARY KEY (`jobId`, `phase`, `kind`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PredictionRefreshOutcome` (
    `jobId` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    PRIMARY KEY (`jobId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `PredictionRefreshIntent` ADD CONSTRAINT `PredictionRefreshIntent_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionRefreshStage` ADD CONSTRAINT `PredictionRefreshStage_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionRefreshOutcome` ADD CONSTRAINT `PredictionRefreshOutcome_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `DurableJob`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE PredictionRefreshIntent ADD CONSTRAINT PredictionRefreshIntent_shape CHECK (COALESCE(
  jobId REGEXP '^[a-f0-9]{64}$'
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.member.jobId')) = jobId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.pin.jobId')) = jobId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.plan.ai.job.jobId')) = jobId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.plan.modelVersionId')) = JSON_UNQUOTE(JSON_EXTRACT(body, '$.pin.modelVersionId')),
  FALSE) = TRUE);
ALTER TABLE PredictionRefreshStage ADD CONSTRAINT PredictionRefreshStage_shape CHECK (COALESCE(
  phase IN ('evidence','ai','fallback','observation') AND kind IN ('started','completed')
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.jobId')) = jobId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.phase')) = phase
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) = kind
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.attemptId')) REGEXP '^[a-f0-9]{64}$', FALSE) = TRUE);
ALTER TABLE PredictionRefreshOutcome ADD CONSTRAINT PredictionRefreshOutcome_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.jobId')) = jobId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.outcome')) IN ('published','retained-previous','unavailable','skipped','failed')
  AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(body, '$.reason'))) BETWEEN 1 AND 128, FALSE) = TRUE);
