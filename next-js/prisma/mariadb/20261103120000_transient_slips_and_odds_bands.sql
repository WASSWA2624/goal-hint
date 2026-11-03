-- MariaDB 11.4 overlay. Stop application/worker writes and verify a private backup first.
-- Personal saved slips are permanently removed; filter presets and explicit public links remain.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261028130000_daily_slip_capacity'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103120000_transient_slips_and_odds_bands') <> 0
    OR (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('SavedSlip','SavedSlipFixture')) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites are missing or migration is already/partly applied.';
  END IF;
END //
DELIMITER ;
-- User-generated slips are transient. Retain filter presets and editorial history.
DROP TABLE `SavedSlipFixture`;
DROP TABLE `SavedSlip`;

-- Existing explicitly shared snapshots remain readable; no new personal snapshots are retained.

-- A legacy sealed day remains untouched. New publications are unique per date/band.
ALTER TABLE DailySlipPublication
  ADD COLUMN oddsBand VARCHAR(16) NOT NULL DEFAULT 'legacy',
  DROP INDEX DailySlipPublication_eatDate_key,
  ADD UNIQUE INDEX DailySlipPublication_eatDate_oddsBand_key (eatDate, oddsBand),
  DROP CONSTRAINT DailySlipPublication_body_shape_v2,
  ADD CONSTRAINT DailySlipPublication_body_shape_v3 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100')
        AND JSON_EXTRACT(bodyJson, '$.version') = 2
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand
        AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
    ), FALSE) = TRUE);
DELIMITER //
CREATE TRIGGER DailySlipPublication_band_insert BEFORE INSERT ON DailySlipPublication FOR EACH ROW
BEGIN
  IF NEW.oddsBand = 'legacy' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New Best Slips require an odds band.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'c1a389801b020c6e01fedc5b53622ea5f30fefd199042e3ddeef7aff7b9c09f7',NOW(3),'20261103120000_transient_slips_and_odds_bands',NOW(3),1);
