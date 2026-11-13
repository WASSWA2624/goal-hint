-- MariaDB 11.4 returns text from JSON_EXTRACT. Compare job times and delays
-- as integers, consistent with the durable job envelope in the app.
-- Apply to a verified MariaDB schema after the original durable jobs migration.
ALTER TABLE `DurableJob`
  DROP CONSTRAINT `DurableJob_projection_check`,
  ADD CONSTRAINT `DurableJob_projection_check` CHECK (
    JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.notBefore')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.expiresAt')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.fallbackReserveMs')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.timeoutMs')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.backoff.maxMs')) = 'INTEGER'
    AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.backoff.baseMs')) = 'INTEGER'
    AND COALESCE(
      JSON_TYPE(envelopeJson) = 'OBJECT' AND JSON_LENGTH(envelopeJson) = 14
      AND JSON_EXTRACT(envelopeJson, '$.version') = 1
      AND type = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.type'))
      AND handlerVersion = JSON_EXTRACT(envelopeJson, '$.handlerVersion')
      AND idempotencyKey = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.idempotencyKey'))
      AND priority = JSON_EXTRACT(envelopeJson, '$.priority')
      AND TIMESTAMPDIFF(MICROSECOND, '1970-01-01 00:00:00', expiresAt) DIV 1000
        = CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.expiresAt')) AS SIGNED)
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.notBefore')) AS SIGNED)
        < CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.expiresAt')) AS SIGNED)
      AND JSON_EXTRACT(envelopeJson, '$.maxAttempts') BETWEEN 1 AND 16
      AND attemptCount <= JSON_EXTRACT(envelopeJson, '$.maxAttempts')
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.timeoutMs')) AS SIGNED) BETWEEN 100 AND 3600000
      AND JSON_EXTRACT(envelopeJson, '$.leaseMs') BETWEEN 1000 AND 120000
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.fallbackReserveMs')) AS SIGNED) >= 0
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.fallbackReserveMs')) AS SIGNED)
        < CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.timeoutMs')) AS SIGNED)
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.backoff.baseMs')) AS SIGNED) BETWEEN 100 AND 60000
      AND CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.backoff.maxMs')) AS SIGNED)
        BETWEEN CAST(JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.backoff.baseMs')) AS SIGNED) AND 3600000
      AND ((refreshRunId IS NULL AND JSON_TYPE(JSON_EXTRACT(envelopeJson, '$.refresh')) = 'NULL')
        OR (refreshRunId = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.runId'))
          AND refreshFixtureId = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.fixtureId'))
          AND refreshCycleId = JSON_UNQUOTE(JSON_EXTRACT(envelopeJson, '$.refresh.cycleId')))),
      FALSE) = TRUE
  );
