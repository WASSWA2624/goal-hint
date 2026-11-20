-- Preserve the sealed revision and accept the local-only model supported by publication.
ALTER TABLE GoalMarketExtension
  DROP CONSTRAINT GoalMarketExtension_shape,
  ADD CONSTRAINT GoalMarketExtension_shape_v2 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(body, '$.revisionId')) = revisionId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.cycleId')) = cycleId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.fixtureId')) = fixtureId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.ruleVersion')) = ruleVersion
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.contentHash')) = contentHash
    AND JSON_EXTRACT(body, '$.version') = 1
    AND (JSON_TYPE(JSON_EXTRACT(body, '$.scoreDistribution')) = 'OBJECT'
      OR JSON_TYPE(JSON_EXTRACT(body, '$.localPoisson')) = 'OBJECT')
    AND (JSON_CONTAINS_PATH(body, 'one', '$.scoreDistribution') = 0
      OR JSON_TYPE(JSON_EXTRACT(body, '$.scoreDistribution')) = 'OBJECT')
    AND (JSON_CONTAINS_PATH(body, 'one', '$.localPoisson') = 0
      OR JSON_TYPE(JSON_EXTRACT(body, '$.localPoisson')) = 'OBJECT')
    AND JSON_TYPE(JSON_EXTRACT(body, '$.markets')) = 'ARRAY', FALSE) = TRUE);
