-- AlterTable
ALTER TABLE `PredictionChangeEvent` ADD COLUMN `operationId` CHAR(64) NULL,
    MODIFY `resultId` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `PredictionCycleOperation` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `revisionId` CHAR(36) NULL,
    `at` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `operationJson` JSON NOT NULL,

    UNIQUE INDEX `PredictionCycleOperation_cycleId_kind_key`(`cycleId`, `kind`),
    UNIQUE INDEX `PredictionCycleOperation_change_key`(`id`, `fixtureId`, `fixtureVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_operationId_key` ON `PredictionChangeEvent`(`operationId`);

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_operation_key` ON `PredictionChangeEvent`(`operationId`, `fixtureId`, `version`);

-- AddForeignKey
ALTER TABLE `PredictionChangeEvent` ADD CONSTRAINT `PredictionChangeEvent_operationId_fixtureId_version_fkey` FOREIGN KEY (`operationId`, `fixtureId`, `version`) REFERENCES `PredictionCycleOperation`(`id`, `fixtureId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionCycleOperation` ADD CONSTRAINT `PredictionCycleOperation_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PredictionCycleOperation` ADD CONSTRAINT `PredictionCycleOperation_revisionId_cycleId_fixtureId_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE PredictionCycleOperation ADD CONSTRAINT PredictionCycleOperation_shape CHECK (COALESCE(
  id REGEXP '^[a-f0-9]{64}$' AND fixtureVersion > 0 AND kind IN ('close','void')
  AND JSON_UNQUOTE(JSON_EXTRACT(operationJson, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(operationJson, '$.kind')) = kind
  AND JSON_UNQUOTE(JSON_EXTRACT(operationJson, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(operationJson, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(operationJson, '$.cycle.state')) = IF(kind = 'close', 'closed', 'void'), FALSE) = TRUE);

ALTER TABLE PredictionChangeEvent DROP CHECK PredictionChangeEvent_shape;
ALTER TABLE PredictionChangeEvent ADD CONSTRAINT PredictionChangeEvent_shape CHECK (
  version > 0 AND ((resultId IS NOT NULL AND operationId IS NULL
    AND kind IN ('revision-published','refresh-result','eligibility-closed'))
    OR (resultId IS NULL AND operationId IS NOT NULL AND kind IN ('cycle-closed','cycle-voided'))));
