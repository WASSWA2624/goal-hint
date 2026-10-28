-- Keep list counts, ordering and filtering on a compact projection instead of
-- reading every immutable candidate document in a large date cohort. SQL NULL
-- means no recommendation decision; an object with null fields preserves an
-- explicit abstention. Values are generated from the original sealed bytes.
ALTER TABLE `PredictionSet`
  ADD COLUMN `feedRecommendation` JSON GENERATED ALWAYS AS (
    CASE WHEN JSON_CONTAINS_PATH(`candidateJson`, 'one', '$.audit.recommendation') = 1
      THEN JSON_OBJECT(
        'family', JSON_EXTRACT(`candidateJson`, '$.audit.recommendation.selected.family'),
        'selection', JSON_EXTRACT(`candidateJson`, '$.audit.recommendation.selected.selection'),
        'probability', JSON_EXTRACT(`candidateJson`, '$.audit.recommendation.selected.probability'),
        'decimal', JSON_EXTRACT(`candidateJson`, '$.audit.recommendation.selected.quote.decimal')
      ) ELSE NULL END
  ) STORED;
