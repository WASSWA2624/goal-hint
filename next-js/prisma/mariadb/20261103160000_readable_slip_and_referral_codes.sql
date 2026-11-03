-- MariaDB 11.4 overlay. Stop application/worker writes; do not retry a partial migration.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261031120000_referral_rewards'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261103160000_readable_slip_and_referral_codes') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;
-- Keep legacy invitation aliases before allocating new short codes lazily under account locks.
ALTER TABLE MemberAccount ADD COLUMN legacyReferralCode CHAR(32) NULL;
CREATE UNIQUE INDEX MemberAccount_legacyReferralCode_key ON MemberAccount(legacyReferralCode);
ALTER TABLE MemberAccount DROP CONSTRAINT MemberAccount_referral_check;
ALTER TABLE MemberAccount ADD CONSTRAINT MemberAccount_referral_check
  CHECK (referralCode IS NULL OR referralCode REGEXP '^([0-9]{8}|[a-f0-9]{32})$');
ALTER TABLE MemberAccount ADD CONSTRAINT MemberAccount_legacy_referral_check
  CHECK (legacyReferralCode IS NULL OR legacyReferralCode REGEXP '^[a-f0-9]{32}$');
UPDATE MemberAccount SET legacyReferralCode=referralCode WHERE referralCode REGEXP '^[a-f0-9]{32}$';

-- Only a content-identity digest and its public sequence are retained; no account or selections.
CREATE TABLE SlipNumber (
  number INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
  fingerprint CHAR(64) NOT NULL,
  PRIMARY KEY(number),
  UNIQUE INDEX SlipNumber_fingerprint_key(fingerprint),
  CONSTRAINT SlipNumber_fingerprint_check CHECK (fingerprint REGEXP '^[a-f0-9]{64}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- MySQL CHECK expressions cannot reference AUTO_INCREMENT columns. Check the assigned value atomically instead.
DELIMITER //
CREATE TRIGGER SlipNumber_capacity AFTER INSERT ON SlipNumber FOR EACH ROW
BEGIN
  IF NEW.number < 1 OR NEW.number > 99999999 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slip number capacity exceeded.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'6d7692d978be80e0f013ac6bdd78d0989f8e50c334a2c2ac305330fadebfcf8b',NOW(3),'20261103160000_readable_slip_and_referral_codes',NOW(3),1);
