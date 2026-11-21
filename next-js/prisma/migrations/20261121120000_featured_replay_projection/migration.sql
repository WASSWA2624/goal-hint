-- Legacy November records retain their original admissibility and seals.
ALTER TABLE NovemberReplayRevision
  DROP CONSTRAINT NovemberReplayRevision_body_check,
  ADD CONSTRAINT NovemberReplayRevision_body_check CHECK (COALESCE(
    id REGEXP '^[a-f0-9]{64}$' AND evidenceHash REGEXP '^[a-f0-9]{64}$'
    AND integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256) AND JSON_TYPE(JSON_EXTRACT(body,'$.canonicalBody'))='STRING'
    AND stagedAt>=generatedAt AND status IN ('estimated','abstained')
    AND (kickoffAt IS NULL OR (kickoffAt>='2026-10-31 21:00:00.000' AND kickoffAt<'2026-11-30 21:00:00.000')
      OR JSON_TYPE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(body,'$.canonicalBody')),'$.featuredDecision.version'))='STRING')
    AND (evidenceCutoffAt IS NULL OR (kickoffAt IS NOT NULL AND evidenceCutoffAt<kickoffAt AND evidenceCutoffAt<=generatedAt))
    AND (scheduleVersion IS NULL OR (cycleId IS NOT NULL AND scheduleVersion>0))
    AND (sourceRevisionId IS NULL OR cycleId IS NOT NULL)
    AND (status='abstained' OR (kickoffAt IS NOT NULL AND evidenceCutoffAt IS NOT NULL AND generatedAt>=kickoffAt)), FALSE) = TRUE);

ALTER TABLE NovemberReplayProjection
  DROP CONSTRAINT NovemberReplayProjection_body_check,
  ADD CONSTRAINT NovemberReplayProjection_body_check CHECK (COALESCE(
    (revisionId IS NULL AND sourceRevisionId IS NULL AND cycleId IS NULL AND scheduleVersion IS NULL
      AND kickoffAt IS NULL AND evidenceCutoffAt IS NULL AND activationOperationId IS NULL AND integrity IS NULL AND body IS NULL)
    OR
    (revisionId IS NOT NULL AND kickoffAt IS NOT NULL AND evidenceCutoffAt<kickoffAt AND changedAt>=kickoffAt
      AND activationOperationId IS NOT NULL AND integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256)
      AND JSON_TYPE(JSON_EXTRACT(body,'$.canonicalBody'))='STRING'
      AND ((sourceRevisionId IS NOT NULL AND cycleId IS NOT NULL AND scheduleVersion>0
          AND kickoffAt>='2026-10-31 21:00:00.000' AND kickoffAt<'2026-11-30 21:00:00.000')
        OR (JSON_TYPE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(body,'$.canonicalBody')),'$.featuredDecision.version'))='STRING'
          AND JSON_TYPE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(body,'$.canonicalBody')),'$.decisionAt')) IN ('INTEGER','UNSIGNED INTEGER')
          AND ((cycleId IS NULL AND scheduleVersion IS NULL AND sourceRevisionId IS NULL)
            OR (cycleId IS NOT NULL AND scheduleVersion>0))))), FALSE) = TRUE);
