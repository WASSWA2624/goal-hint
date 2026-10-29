-- Preserve self-service recovery for registered accounts whose regular password
-- was replaced by an administrator-issued temporary credential. Audit history
-- also identifies consumed or expired credentials after reset sessions are purged.
-- This deliberately invalid hash never accepts the old temporary password.
-- Ordinary hashes, unregistered stubs without manual-reset history, erased
-- accounts, and all historical audit records remain unchanged.
UPDATE `MemberAccount`
SET `passwordHash` = '!self-service-recovery-required'
WHERE `passwordHash` IS NULL AND `phone` IS NOT NULL AND `erasedAt` IS NULL
  AND (`temporaryPasswordHash` IS NOT NULL OR EXISTS (
    SELECT 1 FROM `OwnerAuditEvent` AS `audit`
    WHERE `audit`.`accountId` = `MemberAccount`.`id` AND `audit`.`action` = 'password_reset'
  ));

ALTER TABLE `MemberAccount`
  DROP INDEX `MemberAccount_passwordResetRequestedAt_idx`,
  DROP COLUMN `temporaryPasswordHash`,
  DROP COLUMN `temporaryPasswordExpiresAt`,
  DROP COLUMN `passwordResetRequestedAt`;
