-- User-generated slips are transient. Retain filter presets and editorial history.
DROP TABLE `SavedSlipFixture`;
DROP TABLE `SavedSlip`;

-- Existing explicitly shared snapshots remain readable; no new personal snapshots are retained.

-- A legacy sealed day remains untouched. New publications are unique per date/band.
ALTER TABLE DailySlipPublication
  ADD COLUMN oddsBand VARCHAR(16) NOT NULL DEFAULT 'legacy',
  DROP INDEX DailySlipPublication_eatDate_key,
  ADD UNIQUE INDEX DailySlipPublication_eatDate_oddsBand_key (eatDate, oddsBand),
  DROP CHECK DailySlipPublication_body_shape_v2,
  ADD CONSTRAINT DailySlipPublication_body_shape_v3 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100')
        AND JSON_EXTRACT(bodyJson, '$.version') = 2
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand
        AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
    ), FALSE) = TRUE);
CREATE TRIGGER DailySlipPublication_band_insert BEFORE INSERT ON DailySlipPublication FOR EACH ROW
BEGIN
  IF NEW.oddsBand = 'legacy' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'New Best Slips require an odds band.';
  END IF;
END;
