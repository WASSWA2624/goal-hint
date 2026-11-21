-- Keep the original cutoff payload and seal readable by older releases.
ALTER TABLE PredictionCycleOperation
  ADD COLUMN featuredDecisionJson JSON NULL,
  ADD COLUMN featuredDecisionIntegrity CHAR(64) NULL,
  ADD CONSTRAINT PredictionCycleOperation_featured_check CHECK (
    (featuredDecisionJson IS NULL AND featuredDecisionIntegrity IS NULL)
    OR COALESCE(
      kind = 'close' AND revisionId IS NOT NULL
      AND featuredDecisionIntegrity IS NOT NULL
      AND featuredDecisionIntegrity = SHA2(CAST(featuredDecisionJson AS CHAR CHARACTER SET utf8mb4), 256)
      AND JSON_TYPE(featuredDecisionJson) = 'OBJECT'
      AND JSON_UNQUOTE(JSON_EXTRACT(featuredDecisionJson, '$.fixtureId')) = fixtureId
      AND JSON_UNQUOTE(JSON_EXTRACT(featuredDecisionJson, '$.cycleId')) = cycleId
      AND JSON_UNQUOTE(JSON_EXTRACT(featuredDecisionJson, '$.revisionId')) = revisionId
      AND JSON_TYPE(JSON_EXTRACT(featuredDecisionJson, '$.decision')) = 'OBJECT',
      FALSE
    )
  );
