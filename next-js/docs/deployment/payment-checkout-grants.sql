-- Replace the database and principal with the existing application role; use the migration role for DDL.
GRANT SELECT, INSERT, UPDATE ON `goal_hint_db`.`PaymentReceipt` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT, UPDATE ON `goal_hint_db`.`PaymentReceiptClaim` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT, UPDATE ON `goal_hint_db`.`PaymentReceiptEvidence` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT ON `goal_hint_db`.`ReferralCredit` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT ON `goal_hint_db`.`PaymentEvent` TO 'goal_hint_app'@'application-host';
