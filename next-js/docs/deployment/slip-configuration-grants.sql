-- Apply with the deployment owner after the saved_slip_configurations migration.
-- Replace database/user/host placeholders; never grant application DDL privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON `goal_hint_db`.`SlipConfiguration` TO 'goal_hint_app'@'application-host';
