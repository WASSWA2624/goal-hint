-- Adopt existing tables in place; never drop, truncate or rewrite existing rows.
-- New installations receive the same tables. db:verify must pass before/after adoption.

CREATE TABLE IF NOT EXISTS `FixtureFacts` (
  `fixtureId` char(36) COLLATE utf8mb4_bin NOT NULL,
  `providerFixtureId` bigint unsigned NOT NULL,
  `venueExternalId` bigint unsigned DEFAULT NULL,
  `venueName` varchar(256) COLLATE utf8mb4_bin DEFAULT NULL,
  `venueCity` varchar(256) COLLATE utf8mb4_bin DEFAULT NULL,
  `referee` varchar(256) COLLATE utf8mb4_bin DEFAULT NULL,
  `infoRetrievedAt` datetime(3) DEFAULT NULL,
  `events` json DEFAULT NULL,
  `eventsHash` char(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `eventsRetrievedAt` datetime(3) DEFAULT NULL,
  `statistics` json DEFAULT NULL,
  `statisticsHash` char(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `statisticsRetrievedAt` datetime(3) DEFAULT NULL,
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`fixtureId`),
  KEY `FixtureFacts_venueExternalId_idx` (`venueExternalId`),
  CONSTRAINT `FixtureFacts_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `FootballVenue` (
  `provider` varchar(32) COLLATE utf8mb4_bin NOT NULL,
  `externalId` bigint unsigned NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `name` varchar(256) COLLATE utf8mb4_bin DEFAULT NULL,
  `city` varchar(256) COLLATE utf8mb4_bin DEFAULT NULL,
  `country` varchar(256) COLLATE utf8mb4_bin DEFAULT NULL,
  `capacity` int unsigned DEFAULT NULL,
  `surface` varchar(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `retrievedAt` datetime(3) DEFAULT NULL,
  `checkedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`provider`,`externalId`),
  KEY `FootballVenue_checkedAt_idx` (`checkedAt`),
  CONSTRAINT `FootballVenue_status_check` CHECK ((`status` in (_utf8mb4'available',_utf8mb4'not-found',_utf8mb4'failed')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `SeasonStandings` (
  `seasonId` char(36) COLLATE utf8mb4_bin NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_bin NOT NULL,
  `body` json DEFAULT NULL,
  `contentHash` char(64) COLLATE utf8mb4_bin DEFAULT NULL,
  `retrievedAt` datetime(3) DEFAULT NULL,
  `checkedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`seasonId`),
  KEY `SeasonStandings_checkedAt_idx` (`checkedAt`),
  CONSTRAINT `SeasonStandings_seasonId_fkey` FOREIGN KEY (`seasonId`) REFERENCES `FootballSeason` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `SeasonStandings_status_check` CHECK (((`status` in (_utf8mb4'available',_utf8mb4'not-covered',_utf8mb4'failed')) and ((`status` = _utf8mb4'available') = ((`body` is not null) and (`contentHash` is not null) and (`retrievedAt` is not null)))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
