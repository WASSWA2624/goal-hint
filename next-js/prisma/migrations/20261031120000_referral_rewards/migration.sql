-- Referral identities contain keyed phone digests, never raw numbers.
ALTER TABLE `MemberAccount` ADD COLUMN `referralCode` CHAR(32) NULL;
CREATE UNIQUE INDEX `MemberAccount_referralCode_key` ON `MemberAccount` (`referralCode`);
ALTER TABLE `MemberAccount` ADD CONSTRAINT `MemberAccount_referral_check`
  CHECK (`referralCode` IS NULL OR `referralCode` REGEXP '^[a-f0-9]{32}$');

CREATE TABLE `MemberReferral` (
  `id` CHAR(36) NOT NULL,
  `phoneKey` CHAR(64) NOT NULL,
  `accountId` CHAR(36) NULL,
  `inviterId` CHAR(36) NULL,
  `registeredAt` DATETIME(3) NOT NULL,
  `rewardedAt` DATETIME(3) NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
  `accessCodeId` CHAR(36) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MemberReferral_phoneKey_key` (`phoneKey`),
  UNIQUE INDEX `MemberReferral_accountId_key` (`accountId`),
  UNIQUE INDEX `MemberReferral_accessCodeId_key` (`accessCodeId`),
  INDEX `MemberReferral_inviterId_registeredAt_idx` (`inviterId`, `registeredAt`),
  INDEX `MemberReferral_inviterId_rewardedAt_idx` (`inviterId`, `rewardedAt`),
  CONSTRAINT `MemberReferral_shape_check` CHECK (
    `phoneKey` REGEXP '^[a-f0-9]{64}$'
    AND `status` IN ('pending', 'rewarded', 'ineligible')
    AND (`status` = 'rewarded') = (`rewardedAt` IS NOT NULL)
    AND (`rewardedAt` IS NULL OR `rewardedAt` >= `registeredAt`)
  ),
  CONSTRAINT `MemberReferral_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `MemberAccount` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `MemberReferral_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `MemberAccount` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `MemberReferral_accessCodeId_fkey` FOREIGN KEY (`accessCodeId`) REFERENCES `AccessCode` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `AccessCode` DROP CONSTRAINT `AccessCode_shape_check`;
ALTER TABLE `AccessCode` ADD CONSTRAINT `AccessCode_shape_check` CHECK (
  `source` IN ('payment', 'manual', 'reissue', 'number-change', 'trial', 'credit', 'renewal', 'referral')
  AND (`source` = 'payment') = (`paymentSubmissionId` IS NOT NULL)
  AND `durationDays` BETWEEN 1 AND 366 AND `endsAt` > `startsAt`
  AND (`source` NOT IN ('credit', 'renewal')
    OR (`planId` IS NOT NULL AND `priceUgx` BETWEEN 100 AND 10000000 AND `amountReceivedUgx` IS NULL))
  AND (`source` <> 'referral' OR (`durationDays` = 1 AND `extensionDays` = 0 AND `priceUgx` = 0 AND `amountReceivedUgx` = 0 AND `planId` IS NULL))
);

CREATE TRIGGER MemberReferral_insert BEFORE INSERT ON MemberReferral FOR EACH ROW
BEGIN
  IF NEW.status = 'rewarded' OR NEW.rewardedAt IS NOT NULL OR NEW.accessCodeId IS NOT NULL
    OR (NEW.inviterId IS NOT NULL AND NEW.inviterId = NEW.accountId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Registration identity must precede its reward';
  END IF;
END;
CREATE TRIGGER MemberReferral_identity BEFORE UPDATE ON MemberReferral FOR EACH ROW
BEGIN
  IF (NEW.inviterId IS NOT NULL AND NEW.inviterId = NEW.accountId)
    OR (NEW.status <> 'rewarded' AND NEW.accessCodeId IS NOT NULL)
    OR NOT (NEW.phoneKey <=> OLD.phoneKey) OR NOT (NEW.registeredAt <=> OLD.registeredAt)
    OR NOT (NEW.id <=> OLD.id) OR (NEW.accountId IS NOT NULL AND NOT (NEW.accountId <=> OLD.accountId))
    OR (NEW.inviterId IS NOT NULL AND NOT (NEW.inviterId <=> OLD.inviterId))
    OR (OLD.status <> 'pending' AND (NEW.status <> OLD.status OR NOT (NEW.rewardedAt <=> OLD.rewardedAt)
      OR NOT (NEW.accessCodeId <=> OLD.accessCodeId))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Referral identity and completed awards are immutable';
  END IF;
  IF OLD.status = 'pending' AND NEW.status = 'rewarded' AND NOT EXISTS (
    SELECT 1 FROM AccessCode WHERE id=NEW.accessCodeId AND accountId=NEW.inviterId AND source='referral'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A referral reward must belong to its inviter';
  END IF;
END;
CREATE TRIGGER MemberReferral_no_delete BEFORE DELETE ON MemberReferral FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Registration identities prevent duplicate rewards';
END;
