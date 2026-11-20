CREATE TABLE RecoveredPreMatchOddsSnapshot (
  id CHAR(64) NOT NULL,
  fixtureId CHAR(36) NOT NULL,
  batchId CHAR(64) NOT NULL,
  kickoffAt DATETIME(3) NOT NULL,
  bookmakerExternalId INT UNSIGNED NOT NULL,
  betExternalId INT UNSIGNED NOT NULL,
  retrievedAt DATETIME(3) NOT NULL,
  providerUpdatedAt DATETIME(3) NULL,
  retainUntil DATETIME(3) NOT NULL,
  integrity CHAR(64) NOT NULL,
  body JSON NOT NULL,
  PRIMARY KEY (id),
  INDEX recovered_pre_match_odds_lookup_idx (fixtureId, kickoffAt, bookmakerExternalId, betExternalId, retrievedAt),
  INDEX recovered_pre_match_odds_batch_idx (batchId),
  INDEX recovered_pre_match_odds_retention_idx (retainUntil),
  CONSTRAINT RecoveredPreMatchOddsSnapshot_fixtureId_fkey FOREIGN KEY (fixtureId)
    REFERENCES FootballFixture (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT RecoveredPreMatchOddsSnapshot_batchId_fkey FOREIGN KEY (batchId)
    REFERENCES OddsImportBatch (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT recovered_pre_match_odds_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND batchId REGEXP '^[a-f0-9]{64}$'
    AND bookmakerExternalId > 0 AND betExternalId > 0 AND retrievedAt >= kickoffAt AND retainUntil > retrievedAt
    AND (providerUpdatedAt IS NULL OR providerUpdatedAt <= retrievedAt)
    AND integrity = SHA2(CAST(body AS CHAR), 256) AND JSON_TYPE(body) = 'OBJECT'
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.batchId')) = batchId
    AND JSON_EXTRACT(body, '$.bookmakerId') = bookmakerExternalId AND JSON_EXTRACT(body, '$.betId') = betExternalId
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', kickoffAt) DIV 1000 = JSON_EXTRACT(body, '$.kickoffAt')
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', retrievedAt) DIV 1000 = JSON_EXTRACT(body, '$.retrievedAt')
    AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', retainUntil) DIV 1000 = JSON_EXTRACT(body, '$.retainUntil')
    AND ((providerUpdatedAt IS NULL AND JSON_TYPE(JSON_EXTRACT(body, '$.providerUpdatedAt')) = 'NULL')
      OR TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', providerUpdatedAt) DIV 1000 = JSON_EXTRACT(body, '$.providerUpdatedAt'))
    AND JSON_TYPE(JSON_EXTRACT(body, '$.values')) = 'ARRAY' AND JSON_LENGTH(body, '$.values') BETWEEN 1 AND 1000,
    FALSE) = TRUE)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
