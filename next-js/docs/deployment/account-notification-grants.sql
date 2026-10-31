-- Deployment owner only, after 20261031104143_account_notifications.
-- Replace the host placeholder; never grant schema privileges to the application.
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`MemberNotification` TO 'goal_hint_app'@'application-host';
