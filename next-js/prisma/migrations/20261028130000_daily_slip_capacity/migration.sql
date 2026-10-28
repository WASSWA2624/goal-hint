-- Widen only daily publication capacity; existing snapshots and append-only triggers stay intact.
ALTER TABLE PublishedSlip
  DROP CONSTRAINT PublishedSlip_rank_shape,
  ADD CONSTRAINT PublishedSlip_rank_shape_v2 CHECK (`rank` BETWEEN 1 AND 100);
ALTER TABLE DailySlipPublication
  DROP CONSTRAINT DailySlipPublication_body_shape,
  ADD CONSTRAINT DailySlipPublication_body_shape_v2 CHECK (COALESCE(
    JSON_EXTRACT(bodyJson, '$.version') = 1
    AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId
    AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100, FALSE) = TRUE);
