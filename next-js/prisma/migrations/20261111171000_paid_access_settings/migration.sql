-- Preserve the restricted view and existing access periods when retiring Test.
UPDATE `SubscriptionSettings` SET `paywallMode` = 'on' WHERE `paywallMode` = 'test';

ALTER TABLE `SubscriptionSettings`
    DROP CHECK `SubscriptionSettings_shape_check`,
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
