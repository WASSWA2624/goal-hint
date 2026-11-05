-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261105110000_public_community_channels'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
    OR (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20261105120000_contact_page_settings') <> 0
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME IN ('contactPageEmail', 'contactPageEmailVisible')) <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
  END IF;
END //
DELIMITER ;

ALTER TABLE `SubscriptionSettings`
  ADD COLUMN `contactPageEmail` VARCHAR(254) NULL DEFAULT 'wasswawilon0002@gmail.com',
  ADD COLUMN `contactPageEmailVisible` BOOLEAN NOT NULL DEFAULT true;

DELIMITER //
BEGIN NOT ATOMIC
  IF (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME = 'contactPageEmail'
      AND IS_NULLABLE = 'YES' AND CHARACTER_MAXIMUM_LENGTH = 254) <> 1
    OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME = 'contactPageEmailVisible'
      AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT = '1') <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Contact page settings verification failed.';
  END IF;
END //
DELIMITER ;

INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (UUID(),'3f60cc2c7b52c7920693313b9f04acffcb6b7e5b55e55a26c7c9d270afef45aa',NOW(3),'20261105120000_contact_page_settings',NOW(3),1);
