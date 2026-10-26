-- Provider-fallback-only refresh intents carry no model pin or AI allocation.
-- One statement swaps the shape check so no window exists without a constraint.
-- Complete AI intents keep every original identity binding; partial shapes stay invalid.
ALTER TABLE PredictionRefreshIntent
  DROP CHECK PredictionRefreshIntent_shape,
  ADD CONSTRAINT PredictionRefreshIntent_shape_v2 CHECK (COALESCE(
    jobId REGEXP '^[a-f0-9]{64}$'
    AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.member.jobId')) = jobId
    AND (
      (JSON_UNQUOTE(JSON_EXTRACT(body, '$.pin.jobId')) = jobId
        AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.plan.ai.job.jobId')) = jobId
        AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.plan.modelVersionId')) = JSON_UNQUOTE(JSON_EXTRACT(body, '$.pin.modelVersionId')))
      OR (JSON_TYPE(JSON_EXTRACT(body, '$.pin')) = 'NULL'
        AND JSON_TYPE(JSON_EXTRACT(body, '$.plan.ai')) = 'NULL'
        AND JSON_TYPE(JSON_EXTRACT(body, '$.plan.modelVersionId')) = 'NULL')),
    FALSE) = TRUE);
