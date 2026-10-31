-- Apply as the deployment owner after 20261031120000_referral_rewards.
-- Replace placeholders. Never give the application migration/trigger privileges.
GRANT SELECT, INSERT, UPDATE ON `goal_hint_db`.`MemberReferral` TO 'goal_hint_app'@'application-host';
-- Existing table-level SELECT/UPDATE grants on MemberAccount already cover referralCode.
-- For column-scoped roles, extend their existing SELECT/UPDATE grants to referralCode.
-- MemberReferral deliberately has no application DELETE grant; keyed registration
-- identities survive erasure/deletion to prevent another reward for the same number.
