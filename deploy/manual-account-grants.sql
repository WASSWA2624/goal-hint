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

-- Account credit: WalletEntry is an append-only ledger. Review after deploying 20261024210000_account_credit.
-- No UPDATE or DELETE: its triggers refuse both, and permanent account deletion removes rows by foreign-key cascade.
-- The new MemberAccount and PaymentSubmission columns are covered by existing table-scoped grants.
GRANT SELECT, INSERT ON `goal_hint_db`.`WalletEntry` TO 'goal_hint_app'@'application-host';
-- AccountMove records number changes for reversals to follow; append-only the same way, and it blocks deleting the accounts it names.
GRANT SELECT, INSERT ON `goal_hint_db`.`AccountMove` TO 'goal_hint_app'@'application-host';

-- Prediction quotes: the public price captured beside each published family prediction. Review after deploying
-- 20261025180538_prediction_quotes and apply BEFORE enabling provider odds display: once capture is on, a missing grant
-- fails the forecast publication. Append-only: its triggers refuse UPDATE and DELETE.
GRANT SELECT, INSERT ON `goal_hint_db`.`PredictionQuote` TO 'goal_hint_app'@'application-host';
-- Durable minimal payment SMS intents, after 20261025230000_payment_notification_outbox.
-- No recipient or message body is stored. DELETE covers terminal retention, erasure and explicit owner dismissal.
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`PaymentNotificationOutbox` TO 'goal_hint_app'@'application-host';

-- Owner profit and costs: review after deploying 20261025183256_owner_profit. No personal data; rows are voided or ended,
-- never deleted, so there is no DELETE. Entries are never edited: only the three void columns may change. A recurring line
-- may change only its label, typical amount and end month. The month row is updated table-wide because the month lock's
-- INSERT ... ON DUPLICATE KEY UPDATE writes `month`. Apply with the migration, before deploying the code.
GRANT SELECT, INSERT, UPDATE (label, typicalUgx, endMonth, updatedAt, updatedBy) ON `goal_hint_db`.`OwnerCostLine` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT, UPDATE (voidedAt, voidedBy, voidReason) ON `goal_hint_db`.`OwnerCostEntry` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT, UPDATE ON `goal_hint_db`.`OwnerProfitMonth` TO 'goal_hint_app'@'application-host';
