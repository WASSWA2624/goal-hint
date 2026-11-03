-- Use the existing migration role for DDL. Replace these database/principal placeholders.
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`PaymentReviewEvent` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`PaymentAlertEndpoint` TO 'goal_hint_app'@'application-host';
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`PaymentAlertDelivery` TO 'goal_hint_app'@'application-host';
-- Existing SubscriptionSettings/MemberSession permissions are retained. Do not grant receipt/ledger deletion.
