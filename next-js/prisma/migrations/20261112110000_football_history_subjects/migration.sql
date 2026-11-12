ALTER TABLE `FootballHistorySourcePage`
    ADD COLUMN `subjectIndexStatus` VARCHAR(8) NULL,
    ADD INDEX `football_history_source_subject_idx`(`endpoint`, `subjectIndexStatus`, `id`);

CREATE TABLE `FootballHistorySubject` (
    `kind` VARCHAR(8) NOT NULL,
    `externalId` INTEGER UNSIGNED NOT NULL,

    PRIMARY KEY (`kind`, `externalId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
