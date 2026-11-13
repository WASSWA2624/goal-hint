-- MariaDB equivalent of the MySQL migration. Pause writers and take a backup first.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261111170100_local_goal_market_source'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261113140000_expand_local_goal_markets') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_TYPE = 'CHECK' AND ((TABLE_NAME = 'ExtendedMarketPublishedPick'
        AND CONSTRAINT_NAME = 'ExtendedMarketPublishedPick_source_shape') OR (TABLE_NAME = 'ExtendedMarketSettlementRevision'
        AND CONSTRAINT_NAME = 'ExtendedMarketSettlementRevision_source_shape'))) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Local goal market migration prerequisites missing or already applied.';
  END IF;
END //
DELIMITER ;

ALTER TABLE ExtendedMarketPublishedPick
  DROP CONSTRAINT ExtendedMarketPublishedPick_source_shape,
  ADD CONSTRAINT ExtendedMarketPublishedPick_goal_shape CHECK (COALESCE(
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
    AND period IN ('full-time','half-time','second-half')
    AND ((source = 'ai-score-distribution' AND marketKey LIKE 'goal:%')
      OR (source = 'local-poisson' AND SUBSTRING_INDEX(marketKey, ':', 2) = CONCAT('goal:', period)
        AND SUBSTRING_INDEX(SUBSTRING_INDEX(marketKey, ':', 3), ':', -1) IN ('totals','exact-count','count-range','odd-even'))
      OR (source = 'market-implied' AND marketKey LIKE 'implied:%')),
    FALSE) = TRUE);

ALTER TABLE ExtendedMarketSettlementRevision
  DROP CONSTRAINT ExtendedMarketSettlementRevision_source_shape,
  ADD CONSTRAINT ExtendedMarketSettlementRevision_goal_shape CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.marketKey')) = marketKey
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.predictionRevisionId')) = predictionRevisionId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.batchId')) = batchId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.inputHash')) = inputHash
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.source')) = source
    AND ((source = 'ai-score-distribution' AND marketKey LIKE 'goal:%')
      OR (source = 'local-poisson' AND SUBSTRING_INDEX(marketKey, ':', 1) = 'goal'
        AND SUBSTRING_INDEX(SUBSTRING_INDEX(marketKey, ':', 2), ':', -1) IN ('full-time','half-time','second-half')
        AND SUBSTRING_INDEX(SUBSTRING_INDEX(marketKey, ':', 3), ':', -1) IN ('totals','exact-count','count-range','odd-even'))
      OR (source = 'market-implied' AND marketKey LIKE 'implied:%'))
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) IN ('correct','incorrect','half-win','half-loss','push','pending','void','unavailable')
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) IN ('initial','transition','correction')
    AND ((JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'NULL' AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'unavailable')
      OR JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'STRING'), FALSE) = TRUE);

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME IN ('ExtendedMarketPublishedPick_goal_shape','ExtendedMarketSettlementRevision_goal_shape')
      AND CHECK_CLAUSE LIKE '%count-range%' AND CHECK_CLAUSE LIKE '%local-poisson%') <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Local goal market constraint verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'9cf49fbe2cd6e4499310cd29ebcba83e29d3af9eb3b079434a0fedcd94cad0e9',NOW(3),'20261113140000_expand_local_goal_markets',NOW(3),1);
