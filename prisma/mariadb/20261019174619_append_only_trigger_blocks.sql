-- Production (MariaDB 11.4) apply script for migration 20261019174619_append_only_trigger_blocks.
-- Recreates the ten append-only triggers of 20261012153531_goal_market_extension as BEGIN ... END blocks, with the
-- same names, tables, timing, events and messages, so a dump of them imports again (docs/backup-restore.md).
-- CREATE OR REPLACE TRIGGER swaps each definition in one statement: no table is ever left without its trigger, and a
-- rerun is a no-op. The importing account becomes each trigger's definer; keep it while the triggers are in use.
-- Take and verify a private backup first, then import this file with the migration account, with phpMyAdmin or:
--   mariadb <database> < this-file
-- Every step that fails stops the import before the migration is recorded.

-- 1. Guard: the goal-market extension must already be applied, with its five append-only tables.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('GoalMarketExtension', 'ImpliedMarketExtension', 'ImpliedMarketResultEvidence', 'ExtendedMarketSettlementRevision', 'ExtendedMarketPublishedPick')) <> 5
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261012153531_goal_market_extension'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The goal-market extension is not applied; nothing was imported.';
  END IF;
END //

-- 2. The triggers. With the block delimiter the semicolon inside each body stays in it, and the statement ends at END.
CREATE OR REPLACE TRIGGER GoalMarketExtension_no_update BEFORE UPDATE ON GoalMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
END //
CREATE OR REPLACE TRIGGER GoalMarketExtension_no_delete BEFORE DELETE ON GoalMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
END //
CREATE OR REPLACE TRIGGER ImpliedMarketExtension_no_update BEFORE UPDATE ON ImpliedMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
END //
CREATE OR REPLACE TRIGGER ImpliedMarketExtension_no_delete BEFORE DELETE ON ImpliedMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
END //
CREATE OR REPLACE TRIGGER ImpliedMarketResultEvidence_no_update BEFORE UPDATE ON ImpliedMarketResultEvidence FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
END //
CREATE OR REPLACE TRIGGER ImpliedMarketResultEvidence_no_delete BEFORE DELETE ON ImpliedMarketResultEvidence FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
END //
CREATE OR REPLACE TRIGGER ExtendedMarketSettlementRevision_no_update BEFORE UPDATE ON ExtendedMarketSettlementRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
END //
CREATE OR REPLACE TRIGGER ExtendedMarketSettlementRevision_no_delete BEFORE DELETE ON ExtendedMarketSettlementRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
END //
CREATE OR REPLACE TRIGGER ExtendedMarketPublishedPick_no_update BEFORE UPDATE ON ExtendedMarketPublishedPick FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
END //
CREATE OR REPLACE TRIGGER ExtendedMarketPublishedPick_no_delete BEFORE DELETE ON ExtendedMarketPublishedPick FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
END //

-- 3. Verification: stop before recording unless all ten triggers exist as BEGIN ... END blocks.
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
      AND TRIGGER_NAME IN ('GoalMarketExtension_no_update', 'GoalMarketExtension_no_delete', 'ImpliedMarketExtension_no_update',
        'ImpliedMarketExtension_no_delete', 'ImpliedMarketResultEvidence_no_update', 'ImpliedMarketResultEvidence_no_delete',
        'ExtendedMarketSettlementRevision_no_update', 'ExtendedMarketSettlementRevision_no_delete',
        'ExtendedMarketPublishedPick_no_update', 'ExtendedMarketPublishedPick_no_delete')
      AND ACTION_TIMING = 'BEFORE' AND ACTION_STATEMENT LIKE 'BEGIN%' AND ACTION_STATEMENT LIKE '%END') <> 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The append-only triggers do not match the reviewed migration; it was not recorded.';
  END IF;
END //
DELIMITER ;

-- 4. Record the migration (checksum = SHA-256 of the committed migration.sql), once.
SET @record := 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT UUID(), ''01b6bd32a564b20f12da88191b333d6e660b76454b7826a7081e6f87f2fae3d2'', NOW(3), ''20261019174619_append_only_trigger_blocks'', NULL, NULL, NOW(3), 1 FROM DUAL
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = ''20261019174619_append_only_trigger_blocks'')';
PREPARE record_migration FROM @record;
EXECUTE record_migration;
DEALLOCATE PREPARE record_migration;

-- 5. Closing check. Expect ten rows, each BEFORE UPDATE or BEFORE DELETE, with a body that starts with BEGIN and ends with END.
SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, LEFT(ACTION_STATEMENT, 5) AS body_start,
    RIGHT(ACTION_STATEMENT, 3) AS body_end
  FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME LIKE '%\_no\_%'
  ORDER BY TRIGGER_NAME;
