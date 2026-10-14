-- Production (MariaDB 11.4) apply script for migration 20261012153531_goal_market_extension.
-- Unchanged SQL: every statement is MariaDB-compatible. Not idempotent; apply only while the
-- migration is unrecorded and GoalMarketExtension does not exist (scripts check both).

-- CreateTable
CREATE TABLE `ExtendedMarketPublishedPick` (
    `revisionId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `marketKey` VARCHAR(128) NOT NULL,
    `source` VARCHAR(32) NOT NULL,
    `ruleVersion` VARCHAR(64) NOT NULL,
    `period` VARCHAR(16) NOT NULL,
    `selection` VARCHAR(64) NOT NULL,
    `selectedProbability` DOUBLE NOT NULL,
    `sortOrder` INTEGER UNSIGNED NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,
    INDEX `ExtendedMarketPublishedPick_probability_idx`(`revisionId`, `selectedProbability`, `sortOrder`),
    PRIMARY KEY (`revisionId`, `marketKey`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ImpliedMarketResultEvidence` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `resultId` CHAR(64) NOT NULL,
    `sequence` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `recordedAt` DATETIME(3) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,
    UNIQUE INDEX `ImpliedMarketResultEvidence_sequence_key`(`sequence`),
    INDEX `ImpliedMarketResultEvidence_result_idx`(`fixtureId`, `resultId`, `sequence`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ImpliedMarketExtension` (
    `revisionId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `ruleVersion` VARCHAR(64) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `body` JSON NOT NULL,
    INDEX `ImpliedMarketExtension_fixtureId_cycleId_idx`(`fixtureId`, `cycleId`),
    UNIQUE INDEX `ImpliedMarketExtension_identity_key`(`revisionId`, `cycleId`, `fixtureId`),
    PRIMARY KEY (`revisionId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `GoalMarketExtension` (
    `revisionId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `ruleVersion` VARCHAR(64) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `body` JSON NOT NULL,

    INDEX `GoalMarketExtension_fixtureId_cycleId_idx`(`fixtureId`, `cycleId`),
    UNIQUE INDEX `GoalMarketExtension_identity_key`(`revisionId`, `cycleId`, `fixtureId`),
    PRIMARY KEY (`revisionId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ExtendedMarketSettlement` (
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `marketKey` VARCHAR(128) NOT NULL,
    `revisionId` CHAR(64) NOT NULL,

    UNIQUE INDEX `ExtendedMarketSettlement_revisionId_key`(`revisionId`),
    INDEX `ExtendedMarketSettlement_fixtureId_cycleId_idx`(`fixtureId`, `cycleId`),
    UNIQUE INDEX `ExtendedMarketSettlement_active_key`(`revisionId`, `cycleId`, `marketKey`),
    PRIMARY KEY (`cycleId`, `marketKey`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ExtendedMarketSettlementRevision` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `marketKey` VARCHAR(128) NOT NULL,
    `predictionRevisionId` CHAR(36) NOT NULL,
    `source` VARCHAR(32) NOT NULL,
    `batchId` CHAR(64) NOT NULL,
    `previousId` CHAR(64) NULL,
    `resultId` CHAR(64) NULL,
    `inputHash` CHAR(64) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    UNIQUE INDEX `ExtendedMarketSettlementRevision_previousId_key`(`previousId`),
    INDEX `ExtendedMarketSettlementRevision_history_idx`(`cycleId`, `marketKey`, `at`, `id`),
    UNIQUE INDEX `ExtendedMarketSettlementRevision_identity_key`(`id`, `cycleId`, `marketKey`),
    UNIQUE INDEX `ExtendedMarketSettlementRevision_previous_key`(`previousId`, `cycleId`, `marketKey`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `GoalMarketExtension` ADD CONSTRAINT `GoalMarketExtension_revisionId_cycleId_fixtureId_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlement` ADD CONSTRAINT `ExtendedMarketSettlement_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlement` ADD CONSTRAINT `ExtendedMarketSettlement_revision_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `marketKey`) REFERENCES `ExtendedMarketSettlementRevision`(`id`, `cycleId`, `marketKey`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlementRevision` ADD CONSTRAINT `ExtendedMarketSettlementRevision_cycleId_fixtureId_fkey` FOREIGN KEY (`cycleId`, `fixtureId`) REFERENCES `PredictionCycle`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlementRevision` ADD CONSTRAINT `ExtendedMarketSettlementRevision_prediction_fkey` FOREIGN KEY (`predictionRevisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlementRevision` ADD CONSTRAINT `ExtendedMarketSettlementRevision_batchId_fixtureId_fkey` FOREIGN KEY (`batchId`, `fixtureId`) REFERENCES `SettlementBatch`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlementRevision` ADD CONSTRAINT `ExtendedMarketSettlementRevision_resultId_fixtureId_fkey` FOREIGN KEY (`resultId`, `fixtureId`) REFERENCES `FixtureResult`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ExtendedMarketSettlementRevision` ADD CONSTRAINT `ExtendedMarketSettlementRevision_previous_fkey` FOREIGN KEY (`previousId`, `cycleId`, `marketKey`) REFERENCES `ExtendedMarketSettlementRevision`(`id`, `cycleId`, `marketKey`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE ImpliedMarketExtension ADD CONSTRAINT ImpliedMarketExtension_prediction_fkey
  FOREIGN KEY (revisionId, cycleId, fixtureId) REFERENCES PredictionSet(id, cycleId, fixtureId)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ImpliedMarketResultEvidence ADD CONSTRAINT ImpliedMarketResultEvidence_resultId_fixtureId_fkey
  FOREIGN KEY (resultId, fixtureId) REFERENCES FixtureResult(id, fixtureId)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ExtendedMarketPublishedPick ADD CONSTRAINT ExtendedMarketPublishedPick_revisionId_cycleId_fixtureId_fkey
  FOREIGN KEY (revisionId, cycleId, fixtureId) REFERENCES PredictionSet(id, cycleId, fixtureId)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- No old forecasts, family constraints, probabilities, locks or result revisions are rewritten.
ALTER TABLE GoalMarketExtension ADD CONSTRAINT GoalMarketExtension_seal CHECK (
  integrity = SHA2(CAST(body AS CHAR), 256) AND contentHash REGEXP '^[a-f0-9]{64}$');
ALTER TABLE ImpliedMarketExtension ADD CONSTRAINT ImpliedMarketExtension_seal CHECK (
  integrity = SHA2(CAST(body AS CHAR), 256) AND contentHash REGEXP '^[a-f0-9]{64}$');
ALTER TABLE ImpliedMarketResultEvidence ADD CONSTRAINT ImpliedMarketResultEvidence_seal CHECK (
  integrity = SHA2(CAST(body AS CHAR), 256) AND contentHash REGEXP '^[a-f0-9]{64}$');
ALTER TABLE GoalMarketExtension ADD CONSTRAINT GoalMarketExtension_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.revisionId')) = revisionId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.ruleVersion')) = ruleVersion
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.contentHash')) = contentHash
  AND JSON_EXTRACT(body, '$.version') = 1
  AND JSON_TYPE(JSON_EXTRACT(body, '$.scoreDistribution')) = 'OBJECT'
  AND JSON_TYPE(JSON_EXTRACT(body, '$.markets')) = 'ARRAY', FALSE) = TRUE);
ALTER TABLE ImpliedMarketExtension ADD CONSTRAINT ImpliedMarketExtension_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.revisionId')) = revisionId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.ruleVersion')) = ruleVersion
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.contentHash')) = contentHash, FALSE) = TRUE);
ALTER TABLE ExtendedMarketSettlementRevision ADD CONSTRAINT ExtendedMarketSettlementRevision_seal CHECK (
  integrity = SHA2(CAST(body AS CHAR), 256));
ALTER TABLE ExtendedMarketPublishedPick ADD CONSTRAINT ExtendedMarketPublishedPick_seal CHECK (
  integrity = SHA2(CAST(body AS CHAR), 256));
ALTER TABLE ExtendedMarketPublishedPick ADD CONSTRAINT ExtendedMarketPublishedPick_shape CHECK (COALESCE(
  selectedProbability >= 0 AND selectedProbability <= 1 AND sortOrder <= 255
  AND JSON_EXTRACT(body, '$.version') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.revisionId')) = revisionId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.key')) = marketKey
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.source')) = source
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.ruleVersion')) = ruleVersion
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.period')) = period
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.selection')) = selection
  AND CAST(JSON_EXTRACT(body, '$.selectedProbability') AS DOUBLE) = selectedProbability
  AND JSON_EXTRACT(body, '$.sortOrder') = sortOrder
  AND source IN ('ai-score-distribution','market-implied')
  AND period IN ('full-time','half-time','second-half')
  AND ((source = 'ai-score-distribution' AND marketKey LIKE 'goal:%')
    OR (source = 'market-implied' AND marketKey LIKE 'implied:%')),
  FALSE) = TRUE);
ALTER TABLE ExtendedMarketSettlementRevision ADD CONSTRAINT ExtendedMarketSettlementRevision_shape CHECK (COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.marketKey')) = marketKey
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.predictionRevisionId')) = predictionRevisionId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.batchId')) = batchId
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.inputHash')) = inputHash
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.source')) = source
  AND source IN ('ai-score-distribution', 'market-implied')
  AND ((source = 'ai-score-distribution' AND marketKey LIKE 'goal:%')
    OR (source = 'market-implied' AND marketKey LIKE 'implied:%'))
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) IN ('correct','incorrect','half-win','half-loss','push','pending','void','unavailable')
  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) IN ('initial','transition','correction')
  AND ((JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'NULL' AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'unavailable')
    OR JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'STRING'), FALSE) = TRUE);

-- Repositories expose append and read only; even an accidentally broad runtime grant cannot mutate these archives.
CREATE TRIGGER GoalMarketExtension_no_update BEFORE UPDATE ON GoalMarketExtension FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
CREATE TRIGGER GoalMarketExtension_no_delete BEFORE DELETE ON GoalMarketExtension FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
CREATE TRIGGER ImpliedMarketExtension_no_update BEFORE UPDATE ON ImpliedMarketExtension FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
CREATE TRIGGER ImpliedMarketExtension_no_delete BEFORE DELETE ON ImpliedMarketExtension FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
CREATE TRIGGER ImpliedMarketResultEvidence_no_update BEFORE UPDATE ON ImpliedMarketResultEvidence FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
CREATE TRIGGER ImpliedMarketResultEvidence_no_delete BEFORE DELETE ON ImpliedMarketResultEvidence FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
CREATE TRIGGER ExtendedMarketSettlementRevision_no_update BEFORE UPDATE ON ExtendedMarketSettlementRevision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
CREATE TRIGGER ExtendedMarketSettlementRevision_no_delete BEFORE DELETE ON ExtendedMarketSettlementRevision FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
CREATE TRIGGER ExtendedMarketPublishedPick_no_update BEFORE UPDATE ON ExtendedMarketPublishedPick FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
CREATE TRIGGER ExtendedMarketPublishedPick_no_delete BEFORE DELETE ON ExtendedMarketPublishedPick FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';


-- Record the migration (checksum = SHA-256 of the committed migration.sql), once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''32595fa0866c4d66b72080f41b366977ad28cab04b9f1197efb044a90573d2a1'', NOW(3), ''20261012153531_goal_market_extension'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261012153531_goal_market_extension'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;
