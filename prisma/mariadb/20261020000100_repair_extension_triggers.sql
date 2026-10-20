-- Forward MariaDB overlay; no host deployment is authorized.
DELIMITER $$
-- Forward-only repair: preserve append-only enforcement and all archived rows.
-- Compound bodies round-trip through mysqldump delimiters without a stray terminator.

DROP TRIGGER IF EXISTS `GoalMarketExtension_no_update`$$
CREATE TRIGGER `GoalMarketExtension_no_update` BEFORE UPDATE ON GoalMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
END$$

DROP TRIGGER IF EXISTS `GoalMarketExtension_no_delete`$$
CREATE TRIGGER `GoalMarketExtension_no_delete` BEFORE DELETE ON GoalMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
END$$

DROP TRIGGER IF EXISTS `ImpliedMarketExtension_no_update`$$
CREATE TRIGGER `ImpliedMarketExtension_no_update` BEFORE UPDATE ON ImpliedMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
END$$

DROP TRIGGER IF EXISTS `ImpliedMarketExtension_no_delete`$$
CREATE TRIGGER `ImpliedMarketExtension_no_delete` BEFORE DELETE ON ImpliedMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
END$$

DROP TRIGGER IF EXISTS `ImpliedMarketResultEvidence_no_update`$$
CREATE TRIGGER `ImpliedMarketResultEvidence_no_update` BEFORE UPDATE ON ImpliedMarketResultEvidence FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
END$$

DROP TRIGGER IF EXISTS `ImpliedMarketResultEvidence_no_delete`$$
CREATE TRIGGER `ImpliedMarketResultEvidence_no_delete` BEFORE DELETE ON ImpliedMarketResultEvidence FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
END$$

DROP TRIGGER IF EXISTS `ExtendedMarketSettlementRevision_no_update`$$
CREATE TRIGGER `ExtendedMarketSettlementRevision_no_update` BEFORE UPDATE ON ExtendedMarketSettlementRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
END$$

DROP TRIGGER IF EXISTS `ExtendedMarketSettlementRevision_no_delete`$$
CREATE TRIGGER `ExtendedMarketSettlementRevision_no_delete` BEFORE DELETE ON ExtendedMarketSettlementRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
END$$

DROP TRIGGER IF EXISTS `ExtendedMarketPublishedPick_no_update`$$
CREATE TRIGGER `ExtendedMarketPublishedPick_no_update` BEFORE UPDATE ON ExtendedMarketPublishedPick FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
END$$

DROP TRIGGER IF EXISTS `ExtendedMarketPublishedPick_no_delete`$$
CREATE TRIGGER `ExtendedMarketPublishedPick_no_delete` BEFORE DELETE ON ExtendedMarketPublishedPick FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
END$$

DELIMITER ;

-- Record the canonical committed migration once; existing history is never rewritten.
INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count)
SELECT UUID(),'c48bc7547b91e1b608ded9356eb53e2ecd71a858fc7f39b4b17ec88cdadb6a20',NOW(3),'20261020000100_repair_extension_triggers',NULL,NULL,NOW(3),1
WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='20261020000100_repair_extension_triggers' AND rolled_back_at IS NULL);
