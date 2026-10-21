-- Review after deploying 20261021110000_saved_slips. Replace the database and application-host placeholders
-- with the existing approved application identity; this file never creates users or changes passwords.
-- Saved snapshots are inserted once. Account erasure deletes parents and cascades to fixture links.
GRANT SELECT, INSERT, DELETE ON `goal_hint_db`.`SavedSlip` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT ON `goal_hint_db`.`SavedSlipFixture` TO 'goal_hint_app'@'application-host';

-- Password recovery adds columns to MemberAccount and MemberSession. Existing table-scoped SELECT/INSERT/UPDATE
-- grants cover them; deployments using column-scoped grants must add the new fields before starting this release.
-- No new grant is required for the retired MemberVerification table or any messaging service.
