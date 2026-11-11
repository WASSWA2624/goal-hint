-- Extend the sealed publication and settlement shapes with the reviewed local total.
ALTER TABLE ExtendedMarketPublishedPick
  DROP CHECK ExtendedMarketPublishedPick_shape,
  ADD CONSTRAINT ExtendedMarketPublishedPick_source_shape CHECK (COALESCE(
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
      OR (source = 'local-poisson' AND marketKey = 'goal:full-time:totals:total:1.5:binary' AND period = 'full-time')
      OR (source = 'market-implied' AND marketKey LIKE 'implied:%')),
    FALSE) = TRUE);

ALTER TABLE ExtendedMarketSettlementRevision
  DROP CHECK ExtendedMarketSettlementRevision_shape,
  ADD CONSTRAINT ExtendedMarketSettlementRevision_source_shape CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(body, '$.id')) = id
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.marketKey')) = marketKey
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.predictionRevisionId')) = predictionRevisionId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.batchId')) = batchId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.inputHash')) = inputHash
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.source')) = source
    AND ((source = 'ai-score-distribution' AND marketKey LIKE 'goal:%')
      OR (source = 'local-poisson' AND marketKey = 'goal:full-time:totals:total:1.5:binary')
      OR (source = 'market-implied' AND marketKey LIKE 'implied:%'))
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) IN ('correct','incorrect','half-win','half-loss','push','pending','void','unavailable')
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) IN ('initial','transition','correction')
    AND ((JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'NULL' AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'unavailable')
      OR JSON_TYPE(JSON_EXTRACT(body, '$.selection')) = 'STRING'), FALSE) = TRUE);
