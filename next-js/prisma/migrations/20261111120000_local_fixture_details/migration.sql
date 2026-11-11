ALTER TABLE `FixtureFacts`
    ADD COLUMN `lineups` JSON NULL,
    ADD COLUMN `playerStatistics` JSON NULL,
    ADD COLUMN `detailsRetrievedAt` DATETIME(3) NULL;
