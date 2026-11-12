-- Permit the separately sealed retry after an undispatched final status check.
ALTER TABLE PredictionRefreshStage
  DROP CONSTRAINT PredictionRefreshStage_shape_v2,
  ADD CONSTRAINT PredictionRefreshStage_shape_v3 CHECK (COALESCE(
    phase IN ('preparation','evidence','evidence-empty','ai','fallback','observation','status-retry') AND kind IN ('started','completed')
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.jobId')) = jobId
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.phase')) = phase
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.kind')) = kind
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.attemptId')) REGEXP '^[a-f0-9]{64}$', FALSE) = TRUE);
