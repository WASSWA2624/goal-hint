-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261104090000_six_best_slip_odds_bands'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261104140000_manual_providers_and_opt_in_trials') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

ALTER TABLE `SubscriptionSettings`
  ADD COLUMN `mtnEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `airtelEnabled` BOOLEAN NOT NULL DEFAULT false;

UPDATE `SubscriptionSettings`
SET `mtnEnabled` = COALESCE(TRIM(`mtnNumber`) <> '' AND TRIM(`mtnName`) <> '', false),
    `airtelEnabled` = COALESCE(TRIM(`airtelNumber`) <> '' AND TRIM(`airtelName`) <> '', false);

ALTER TABLE `MemberAccount`
  ADD COLUMN `trialEligibleAt` DATETIME(3) NULL,
  ADD COLUMN `trialForfeitedAt` DATETIME(3) NULL;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'ebbce5d55ca71b53142b45771f2049da1006269ea05e10d5cf35df75952642ff',NOW(3),'20261104140000_manual_providers_and_opt_in_trials',NOW(3),1);
