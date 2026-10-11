-- CreateTable
CREATE TABLE `OddsImportBatch` (
    `id` CHAR(64) NOT NULL,
    `accountId` CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `scopeKey` VARCHAR(96) NOT NULL,
    `policyHash` CHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `requestsDispatched` INTEGER UNSIGNED NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    INDEX `OddsImportBatch_accountId_receivedAt_idx`(`accountId`, `receivedAt`),
    INDEX `OddsImportBatch_scopeKey_receivedAt_idx`(`scopeKey`, `receivedAt`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `OddsBetObservation` (
    `id` CHAR(64) NOT NULL,
    `provider` VARCHAR(32) NOT NULL,
    `betExternalId` INTEGER UNSIGNED NOT NULL,
    `name` VARCHAR(256) NOT NULL,
    `batchId` CHAR(64) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL,

    INDEX `OddsBetObservation_batchId_idx`(`batchId`),
    UNIQUE INDEX `OddsBetObservation_provider_betExternalId_name_key`(`provider`, `betExternalId`, `name`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ProviderOddsSnapshot` (
    `id` CHAR(64) NOT NULL,
    `fixtureId` CHAR(36) NOT NULL,
    `batchId` CHAR(64) NOT NULL,
    `previousId` CHAR(64) NULL,
    `bookmakerExternalId` INTEGER UNSIGNED NOT NULL,
    `bookmakerName` VARCHAR(128) NULL,
    `betExternalId` INTEGER UNSIGNED NOT NULL,
    `betName` VARCHAR(256) NULL,
    `valuesHash` CHAR(64) NOT NULL,
    `selectionCount` SMALLINT UNSIGNED NOT NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `retainUntil` DATETIME(3) NOT NULL,
    `integrity` CHAR(64) NOT NULL,
    `body` JSON NOT NULL,

    UNIQUE INDEX `ProviderOddsSnapshot_previousId_key`(`previousId`),
    INDEX `ProviderOddsSnapshot_fixtureId_bookmakerExternalId_betExtern_idx`(`fixtureId`, `bookmakerExternalId`, `betExternalId`, `retrievedAt`),
    INDEX `ProviderOddsSnapshot_batchId_idx`(`batchId`),
    INDEX `ProviderOddsSnapshot_retainUntil_idx`(`retainUntil`),
    UNIQUE INDEX `ProviderOddsSnapshot_id_fixtureId_key`(`id`, `fixtureId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureOddsState` (
    `fixtureId` CHAR(36) NOT NULL,
    `latestBatchId` CHAR(64) NOT NULL,
    `policyHash` CHAR(64) NOT NULL,
    `lastRetrievedAt` DATETIME(3) NOT NULL,
    `lastProviderUpdatedAt` DATETIME(3) NULL,
    `withdrawnAt` DATETIME(3) NULL,
    `publicVersion` INTEGER UNSIGNED NOT NULL DEFAULT 0,

    INDEX `FixtureOddsState_latestBatchId_idx`(`latestBatchId`),
    PRIMARY KEY (`fixtureId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `FixtureOddsPrice` (
    `fixtureId` CHAR(36) NOT NULL,
    `marketKey` VARCHAR(96) NOT NULL,
    `selection` VARCHAR(64) NOT NULL,
    `basis` VARCHAR(16) NOT NULL,
    `bookmakerExternalId` INTEGER UNSIGNED NULL,
    `line` DECIMAL(6, 2) NULL,
    `priceDecimal` DECIMAL(10, 4) NOT NULL,
    `displayHundredths` INTEGER UNSIGNED NOT NULL,
    `impliedProbability` DECIMAL(13, 12) NOT NULL,
    `overround` DECIMAL(13, 12) NOT NULL,
    `method` VARCHAR(32) NOT NULL,
    `mappingVersion` VARCHAR(32) NOT NULL,
    `snapshotId` CHAR(64) NULL,
    `basisJson` JSON NULL,
    `retrievedAt` DATETIME(3) NOT NULL,
    `providerUpdatedAt` DATETIME(3) NULL,
    `stale` BOOLEAN NOT NULL,

    INDEX `FixtureOddsPrice_snapshotId_fixtureId_idx`(`snapshotId`, `fixtureId`),
    PRIMARY KEY (`fixtureId`, `marketKey`, `selection`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `OddsImportBatch` ADD CONSTRAINT `OddsImportBatch_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `ApiQuotaAccount`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `OddsBetObservation` ADD CONSTRAINT `OddsBetObservation_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `OddsImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProviderOddsSnapshot` ADD CONSTRAINT `ProviderOddsSnapshot_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProviderOddsSnapshot` ADD CONSTRAINT `ProviderOddsSnapshot_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `OddsImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProviderOddsSnapshot` ADD CONSTRAINT `ProviderOddsSnapshot_previousId_fkey` FOREIGN KEY (`previousId`) REFERENCES `ProviderOddsSnapshot`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureOddsState` ADD CONSTRAINT `FixtureOddsState_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureOddsState` ADD CONSTRAINT `FixtureOddsState_latestBatchId_fkey` FOREIGN KEY (`latestBatchId`) REFERENCES `OddsImportBatch`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureOddsPrice` ADD CONSTRAINT `FixtureOddsPrice_fixtureId_fkey` FOREIGN KEY (`fixtureId`) REFERENCES `FootballFixture`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FixtureOddsPrice` ADD CONSTRAINT `FixtureOddsPrice_snapshot_fkey` FOREIGN KEY (`snapshotId`, `fixtureId`) REFERENCES `ProviderOddsSnapshot`(`id`, `fixtureId`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Reviewed hand-written constraints (prompt 052). Every CHECK is NULL-safe: MySQL accepts a CHECK that
-- evaluates to NULL, so each predicate is wrapped as COALESCE(..., FALSE) = TRUE.
ALTER TABLE OddsImportBatch
  ADD CONSTRAINT OddsImportBatch_shape_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND accountId REGEXP '^[a-f0-9]{64}$' AND policyHash REGEXP '^[a-f0-9]{64}$'
    AND kind IN ('prices', 'bets', 'bookmakers') AND status IN ('complete', 'partial', 'failed')
    AND CHAR_LENGTH(scopeKey) > 0 AND integrity = SHA2(CAST(body AS CHAR), 256)
    AND JSON_TYPE(body) = 'OBJECT'
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.accountId')) = accountId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) = kind AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.scopeKey')) = scopeKey
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.policyHash')) = policyHash AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = status
    AND JSON_EXTRACT(body, '$.requestsDispatched') = requestsDispatched
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', receivedAt) DIV 1000 = JSON_EXTRACT(body, '$.receivedAt')
    AND JSON_CONTAINS_PATH(body, 'one', '$.values', '$.bookmakers') = 0, FALSE) = TRUE);
ALTER TABLE OddsBetObservation
  ADD CONSTRAINT OddsBetObservation_shape_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND provider = 'api-football' AND betExternalId > 0
    AND CHAR_LENGTH(name) > 0 AND name = TRIM(name), FALSE) = TRUE);
ALTER TABLE ProviderOddsSnapshot
  ADD CONSTRAINT ProviderOddsSnapshot_identity_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND batchId REGEXP '^[a-f0-9]{64}$' AND valuesHash REGEXP '^[a-f0-9]{64}$'
    AND (previousId IS NULL OR (previousId REGEXP '^[a-f0-9]{64}$' AND previousId <> id))
    AND bookmakerExternalId > 0 AND betExternalId > 0 AND selectionCount >= 1, FALSE) = TRUE),
  ADD CONSTRAINT ProviderOddsSnapshot_time_check CHECK (COALESCE(
    (providerUpdatedAt IS NULL OR providerUpdatedAt <= retrievedAt) AND retainUntil > retrievedAt, FALSE) = TRUE),
  ADD CONSTRAINT ProviderOddsSnapshot_integrity_check CHECK (COALESCE(integrity = SHA2(CAST(body AS CHAR), 256), FALSE) = TRUE),
  ADD CONSTRAINT ProviderOddsSnapshot_body_check CHECK (COALESCE(
    JSON_TYPE(body) = 'OBJECT' AND JSON_LENGTH(body) = 12
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
    AND ((previousId IS NULL AND JSON_TYPE(JSON_EXTRACT(body, '$.previousId')) = 'NULL')
      OR JSON_UNQUOTE(JSON_EXTRACT(body, '$.previousId')) = previousId)
    AND JSON_EXTRACT(body, '$.bookmakerId') = bookmakerExternalId AND JSON_EXTRACT(body, '$.betId') = betExternalId
    AND ((bookmakerName IS NULL AND JSON_TYPE(JSON_EXTRACT(body, '$.bookmakerName')) = 'NULL')
      OR JSON_UNQUOTE(JSON_EXTRACT(body, '$.bookmakerName')) = bookmakerName)
    AND ((betName IS NULL AND JSON_TYPE(JSON_EXTRACT(body, '$.betName')) = 'NULL')
      OR JSON_UNQUOTE(JSON_EXTRACT(body, '$.betName')) = betName)
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.valuesHash')) = valuesHash
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', retrievedAt) DIV 1000 = JSON_EXTRACT(body, '$.retrievedAt')
    AND ((providerUpdatedAt IS NULL AND JSON_TYPE(JSON_EXTRACT(body, '$.providerUpdatedAt')) = 'NULL')
      OR TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', providerUpdatedAt) DIV 1000 = JSON_EXTRACT(body, '$.providerUpdatedAt'))
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', retainUntil) DIV 1000 = JSON_EXTRACT(body, '$.retainUntil')
    AND JSON_TYPE(JSON_EXTRACT(body, '$.values')) = 'ARRAY' AND JSON_LENGTH(body, '$.values') = selectionCount, FALSE) = TRUE);
ALTER TABLE FixtureOddsState
  ADD CONSTRAINT FixtureOddsState_shape_check CHECK (COALESCE(
    policyHash REGEXP '^[a-f0-9]{64}$'
    AND (lastProviderUpdatedAt IS NULL OR lastProviderUpdatedAt <= lastRetrievedAt), FALSE) = TRUE);
-- 053 replaces FixtureOddsPrice_market_check with a _v2 that admits score-derived market keys.
ALTER TABLE FixtureOddsPrice
  ADD CONSTRAINT FixtureOddsPrice_market_check CHECK (COALESCE(
    marketKey IN ('match-result', 'double-chance', 'total-goals', 'both-teams-to-score')
    AND ((marketKey = 'total-goals' AND line = 2.50) OR (marketKey <> 'total-goals' AND line IS NULL)), FALSE) = TRUE),
  ADD CONSTRAINT FixtureOddsPrice_basis_check CHECK (COALESCE(
    basis IN ('bookmaker', 'median')
    AND (basis <> 'bookmaker' OR (snapshotId IS NOT NULL AND bookmakerExternalId IS NOT NULL AND basisJson IS NULL))
    AND (basis <> 'median' OR (bookmakerExternalId IS NULL AND JSON_TYPE(basisJson) = 'OBJECT')), FALSE) = TRUE),
  ADD CONSTRAINT FixtureOddsPrice_value_check CHECK (COALESCE(
    priceDecimal > 1 AND displayHundredths >= 100 AND displayHundredths = ROUND(priceDecimal * 100, 0)
    AND impliedProbability > 0 AND impliedProbability < 1 AND overround > 0
    AND method REGEXP '^[a-z0-9-]+-v[0-9]+$' AND mappingVersion REGEXP '^[a-z0-9-]+-v[0-9]+$'
    AND CHAR_LENGTH(selection) > 0
    AND (providerUpdatedAt IS NULL OR providerUpdatedAt <= retrievedAt), FALSE) = TRUE);

-- Public cache invalidation fires once per fixture, and only when its public prices change
-- (publicVersion). Reconfirmations that only move lastRetrievedAt never invalidate. No DELIMITER.
CREATE TRIGGER PublicCache_FixtureOddsState_insert AFTER INSERT ON FixtureOddsState FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags WHERE tags.tag IS NOT NULL AND NEW.publicVersion > 0 ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags ON tags.tag=t.tag
    WHERE NEW.publicVersion > 0;
END;

CREATE TRIGGER PublicCache_FixtureOddsState_update AFTER UPDATE ON FixtureOddsState FOR EACH ROW
BEGIN
  INSERT INTO PublicCacheTag (tag, generation)
    SELECT tags.tag, 1 FROM (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags WHERE tags.tag IS NOT NULL AND NEW.publicVersion <> OLD.publicVersion ORDER BY tags.tag
    ON DUPLICATE KEY UPDATE generation=PublicCacheTag.generation+1;
  INSERT INTO PublicCacheInvalidation (tag, generation, at)
    SELECT t.tag, t.generation, UTC_TIMESTAMP(3) FROM PublicCacheTag t
    JOIN (SELECT CONCAT('fixture:', LOWER(NEW.fixtureId)) AS tag UNION SELECT CONCAT('date:', DATE_FORMAT(DATE_ADD(f.kickoff, INTERVAL 3 HOUR), '%Y-%m-%d')) AS tag FROM FootballFixture f WHERE f.id=NEW.fixtureId) tags ON tags.tag=t.tag
    WHERE NEW.publicVersion <> OLD.publicVersion;
END;
