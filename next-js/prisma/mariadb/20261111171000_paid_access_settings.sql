-- MariaDB overlay. Pause writers and take a backup before applying.
DELIMITER //
BEGIN NOT ATOMIC
    IF (SELECT COUNT(*) FROM `_prisma_migrations` WHERE `migration_name` = '20261105120000_contact_page_settings'
        AND `finished_at` IS NOT NULL AND `rolled_back_at` IS NULL) <> 1
        OR (SELECT COUNT(*) FROM `_prisma_migrations` WHERE `migration_name` = '20261111171000_paid_access_settings') <> 0
        OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME = 'maxUnlockedDevices') <> 1
        OR (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'SubscriptionSettings' AND COLUMN_NAME = 'allowUnsubscribedMembers') <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Migration prerequisites missing or already/partly applied.';
    END IF;
END //
DELIMITER ;

UPDATE `SubscriptionSettings` SET `paywallMode` = 'on' WHERE `paywallMode` = 'test';

ALTER TABLE `SubscriptionSettings`
    DROP CONSTRAINT `SubscriptionSettings_shape_check`,
    DROP COLUMN `maxUnlockedDevices`,
    ADD COLUMN `allowUnsubscribedMembers` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `trialDays` SMALLINT UNSIGNED NOT NULL DEFAULT 2,
    ADD CONSTRAINT `SubscriptionSettings_access_shape_check` CHECK (
        `id` = 1
        AND `paywallMode` IN ('off', 'on')
        AND `copyFormat` IN ('international', 'local')
        AND `allowUnsubscribedMembers` IN (0, 1)
        AND `trialDays` BETWEEN 0 AND 366
        AND `screenshotRetentionDays` BETWEEN 7 AND 365
    );

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `started_at`, `applied_steps_count`)
VALUES (UUID(), '10d81358b0de73002a91b6a67936f8d0b434b8c3d084e5295c63b5804270148c', NOW(3), '20261111171000_paid_access_settings', NOW(3), 1);
