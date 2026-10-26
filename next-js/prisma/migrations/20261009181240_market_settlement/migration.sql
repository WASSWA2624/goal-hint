-- AlterTable
ALTER TABLE `PredictionChangeEvent` ADD COLUMN `settlementId` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `SettlementBatch` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `fixtureVersion` BIGINT UNSIGNED NOT NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SettlementBatch_id_fixtureId_key`(`id`, `fixtureId`),
    UNIQUE INDEX `SettlementBatch_change_key`(`id`, `fixtureId`, `fixtureVersion`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MarketSettlement` (
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `family` VARCHAR(32) NOT NULL,
    `revisionId` CHAR(64) NOT NULL,

    UNIQUE INDEX `MarketSettlement_revisionId_key`(`revisionId`),
    INDEX `MarketSettlement_fixtureId_cycleId_idx`(`fixtureId`, `cycleId`),
    UNIQUE INDEX `MarketSettlement_active_key`(`revisionId`, `cycleId`, `family`),
    PRIMARY KEY (`cycleId`, `family`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MarketSettlementRevision` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `family` VARCHAR(32) NOT NULL,
    `batchId` CHAR(64) NOT NULL,
    `previousId` CHAR(64) NULL,
    `resultId` CHAR(64) NULL,
    `lockedSetId` CHAR(36) NULL,
    `inputHash` CHAR(64) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    UNIQUE INDEX `MarketSettlementRevision_previousId_key`(`previousId`),
    INDEX `MarketSettlementRevision_cycleId_family_at_id_idx`(`cycleId`, `family`, `at`, `id`),
    UNIQUE INDEX `MarketSettlementRevision_identity_key`(`id`, `cycleId`, `family`),
    UNIQUE INDEX `MarketSettlementRevision_previous_key`(`previousId`, `cycleId`, `family`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `SettlementEventReceipt` (
    `fixtureId` CHAR(36) NOT NULL,
    `version` BIGINT UNSIGNED NOT NULL,
    `at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`fixtureId`, `version`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_settlementId_key` ON `PredictionChangeEvent`(`settlementId`);

-- CreateIndex
CREATE UNIQUE INDEX `PredictionChangeEvent_settlement_key` ON `PredictionChangeEvent`(`settlementId`, `fixtureId`, `version`);

-- AddForeignKey
ALTER TABLE `PredictionChangeEvent` ADD CONSTRAINT `PredictionChangeEvent_settlementId_fixtureId_version_fkey` FOREIGN KEY (`settlementId`, `fixtureId`, `version`) REFERENCES `SettlementBatch`(`id`, `fixtureId`, `fixtureVersion`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SettlementBatch` ADD CONSTRAINT `SettlementBatch_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlement` ADD CONSTRAINT `MarketSettlement_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlement` ADD CONSTRAINT `MarketSettlement_revisionId_cycleId_family_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `family`) REFERENCES `MarketSettlementRevision`(`id`, `cycleId`, `family`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlementRevision` ADD CONSTRAINT `MarketSettlementRevision_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlementRevision` ADD CONSTRAINT `MarketSettlementRevision_batchId_fixtureId_fkey` FOREIGN KEY (`batchId`, `fixtureId`) REFERENCES `SettlementBatch`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlementRevision` ADD CONSTRAINT `MarketSettlementRevision_resultId_fixtureId_fkey` FOREIGN KEY (`resultId`, `fixtureId`) REFERENCES `FixtureResult`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlementRevision` ADD CONSTRAINT `MarketSettlementRevision_lockedSetId_cycleId_fixtureId_fkey` FOREIGN KEY (`lockedSetId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MarketSettlementRevision` ADD CONSTRAINT `MarketSettlementRevision_previousId_cycleId_family_fkey` FOREIGN KEY (`previousId`, `cycleId`, `family`) REFERENCES `MarketSettlementRevision`(`id`, `cycleId`, `family`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `SettlementEventReceipt` ADD CONSTRAINT `SettlementEventReceipt_fixtureId_version_fkey` FOREIGN KEY (`fixtureId`, `version`) REFERENCES `PredictionChangeEvent`(`fixtureId`, `version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE PredictionChangeEvent DROP CHECK PredictionChangeEvent_shape;
ALTER TABLE PredictionChangeEvent ADD CONSTRAINT PredictionChangeEvent_shape CHECK (
  version > 0 AND (resultId IS NOT NULL) + (operationId IS NOT NULL) + (lifecycleId IS NOT NULL)
    + (fixtureResultId IS NOT NULL) + (settlementId IS NOT NULL) = 1
  AND ((resultId IS NOT NULL AND kind IN ('revision-published','refresh-result','eligibility-closed'))
    OR (operationId IS NOT NULL AND kind IN ('cycle-closed','cycle-voided'))
    OR (lifecycleId IS NOT NULL AND kind IN ('schedule-lifecycle','lifecycle-conflict'))
    OR (fixtureResultId IS NOT NULL AND kind = 'fixture-result')
    OR (settlementId IS NOT NULL AND kind = 'market-settlement')));

ALTER TABLE MarketSettlement ADD CONSTRAINT MarketSettlement_family CHECK (
  family IN ('match-result','double-chance','total-goals','both-teams-to-score'));
ALTER TABLE SettlementBatch ADD CONSTRAINT SettlementBatch_version CHECK (fixtureVersion > 0);
ALTER TABLE MarketSettlementRevision ADD CONSTRAINT MarketSettlementRevision_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.family')) = family
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.batchId')) = batchId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.inputHash')) = inputHash
  AND family IN ('match-result','double-chance','total-goals','both-teams-to-score')
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) IN ('correct','incorrect','pending','void','unavailable')
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) IN ('initial','transition','correction')
  AND ((JSON_EXTRACT(body, '$.selection') = CAST('null' AS JSON)
      AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'unavailable')
    OR (lockedSetId IS NOT NULL AND JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'STRING')),
  FALSE) = TRUE);
