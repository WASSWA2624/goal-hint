-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261104140000_manual_providers_and_opt_in_trials'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261105110000_public_community_channels') <> 0
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME = 'communityVisible') <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

ALTER TABLE `SubscriptionSettings`
  ADD COLUMN `communityVisible` BOOLEAN NOT NULL DEFAULT true;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME = 'communityVisible'
      AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT = '1') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Public community visibility verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'351f6593f07a9102a5117594d4e1352ba92fe367aa1b43ce1a8eab1ac514884c',NOW(3),'20261105110000_public_community_channels',NOW(3),1);
