-- Apply using the existing deployment owner, replacing these documented role/database placeholders.
-- Public-link records are append-only. The application never requires UPDATE, DELETE, or DDL privileges.
GRANT SELECT, INSERT ON `goal_hint_db`.`SharedSlip` TO 'goal_hint_app'@'application-host';
