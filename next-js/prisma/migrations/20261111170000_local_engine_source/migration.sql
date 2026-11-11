-- Extend source identity without changing sealed forecasts or their checksums.
ALTER TABLE MarketPrediction
  DROP CHECK MarketPrediction_payload_check,
  ADD CONSTRAINT MarketPrediction_payload_check CHECK (COALESCE(
    JSON_TYPE(payloadJson) = 'OBJECT' AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.available')) = 'BOOLEAN'
    AND ((available = 0 AND JSON_LENGTH(payloadJson) = 2 AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.available')) = 'false'
      AND unavailableReason = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.reason')) AND CHAR_LENGTH(unavailableReason) > 0
      AND source IS NULL AND selection IS NULL AND selectedProbability IS NULL
      AND probability1 IS NULL AND probability2 IS NULL AND probability3 IS NULL
      AND generatedAt IS NULL AND retrievedAt IS NULL AND providerUpdatedAt IS NULL) OR
    (available = 1 AND JSON_LENGTH(payloadJson) = 6 AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.available')) = 'true'
      AND unavailableReason IS NULL AND source IN ('ai', 'local-engine', 'api-football') AND selection IS NOT NULL
      AND source = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.source'))
      AND source = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.provenance.kind'))
      AND family = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.family'))
      AND selection = JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.selection'))
      AND selectedProbability = CAST(JSON_EXTRACT(payloadJson, '$.market.selectedProbability') AS DOUBLE)
      AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.ruleVersion')) = 'regulation-markets-v1'
      AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.period')) = 'regulation-including-stoppage-time'
      AND probability1 > 0 AND probability1 < 1 AND probability2 > 0 AND probability2 < 1
      AND (probability3 IS NULL OR (probability3 > 0 AND probability3 < 1))
      AND retrievedAt IS NOT NULL
      AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', retrievedAt) DIV 1000 = JSON_EXTRACT(payloadJson, '$.timestamps.retrievedAt')
      AND ((generatedAt IS NULL AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.timestamps.generatedAt')) = 'NULL') OR
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', generatedAt) DIV 1000 = JSON_EXTRACT(payloadJson, '$.timestamps.generatedAt'))
      AND ((providerUpdatedAt IS NULL AND JSON_TYPE(JSON_EXTRACT(payloadJson, '$.timestamps.providerUpdatedAt')) = 'NULL') OR
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', providerUpdatedAt) DIV 1000 = JSON_EXTRACT(payloadJson, '$.timestamps.providerUpdatedAt'))
      AND (source = 'api-football' OR JSON_TYPE(JSON_EXTRACT(payloadJson, '$.fallback')) = 'NULL')
      AND (source <> 'api-football' OR JSON_TYPE(JSON_EXTRACT(payloadJson, '$.fallback')) = 'OBJECT')
      AND (
        (family = 'match-result'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 3
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."home-win"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."draw"') AS DOUBLE)
          AND probability3 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."away-win"') AS DOUBLE)
          AND ABS(probability1 + probability2 + probability3 - 1) <= 0.0010000000000002
          AND selectedProbability = GREATEST(probability1, probability2, probability3)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2, probability3) THEN 'home-win' WHEN probability2 = GREATEST(probability1, probability2, probability3) THEN 'draw' ELSE 'away-win' END)
        OR
        (family = 'double-chance'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 3
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."home-or-draw"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."away-or-draw"') AS DOUBLE)
          AND probability3 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."home-or-away"') AS DOUBLE)
          AND JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.market.derivedFrom')) = 'match-result'
          AND selectedProbability = GREATEST(probability1, probability2, probability3)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2, probability3) THEN 'home-or-draw' WHEN probability2 = GREATEST(probability1, probability2, probability3) THEN 'away-or-draw' ELSE 'home-or-away' END)
        OR
        (family = 'total-goals'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 2
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."over-2.5"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."under-2.5"') AS DOUBLE)
          AND probability3 IS NULL
          AND ABS(probability1 + probability2 - 1) <= 0.0010000000000002
          AND JSON_EXTRACT(payloadJson, '$.market.line') = 2.5
          AND selectedProbability = GREATEST(probability1, probability2)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2) THEN 'over-2.5' ELSE 'under-2.5' END)
        OR
        (family = 'both-teams-to-score'
          AND JSON_LENGTH(JSON_EXTRACT(payloadJson, '$.market.probabilities')) = 2
          AND probability1 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."yes"') AS DOUBLE)
          AND probability2 = CAST(JSON_EXTRACT(payloadJson, '$.market.probabilities."no"') AS DOUBLE)
          AND probability3 IS NULL
          AND ABS(probability1 + probability2 - 1) <= 0.0010000000000002
          AND selectedProbability = GREATEST(probability1, probability2)
          AND selection = CASE WHEN probability1 = GREATEST(probability1, probability2) THEN 'yes' ELSE 'no' END)
      ))), FALSE) = TRUE);
