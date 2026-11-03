-- Preserve the existing immutable shared-slip guards using dump-safe block bodies.
-- Do not rewrite the applied 20261029180000_shared_slips migration. Pause writers while replacing these triggers.
DROP TRIGGER IF EXISTS SharedSlip_no_update;
CREATE TRIGGER SharedSlip_no_update BEFORE UPDATE ON SharedSlip FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shared slips are immutable.';
END;
DROP TRIGGER IF EXISTS SharedSlip_no_delete;
CREATE TRIGGER SharedSlip_no_delete BEFORE DELETE ON SharedSlip FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shared slip links are permanent.';
END;
