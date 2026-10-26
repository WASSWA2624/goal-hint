-- CreateTable
CREATE TABLE `PublicSearchLimit` (
    `scope` VARCHAR(32) NOT NULL,
    `windowStartedAt` DATETIME(3) NOT NULL,
    `requests` INTEGER UNSIGNED NOT NULL,

    PRIMARY KEY (`scope`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE PublicSearchLimit ADD CONSTRAINT PublicSearchLimit_scope CHECK (scope = 'matches');
INSERT INTO PublicSearchLimit (scope, windowStartedAt, requests) VALUES ('matches', '1970-01-01 00:00:00.000', 0);
