-- MariaDB overlay. Pause writers and take a verified backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103170000_community_payment_alerts' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103180000_shared_slip_trigger_blocks') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
-- Preserve the existing immutable shared-slip guards using dump-safe block bodies.
-- Do not rewrite the applied 20261029180000_shared_slips migration. Pause writers while replacing these triggers.
DROP TRIGGER IF EXISTS SharedSlip_no_update //
CREATE TRIGGER SharedSlip_no_update BEFORE UPDATE ON SharedSlip FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shared slips are immutable.';
END //
DROP TRIGGER IF EXISTS SharedSlip_no_delete //
CREATE TRIGGER SharedSlip_no_delete BEFORE DELETE ON SharedSlip FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shared slip links are permanent.';
END //

DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'c5d93db0d060509f86e76bac502d72d2afdad1946147057985e5dd53bf617dc0',NOW(3),'20261103180000_shared_slip_trigger_blocks',NOW(3),1);
