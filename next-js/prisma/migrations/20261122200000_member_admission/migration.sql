-- New regular members can be admitted independently of proof of phone ownership.
-- Keep existing accounts in their current admission and verification states.
ALTER TABLE `MemberAccount` ADD COLUMN `memberAdmittedAt` DATETIME(3) NULL;
