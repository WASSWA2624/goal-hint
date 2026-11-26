-- Existing publication identities, ranks and sealed bodies are preserved.
ALTER TABLE DailySlipPublication
  DROP CHECK DailySlipPublication_body_shape_v6,
  ADD CONSTRAINT DailySlipPublication_body_shape_v7 CHECK (COALESCE(
    (modelId IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand AND (
          (JSON_EXTRACT(bodyJson, '$.version') = 2 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
          OR (JSON_EXTRACT(bodyJson, '$.version') = 3 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 10)
        ))
    )) OR (modelId IS NULL AND oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
      AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand
      AND JSON_EXTRACT(bodyJson, '$.version') IN (4, 5) AND JSON_EXTRACT(bodyJson, '$.count') = 0
      AND JSON_TYPE(JSON_EXTRACT(bodyJson, '$.model')) = 'NULL'), FALSE) = TRUE);

ALTER TABLE DailyBestSlipAppendBatch
  DROP CHECK DailyBestSlipAppendBatch_rank_shape,
  DROP CHECK DailyBestSlipAppendBatch_body_shape,
  MODIFY COLUMN `firstRank` INT UNSIGNED NOT NULL,
  MODIFY COLUMN `count` INT UNSIGNED NOT NULL,
  ADD CONSTRAINT DailyBestSlipAppendBatch_rank_shape_v2 CHECK (COALESCE(
    JSON_EXTRACT(bodyJson, '$.firstRank') = `firstRank` AND JSON_EXTRACT(bodyJson, '$.count') = `count`
    AND `firstRank` >= 1 AND `count` >= 1 AND (
      (JSON_EXTRACT(bodyJson, '$.version') = 1 AND `firstRank` + `count` <= 11)
      OR (JSON_EXTRACT(bodyJson, '$.version') = 2 AND `firstRank` + `count` <= 4294967296)
    ), FALSE) = TRUE);

ALTER TABLE PublishedSlip
  DROP CHECK PublishedSlip_rank_shape_v2,
  MODIFY COLUMN `rank` INT UNSIGNED NOT NULL,
  ADD CONSTRAINT PublishedSlip_rank_shape_v3 CHECK (`rank` >= 1);

-- A Kampala operational set opens at 00:00 local and accepts additions until 03:00 the next day.
CREATE TRIGGER DailyBestSlipAppendBatch_check_operational_slot BEFORE INSERT ON DailyBestSlipAppendBatch FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM DailySlipPublication p WHERE p.id = NEW.publicationId
      AND NEW.firstRank > JSON_EXTRACT(p.bodyJson, '$.count')
      AND NEW.publishedAt >= p.publishedAt AND NEW.publishedAt >= NEW.hourAt
      AND MINUTE(NEW.hourAt) IN (0, 30) AND SECOND(NEW.hourAt) = 0 AND MICROSECOND(NEW.hourAt) = 0
      AND (
        (JSON_EXTRACT(NEW.bodyJson, '$.version') = 1 AND JSON_EXTRACT(p.bodyJson, '$.version') IN (3, 4)
          AND DATE(DATE_ADD(NEW.hourAt, INTERVAL 3 HOUR)) = p.eatDate
          AND NEW.publishedAt < DATE_ADD(NEW.hourAt, INTERVAL IF(MINUTE(NEW.hourAt) = 0, 60, 30) MINUTE))
        OR (JSON_EXTRACT(NEW.bodyJson, '$.version') = 2 AND JSON_EXTRACT(p.bodyJson, '$.version') IN (3, 4, 5)
          AND NEW.hourAt >= DATE_SUB(p.eatDate, INTERVAL 3 HOUR)
          AND NEW.hourAt < DATE_ADD(p.eatDate, INTERVAL 1 DAY)
          AND NEW.publishedAt < DATE_ADD(NEW.hourAt, INTERVAL 30 MINUTE))
      )
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid Best Slips publication slot';
  END IF;
END;

DROP TRIGGER DailyBestSlipAppendBatch_check_slot;
