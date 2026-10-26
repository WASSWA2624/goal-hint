-- Password recovery is manually approved; only hashes and a bounded reset authorization are retained.
ALTER TABLE `MemberAccount`
  ADD COLUMN `temporaryPasswordHash` VARCHAR(255) NULL,
  ADD COLUMN `temporaryPasswordExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `passwordResetRequestedAt` DATETIME(3) NULL,
  ADD INDEX `MemberAccount_passwordResetRequestedAt_idx` (`passwordResetRequestedAt`);

ALTER TABLE `MemberSession`
  ADD COLUMN `passwordResetAt` DATETIME(3) NULL,
  ADD COLUMN `adminPasswordVersion` CHAR(64) NULL;
