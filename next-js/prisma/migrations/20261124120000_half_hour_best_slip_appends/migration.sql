-- Keep historic hourly slots valid and allow new half-hour appointments.
CREATE TRIGGER DailyBestSlipAppendBatch_check_slot BEFORE INSERT ON DailyBestSlipAppendBatch FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM DailySlipPublication p WHERE p.id = NEW.publicationId
      AND JSON_EXTRACT(p.bodyJson, '$.version') IN (3, 4)
      AND NEW.firstRank > JSON_EXTRACT(p.bodyJson, '$.count')
      AND NEW.publishedAt >= p.publishedAt
      AND DATE(DATE_ADD(NEW.hourAt, INTERVAL 3 HOUR)) = p.eatDate
      AND MINUTE(NEW.hourAt) IN (0, 30) AND SECOND(NEW.hourAt) = 0 AND MICROSECOND(NEW.hourAt) = 0
      AND NEW.publishedAt >= NEW.hourAt
      AND NEW.publishedAt < DATE_ADD(NEW.hourAt, INTERVAL IF(MINUTE(NEW.hourAt) = 0, 60, 30) MINUTE)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid Best Slips publication slot';
  END IF;
END;

DROP TRIGGER DailyBestSlipAppendBatch_check_parent;
