-- Run as the database administrator after 20261031135652_referral_review, replacing database/app-account names.
-- Cases and financial ledger cannot be deleted; event history is append-only. Evidence is scrubbed by UPDATE.
GRANT SELECT, INSERT, UPDATE ON goal_hint.ReferralReviewCase TO 'goal_hint_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON goal_hint.ReferralReviewEvidence TO 'goal_hint_app'@'127.0.0.1';
GRANT SELECT, INSERT ON goal_hint.ReferralReviewEvent TO 'goal_hint_app'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE ON goal_hint.ReferralGrantReversal TO 'goal_hint_app'@'127.0.0.1';
