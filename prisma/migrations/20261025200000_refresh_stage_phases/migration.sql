-- Live AI preparation imports and the recoverable empty-evidence request were added after the original stage check.
-- One statement swaps the check so no window exists without a constraint; every original binding is kept.
ALTER TABLE PredictionRefreshStage
  DROP CONSTRAINT PredictionRefreshStage_shape,
  ADD CONSTRAINT PredictionRefreshStage_shape_v2 CHECK (COALESCE(
    phase IN ('preparation','evidence','evidence-empty','ai','fallback','observation') AND kind IN ('started','completed')
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.jobId')) = jobId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.phase')) = phase
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) = kind
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.attemptId')) REGEXP '^[a-f0-9]{64}$', FALSE) = TRUE);
