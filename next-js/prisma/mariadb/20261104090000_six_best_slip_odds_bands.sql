-- MariaDB overlay. Extend the allowed band set without changing existing publications.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103180000_shared_slip_trigger_blocks'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261104090000_six_best_slip_odds_bands') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

ALTER TABLE DailySlipPublication
  DROP CONSTRAINT DailySlipPublication_body_shape_v3,
  ADD CONSTRAINT DailySlipPublication_body_shape_v4 CHECK (COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.model.id')) = modelId AND (
      (oddsBand = 'legacy' AND JSON_EXTRACT(bodyJson, '$.version') = 1 AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 100)
      OR (oddsBand IN ('1.5-5','5-10','10-20','20-50','50-100','100-200')
        AND JSON_EXTRACT(bodyJson, '$.version') = 2
        AND JSON_UNQUOTE(JSON_EXTRACT(bodyJson, '$.oddsBand')) = oddsBand
        AND JSON_EXTRACT(bodyJson, '$.count') BETWEEN 1 AND 20)
    ), FALSE) = TRUE);

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'a2ad704892f0165e9bc92a6c5f4de140714cccdd72b9146b7d312a18e4d26d3a',NOW(3),'20261104090000_six_best_slip_odds_bands',NOW(3),1);
