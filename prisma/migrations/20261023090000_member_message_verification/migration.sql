-- Existing identities retain access; new registrations and phone changes require phone ownership verification.
ALTER TABLE `MemberAccount`
  ADD COLUMN `phoneVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `passwordChangedAt` DATETIME(3) NULL;

UPDATE `MemberAccount` SET `phoneVerifiedAt` = `createdAt`
  WHERE `phone` IS NOT NULL AND `erasedAt` IS NULL;

-- Historical retired challenges must never become active after rollout.
UPDATE `MemberVerification` SET `consumedAt` = COALESCE(`consumedAt`, UTC_TIMESTAMP(3));
ALTER TABLE `MemberVerification` ADD COLUMN `channel` VARCHAR(8) NOT NULL DEFAULT 'sms';
