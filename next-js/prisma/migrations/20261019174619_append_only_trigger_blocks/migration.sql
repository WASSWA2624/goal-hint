-- Recreate the ten append-only triggers of 20261012153531_goal_market_extension as BEGIN ... END blocks.
-- Prisma applies a migration as one multi-statement script, so MySQL stored each single-statement trigger body with
-- its closing `;`. mysqldump then writes `/*!50003 ... 'append-only'; */;;`, which the mysql client rejects
-- (ERROR 1064 near ' */'), so no snapshot restored. A BEGIN ... END body ends at END, like the PublicCache triggers.
-- Same names, tables, timing, events and messages. Each table is unguarded only between its DROP and CREATE, so pause
-- writers while this runs (the application never updates or deletes these rows). A rerun after a failure is safe.

DROP TRIGGER IF EXISTS GoalMarketExtension_no_update;
CREATE TRIGGER GoalMarketExtension_no_update BEFORE UPDATE ON GoalMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
END;
DROP TRIGGER IF EXISTS GoalMarketExtension_no_delete;
CREATE TRIGGER GoalMarketExtension_no_delete BEFORE DELETE ON GoalMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Goal market extensions are append-only';
END;
DROP TRIGGER IF EXISTS ImpliedMarketExtension_no_update;
CREATE TRIGGER ImpliedMarketExtension_no_update BEFORE UPDATE ON ImpliedMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
END;
DROP TRIGGER IF EXISTS ImpliedMarketExtension_no_delete;
CREATE TRIGGER ImpliedMarketExtension_no_delete BEFORE DELETE ON ImpliedMarketExtension FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market extensions are append-only';
END;
DROP TRIGGER IF EXISTS ImpliedMarketResultEvidence_no_update;
CREATE TRIGGER ImpliedMarketResultEvidence_no_update BEFORE UPDATE ON ImpliedMarketResultEvidence FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
END;
DROP TRIGGER IF EXISTS ImpliedMarketResultEvidence_no_delete;
CREATE TRIGGER ImpliedMarketResultEvidence_no_delete BEFORE DELETE ON ImpliedMarketResultEvidence FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Implied market result evidence is append-only';
END;
DROP TRIGGER IF EXISTS ExtendedMarketSettlementRevision_no_update;
CREATE TRIGGER ExtendedMarketSettlementRevision_no_update BEFORE UPDATE ON ExtendedMarketSettlementRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
END;
DROP TRIGGER IF EXISTS ExtendedMarketSettlementRevision_no_delete;
CREATE TRIGGER ExtendedMarketSettlementRevision_no_delete BEFORE DELETE ON ExtendedMarketSettlementRevision FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended settlement revisions are append-only';
END;
DROP TRIGGER IF EXISTS ExtendedMarketPublishedPick_no_update;
CREATE TRIGGER ExtendedMarketPublishedPick_no_update BEFORE UPDATE ON ExtendedMarketPublishedPick FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
END;
DROP TRIGGER IF EXISTS ExtendedMarketPublishedPick_no_delete;
CREATE TRIGGER ExtendedMarketPublishedPick_no_delete BEFORE DELETE ON ExtendedMarketPublishedPick FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published extended market picks are append-only';
END;
