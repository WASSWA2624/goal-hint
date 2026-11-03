-- Substitute the deployment's actual database and application-role names.
-- Apply the readable-code migration before deploying the sharing/referral code.
GRANT SELECT, INSERT ON `goal_hint`.`SlipNumber` TO 'goal_hint_app'@'localhost';
-- Existing MemberAccount SELECT/INSERT/UPDATE privileges cover legacyReferralCode.
