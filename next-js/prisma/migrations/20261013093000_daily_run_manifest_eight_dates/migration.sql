-- Live runs now select an eight-date window (LIVE_FORECAST_WINDOW_DAYS = 8, the visitor-local edge day),
-- so a manifest's coverage holds seven or eight EAT dates (docs/daily-selection.md).
ALTER TABLE DailyRunManifest DROP CHECK DailyRunManifest_shape;
ALTER TABLE DailyRunManifest ADD CONSTRAINT DailyRunManifest_shape CHECK (COALESCE(
  manifestHash REGEXP '^[a-f0-9]{64}$' AND JSON_EXTRACT(manifestJson, '$.version') = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(manifestJson, '$.runId')) = runId
  AND JSON_TYPE(JSON_EXTRACT(manifestJson, '$.entries')) = 'ARRAY'
  AND JSON_LENGTH(JSON_EXTRACT(manifestJson, '$.coverage')) IN (7, 8), FALSE) = TRUE);
