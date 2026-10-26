-- CreateTable
CREATE TABLE `DailySlipPublication` (
    `id` CHAR(64) NOT NULL,
    `eatDate` DATE NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `modelId` CHAR(64) NOT NULL,
    `bodyJson` JSON NOT NULL,
    `integrity` CHAR(64) NOT NULL,

    UNIQUE INDEX `DailySlipPublication_eatDate_key`(`eatDate`),
    INDEX `DailySlipPublication_publishedAt_idx`(`publishedAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PublishedSlip` (
    `id` CHAR(64) NOT NULL,
    `publicationId` CHAR(64) NOT NULL,
    `rank` TINYINT UNSIGNED NOT NULL,
    `snapshotJson` JSON NOT NULL,
    `integrity` CHAR(64) NOT NULL,

    UNIQUE INDEX `PublishedSlip_publicationId_rank_key`(`publicationId`, `rank`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PublishedSlipLeg` (
    `slipId` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `cycleId` CHAR(36) NOT NULL,
    `revisionId` CHAR(36) NOT NULL,

    INDEX `PublishedSlipLeg_cycleId_idx`(`cycleId`),
    INDEX `PublishedSlipLeg_revisionId_cycleId_fixtureId_idx`(`revisionId`, `cycleId`, `fixtureId`),
    INDEX `PublishedSlipLeg_fixtureId_idx`(`fixtureId`),
    PRIMARY KEY (`slipId`, `fixtureId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `PublishedSlip` ADD CONSTRAINT `PublishedSlip_publicationId_fkey` FOREIGN KEY (`publicationId`) REFERENCES `DailySlipPublication`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PublishedSlipLeg` ADD CONSTRAINT `PublishedSlipLeg_slipId_fkey` FOREIGN KEY (`slipId`) REFERENCES `PublishedSlip`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PublishedSlipLeg` ADD CONSTRAINT `PublishedSlipLeg_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PublishedSlipLeg` ADD CONSTRAINT `PublishedSlipLeg_revisionId_cycleId_fixtureId_fkey` FOREIGN KEY (`revisionId`, `cycleId`, `fixtureId`) REFERENCES `PredictionSet`(`id`, `cycleId`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Original publication bodies and cycle membership cannot be edited or erased.
ALTER TABLE PublishedSlip ADD CONSTRAINT PublishedSlip_rank_shape CHECK (`rank` BETWEEN 1 AND 10);
ALTER TABLE DailySlipPublication ADD CONSTRAINT DailySlipPublication_body_shape CHECK (COALESCE(
  JSON_EXTRACT(bodyJson, '$.version') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId
  AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 10, FALSE) = TRUE);
ALTER TABLE PublishedSlip ADD CONSTRAINT PublishedSlip_snapshot_shape CHECK (COALESCE(
  JSON_LENGTH(JSON_EXTRACT(snapshotJson, '$.slip.selections')) BETWEEN 1 AND 8
  AND JSON_EXTRACT(snapshotJson, '$.estimatedProbability') BETWEEN 0 AND 1, FALSE) = TRUE);
CREATE TRIGGER DailySlipPublication_no_update BEFORE UPDATE ON DailySlipPublication FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip history is append-only';
END;
CREATE TRIGGER DailySlipPublication_no_delete BEFORE DELETE ON DailySlipPublication FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip history is append-only';
END;
CREATE TRIGGER PublishedSlip_no_update BEFORE UPDATE ON PublishedSlip FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip history is append-only';
END;
CREATE TRIGGER PublishedSlip_no_delete BEFORE DELETE ON PublishedSlip FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip history is append-only';
END;
CREATE TRIGGER PublishedSlipLeg_no_update BEFORE UPDATE ON PublishedSlipLeg FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip history is append-only';
END;
CREATE TRIGGER PublishedSlipLeg_no_delete BEFORE DELETE ON PublishedSlipLeg FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published slip history is append-only';
END;
