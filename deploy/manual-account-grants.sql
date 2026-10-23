-- Review after deploying 20261021110000_saved_slips. Replace the database and application-host placeholders
-- with the existing approved application identity; this file never creates users or changes passwords.
-- Saved snapshots are inserted once. Account erasure deletes parents and cascades to fixture links.
GRANT SELECT, INSERT, DELETE ON `goal_hint_db`.`SavedSlip` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT ON `goal_hint_db`.`SavedSlipFixture` TO 'goal_hint_app'@'application-host';

-- Password recovery adds columns to MemberAccount and MemberSession. Existing table-scoped SELECT/INSERT/UPDATE
-- grants cover them; deployments using column-scoped grants must add the new fields before starting this release.
-- Phone verification reuses MemberVerification to retain hashed requests for a rolling 24 hours.
-- Review after deploying 20261023090000_member_message_verification. No credentials are stored in this table.
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`MemberVerification` TO 'goal_hint_app'@'application-host';

-- Admin-confirmed permanent account deletion removes the account's financial, access and audit records atomically.
-- Apply these additional grants before deploying the permanent deletion flow; plans and settings remain retained.
GRANT DELETE ON `goal_hint_db`.`PaymentSubmission` TO 'goal_hint_app'@'application-host';
GRANT DELETE ON `goal_hint_db`.`AccessCode` TO 'goal_hint_app'@'application-host';
GRANT DELETE ON `goal_hint_db`.`OwnerAuditEvent` TO 'goal_hint_app'@'application-host';
