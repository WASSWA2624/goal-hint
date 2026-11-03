-- Extend editorial publication eligibility without rewriting sealed history or per-band ranks.
ALTER TABLE DailySlipPublication
  DROP CHECK DailySlipPublication_body_shape_v3,
  ADD CONSTRAINT DailySlipPublication_body_shape_v4 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
        AND JSON_EXTRACT(bodyJson, '$.version') = 2
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand
        AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
    ), FALSE) = TRUE);
